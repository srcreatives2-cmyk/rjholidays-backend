const express = require('express');
const router = express.Router();
const { login } = require('../lib/auth');

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const token = login(String(email).trim(), String(password));

    if (!token) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.json({ token });
  } catch (err) {
    // Log the real server-side cause without exposing secrets to the browser.
    console.error('Admin login error:', err.message);

    if (err.code === 'AUTH_CONFIG_MISSING' || err.code === 'AUTH_CONFIG_INVALID') {
      return res.status(503).json({
        error: 'Authentication service is not configured correctly'
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
