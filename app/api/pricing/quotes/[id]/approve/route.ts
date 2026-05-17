import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionWithRole, requireRole, APPROVER_ROLES } from '@/lib/role-guard';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

type Params = { params: { id: string } };

const ApproveSchema = z.object({
  action:  z.enum(['approved', 'rejected', 'revision_requested']),
  remarks: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, APPROVER_ROLES);
  if (denied) return denied;

  const body = await req.json();
  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { action, remarks } = parsed.data;

  const { data: quote } = await supabaseAdmin
    .from('quotes').select('*, quote_pricing(*), created_by, quote_number, customer_name')
    .eq('id', params.id).single();

  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (quote.status !== 'pending_approval') {
    return NextResponse.json({ error: 'Quote is not pending approval' }, { status: 400 });
  }

  const quoteStatus = action === 'approved' ? 'approved'
    : action === 'rejected' ? 'rejected'
    : 'revision_requested';

  await Promise.all([
    supabaseAdmin.from('quotes')
      .update({ status: quoteStatus, updated_at: new Date().toISOString() })
      .eq('id', params.id),
    supabaseAdmin.from('approval_requests')
      .update({
        status:      action,
        reviewed_by: session!.user!.email,
        reviewed_at: new Date().toISOString(),
        remarks:     remarks ?? null,
      })
      .eq('quote_id', params.id)
      .eq('status', 'pending'),
  ]);

  // Email notification to quote creator
  const actionLabel = action === 'approved' ? 'Approved' : action === 'rejected' ? 'Rejected' : 'Sent Back for Revision';
  await fetch(`${process.env.NEXTAUTH_URL}/api/mailer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mailer-secret': process.env.MAILER_SECRET! },
    body: JSON.stringify({
      to:      quote.created_by,
      subject: `Quote ${quote.quote_number} — ${actionLabel}`,
      html: `
        <p>Your quote has been <b>${actionLabel.toLowerCase()}</b>.</p>
        <table>
          <tr><td><b>Quote</b></td><td>${quote.quote_number}</td></tr>
          <tr><td><b>Customer</b></td><td>${quote.customer_name}</td></tr>
          <tr><td><b>Reviewed by</b></td><td>${session!.user!.email}</td></tr>
          ${remarks ? `<tr><td><b>Remarks</b></td><td>${remarks}</td></tr>` : ''}
        </table>
        <p><a href="${process.env.NEXTAUTH_URL}/pricing/${params.id}">View Quote</a></p>
      `,
    }),
  }).catch(() => null);

  await writeAuditLog({
    entityType: 'approval', entityId: params.id,
    action, changedBy: session!.user!.email!,
    updatedValue: { status: quoteStatus, remarks },
  });

  return NextResponse.json({ status: quoteStatus });
}
