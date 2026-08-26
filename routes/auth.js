const express = require('express');
const router = express.Router();
const { login } = require('../lib/auth');

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const token = login(email, password);
  if (!token) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({ token });
});

module.exports = router;
