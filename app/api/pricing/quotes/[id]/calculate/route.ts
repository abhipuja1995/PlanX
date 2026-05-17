import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionWithRole, requireRole, canSeeVendorData, ALL_PRICING_ROLES } from '@/lib/role-guard';
import { runPricingEngine } from '@/lib/pricing-engine';
import { getPricingInsight } from '@/lib/pricing-insight';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

type Params = { params: { id: string } };

const CalcInputSchema = z.object({
  sales_input_price:  z.number().positive(),
  manual_discount_pct: z.number().min(0).max(100).default(0),
});

const VENDOR_FIELDS = ['lowest_vendor_cost', 'avg_vendor_cost', 'preferred_vendor_cost', 'floor_price'];

export async function POST(req: Request, { params }: Params) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, ALL_PRICING_ROLES);
  if (denied) return denied;

  const body = await req.json();
  const parsed = CalcInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { sales_input_price, manual_discount_pct } = parsed.data;

  // Fetch quote
  const { data: quote } = await supabaseAdmin
    .from('quotes').select('*').eq('id', params.id).single();
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  // Fetch channels & addons
  const [{ data: channels }, { data: addons }] = await Promise.all([
    supabaseAdmin.from('quote_channels').select('*').eq('quote_id', params.id),
    supabaseAdmin.from('quote_addons').select('*').eq('quote_id', params.id),
  ]);

  if (!channels?.length) {
    return NextResponse.json({ error: 'Add at least one channel before calculating' }, { status: 400 });
  }

  // Fetch vendor costs for the channel config (use first channel's type/plan as primary)
  const primaryChannel = channels[0];
  const { data: vendorPricing } = await supabaseAdmin
    .from('vendor_pricing')
    .select('cost_per_unit, vendors(is_preferred)')
    .eq('channel_type', primaryChannel.channel_type)
    .eq('plan_type', primaryChannel.plan_type)
    .or('valid_to.is.null,valid_to.gte.' + new Date().toISOString().split('T')[0]);

  // Fetch pricing config
  const { data: configRows } = await supabaseAdmin.from('pricing_config').select('key, value');
  const config = Object.fromEntries((configRows ?? []).map(r => [r.key, Number(r.value)])) as {
    target_margin_pct: number; minimum_margin_pct: number;
    healthy_margin_pct: number; amber_margin_pct: number; max_discount_pct: number;
  };

  // Use fallback vendor costs if none exist yet
  const vendorCosts = vendorPricing?.length
    ? vendorPricing.map((vp: any) => ({
        cost_per_unit: Number(vp.cost_per_unit),
        is_preferred:  vp.vendors?.is_preferred ?? false,
      }))
    : [{ cost_per_unit: sales_input_price * 0.65, is_preferred: false }]; // 35% margin fallback

  const result = runPricingEngine(
    channels, addons ?? [], vendorCosts, config,
    sales_input_price, manual_discount_pct, quote.commitment_period_months
  );

  // Claude pricing insight
  const pricingInsight = await getPricingInsight(result, quote.customer_name);

  // Upsert into quote_pricing
  await supabaseAdmin.from('quote_pricing').upsert({
    quote_id:                params.id,
    ...result,
    calculated_by:           session!.user!.email,
    calculated_at:           new Date().toISOString(),
  }, { onConflict: 'quote_id' });

  await writeAuditLog({
    entityType: 'pricing', entityId: params.id,
    action: 'calculated', changedBy: session!.user!.email!,
    updatedValue: { sales_input_price, manual_discount_pct, gross_margin_pct: result.gross_margin_pct },
  });

  // Redact vendor fields for sales/manager
  const showVendorData = canSeeVendorData(role);
  const response: Record<string, unknown> = { ...result, pricing_insight: pricingInsight };

  if (!showVendorData) {
    VENDOR_FIELDS.forEach(f => delete response[f]);
  }

  return NextResponse.json(response);
}
