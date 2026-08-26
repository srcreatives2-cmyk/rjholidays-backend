const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');
const { generateBookingCode } = require('../lib/codes');

router.use(requireAuth);

// CONVERT an accepted quote into a booking (Phase 10)
router.post('/from-quote/:quoteId', async (req, res) => {
  try {
    const { data: quote, error } = await supabase.from('quotes').select('*').eq('id', req.params.quoteId).single();
    if (error) return res.status(404).json({ error: 'Quote not found' });
    if (quote.status !== 'Accepted') {
      return res.status(400).json({ error: 'Only accepted quotes can be converted to a booking.' });
    }

    const booking_code = generateBookingCode();
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .insert({
        booking_code,
        quote_id: quote.id,
        customer_id: quote.customer_id,
        package_id: quote.package_id,
        travel_date: quote.travel_date,
        return_date: quote.return_date,
        travellers_count: (quote.adults || 0) + (quote.children || 0),
        total_amount: quote.total_amount,
        advance_paid: 0,
        balance_due: quote.total_amount,
        payment_status: 'Payment Pending',
        booking_status: 'Payment Pending',
      })
      .select()
      .single();
    if (bookErr) throw bookErr;

    await supabase.from('leads').update({ status: 'Payment Pending', updated_at: new Date().toISOString() }).eq('id', quote.lead_id);

    res.status(201).json(booking);
  } catch (err) {
    console.error('[POST /bookings/from-quote]', err);
    res.status(500).json({ error: err.message });
  }
});

// LIST bookings
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, customers(name, phone, email)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET single booking with payment history
router.get('/:id', async (req, res) => {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*, customers(*)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Booking not found' });

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: false });

  res.json({ ...booking, payments: payments || [] });
});

// UPDATE vendor details (Phase 16 groundwork: hotel/cab/driver info)
router.patch('/:id/vendor-details', async (req, res) => {
  const { data, error } = await supabase
    .from('bookings')
    .update({ vendor_details: req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// UPDATE booking status manually (e.g. mark "Traveling", "Completed", "Cancelled")
router.patch('/:id/status', async (req, res) => {
  const { booking_status } = req.body;
  const valid = ['Payment Pending', 'Confirmed', 'Traveling', 'Completed', 'Cancelled'];
  if (!valid.includes(booking_status)) return res.status(400).json({ error: 'Invalid status' });

  const { data, error } = await supabase
    .from('bookings')
    .update({ booking_status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  if (booking_status === 'Completed') {
    await supabase.from('leads').update({ status: 'Completed' }).eq('customer_id', data.customer_id);
  }

  res.json(data);
});

// MANUAL "Mark as Paid" — for bank transfer / cash / UPI outside Razorpay
// This is the permanent fallback alongside Razorpay, as agreed.
router.post('/:id/mark-paid', async (req, res) => {
  try {
    const { amount, payment_method, reference_note } = req.body;
    if (!amount || !payment_method) return res.status(400).json({ error: 'amount and payment_method are required' });
    const validMethods = ['manual_bank_transfer', 'manual_cash', 'manual_upi'];
    if (!validMethods.includes(payment_method)) return res.status(400).json({ error: 'Invalid payment_method' });

    const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Booking not found' });

    const { error: payErr } = await supabase.from('payments').insert({
      booking_id: booking.id,
      amount,
      payment_method,
      status: 'verified',
      verified_server_side: true, // manual entries are admin-verified by definition
      reference_note,
    });
    if (payErr) throw payErr;

    const newAdvancePaid = Number(booking.advance_paid) + Number(amount);
    const newBalanceDue = Math.max(0, Number(booking.total_amount) - newAdvancePaid);
    const paymentStatus = newBalanceDue === 0 ? 'Fully Paid' : 'Advance Paid';
    const bookingStatus = newBalanceDue === 0 ? 'Confirmed' : booking.booking_status;

    const { data: updated, error: updateErr } = await supabase
      .from('bookings')
      .update({
        advance_paid: newAdvancePaid,
        balance_due: newBalanceDue,
        payment_status: paymentStatus,
        booking_status: bookingStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    res.json(updated);
  } catch (err) {
    console.error('[POST /bookings/:id/mark-paid]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
