import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionWithRole, requireRole, ALL_PRICING_ROLES } from '@/lib/role-guard';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

type Params = { params: { id: string } };

const AddonSchema = z.object({
  addon_type: z.enum(['agentic_voice', 'ai_services', 'recording', 'analytics', 'other']),
  name:       z.string().min(1),
  unit_price: z.number().positive(),
  quantity:   z.number().int().positive().default(1),
  discount:   z.number().min(0).max(100).default(0),
});

export async function GET(_: Request, { params }: Params) {
  const { role, error } = await getSessionWithRole();
  if (error) return error;
  if (requireRole(role, ALL_PRICING_ROLES)) return requireRole(role, ALL_PRICING_ROLES)!;

  const { data, error: dbErr } = await supabaseAdmin
    .from('quote_addons').select('*').eq('quote_id', params.id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;
  if (requireRole(role, ALL_PRICING_ROLES)) return requireRole(role, ALL_PRICING_ROLES)!;

  const body = await req.json();
  const parsed = z.array(AddonSchema).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await supabaseAdmin.from('quote_addons').delete().eq('quote_id', params.id);

  const rows = parsed.data.map(a => ({ ...a, quote_id: params.id }));
  const { data, error: dbErr } = await supabaseAdmin.from('quote_addons').insert(rows).select();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  await writeAuditLog({
    entityType: 'quote', entityId: params.id,
    action: 'addons_updated', changedBy: session!.user!.email!,
    updatedValue: { addon_count: rows.length },
  });

  return NextResponse.json(data);
}
