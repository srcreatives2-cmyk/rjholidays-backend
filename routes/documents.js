const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');
const { buildInvoicePdf, buildReceiptPdf, buildVoucherPdf, buildBookingConfirmationPdf } = require('../lib/pdf');

router.use(requireAuth);

async function loadBookingAndCustomer(bookingId) {
  const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (error || !booking) return { error: 'Booking not found' };
  const { data: customer } = await supabase.from('customers').select('*').eq('id', booking.customer_id).single();
  return { booking, customer };
}

async function logDocument(bookingId, type, pdfBuffer) {
  // file_url left null since we don't have persistent object storage wired up yet —
  // documents are generated on-demand. The `documents` table still logs that it happened.
  await supabase.from('documents').insert({ booking_id: bookingId, type, generated_at: new Date().toISOString() });
}

router.get('/invoice/:bookingId', async (req, res) => {
  const { booking, customer, error } = await loadBookingAndCustomer(req.params.bookingId);
  if (error) return res.status(404).json({ error });
  const pdf = await buildInvoicePdf(booking, customer);
  await logDocument(booking.id, 'invoice');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Invoice-${booking.booking_code}.pdf"`);
  res.send(pdf);
});

router.get('/receipt/:paymentId', async (req, res) => {
  const { data: payment, error: payErr } = await supabase.from('payments').select('*').eq('id', req.params.paymentId).single();
  if (payErr || !payment) return res.status(404).json({ error: 'Payment not found' });
  const { booking, customer } = await loadBookingAndCustomer(payment.booking_id);
  const pdf = await buildReceiptPdf(payment, booking, customer);
  await logDocument(booking.id, 'receipt');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Receipt-${booking.booking_code}.pdf"`);
  res.send(pdf);
});

router.get('/voucher/:bookingId/:type', async (req, res) => {
  const { type } = req.params; // 'hotel' | 'cab'
  const { booking, customer, error } = await loadBookingAndCustomer(req.params.bookingId);
  if (error) return res.status(404).json({ error });
  const pdf = await buildVoucherPdf(booking, customer, type);
  await logDocument(booking.id, 'voucher');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-voucher-${booking.booking_code}.pdf"`);
  res.send(pdf);
});

router.get('/booking-confirmation/:bookingId', async (req, res) => {
  const { booking, customer, error } = await loadBookingAndCustomer(req.params.bookingId);
  if (error) return res.status(404).json({ error });
  const { data: quote } = booking.quote_id
    ? await supabase.from('quotes').select('itinerary').eq('id', booking.quote_id).single()
    : { data: null };
  const pdf = await buildBookingConfirmationPdf(booking, customer, quote?.itinerary || []);
  await logDocument(booking.id, 'voucher'); // closest existing type; booking confirmation isn't a separate documents.type value
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Confirmation-${booking.booking_code}.pdf"`);
  res.send(pdf);
});

module.exports = router;
