export interface ChannelInput {
  channel_type: 'inbound' | 'outbound' | 'blended';
  plan_type: 'pulse' | 'unlimited';
  concurrent_channels: number;
  avg_call_duration_sec?: number;
  monthly_minutes?: number;
  discount_at_channel: number;
}

export interface AddonInput {
  unit_price: number;
  quantity: number;
  discount: number;
  addon_type: string;
}

export interface VendorCost {
  cost_per_unit: number;
  is_preferred: boolean;
}

export interface PricingConfig {
  target_margin_pct: number;
  minimum_margin_pct: number;
  healthy_margin_pct: number;
  amber_margin_pct: number;
  max_discount_pct: number;
}

export interface PricingResult {
  lowest_vendor_cost: number;
  avg_vendor_cost: number;
  preferred_vendor_cost: number | null;
  base_price: number;
  floor_price: number;
  suggested_price: number;
  sales_input_price: number;
  manual_discount_pct: number;
  channel_discount_pct: number;
  final_price: number;
  addon_total: number;
  total_mrc: number;
  total_arc: number;
  gross_profit: number;
  gross_margin_pct: number;
  profit_status: 'healthy' | 'near_minimum' | 'loss';
  color_indicator: 'green' | 'amber' | 'red';
  approval_required: boolean;
  approval_triggers: string[];
  recommended_discount_pct: number;
}

export function runPricingEngine(
  channels: ChannelInput[],
  addons: AddonInput[],
  vendorCosts: VendorCost[],
  config: PricingConfig,
  salesInputPrice: number,
  manualDiscountPct: number,
  commitmentMonths: number
): PricingResult {
  // Step 1 — Vendor cost benchmarks
  const costs = vendorCosts.map(v => v.cost_per_unit);
  const lowestVendorCost = Math.min(...costs);
  const avgVendorCost = costs.reduce((a, b) => a + b, 0) / costs.length;
  const preferred = vendorCosts.find(v => v.is_preferred);
  const preferredVendorCost = preferred?.cost_per_unit ?? null;

  // Step 2 — Price benchmarks from lowest vendor cost
  const { target_margin_pct, minimum_margin_pct, healthy_margin_pct, max_discount_pct } = config;
  const basePrice      = lowestVendorCost / (1 - target_margin_pct / 100);
  const floorPrice     = lowestVendorCost / (1 - minimum_margin_pct / 100);
  const suggestedPrice = basePrice;

  // Step 3 — Weighted channel-level discount
  const totalChannels = channels.reduce((s, c) => s + c.concurrent_channels, 0);
  const channelDiscountPct = totalChannels > 0
    ? channels.reduce((s, c) => s + (c.discount_at_channel * c.concurrent_channels), 0) / totalChannels
    : 0;

  // Step 4 — Apply discounts
  const afterChannelDiscount = salesInputPrice * (1 - channelDiscountPct / 100);
  const finalPrice           = afterChannelDiscount * (1 - manualDiscountPct / 100);

  // Step 5 — Addon total
  const addonTotal = addons.reduce((s, a) => {
    const linePrice = a.unit_price * a.quantity;
    return s + linePrice * (1 - a.discount / 100);
  }, 0);

  // Step 6 — MRC / ARC (monthly minutes × final price + addons)
  const totalMonthlyMinutes = channels.reduce((s, c) => s + (c.monthly_minutes ?? 0), 0);
  const totalMrc = (totalMonthlyMinutes * finalPrice) + addonTotal;
  const totalArc = totalMrc * commitmentMonths;

  // Step 7 — Margin & profitability
  const grossProfit   = finalPrice - lowestVendorCost;
  const grossMarginPct = finalPrice > 0 ? (grossProfit / finalPrice) * 100 : 0;

  const profitStatus: PricingResult['profit_status'] =
    grossMarginPct >= healthy_margin_pct ? 'healthy'
    : grossMarginPct >= minimum_margin_pct ? 'near_minimum'
    : 'loss';

  const colorIndicator: PricingResult['color_indicator'] =
    profitStatus === 'healthy' ? 'green'
    : profitStatus === 'near_minimum' ? 'amber'
    : 'red';

  // Step 8 — Approval triggers
  const approvalTriggers: string[] = [];
  if (finalPrice < floorPrice)           approvalTriggers.push('below_floor');
  if (grossMarginPct < minimum_margin_pct) approvalTriggers.push('below_margin_threshold');
  if (manualDiscountPct > max_discount_pct) approvalTriggers.push('excess_discount');
  if (grossProfit < 0)                   approvalTriggers.push('loss_making');

  // Step 9 — Incremental discount recommendation
  const buffer = salesInputPrice - floorPrice;
  let recommendedDiscountPct = 0;
  if (buffer > 0) {
    const salesPriceBase = salesInputPrice > 0 ? salesInputPrice : 1;
    let extra = (buffer * 0.30) / salesPriceBase * 100;
    if (commitmentMonths >= 24) extra += 2;
    else if (commitmentMonths >= 12) extra += 1;
    if (totalChannels > 100) extra += 1.5;
    else if (totalChannels > 50) extra += 0.5;
    const hasPremiumAddons = addons.some(a =>
      ['recording', 'analytics'].includes(a.addon_type)
    );
    if (hasPremiumAddons) extra += 0.5;
    recommendedDiscountPct = Math.min(parseFloat(extra.toFixed(2)), max_discount_pct);
  }

  return {
    lowest_vendor_cost:    round(lowestVendorCost),
    avg_vendor_cost:       round(avgVendorCost),
    preferred_vendor_cost: preferredVendorCost !== null ? round(preferredVendorCost) : null,
    base_price:            round(basePrice),
    floor_price:           round(floorPrice),
    suggested_price:       round(suggestedPrice),
    sales_input_price:     round(salesInputPrice),
    manual_discount_pct:   round(manualDiscountPct),
    channel_discount_pct:  round(channelDiscountPct),
    final_price:           round(finalPrice),
    addon_total:           round(addonTotal),
    total_mrc:             round(totalMrc),
    total_arc:             round(totalArc),
    gross_profit:          round(grossProfit),
    gross_margin_pct:      round(grossMarginPct),
    profit_status:         profitStatus,
    color_indicator:       colorIndicator,
    approval_required:     approvalTriggers.length > 0,
    approval_triggers:     approvalTriggers,
    recommended_discount_pct: recommendedDiscountPct,
  };
}

function round(n: number, decimals = 4): number {
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}
