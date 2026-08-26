const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');

router.use(requireAuth);

// ---- PACKAGES ----
router.get('/packages', async (req, res) => {
  const { data, error } = await supabase.from('packages').select('*').order('destination');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/packages', async (req, res) => {
  const { data, error } = await supabase.from('packages').insert(req.body).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.patch('/packages/:id', async (req, res) => {
  const { data, error } = await supabase.from('packages').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---- SEASONAL PRICING RULES ----
router.get('/pricing-rules', async (req, res) => {
  const { package_id } = req.query;
  let query = supabase.from('package_pricing_rules').select('*').order('start_date');
  if (package_id) query = query.eq('package_id', package_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/pricing-rules', async (req, res) => {
  const { data, error } = await supabase.from('package_pricing_rules').insert(req.body).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.delete('/pricing-rules/:id', async (req, res) => {
  const { error } = await supabase.from('package_pricing_rules').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ---- VEHICLE RATES ----
router.get('/vehicle-rates', async (req, res) => {
  const { data, error } = await supabase.from('vehicle_rates').select('*').order('vehicle_type');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/vehicle-rates', async (req, res) => {
  const { data, error } = await supabase.from('vehicle_rates').insert(req.body).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.delete('/vehicle-rates/:id', async (req, res) => {
  const { error } = await supabase.from('vehicle_rates').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ---- ADD-ONS ----
router.get('/addons', async (req, res) => {
  const { data, error } = await supabase.from('addons').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/addons', async (req, res) => {
  const { data, error } = await supabase.from('addons').insert(req.body).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.patch('/addons/:id', async (req, res) => {
  const { data, error } = await supabase.from('addons').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
