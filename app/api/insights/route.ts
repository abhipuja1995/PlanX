/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

const XAI_BASE = "https://api.x.ai/v1";
const MODEL    = "grok-3-mini";

function buildRuleBasedInsights(m: any) {
  const overdueRate  = m.total > 0 ? m.overdue / m.total : 0;
  const staleRate    = m.total > 0 ? m.stale   / m.total : 0;
  const resolveRate  = m.createdThisWeek > 0 ? m.resolvedThisWeek / m.createdThisWeek : 1;

  // RAG
  const rag = overdueRate >= 0.30 || staleRate >= 0.40 ? "red"
            : overdueRate >= 0.15 || staleRate >= 0.20 ? "amber"
            : "green";

  // On-track
  const onTrack: string[] = [];
  if (resolveRate >= 0.8)   onTrack.push(`Team resolved ${m.resolvedThisWeek} of ${m.createdThisWeek} issues created this week — healthy throughput`);
  if (m.wip <= 20)          onTrack.push(`WIP is at ${m.wip} — team is focused`);
  if (m.overdue < 10)       onTrack.push(`Only ${m.overdue} overdue issues — team is largely on schedule`);
  if (m.completedThisWeek > 0) onTrack.push(`${m.completedThisWeek} issues completed this week`);
  if (onTrack.length === 0) onTrack.push("Monitor progress closely — no clear on-track signals this week");

  // Blockers
  const blockers: string[] = [];
  if (m.overdue > 0)        blockers.push(`${m.overdue} issues are past their due date (${(overdueRate * 100).toFixed(0)}% of active)`);
  if (m.stale > 0)          blockers.push(`${m.stale} issues have had no updates in 5+ days — potential bottleneck`);
  if (m.wip > 30)           blockers.push(`WIP is high at ${m.wip} — team may be context-switching too much`);
  if (m.unassigned > 0)     blockers.push(`${m.unassigned} issues unassigned — no clear ownership`);
  if (resolveRate < 0.5)    blockers.push(`Resolving only ${m.resolvedThisWeek} vs ${m.createdThisWeek} created this week — backlog growing`);
  if (blockers.length === 0) blockers.push("No critical blockers detected this cycle");

  // Improvements
  const improvements: string[] = [];
  if (m.noDate > 0)         improvements.push(`${m.noDate} issues missing due dates — add dates to improve tracking`);
  if (staleRate > 0.10)     improvements.push(`${(staleRate * 100).toFixed(0)}% of issues are stale — review and update or close them`);
  if (m.anomalyCount > 0)   improvements.push(`${m.anomalyCount} issues have data anomalies — clean up for better reporting`);
  if (m.avgCycleTimeDays > 14) improvements.push(`Average cycle time is ${m.avgCycleTimeDays.toFixed(1)} days — consider breaking issues into smaller tasks`);
  if (improvements.length === 0) improvements.push("Data hygiene looks good — keep maintaining issue metadata");

  // Key achievement
  const topProject = m.topCompletedProject ?? "the team";
  const keyAchievement = m.completedThisWeek > 0
    ? `${m.completedThisWeek} issues completed this week${topProject !== "the team" ? `, led by ${topProject}` : ""}`
    : "Focus on clearing the backlog — no completions recorded this week";

  // Top risks
  const risks: string[] = [];
  if (m.overdue > 0)    risks.push(`${m.overdue} overdue issues risk missing sprint goals`);
  if (m.stale > 0)      risks.push(`${m.stale} stale issues indicate hidden blockers`);
  if (resolveRate < 0.7) risks.push("Resolution rate below 70% — velocity declining");
  if (m.wip > 30)       risks.push("High WIP increases risk of delayed delivery across all tracks");
  const topRisks = risks.slice(0, 3);
  if (topRisks.length === 0) topRisks.push("No critical risks identified — maintain current cadence");

  // Accomplished
  const accomplished = m.recentlyCompleted?.slice(0, 5).map((i: any) => `${i.id}: ${i.name}`) ?? [];
  const upcoming     = m.upcomingDue?.slice(0, 5).map((i: any) => `${i.id}: ${i.name} (due ${i.due})`) ?? [];

  return {
    rag,
    ragLabel: rag === "green" ? "On Track" : rag === "amber" ? "At Risk" : "Off Track",
    keyAchievement,
    topRisks,
    onTrack,
    blockers,
    improvements,
    createdVsResolved: `Created ${m.createdThisWeek}, resolved ${m.resolvedThisWeek} this week${resolveRate < 0.8 ? " — falling behind" : " — keeping pace"}`,
    timeSaved: `~${Math.round(m.resolvedThisWeek * 0.5)}h saved via automated status tracking`,
    avgCycleTime: `${m.avgCycleTimeDays?.toFixed(1) ?? "N/A"} days average`,
    wip: m.wip,
    stale: m.stale,
    accomplished,
    upcoming,
    bugsMoment: m.bugsThisWeek > 0 ? `${m.bugsThisWeek} bugs reported this week${m.bugsResolved > 0 ? `, ${m.bugsResolved} resolved` : ""}` : "No new bugs this week",
  };
}

async function callXAI(m: any) {
  const prompt = `You are a senior engineering manager reviewing project health data. Return ONLY a JSON object.

METRICS:
- Active issues: ${m.total} | Overdue: ${m.overdue} (${(m.total > 0 ? m.overdue/m.total*100 : 0).toFixed(0)}%)
- WIP: ${m.wip} | Stale (5+ days): ${m.stale} | Unassigned: ${m.unassigned}
- Created this week: ${m.createdThisWeek} | Resolved: ${m.resolvedThisWeek} | Completed: ${m.completedThisWeek}
- Avg cycle time: ${m.avgCycleTimeDays?.toFixed(1)} days | Anomalies: ${m.anomalyCount}
- Bugs this week: ${m.bugsThisWeek} resolved: ${m.bugsResolved}
- Missing due dates: ${m.noDate}

Return this JSON:
{
  "rag": "green|amber|red",
  "ragLabel": "On Track|At Risk|Off Track",
  "keyAchievement": "one sentence",
  "topRisks": ["risk1", "risk2", "risk3"],
  "onTrack": ["item1", "item2"],
  "blockers": ["blocker1", "blocker2", "blocker3"],
  "improvements": ["improvement1", "improvement2"],
  "createdVsResolved": "one sentence summary",
  "timeSaved": "estimate",
  "avgCycleTime": "X days average",
  "wip": ${m.wip},
  "stale": ${m.stale},
  "accomplished": [],
  "upcoming": [],
  "bugsMoment": "one sentence about bugs"
}`;

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.XAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`xAI ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(data.choices[0].message.content);
  // Override accomplished/upcoming with actual data
  content.accomplished = m.recentlyCompleted?.slice(0, 5).map((i: any) => `${i.id}: ${i.name}`) ?? [];
  content.upcoming     = m.upcomingDue?.slice(0, 5).map((i: any) => `${i.id}: ${i.name} (due ${i.due})`) ?? [];
  return content;
}

export async function POST(req: Request) {
  try {
    const metrics = await req.json();
    if (process.env.XAI_API_KEY) {
      try {
        const aiResult = await callXAI(metrics);
        return NextResponse.json(aiResult);
      } catch {
        // fall through to rule-based
      }
    }
    return NextResponse.json(buildRuleBasedInsights(metrics));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
