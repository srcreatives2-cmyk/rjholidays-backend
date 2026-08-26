// Pricing engine — implements the approved Phase 4 calculation flow:
//
//   Base per-person rate (season-adjusted)
//   x traveller count (adults + children, same rate)
//   + vehicle cost (auto-looked-up by group size + type)
//   + hotel category adjustment (manual, admin-entered)
//   + room configuration adjustment (manual, only if non-double-occupancy)
//   + add-ons selected (admin-managed list, priced per item)
//   - coupon/discount
//   = Final Price -> split into Advance + Balance (admin sets manually, case-by-case)

const supabase = require('./supabase');

async function getSeasonAdjustedBaseRate(packageId, travelDate) {
  const { data: pkg, error } = await supabase
    .from('packages')
    .select('*')
    .eq('id', packageId)
    .single();
  if (error || !pkg) throw new Error('Package not found');

  let rate = Number(pkg.base_price_double_occupancy);
  let seasonLabel = 'Standard';

  if (travelDate) {
    const { data: rules } = await supabase
      .from('package_pricing_rules')
      .select('*')
      .eq('package_id', packageId)
      .lte('start_date', travelDate)
      .gte('end_date', travelDate);

    if (rules && rules.length > 0) {
      const rule = rules[0]; // first matching rule wins
      seasonLabel = rule.label;
      if (rule.modifier_type === 'percent') {
        rate = rate + (rate * Number(rule.modifier_value)) / 100;
      } else {
        rate = rate + Number(rule.modifier_value);
      }
    }
  }

  return { baseRate: rate, seasonLabel, package: pkg };
}

async function getVehicleCost(vehicleType, groupSize, destination) {
  if (!vehicleType || !groupSize) return 0;
  let query = supabase
    .from('vehicle_rates')
    .select('*')
    .eq('vehicle_type', vehicleType)
    .lte('min_group_size', groupSize)
    .gte('max_group_size', groupSize);

  const { data: rates } = await query;
  if (!rates || rates.length === 0) return 0;

  // Prefer a destination-specific rate over a generic one
  const specific = rates.find((r) => r.destination === destination);
  return Number((specific || rates[0]).price);
}

async function calculateQuotePrice({
  packageId,
  travelDate,
  adults,
  children,
  vehicleType,
  destination,
  hotelAdjustment = 0,
  roomConfigAdjustment = 0,
  addonIds = [],
  couponCode = null,
}) {
  const travellerCount = Number(adults || 0) + Number(children || 0);
  const { baseRate, seasonLabel } = await getSeasonAdjustedBaseRate(packageId, travelDate);

  const baseTotal = baseRate * travellerCount;
  const vehicleCost = await getVehicleCost(vehicleType, travellerCount, destination);

  let addonsTotal = 0;
  let addonDetails = [];
  if (addonIds.length > 0) {
    const { data: addons } = await supabase.from('addons').select('*').in('id', addonIds);
    if (addons) {
      addonDetails = addons.map((a) => ({ name: a.name, price: Number(a.price) }));
      addonsTotal = addonDetails.reduce((sum, a) => sum + a.price, 0);
    }
  }

  let subtotal =
    baseTotal + vehicleCost + Number(hotelAdjustment || 0) + Number(roomConfigAdjustment || 0) + addonsTotal;

  let discountAmount = 0;
  if (couponCode) {
    const { data: coupon } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode)
      .eq('is_active', true)
      .maybeSingle();

    if (coupon) {
      const notExpired = !coupon.expiry_date || new Date(coupon.expiry_date) >= new Date();
      const underUsageLimit = !coupon.usage_limit || coupon.times_used < coupon.usage_limit;
      const meetsMin = subtotal >= Number(coupon.min_booking_value || 0);
      if (notExpired && underUsageLimit && meetsMin) {
        discountAmount =
          coupon.discount_type === 'percent'
            ? (subtotal * Number(coupon.discount_value)) / 100
            : Number(coupon.discount_value);
      }
    }
  }

  const totalAmount = Math.max(0, subtotal - discountAmount);

  return {
    baseRatePerPerson: baseRate,
    seasonLabel,
    travellerCount,
    baseTotal,
    vehicleCost,
    hotelAdjustment: Number(hotelAdjustment || 0),
    roomConfigAdjustment: Number(roomConfigAdjustment || 0),
    addons: addonDetails,
    addonsTotal,
    discountAmount,
    totalAmount,
  };
}

module.exports = { calculateQuotePrice, getSeasonAdjustedBaseRate, getVehicleCost };
