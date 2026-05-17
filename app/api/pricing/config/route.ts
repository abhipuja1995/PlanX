import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionWithRole, requireRole, ADMIN_ROLES, ALL_PRICING_ROLES } from '@/lib/role-guard';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

const ConfigUpdateSchema = z.record(z.string(), z.number());

export async function GET() {
  const { role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, ALL_PRICING_ROLES);
  if (denied) return denied;

  const { data, error: dbErr } = await supabaseAdmin
    .from('pricing_config').select('key, value, description').order('key');

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, ADMIN_ROLES);
  if (denied) return denied;

  const body = await req.json();
  const parsed = ConfigUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  for (const [key, value] of Object.entries(parsed.data)) {
    const { data: prev } = await supabaseAdmin
      .from('pricing_config').select('value').eq('key', key).single();

    await supabaseAdmin.from('pricing_config').update({
      value, updated_by: session!.user!.email, updated_at: new Date().toISOString(),
    }).eq('key', key);

    await writeAuditLog({
      entityType: 'config', entityId: key as unknown as string,
      action: 'updated', changedBy: session!.user!.email!,
      previousValue: { [key]: prev?.value },
      updatedValue:  { [key]: value },
    });
  }

  return NextResponse.json({ updated: Object.keys(parsed.data) });
}
