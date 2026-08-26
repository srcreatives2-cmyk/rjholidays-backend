const jwt = require('jsonwebtoken');
const supabase = require('./supabase');

// Generates a one-time magic-link token, valid for 30 minutes, and stores it.
const { baseUrl } = require('./codes');

async function createMagicLink(customerId) {
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('customer_login_tokens')
    .insert({ customer_id: customerId, expires_at })
    .select()
    .single();
  if (error) throw error;
  return `${baseUrl()}/customer/verify/${data.token}`;
}

// Verifies a magic-link token (single use), returns a session JWT for the customer dashboard.
async function verifyMagicLink(token) {
  const { data: row, error } = await supabase
    .from('customer_login_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error || !row) return { error: 'Invalid or expired link' };
  if (row.used_at) return { error: 'This link has already been used. Please request a new one.' };
  if (new Date(row.expires_at) < new Date()) return { error: 'This link has expired. Please request a new one.' };

  await supabase.from('customer_login_tokens').update({ used_at: new Date().toISOString() }).eq('id', row.id);

  const sessionToken = jwt.sign({ customer_id: row.customer_id, type: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  return { sessionToken, customer_id: row.customer_id };
}

function requireCustomerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'customer') throw new Error('wrong token type');
    req.customerId = decoded.customer_id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { createMagicLink, verifyMagicLink, requireCustomerAuth };
