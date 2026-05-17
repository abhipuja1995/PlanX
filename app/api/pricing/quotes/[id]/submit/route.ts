import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionWithRole, requireRole, ALL_PRICING_ROLES } from '@/lib/role-guard';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

type Params = { params: { id: string } };

const SubmitSchema = z.object({
  discount_justification: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const { session, role, error } = await getSessionWithRole();
  if (error) return error;

  const denied = requireRole(role, ALL_PRICING_ROLES);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const { discount_justification } = SubmitSchema.parse(body);

  // Fetch quote + latest pricing
  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .select('*, quote_pricing(*)')
    .eq('id', params.id)
    .single();

  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!['draft', 'revision_requested'].includes(quote.status)) {
    return NextResponse.json({ error: 'Quote is not in a submittable state' }, { status: 400 });
  }

  const pricing = quote.quote_pricing?.[0];
  if (!pricing) {
    return NextResponse.json({ error: 'Run pricing calculation before submitting' }, { status: 400 });
  }

  const approvalRequired = pricing.approval_required;
  const newStatus = approvalRequired ? 'pending_approval' : 'finalized';

  await supabaseAdmin
    .from('quotes')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (approvalRequired) {
    await supabaseAdmin.from('approval_requests').insert({
      quote_id:               params.id,
      requested_by:           session!.user!.email,
      trigger_reason:         pricing.approval_required ? 'below_floor' : null,
      expected_margin:        pricing.gross_margin_pct,
      revenue_impact:         pricing.total_arc,
      discount_justification: discount_justification ?? null,
    });

    // Email notification to approvers
    await fetch(`${process.env.NEXTAUTH_URL}/api/mailer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mailer-secret': process.env.MAILER_SECRET! },
      body: JSON.stringify({
        to:      process.env.PRICING_APPROVER_EMAILS,
        subject: `Approval Required: Quote ${quote.quote_number} — ${quote.customer_name}`,
        html: `
          <p>A quote requires your approval.</p>
          <table>
            <tr><td><b>Quote</b></td><td>${quote.quote_number}</td></tr>
            <tr><td><b>Customer</b></td><td>${quote.customer_name}</td></tr>
            <tr><td><b>Submitted by</b></td><td>${session!.user!.email}</td></tr>
            <tr><td><b>Margin</b></td><td>${Number(pricing.gross_margin_pct).toFixed(1)}%</td></tr>
            <tr><td><b>Reason</b></td><td>${discount_justification ?? 'Not provided'}</td></tr>
          </table>
          <p><a href="${process.env.NEXTAUTH_URL}/pricing/${params.id}/approval">Review Quote</a></p>
        `,
      }),
    }).catch(() => null);
  }

  await writeAuditLog({
    entityType: 'quote', entityId: params.id,
    action: approvalRequired ? 'submitted_for_approval' : 'finalized',
    changedBy: session!.user!.email!,
    updatedValue: { status: newStatus },
  });

  return NextResponse.json({ status: newStatus, approval_required: approvalRequired });
}
