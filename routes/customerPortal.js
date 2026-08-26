const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { createMagicLink, verifyMagicLink, requireCustomerAuth } = require('../lib/customerAuth');
const { sendMagicLinkEmail } = require('../lib/email');

// REQUEST a magic link — public, identified by phone + email match on an existing booking
router.post('/request-link', async (req, res) => {
  try {
    const { phone, email } = req.body;
    if (!phone || !email) return res.status(400).json({ error: 'Phone and email are required' });

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', phone)
      .eq('email', email)
      .maybeSingle();

    // Always return a generic success message, whether or not a match was found —
    // avoids leaking which phone/email combinations exist in the system.
    if (customer) {
      const { data: booking } = await supabase.from('bookings').select('id').eq('customer_id', customer.id).limit(1).maybeSingle();
      if (booking) {
        const link = await createMagicLink(customer.id);
        await sendMagicLinkEmail(customer, link);
      }
    }

    res.json({ success: true, message: 'If we found a matching booking, a login link has been emailed to you.' });
  } catch (err) {
    console.error('[POST /customer/request-link]', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// VERIFY the magic link token, returns a session token
router.get('/verify/:token', async (req, res) => {
  const result = await verifyMagicLink(req.params.token);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ session_token: result.sessionToken });
});

// GET the logged-in customer's bookings (own data only — enforced via req.customerId from JWT)
router.get('/my-bookings', requireCustomerAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('customer_id', req.customerId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET a single booking's full detail (itinerary, payments, documents) — ownership-checked
router.get('/bookings/:id', requireCustomerAuth, async (req, res) => {
  const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', req.params.id).single();
  if (error || !booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.customer_id !== req.customerId) return res.status(403).json({ error: 'Not authorized' });

  const { data: payments } = await supabase.from('payments').select('*').eq('booking_id', booking.id).order('created_at', { ascending: false });
  const { data: documents } = await supabase.from('documents').select('*').eq('booking_id', booking.id).order('generated_at', { ascending: false });
  const { data: quote } = booking.quote_id
    ? await supabase.from('quotes').select('itinerary, inclusions, exclusions').eq('id', booking.quote_id).single()
    : { data: null };

  res.json({ ...booking, payments: payments || [], documents: documents || [], itinerary: quote?.itinerary || [] });
});

module.exports = router;
