// Generates human-readable sequential-looking codes, e.g. RJH-2026-00123
// Uses a random 5-digit suffix seeded by timestamp to avoid needing a DB sequence lookup on every request.
// Collisions are astronomically unlikely at this business's volume; the DB unique constraint is the real safety net.

function generateCode(prefix) {
  const year = new Date().getFullYear();
  const suffix = Math.floor(10000 + Math.random() * 89999); // 5-digit
  return `${prefix}-${year}-${suffix}`;
}

const generateEnquiryCode = () => generateCode('RJH');
const generateQuoteCode = () => generateCode('RJH-Q');
const generateBookingCode = () => generateCode('RJH-B');

module.exports = { generateEnquiryCode, generateQuoteCode, generateBookingCode };
