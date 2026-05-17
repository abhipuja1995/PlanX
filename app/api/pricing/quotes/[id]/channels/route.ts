import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionWithRole, requireRole, ALL_PRICING_ROLES } from '@/lib/role-guard';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

type Params = { params: { id: string } };

const ChannelSchema = z.object({
  channel_type:          z.enum(['inbound', 'outbound', 'blended']),
  plan_type:             z.enum(['pulse', 'unlimited']),
  concurrent_channels:   z.number().int().positive(),
  avg_call_duration_sec: z.number().int().positive().optional(),
  monthly_minutes:       z.number().int().positive().optional(),
  traffic_distribution:  z.object({ peak: z.number(), off_peak: z.number() }).optional(),
  commitment_volume:     z.number().int().positive().optional(),
  discount_at_channel:   z.number().min(0).max(100).default(0),
  sort_order:            z.number().int().default(0),
});

export async function GET(_: Request, { params }: Params) {
  const { role, error } = await getSessionWithRole();
  if (error) return error;
  if (requireRole(role, ALL_PRICING_ROLES)) return requireRole(role, ALL_PRICING_ROLES)!;

  const { data, error: dbErr } = await supabaseAdmin
    .from('quote_channels').select('*').eq('quote_id', params.id).order('sort_order');

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT — replace all channels for a quote
export async function PUT(req: Request, { params }: Params) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;
  if (requireRole(role, ALL_PRICING_ROLES)) return requireRole(role, ALL_PRICING_ROLES)!;

  const body = await req.json();
  const parsed = z.array(ChannelSchema).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await supabaseAdmin.from('quote_channels').delete().eq('quote_id', params.id);

  const rows = parsed.data.map((ch, i) => ({ ...ch, quote_id: params.id, sort_order: i }));
  const { data, error: dbErr } = await supabaseAdmin.from('quote_channels').insert(rows).select();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  await writeAuditLog({
    entityType: 'quote', entityId: params.id,
    action: 'channels_updated', changedBy: session!.user!.email!,
    updatedValue: { channel_count: rows.length },
  });

  return NextResponse.json(data);
}
