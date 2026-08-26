// Phase 9 — WhatsApp Semi-Automation (Interim approach, per approved spec)
//
// Since Meta Business verification hasn't been done yet, we don't auto-send WhatsApp
// messages via the Cloud API. Instead, this generates ready-to-send wa.me links with
// pre-filled text, which the admin clicks to send manually — same mechanic as the
// existing "Book Now" buttons on the live site.
//
// When Cloud API automation is added later, only this file's callers change
// (swap "return a link" for "call the Cloud API") — the message content and trigger
// points stay the same.

function buildWaLink(phone, message) {
  const digitsOnly = String(phone || '').replace(/[^\d]/g, '');
  const withCountryCode = digitsOnly.startsWith('91') ? digitsOnly : `91${digitsOnly}`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

const templates = {
  newEnquiry: (enquiry) =>
    `Hi ${enquiry.name}, thank you for reaching out to RJ Holidays! We've received your enquiry for ${enquiry.destination} (Ref: ${enquiry.enquiry_code}). Our team will get back to you shortly with the best options for your trip.`,

  quoteSent: (quote, customer, viewUrl) =>
    `Hi ${customer.name}, your travel quotation for ${quote.season_label || 'your trip'} is ready! Total: Rs. ${quote.total_amount} (Advance: Rs. ${quote.advance_amount}). View and accept here: ${viewUrl}`,

  quoteReminder: (quote, customer, viewUrl) =>
    `Hi ${customer.name}, just a reminder that your travel quotation (Ref: ${quote.quote_code}) is expiring soon${quote.validity_date ? ' on ' + quote.validity_date : ''}. View it here: ${viewUrl}`,

  paymentPending: (booking, customer) =>
    `Hi ${customer.name}, your booking (Ref: ${booking.booking_code}) has a pending balance of Rs. ${booking.balance_due}. Please let us know if you'd like to proceed with payment.`,

  paymentSuccessful: (booking, customer) =>
    `Hi ${customer.name}, we've received your payment. Your booking (Ref: ${booking.booking_code}) is now confirmed! We'll share your itinerary and travel documents shortly.`,

  preTrip: (booking, customer) =>
    `Hi ${customer.name}, your trip to ${booking.destination || ''} is coming up! Ref: ${booking.booking_code}. Let us know if you need anything before you travel.`,

  duringTrip: (booking, customer) =>
    `Hi ${customer.name}, hope you're having a wonderful trip! Reach out anytime if you need assistance. — RJ Holidays`,

  postTrip: (booking, customer) =>
    `Hi ${customer.name}, thank you for travelling with RJ Holidays! We hope you had a memorable trip. We'd love to hear your feedback.`,

  reviewRequest: (booking, customer, reviewUrl) =>
    `Hi ${customer.name}, we hope you loved your trip with RJ Holidays! Could you spare a minute to share your experience? ${reviewUrl}`,
};

module.exports = { buildWaLink, templates };
