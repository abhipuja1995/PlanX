import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionWithRole, requireRole, VENDOR_ROLES } from '@/lib/role-guard';

export async function GET(req: Request) {
  const { role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, VENDOR_ROLES);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const page     = parseInt(searchParams.get('page') ?? '1', 10);
  const limit    = parseInt(searchParams.get('limit') ?? '50', 10);
  const entityId = searchParams.get('entity_id');
  const from     = (page - 1) * limit;

  let query = supabaseAdmin
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('changed_at', { ascending: false })
    .range(from, from + limit - 1);

  if (entityId) query = query.eq('entity_id', entityId);

  const { data, error: dbErr, count } = await query;
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ data, total: count, page, limit });
}
