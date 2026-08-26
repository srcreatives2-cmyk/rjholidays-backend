const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html, attachments }) {
  try {
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'RJ Holidays <bookings@rjholidays.online>',
      to,
      subject,
      html,
      attachments, // [{ filename, content: Buffer }]
    });
    return result;
  } catch (err) {
    console.error('[email] Failed to send:', err.message);
    // Don't throw — a failed notification email should never break the enquiry/quote flow.
    return null;
  }
}

async function notifyAdminNewEnquiry(enquiry) {
  return sendEmail({
    to: process.env.NOTIFY_EMAIL,
    subject: `New Enquiry — ${enquiry.enquiry_code} — ${enquiry.destination}`,
    html: `
      <h2>New enquiry received</h2>
      <p><strong>Lead ID:</strong> ${enquiry.enquiry_code}</p>
      <p><strong>Name:</strong> ${enquiry.name}</p>
      <p><strong>Mobile:</strong> ${enquiry.mobile}</p>
      <p><strong>WhatsApp:</strong> ${enquiry.whatsapp || '-'}</p>
      <p><strong>Email:</strong> ${enquiry.email || '-'}</p>
      <p><strong>Destination:</strong> ${enquiry.destination}</p>
      <p><strong>Travel dates:</strong> ${enquiry.travel_date || '?'} to ${enquiry.return_date || '?'}</p>
      <p><strong>Travellers:</strong> ${enquiry.adults} adults, ${enquiry.children} children</p>
      <p><strong>Budget:</strong> ${enquiry.budget || '-'}</p>
      <p><strong>Special requirements:</strong> ${enquiry.special_requirements || '-'}</p>
      <hr/>
      <p><strong>Source:</strong> ${enquiry.utm_source || 'Direct/Organic'} ${enquiry.referrer_url ? `(via ${enquiry.referrer_url})` : ''}</p>
      <p><a href="${process.env.PUBLIC_BASE_URL}/admin">Open Admin Panel</a></p>
    `,
  });
}

async function confirmEnquiryToCustomer(enquiry) {
  if (!enquiry.email) return null;
  return sendEmail({
    to: enquiry.email,
    subject: `We've received your enquiry — ${enquiry.enquiry_code}`,
    html: `
      <p>Hi ${enquiry.name},</p>
      <p>Thanks for reaching out to RJ Holidays! We've received your enquiry for <strong>${enquiry.destination}</strong> and your reference number is:</p>
      <h2>${enquiry.enquiry_code}</h2>
      <p>Our team will get back to you shortly with the best options for your trip.</p>
      <p>Warm regards,<br/>RJ Holidays</p>
    `,
  });
}

async function sendQuoteEmail(quote, customer, pdfBuffer, viewUrl) {
  return sendEmail({
    to: customer.email,
    subject: `Your travel quotation — ${quote.quote_code}`,
    html: `
      <p>Hi ${customer.name},</p>
      <p>Your personalized travel quotation is ready. You can view it online or check the attached PDF.</p>
      <p><a href="${viewUrl}">View & Accept Your Quote</a></p>
      <p><strong>Total:</strong> ₹${quote.total_amount}<br/>
      <strong>Advance:</strong> ₹${quote.advance_amount}<br/>
      <strong>Balance:</strong> ₹${quote.balance_amount}<br/>
      <strong>Valid until:</strong> ${quote.validity_date || '-'}</p>
      <p>Warm regards,<br/>RJ Holidays</p>
    `,
    attachments: pdfBuffer
      ? [{ filename: `Quotation-${quote.quote_code}.pdf`, content: pdfBuffer }]
      : undefined,
  });
}

async function sendMagicLinkEmail(customer, magicLinkUrl) {
  return sendEmail({
    to: customer.email,
    subject: 'Your RJ Holidays booking login link',
    html: `
      <p>Hi ${customer.name},</p>
      <p>Click below to securely view your booking. This link expires in 30 minutes and can only be used once.</p>
      <p><a href="${magicLinkUrl}">View My Booking</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p>Warm regards,<br/>RJ Holidays</p>
    `,
  });
}

async function sendBookingConfirmationEmail(booking, customer, magicLinkUrl) {
  return sendEmail({
    to: customer.email,
    subject: `Booking Confirmed — ${booking.booking_code}`,
    html: `
      <p>Hi ${customer.name},</p>
      <p>Your booking is confirmed! Reference: <strong>${booking.booking_code}</strong></p>
      <p><strong>Travel dates:</strong> ${booking.travel_date || '-'} to ${booking.return_date || '-'}</p>
      <p><strong>Total:</strong> ₹${booking.total_amount} | <strong>Paid:</strong> ₹${booking.advance_paid} | <strong>Balance:</strong> ₹${booking.balance_due}</p>
      ${magicLinkUrl ? `<p><a href="${magicLinkUrl}">View your booking dashboard</a></p>` : ''}
      <p>Warm regards,<br/>RJ Holidays</p>
    `,
  });
}

module.exports = {
  sendEmail,
  notifyAdminNewEnquiry,
  confirmEnquiryToCustomer,
  sendQuoteEmail,
  sendMagicLinkEmail,
  sendBookingConfirmationEmail,
};
