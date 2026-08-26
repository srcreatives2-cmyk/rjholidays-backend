const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');

// ---------- ADMIN ----------

// Mark that a review was requested (for tracking; actual send happens via the
// WhatsApp link from /api/whatsapp/link?type=reviewRequest, or a manual email)
router.post('/request/:bookingId', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('bookings')
    .update({ review_requested_at: new Date().toISOString() })
    .eq('id', req.params.bookingId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// List reviews (with pending ones first) for moderation
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, customers(name)')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body; // 'approved' | 'hidden' | 'pending'
  if (!['approved', 'hidden', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { data, error } = await supabase.from('reviews').update({ status }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---------- PUBLIC (no login — accessed via booking.review_token link) ----------

router.get('/public/:token', async (req, res) => {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, booking_code, customer_id')
    .eq('review_token', req.params.token)
    .single();
  if (error || !booking) return res.status(404).json({ error: 'Invalid review link' });

  const { data: existing } = await supabase.from('reviews').select('*').eq('booking_id', booking.id).maybeSingle();
  res.json({ booking_code: booking.booking_code, already_submitted: !!existing });
});

router.post('/public/:token', async (req, res) => {
  try {
    const { rating, review_text } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'A rating from 1 to 5 is required.' });

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, customer_id')
      .eq('review_token', req.params.token)
      .single();
    if (error || !booking) return res.status(404).json({ error: 'Invalid review link' });

    const { data: existing } = await supabase.from('reviews').select('id').eq('booking_id', booking.id).maybeSingle();
    if (existing) return res.status(400).json({ error: 'A review has already been submitted for this booking.' });

    const { data: review, error: reviewErr } = await supabase
      .from('reviews')
      .insert({ booking_id: booking.id, customer_id: booking.customer_id, rating, review_text, status: 'pending' })
      .select()
      .single();
    if (reviewErr) throw reviewErr;

    res.status(201).json({ success: true, message: 'Thank you for your feedback!' });
  } catch (err) {
    console.error('[POST /reviews/public/:token]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
