const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');

router.use(requireAuth); // everything in this file is admin-only

const VALID_STATUSES = [
  'New Lead','Contacted','Requirement Confirmed','Quotation Sent','Follow-up',
  'Negotiation','Payment Pending','Confirmed','Traveling','Completed','Lost',
];

// LIST leads — filterable by status, destination, date range; searchable by name/phone/lead code
router.get('/', async (req, res) => {
  try {
    const { status, destination, search, from, to } = req.query;
    let query = supabase.from('leads').select('*, customers(name, phone, whatsapp, email)').order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (destination) query = query.ilike('destination', `%${destination}%`);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (search) query = query.or(`lead_code.ilike.%${search}%`);

    const { data, error } = await query.limit(300);
    if (error) throw error;

    // If searching, also match on joined customer name/phone (Supabase can't OR across joins directly)
    let results = data;
    if (search && results) {
      const s = search.toLowerCase();
      results = results.filter(
        (l) =>
          l.lead_code?.toLowerCase().includes(s) ||
          l.customers?.name?.toLowerCase().includes(s) ||
          l.customers?.phone?.includes(s)
      );
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single lead with full customer history (past leads/bookings for that customer)
router.get('/:id', async (req, res) => {
  try {
    const { data: lead, error } = await supabase
      .from('leads')
      .select('*, customers(*)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    const { data: history } = await supabase
      .from('leads')
      .select('id, lead_code, destination, status, created_at')
      .eq('customer_id', lead.customer_id)
      .neq('id', lead.id)
      .order('created_at', { ascending: false });

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, booking_code, travel_date, booking_status, payment_status, total_amount')
      .eq('customer_id', lead.customer_id)
      .order('created_at', { ascending: false });

    res.json({ ...lead, customer_history: history || [], past_bookings: bookings || [] });
  } catch (err) {
    res.status(404).json({ error: 'Lead not found' });
  }
});

// UPDATE status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const { data, error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ADD a note (timestamped)
router.post('/:id/notes', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Note text is required' });

  const { data: lead, error: fetchErr } = await supabase.from('leads').select('notes').eq('id', req.params.id).single();
  if (fetchErr) return res.status(404).json({ error: 'Lead not found' });

  const notes = [...(lead.notes || []), { text, created_at: new Date().toISOString() }];
  const { data, error } = await supabase.from('leads').update({ notes }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// SET follow-up date
router.patch('/:id/follow-up', async (req, res) => {
  const { follow_up_date } = req.body;
  const { data, error } = await supabase
    .from('leads')
    .update({ follow_up_date, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
