const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');
const { generateEnquiryCode } = require('../lib/codes');
const { notifyAdminNewEnquiry, confirmEnquiryToCustomer } = require('../lib/email');

// PUBLIC: called from the website's enquiry form (Phase 5)
router.post('/', async (req, res) => {
  try {
    const {
      name, mobile, whatsapp, email, destination, travel_date, return_date,
      adults, children, budget, hotel_category, meal_preference,
      vehicle_requirement, flight_requirement, special_requirements,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      referrer_url, landing_page,
    } = req.body;

    if (!name || !mobile || !destination) {
      return res.status(400).json({ error: 'name, mobile, and destination are required' });
    }

    // Find or create the customer by phone number
    let { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', mobile)
      .maybeSingle();

    if (!customer) {
      const { data: newCustomer, error: custErr } = await supabase
        .from('customers')
        .insert({ name, phone: mobile, whatsapp, email, country: 'India' })
        .select()
        .single();
      if (custErr) throw custErr;
      customer = newCustomer;
    }

    const enquiry_code = generateEnquiryCode();

    const { data: enquiry, error: enqErr } = await supabase
      .from('enquiries')
      .insert({
        enquiry_code,
        customer_id: customer.id,
        name, mobile, whatsapp, email, destination,
        travel_date: travel_date || null,
        return_date: return_date || null,
        adults: adults || 1,
        children: children || 0,
        budget, hotel_category, meal_preference, vehicle_requirement,
        flight_requirement: !!flight_requirement,
        special_requirements,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        referrer_url, landing_page,
      })
      .select()
      .single();
    if (enqErr) throw enqErr;

    // Auto-create a Lead from this enquiry (Phase 6)
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .insert({
        lead_code: enquiry_code,
        customer_id: customer.id,
        enquiry_id: enquiry.id,
        destination, travel_date: travel_date || null, return_date: return_date || null,
        adults: adults || 1, children: children || 0,
        budget, requirements: special_requirements,
        lead_source: utm_source ? mapUtmToSource(utm_source) : (referrer_url ? 'Referral' : 'Direct'),
        status: 'New Lead',
        utm_source, utm_medium, utm_campaign, referrer_url,
      })
      .select()
      .single();
    if (leadErr) throw leadErr;

    await supabase.from('enquiries').update({ lead_id: lead.id }).eq('id', enquiry.id);

    // Fire-and-forget notifications — never block the response on email delivery
    notifyAdminNewEnquiry(enquiry).catch(() => {});
    confirmEnquiryToCustomer(enquiry).catch(() => {});

    res.status(201).json({
      success: true,
      enquiry_code,
      message: 'Enquiry received. We will get back to you shortly.',
    });
  } catch (err) {
    console.error('[POST /enquiries]', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or contact us on WhatsApp.' });
  }
});

function mapUtmToSource(utm_source) {
  const s = (utm_source || '').toLowerCase();
  if (s.includes('google')) return 'Google Ads';
  if (s.includes('meta') || s.includes('facebook')) return 'Meta Ads';
  if (s.includes('instagram')) return 'Instagram';
  if (s.includes('whatsapp')) return 'WhatsApp';
  return 'Other';
}

// ADMIN: list all enquiries (mostly for debugging; CRM works off /leads)
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
