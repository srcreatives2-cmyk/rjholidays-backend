const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');

router.use(requireAuth);

router.get('/summary', async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [
      { count: totalLeads },
      { count: newLeads },
      { count: pendingQuotes },
      { count: confirmedBookings },
      { count: pendingPaymentBookings },
      { data: upcomingTrips },
      { data: allPayments },
      { data: monthPayments },
      { count: totalBookingsForConversion },
    ] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'Sent'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('booking_status', 'Confirmed'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('payment_status', 'Payment Pending'),
      supabase.from('bookings').select('booking_code, travel_date, customer_id').gte('travel_date', today).lte('travel_date', thirtyDaysFromNow),
      supabase.from('payments').select('amount').eq('status', 'verified'),
      supabase.from('payments').select('amount').eq('status', 'verified').gte('created_at', monthStart),
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
    ]);

    const revenueAllTime = (allPayments || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const revenueThisMonth = (monthPayments || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const conversionRate = totalLeads > 0 ? ((totalBookingsForConversion / totalLeads) * 100).toFixed(1) : '0.0';

    res.json({
      total_leads: totalLeads || 0,
      new_leads_7d: newLeads || 0,
      pending_quotes: pendingQuotes || 0,
      confirmed_bookings: confirmedBookings || 0,
      pending_payment_bookings: pendingPaymentBookings || 0,
      upcoming_trips_30d: upcomingTrips || [],
      revenue_this_month: revenueThisMonth,
      revenue_all_time: revenueAllTime,
      conversion_rate_pct: conversionRate,
    });
  } catch (err) {
    console.error('[GET /dashboard/summary]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
