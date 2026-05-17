import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionWithRole, requireRole, VENDOR_ROLES, ADMIN_ROLES } from '@/lib/role-guard';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

const VendorSchema = z.object({
  name:         z.string().min(1),
  code:         z.string().min(1).toUpperCase(),
  is_preferred: z.boolean().default(false),
  is_active:    z.boolean().default(true),
});

const VendorPricingSchema = z.object({
  vendor_id:            z.string().uuid(),
  channel_type:         z.enum(['inbound', 'outbound', 'blended']),
  plan_type:            z.enum(['pulse', 'unlimited']),
  avg_call_duration_sec: z.number().int().positive().optional(),
  cost_per_unit:        z.number().positive(),
  unit_type:            z.enum(['per_minute', 'per_call', 'per_channel']),
  valid_from:           z.string(),
  valid_to:             z.string().optional(),
});

export async function GET() {
  const { role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, VENDOR_ROLES);
  if (denied) return denied;

  const { data, error: dbErr } = await supabaseAdmin
    .from('vendors')
    .select('*, vendor_pricing(*)')
    .eq('is_active', true)
    .order('name');

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, ADMIN_ROLES);
  if (denied) return denied;

  const body = await req.json();
  const { vendor, pricing } = body;

  const parsedVendor = VendorSchema.safeParse(vendor);
  if (!parsedVendor.success) return NextResponse.json({ error: parsedVendor.error.flatten() }, { status: 400 });

  const { data: newVendor, error: dbErr } = await supabaseAdmin
    .from('vendors').insert(parsedVendor.data).select().single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  if (pricing?.length) {
    const pricingRows = pricing.map((p: unknown) => {
      const pp = VendorPricingSchema.parse({ ...(p as object), vendor_id: newVendor.id });
      return pp;
    });
    await supabaseAdmin.from('vendor_pricing').insert(pricingRows);
  }

  await writeAuditLog({
    entityType: 'vendor', entityId: newVendor.id,
    action: 'created', changedBy: session!.user!.email!,
    updatedValue: parsedVendor.data,
  });

  return NextResponse.json(newVendor, { status: 201 });
}
