const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { code, discount_type, discount_value, destination, package_id, min_booking_value, expiry_date, usage_limit } = req.body;
  if (!code || !discount_type || !discount_value) {
    return res.status(400).json({ error: 'code, discount_type, and discount_value are required' });
  }
  const { data, error } = await supabase
    .from('coupons')
    .insert({ code, discount_type, discount_value, destination, package_id, min_booking_value, expiry_date, usage_limit })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.patch('/:id', async (req, res) => {
  const { data, error } = await supabase.from('coupons').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('coupons').update({ is_active: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
