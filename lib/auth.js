const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Single-user mode: one admin account defined via env vars (ADMIN_EMAIL / ADMIN_PASSWORD_HASH).
// This intentionally avoids a `staff` login table for now — see README for how to generate the password hash.
//
// Uses Node's built-in crypto.scrypt for password hashing (no external dependency needed —
// equally secure to bcrypt, and avoids relying on a package that may drift between environments).
// Hash format stored in ADMIN_PASSWORD_HASH: "salt_hex:derived_key_hex"

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, 'hex');
  if (derivedKey.length !== keyBuffer.length) return false;
  return crypto.timingSafeEqual(derivedKey, keyBuffer);
}

function login(email, password) {
  if (email !== process.env.ADMIN_EMAIL) return null;
  const valid = verifyPassword(password, process.env.ADMIN_PASSWORD_HASH || '');
  if (!valid) return null;
  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  return token;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { login, requireAuth, hashPassword, verifyPassword };
