const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Single-user admin authentication configured through environment variables.
// Required: ADMIN_EMAIL, ADMIN_PASSWORD_HASH, JWT_SECRET
// Password hash format: "salt_hex:derived_key_hex"

function hashPassword(password) {
  if (typeof password !== 'string' || !password) {
    throw new Error('Password is required to generate a hash');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || !storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [salt, key] = parts;
  if (!/^[0-9a-f]+$/i.test(salt) || salt.length < 16) return false;
  if (!/^[0-9a-f]+$/i.test(key) || key.length !== 128) return false;

  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, 'hex');
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  } catch (err) {
    console.error('Password verification failed:', err.message);
    return false;
  }
}

function assertAuthConfig() {
  const missing = [];
  if (!process.env.ADMIN_EMAIL) missing.push('ADMIN_EMAIL');
  if (!process.env.ADMIN_PASSWORD_HASH) missing.push('ADMIN_PASSWORD_HASH');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');

  if (missing.length) {
    const error = new Error(`Authentication configuration missing: ${missing.join(', ')}`);
    error.code = 'AUTH_CONFIG_MISSING';
    throw error;
  }

  const hashParts = process.env.ADMIN_PASSWORD_HASH.split(':');
  if (
    hashParts.length !== 2 ||
    !/^[0-9a-f]+$/i.test(hashParts[0]) ||
    hashParts[0].length < 16 ||
    !/^[0-9a-f]+$/i.test(hashParts[1]) ||
    hashParts[1].length !== 128
  ) {
    const error = new Error('ADMIN_PASSWORD_HASH has an invalid format; expected salt_hex:derived_key_hex');
    error.code = 'AUTH_CONFIG_INVALID';
    throw error;
  }
}

function login(email, password) {
  assertAuthConfig();

  if (email !== process.env.ADMIN_EMAIL) return null;
  if (!verifyPassword(password, process.env.ADMIN_PASSWORD_HASH)) return null;

  return jwt.sign(
    { email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  if (!process.env.JWT_SECRET) {
    console.error('Authentication configuration error: JWT_SECRET is missing');
    return res.status(503).json({ error: 'Authentication service is not configured' });
  }

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { login, requireAuth, hashPassword, verifyPassword };
