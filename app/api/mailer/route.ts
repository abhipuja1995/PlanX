import { NextResponse } from "next/server";
import { PlaneClient } from "@/lib/plane-client";

const WS  = process.env.PLANE_WORKSPACE_SLUG!;
const client = new PlaneClient(process.env.PLANE_API_KEY!, process.env.PLANE_BASE_URL!);

function arr(data: any): any[] { return data?.results ?? (Array.isArray(data) ? data : []); }

const PLANE_BASE = process.env.PLANE_BASE_URL ?? "https://nirmaan.credresolve.com";
function issueUrl(pid: string, id: string) {
  return `${PLANE_BASE}/${WS}/projects/${pid}/issues/${id}/`;
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function overdueDays(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const due = new Date(targetDate); due.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#ef4444", high: "#f97316", medium: "#eab308",
  low: "#22c55e", none: "#94a3b8",
};

function buildHtml(opts: {
  recipientName: string;
  introText: string;
  columns: string[];
  rows: string;
}): string {
  const date = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const thStyle = `text-align:left;padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;white-space:nowrap`;
  const headers = opts.columns.map(c => `<th style="${thStyle}">${c}</th>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nirmaan Daily Digest</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%">

  <!-- Header -->
  <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px 32px">
    <div style="font-size:22px;font-weight:800;color:#60a5fa;letter-spacing:-0.5px">Nirmaan</div>
    <div style="font-size:12px;color:#94a3b8;margin-top:4px">${date} · Daily Issue Digest</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:28px 32px">
    <p style="margin:0 0 8px;font-size:15px;color:#0f172a">Hi <strong>${opts.recipientName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6">${opts.introText}</p>

    <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;min-width:560px">
      <thead><tr style="background:#f8fafc">${headers}</tr></thead>
      <tbody>${opts.rows}</tbody>
    </table>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px 32px;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:12px;color:#94a3b8">
      This is an automated daily digest from <strong>Nirmaan</strong>. Please take action on these issues.<br>
      <a href="${PLANE_BASE}/${WS}" style="color:#3b82f6;text-decoration:none">Open Workspace →</a>
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

function overdueRow(i: any, days: number): string {
  const p = i.priority ?? "none";
  const tdStyle = "padding:10px 14px;vertical-align:middle;border-bottom:1px solid #f1f5f9";
  return `<tr>
    <td style="${tdStyle}">
      <a href="${issueUrl(i.project_id, i.id)}" style="color:#3b82f6;font-weight:700;font-size:11px;text-decoration:none;font-family:monospace">${i.project_identifier}-${i.sequence_id}</a>
      <div style="font-size:13px;color:#0f172a;margin-top:2px">${i.name}</div>
    </td>
    <td style="${tdStyle};color:#475569;white-space:nowrap">${i.state_name}</td>
    <td style="${tdStyle};white-space:nowrap"><span style="color:${PRIORITY_COLOR[p]};font-weight:700;text-transform:capitalize">${p}</span></td>
    <td style="${tdStyle};white-space:nowrap"><span style="color:#ef4444;font-weight:700">${fmt(i.target_date)}</span><br><span style="font-size:11px;color:#ef4444">${days}d overdue</span></td>
    <td style="${tdStyle};color:#64748b;white-space:nowrap">${i.project_name}</td>
  </tr>`;
}

function anomalyRow(i: any): string {
  const tdStyle = "padding:10px 14px;vertical-align:middle;border-bottom:1px solid #f1f5f9";
  const anomalyBadges = i.anomalies.map((a: string) =>
    `<span style="display:inline-block;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;white-space:nowrap;margin:1px">${a}</span>`
  ).join(" ");
  return `<tr>
    <td style="${tdStyle}">
      <a href="${issueUrl(i.project_id, i.id)}" style="color:#3b82f6;font-weight:700;font-size:11px;text-decoration:none;font-family:monospace">${i.project_identifier}-${i.sequence_id}</a>
      <div style="font-size:13px;color:#0f172a;margin-top:2px">${i.name}</div>
    </td>
    <td style="${tdStyle};color:#475569;white-space:nowrap">${i.state_name}</td>
    <td style="${tdStyle}">${anomalyBadges}</td>
    <td style="${tdStyle};color:#64748b;white-space:nowrap">${fmt(i.target_date)}</td>
    <td style="${tdStyle};color:#64748b;white-space:nowrap">${i.project_name}</td>
  </tr>`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = process.env.MAILER_SECRET;
  if (secret && searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = searchParams.get("dry") === "1";

  try {
    // ── 1. Resolve workspace member emails ────────────────────────────────
    const wsMembers = arr(await client.listWorkspaceMembers(WS));
    const memberMap: Record<string, { email: string; name: string }> = {};
    for (const m of wsMembers) {
      const mem = m.member ?? m;
      if (mem?.id && mem?.email) {
        memberMap[mem.id] = {
          email: mem.email,
          name: (mem.display_name ?? `${mem.first_name ?? ""} ${mem.last_name ?? ""}`.trim() || mem.email),
        };
      }
    }

    // ── 2. Fetch all issues from all projects ─────────────────────────────
    const projects = arr(await client.listProjects(WS));

    const overdueByAssignee: Record<string, { email: string; name: string; issues: any[] }> = {};
    const anomalyByCreator:  Record<string, { email: string; name: string; issues: any[] }> = {};

    for (const project of projects) {
      const pid = project.id;
      const [issues, states] = await Promise.all([
        client.listIssues(WS, pid).then(arr),
        client.listStates(WS, pid).then(arr),
      ]);

      const stateMap = Object.fromEntries(states.map((s: any) => [s.id, s]));

      for (const issue of issues) {
        const state      = stateMap[issue.state] ?? {};
        const stateGroup = state.group ?? "";

        // Skip completed / cancelled
        if (stateGroup === "completed" || stateGroup === "cancelled") continue;

        const enriched = {
          ...issue,
          state_name:         state.name ?? "—",
          state_group:        stateGroup,
          project_id:         pid,
          project_name:       project.name,
          project_identifier: project.identifier,
        };

        // ── Overdue → notify each assignee ──
        const days = overdueDays(issue.target_date);
        if (days !== null) {
          for (const assigneeId of (issue.assignees ?? [])) {
            const m = memberMap[assigneeId];
            if (!m) continue;
            if (!overdueByAssignee[assigneeId]) overdueByAssignee[assigneeId] = { ...m, issues: [] };
            overdueByAssignee[assigneeId].issues.push({ ...enriched, _days: days });
          }
        }

        // ── Anomaly → notify creator ──
        const anomalies: string[] = [];
        if (!issue.start_date)                          anomalies.push("No Start Date");
        if (!issue.target_date)                         anomalies.push("No Due Date");
        if (!issue.assignees || issue.assignees.length === 0) anomalies.push("Unassigned");

        if (anomalies.length > 0) {
          const creatorId = issue.created_by;
          const m = memberMap[creatorId];
          if (m) {
            if (!anomalyByCreator[creatorId]) anomalyByCreator[creatorId] = { ...m, issues: [] };
            anomalyByCreator[creatorId].issues.push({ ...enriched, anomalies });
          }
        }
      }
    }

    // ── 3. Send emails ─────────────────────────────────────────────────────
    const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const sent: string[] = [];
    const preview: any[] = [];

    if (!dryRun) {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host:   process.env.SMTP_HOST ?? "smtp.gmail.com",
        port:   Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      const from = process.env.SMTP_FROM ?? `Nirmaan <${process.env.SMTP_USER}>`;

      // Overdue emails
      for (const [, { email, name, issues }] of Object.entries(overdueByAssignee)) {
        const sorted = [...issues].sort((a, b) => b._days - a._days);
        const rows = sorted.map(i => overdueRow(i, i._days)).join("");
        const urgentCount = issues.filter(i => (i.priority === "urgent" || i.priority === "high")).length;
        const urgentNote = urgentCount > 0 ? `, including ${urgentCount} high-priority` : "";
        await transporter.sendMail({
          from,
          to: email,
          subject: `🚨 Action Required: ${issues.length} Overdue Issue${issues.length !== 1 ? "s" : ""} Assigned to You${urgentCount > 0 ? ` (${urgentCount} High Priority)` : ""} — ${dateStr}`,
          html: buildHtml({
            recipientName: name,
            introText: `You have <strong style="color:#ef4444">${issues.length} overdue issue${issues.length !== 1 ? "s" : ""}</strong> assigned to you${urgentNote}. These are past their due date and require immediate attention. Please update their status or reach out to your PM today.`,
            columns: ["Issue", "State", "Priority", "Due Date", "Project"],
            rows,
          }),
        });
        sent.push(`overdue → ${email} (${issues.length} issues)`);
      }

      // Anomaly emails
      for (const [, { email, name, issues }] of Object.entries(anomalyByCreator)) {
        const rows = issues.map(i => anomalyRow(i)).join("");
        const missingDue   = issues.filter(i => i.anomalies.includes("No Due Date")).length;
        const unassigned   = issues.filter(i => i.anomalies.includes("Unassigned")).length;
        const parts: string[] = [];
        if (missingDue)  parts.push(`${missingDue} without a due date`);
        if (unassigned)  parts.push(`${unassigned} unassigned`);
        const detail = parts.length ? ` (${parts.join(", ")})` : "";
        await transporter.sendMail({
          from,
          to: email,
          subject: `⚠️ Escalation: ${issues.length} Issue${issues.length !== 1 ? "s" : ""} You Created Have Incomplete Data${detail ? " — Fix Needed" : ""} — ${dateStr}`,
          html: buildHtml({
            recipientName: name,
            introText: `<strong style="color:#f97316">${issues.length} issue${issues.length !== 1 ? "s" : ""} you created${detail}</strong> are missing required fields. Incomplete issues cannot be tracked, reported, or acted upon. Please update them immediately so the team can plan and deliver effectively.`,
            columns: ["Issue", "State", "Missing Fields", "Due Date", "Project"],
            rows,
          }),
        });
        sent.push(`anomaly → ${email} (${issues.length} issues)`);
      }
    } else {
      // Dry run — return what would be sent
      for (const [id, { email, name, issues }] of Object.entries(overdueByAssignee)) {
        preview.push({ type: "overdue", to: email, name, issueCount: issues.length, issues: issues.map(i => `${i.project_identifier}-${i.sequence_id} (${i._days}d)`) });
      }
      for (const [id, { email, name, issues }] of Object.entries(anomalyByCreator)) {
        preview.push({ type: "anomaly", to: email, name, issueCount: issues.length, issues: issues.map(i => `${i.project_identifier}-${i.sequence_id}: ${i.anomalies.join(", ")}`) });
      }
    }

    return NextResponse.json({
      ok: true,
      date: dateStr,
      dryRun,
      memberCount: Object.keys(memberMap).length,
      overdueEmailsQueued: Object.keys(overdueByAssignee).length,
      anomalyEmailsQueued: Object.keys(anomalyByCreator).length,
      sent,
      preview,
    });
  } catch (err: any) {
    console.error("Mailer error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
