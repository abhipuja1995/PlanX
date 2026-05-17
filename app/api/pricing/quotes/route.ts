import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionWithRole, requireRole, ALL_PRICING_ROLES } from '@/lib/role-guard';
import { generateQuoteNumber } from '@/lib/quote-number';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

const CreateQuoteSchema = z.object({
  customer_name:            z.string().min(1),
  customer_email:           z.string().email().optional(),
  commitment_period_months: z.number().int().positive().default(12),
  validity_days:            z.number().int().positive().default(30),
  notes:                    z.string().optional(),
  terms_and_conditions:     z.string().optional(),
  exclusions:               z.string().optional(),
});

export async function GET() {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, ALL_PRICING_ROLES);
  if (denied) return denied;

  let query = supabaseAdmin
    .from('quotes')
    .select('*, quote_pricing(gross_margin_pct, profit_status, final_price, approval_required)')
    .order('created_at', { ascending: false });

  // Sales can only see their own quotes
  if (role === 'sales') {
    query = query.eq('created_by', session!.user!.email!);
  }

  const { data, error: dbErr } = await query;
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, ALL_PRICING_ROLES);
  if (denied) return denied;

  const body = await req.json();
  const parsed = CreateQuoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const quoteNumber = await generateQuoteNumber();

  const { data, error: dbErr } = await supabaseAdmin
    .from('quotes')
    .insert({ ...parsed.data, quote_number: quoteNumber, created_by: session!.user!.email! })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  await writeAuditLog({
    entityType: 'quote', entityId: data.id,
    action: 'created', changedBy: session!.user!.email!,
    updatedValue: parsed.data,
  });

  return NextResponse.json(data, { status: 201 });
}
