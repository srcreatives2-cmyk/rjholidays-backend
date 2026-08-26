const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');
const { createOrder, verifyWebhookSignature } = require('../lib/razorpay');

// CREATE a Razorpay order for a booking — public (called from quote page or customer dashboard)
// Supports: advance only, balance only, or full payment (client specifies which via `amount_type`)
router.post('/create-order/:bookingId', async (req, res) => {
  try {
    const { amount_type } = req.body; // 'advance' | 'balance' | 'full'
    const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', req.params.bookingId).single();
    if (error) return res.status(404).json({ error: 'Booking not found' });

    let amount;
    if (amount_type === 'full') amount = Number(booking.total_amount) - Number(booking.advance_paid);
    else if (amount_type === 'balance') amount = Number(booking.balance_due);
    else amount = Number(booking.balance_due); // default: pay whatever is currently due

    if (amount <= 0) return res.status(400).json({ error: 'No amount due for this booking.' });

    const order = await createOrder({
      amount,
      receipt: booking.booking_code,
      notes: { booking_id: booking.id, amount_type: amount_type || 'due' },
    });

    // Record a pending payment row so we can reconcile once the webhook arrives
    await supabase.from('payments').insert({
      booking_id: booking.id,
      amount,
      payment_method: 'razorpay',
      razorpay_order_id: order.id,
      status: 'pending',
      verified_server_side: false,
    });

    res.json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('[POST /payments/create-order]', err);
    res.status(500).json({ error: err.message });
  }
});

// WEBHOOK — the only source of truth for payment confirmation.
// Configure this exact URL in Razorpay Dashboard > Settings > Webhooks.
// NOTE: requires the raw request body for signature verification — see server.js for the
// express.raw() middleware applied specifically to this route.
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const isValid = verifyWebhookSignature(req.body, signature);
    if (!isValid) {
      console.warn('[webhook] Invalid signature — rejecting');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(req.body.toString());

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;

      const { data: paymentRow } = await supabase
        .from('payments')
        .select('*')
        .eq('razorpay_order_id', orderId)
        .eq('status', 'pending')
        .maybeSingle();

      if (paymentRow) {
        await supabase
          .from('payments')
          .update({
            razorpay_payment_id: payment.id,
            status: 'verified',
            verified_server_side: true,
          })
          .eq('id', paymentRow.id);

        const { data: booking } = await supabase.from('bookings').select('*').eq('id', paymentRow.booking_id).single();
        if (booking) {
          const newAdvancePaid = Number(booking.advance_paid) + Number(paymentRow.amount);
          const newBalanceDue = Math.max(0, Number(booking.total_amount) - newAdvancePaid);
          const paymentStatus = newBalanceDue === 0 ? 'Fully Paid' : 'Advance Paid';
          const bookingStatus = newBalanceDue === 0 ? 'Confirmed' : booking.booking_status;

          await supabase
            .from('bookings')
            .update({
              advance_paid: newAdvancePaid,
              balance_due: newBalanceDue,
              payment_status: paymentStatus,
              booking_status: bookingStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', booking.id);
        }
      }
    }

    if (event.event === 'payment.failed') {
      const payment = event.payload.payment.entity;
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('razorpay_order_id', payment.order_id)
        .eq('status', 'pending');
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[POST /payments/webhook]', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ADMIN: list payments for a booking
router.get('/booking/:bookingId', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('booking_id', req.params.bookingId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
