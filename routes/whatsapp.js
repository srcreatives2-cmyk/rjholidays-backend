const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');
const { buildWaLink, templates } = require('../lib/whatsapp');
const { baseUrl } = require('../lib/codes');

router.use(requireAuth);

// GET a pre-filled WhatsApp link for a given trigger + entity
// Usage: GET /api/whatsapp/link?type=quoteSent&quoteId=xxx
router.get('/link', async (req, res) => {
  try {
    const { type, enquiryId, quoteId, bookingId } = req.query;

    switch (type) {
      case 'newEnquiry': {
        const { data: enquiry } = await supabase.from('enquiries').select('*').eq('id', enquiryId).single();
        if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
        return res.json({ link: buildWaLink(enquiry.whatsapp || enquiry.mobile, templates.newEnquiry(enquiry)) });
      }
      case 'quoteSent':
      case 'quoteReminder': {
        const { data: quote } = await supabase.from('quotes').select('*').eq('id', quoteId).single();
        if (!quote) return res.status(404).json({ error: 'Quote not found' });
        const { data: customer } = await supabase.from('customers').select('*').eq('id', quote.customer_id).single();
        const viewUrl = `${baseUrl()}/quote/${quote.view_token}`;
        const tpl = type === 'quoteSent' ? templates.quoteSent : templates.quoteReminder;
        return res.json({ link: buildWaLink(customer.whatsapp || customer.phone, tpl(quote, customer, viewUrl)) });
      }
      case 'paymentPending':
      case 'paymentSuccessful':
      case 'preTrip':
      case 'duringTrip':
      case 'postTrip': {
        const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        const { data: customer } = await supabase.from('customers').select('*').eq('id', booking.customer_id).single();
        return res.json({ link: buildWaLink(customer.whatsapp || customer.phone, templates[type](booking, customer)) });
      }
      case 'reviewRequest': {
        const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        const { data: customer } = await supabase.from('customers').select('*').eq('id', booking.customer_id).single();
        const reviewUrl = `${baseUrl()}/review/${booking.review_token}`;
        return res.json({ link: buildWaLink(customer.whatsapp || customer.phone, templates.reviewRequest(booking, customer, reviewUrl)) });
      }
      default:
        return res.status(400).json({ error: 'Unknown link type' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
