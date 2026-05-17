import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionWithRole, requireRole, ALL_PRICING_ROLES } from '@/lib/role-guard';
import { writeAuditLog } from '@/lib/audit';

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, ALL_PRICING_ROLES);
  if (denied) return denied;

  const { data, error: dbErr } = await supabaseAdmin
    .from('quotes')
    .select(`
      *,
      quote_channels(*),
      quote_addons(*),
      quote_pricing(*),
      approval_requests(*)
    `)
    .eq('id', params.id)
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 404 });

  // Sales can only see their own
  if (role === 'sales' && data.created_by !== session!.user!.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: Params) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, ALL_PRICING_ROLES);
  if (denied) return denied;

  const { data: existing } = await supabaseAdmin
    .from('quotes').select('created_by, status').eq('id', params.id).single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (role === 'sales' && existing.created_by !== session!.user!.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  if (!['draft', 'revision_requested'].includes(existing.status)) {
    return NextResponse.json({ error: 'Cannot edit a submitted quote' }, { status: 400 });
  }

  const body = await req.json();
  const allowed = ['customer_name','customer_email','commitment_period_months',
                   'validity_days','notes','terms_and_conditions','exclusions'];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { data, error: dbErr } = await supabaseAdmin
    .from('quotes').update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', params.id).select().single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  await writeAuditLog({
    entityType: 'quote', entityId: params.id,
    action: 'updated', changedBy: session!.user!.email!,
    previousValue: existing, updatedValue: updates,
  });

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: Params) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, ALL_PRICING_ROLES);
  if (denied) return denied;

  const { data: existing } = await supabaseAdmin
    .from('quotes').select('created_by, status').eq('id', params.id).single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (role === 'sales' && existing.created_by !== session!.user!.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  if (existing.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft quotes can be deleted' }, { status: 400 });
  }

  await supabaseAdmin.from('quotes').delete().eq('id', params.id);

  await writeAuditLog({
    entityType: 'quote', entityId: params.id,
    action: 'deleted', changedBy: session!.user!.email!,
  });

  return new NextResponse(null, { status: 204 });
}
