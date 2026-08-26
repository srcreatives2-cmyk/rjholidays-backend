// Razorpay integration.
// CRITICAL: payment confirmation only ever happens via verified webhook signature —
// a frontend "payment success" redirect is NEVER treated as proof of payment on its own.

const crypto = require('crypto');
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Creates a Razorpay Order server-side. Amount is in paise (₹1 = 100 paise).
async function createOrder({ amount, currency = 'INR', receipt, notes }) {
  return razorpay.orders.create({
    amount: Math.round(amount * 100),
    currency,
    receipt,
    notes,
  });
}

// Verifies the checkout-side signature (used right after checkout completes, as an
// early UX signal only — NOT treated as final proof; the webhook below is authoritative).
function verifyPaymentSignature({ order_id, payment_id, signature }) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${order_id}|${payment_id}`)
    .digest('hex');
  return expected === signature;
}

// Verifies an incoming webhook's signature against the raw request body.
// `rawBody` must be the exact unparsed request body Razorpay sent (Buffer/string).
function verifyWebhookSignature(rawBody, signatureHeader) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return expected === signatureHeader;
}

module.exports = { razorpay, createOrder, verifyPaymentSignature, verifyWebhookSignature };
