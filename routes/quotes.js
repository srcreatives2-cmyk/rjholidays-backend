const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');
const { generateQuoteCode } = require('../lib/codes');
const { calculateQuotePrice } = require('../lib/pricing');
const { buildQuotePdf } = require('../lib/pdf');
const { sendQuoteEmail } = require('../lib/email');

// ---------- ADMIN ROUTES ----------

// CREATE a quote from a lead. Auto-calculates base + vehicle cost; admin supplies manual adjustments.
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      lead_id, package_id, travel_date, return_date, adults, children,
      vehicle_type, hotel_category, hotel_adjustment, room_config_note, room_config_adjustment,
      addon_ids, coupon_code, itinerary, inclusions, exclusions,
      cancellation_policy, terms_and_conditions, validity_date,
      advance_amount, // admin sets manually, case-by-case (per approved Phase 4 spec)
    } = req.body;

    if (!lead_id || !package_id) return res.status(400).json({ error: 'lead_id and package_id are required' });

    const { data: lead, error: leadErr } = await supabase.from('leads').select('*').eq('id', lead_id).single();
    if (leadErr) return res.status(404).json({ error: 'Lead not found' });

    const { data: pkg } = await supabase.from('packages').select('*').eq('id', package_id).single();

    const pricing = await calculateQuotePrice({
      packageId: package_id,
      travelDate: travel_date,
      adults, children,
      vehicleType: vehicle_type,
      destination: pkg?.destination,
      hotelAdjustment: hotel_adjustment,
      roomConfigAdjustment: room_config_adjustment,
      addonIds: addon_ids || [],
      couponCode: coupon_code,
    });

    const advance = Number(advance_amount || 0);
    const balance = Math.max(0, pricing.totalAmount - advance);

    const quote_code = generateQuoteCode();

    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        quote_code,
        lead_id,
        customer_id: lead.customer_id,
        package_id,
        travel_date, return_date, adults, children,
        base_rate_per_person: pricing.baseRatePerPerson,
        season_label: pricing.seasonLabel,
        vehicle_type, vehicle_cost: pricing.vehicleCost,
        hotel_category, hotel_adjustment: pricing.hotelAdjustment,
        room_config_note, room_config_adjustment: pricing.roomConfigAdjustment,
        addons: pricing.addons,
        coupon_code, discount_amount: pricing.discountAmount,
        total_amount: pricing.totalAmount,
        advance_amount: advance,
        balance_amount: balance,
        itinerary: itinerary || [],
        inclusions, exclusions, cancellation_policy, terms_and_conditions,
        validity_date,
        status: 'Draft',
      })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json(quote);
  } catch (err) {
    console.error('[POST /quotes]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET single quote (admin)
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('quotes').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Quote not found' });
  res.json(data);
});

// LIST quotes for a lead
router.get('/', requireAuth, async (req, res) => {
  const { lead_id } = req.query;
  let query = supabase.from('quotes').select('*').order('created_at', { ascending: false });
  if (lead_id) query = query.eq('lead_id', lead_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// SEND quote — generates PDF, emails it with the public view link, updates lead status
router.post('/:id/send', requireAuth, async (req, res) => {
  try {
    const { data: quote, error } = await supabase.from('quotes').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Quote not found' });

    const { data: customer } = await supabase.from('customers').select('*').eq('id', quote.customer_id).single();
    const { data: pkg } = await supabase.from('packages').select('*').eq('id', quote.package_id).single();

    if (!customer.email) {
      return res.status(400).json({ error: 'Customer has no email on file — cannot send quote via email.' });
    }

    const pdfBuffer = await buildQuotePdf(quote, customer, pkg);
    const viewUrl = `${process.env.PUBLIC_BASE_URL}/quote/${quote.view_token}`;

    await sendQuoteEmail(quote, customer, pdfBuffer, viewUrl);

    await supabase.from('quotes').update({ status: 'Sent', updated_at: new Date().toISOString() }).eq('id', quote.id);
    await supabase.from('leads').update({ status: 'Quotation Sent', updated_at: new Date().toISOString() }).eq('id', quote.lead_id);

    res.json({ success: true, view_url: viewUrl });
  } catch (err) {
    console.error('[POST /quotes/:id/send]', err);
    res.status(500).json({ error: err.message });
  }
});

// DOWNLOAD PDF directly (admin convenience)
router.get('/:id/pdf', requireAuth, async (req, res) => {
  try {
    const { data: quote, error } = await supabase.from('quotes').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Quote not found' });
    const { data: customer } = await supabase.from('customers').select('*').eq('id', quote.customer_id).single();
    const { data: pkg } = await supabase.from('packages').select('*').eq('id', quote.package_id).single();

    const pdfBuffer = await buildQuotePdf(quote, customer, pkg);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.quote_code}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- PUBLIC ROUTES (no auth — accessed via the emailed view_token link) ----------

// VIEW quote by token (customer-facing, no login required)
router.get('/public/:token', async (req, res) => {
  const { data: quote, error } = await supabase.from('quotes').select('*').eq('view_token', req.params.token).single();
  if (error) return res.status(404).json({ error: 'Quote not found' });

  if (quote.validity_date && new Date(quote.validity_date) < new Date() && quote.status !== 'Accepted') {
    await supabase.from('quotes').update({ status: 'Expired' }).eq('id', quote.id);
    quote.status = 'Expired';
  }

  const { data: customer } = await supabase.from('customers').select('name, phone').eq('id', quote.customer_id).single();
  const { data: pkg } = await supabase.from('packages').select('destination, name').eq('id', quote.package_id).single();

  res.json({ ...quote, customer, package: pkg });
});

// ACCEPT quote (customer-facing)
router.post('/public/:token/accept', async (req, res) => {
  const { data: quote, error } = await supabase.from('quotes').select('*').eq('view_token', req.params.token).single();
  if (error) return res.status(404).json({ error: 'Quote not found' });
  if (quote.status === 'Expired') return res.status(400).json({ error: 'This quote has expired.' });

  await supabase.from('quotes').update({ status: 'Accepted', updated_at: new Date().toISOString() }).eq('id', quote.id);
  await supabase.from('leads').update({ status: 'Negotiation', updated_at: new Date().toISOString() }).eq('id', quote.lead_id);

  // Phase 15: increment coupon usage count now that the discount has actually been used
  if (quote.coupon_code) {
    await supabase.rpc('increment_coupon_usage', { coupon_code_input: quote.coupon_code });
  }

  res.json({ success: true, message: 'Quote accepted. Our team will be in touch to confirm your booking.' });
});

module.exports = router;
