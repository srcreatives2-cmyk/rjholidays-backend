const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');

router.use(requireAuth);

// PHASE 13 — Quotes needing follow-up: sent but not accepted, and either
// nearing their validity date or stale (sent 5+ days ago with no response).
router.get('/needs-follow-up', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const soonThreshold = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const staleThreshold = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const { data: sentQuotes, error } = await supabase
      .from('quotes')
      .select('*, customers(name, phone, whatsapp)')
      .eq('status', 'Sent');
    if (error) throw error;

    const needsFollowUp = (sentQuotes || []).filter((q) => {
      const nearingExpiry = q.validity_date && q.validity_date >= today && q.validity_date <= soonThreshold;
      const stale = q.updated_at && q.updated_at <= staleThreshold;
      return nearingExpiry || stale;
    });

    res.json(needsFollowUp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PHASE 14 — Source-to-revenue conversion report.
// Groups by lead_source: enquiries -> quotes sent -> accepted -> bookings -> revenue.
router.get('/conversion-report', async (req, res) => {
  try {
    const { data: leads, error } = await supabase.from('leads').select('id, lead_source, customer_id');
    if (error) throw error;

    const { data: quotes } = await supabase.from('quotes').select('lead_id, status, total_amount');
    const { data: bookings } = await supabase.from('bookings').select('quote_id, total_amount, booking_status');

    const quotesByLead = {};
    (quotes || []).forEach((q) => {
      quotesByLead[q.lead_id] = quotesByLead[q.lead_id] || [];
      quotesByLead[q.lead_id].push(q);
    });

    const report = {};
    (leads || []).forEach((lead) => {
      const source = lead.lead_source || 'Other';
      if (!report[source]) {
        report[source] = { leads: 0, quotes_sent: 0, quotes_accepted: 0, bookings: 0, revenue: 0 };
      }
      report[source].leads += 1;

      const leadQuotes = quotesByLead[lead.id] || [];
      leadQuotes.forEach((q) => {
        if (['Sent', 'Accepted', 'Expired'].includes(q.status)) report[source].quotes_sent += 1;
        if (q.status === 'Accepted') report[source].quotes_accepted += 1;
      });
    });

    // Attribute booking revenue back to source via quote -> lead -> source
    const { data: quotesWithId } = await supabase.from('quotes').select('id, lead_id, total_amount');
    const leadSourceByLeadId = {};
    (leads || []).forEach((l) => { leadSourceByLeadId[l.id] = l.lead_source || 'Other'; });
    const sourceByQuoteId = {};
    (quotesWithId || []).forEach((q) => { sourceByQuoteId[q.id] = leadSourceByLeadId[q.lead_id]; });

    (bookings || []).forEach((b) => {
      const source = sourceByQuoteId[b.quote_id] || 'Other';
      if (!report[source]) report[source] = { leads: 0, quotes_sent: 0, quotes_accepted: 0, bookings: 0, revenue: 0 };
      report[source].bookings += 1;
      if (b.booking_status !== 'Cancelled') report[source].revenue += Number(b.total_amount || 0);
    });

    res.json(report);
  } catch (err) {
    console.error('[GET /insights/conversion-report]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
