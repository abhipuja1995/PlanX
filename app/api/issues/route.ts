import { NextResponse } from "next/server";

const BASE_URL = process.env.PLANE_BASE_URL!;
const API_KEY = process.env.PLANE_API_KEY!;
const WS = process.env.PLANE_WORKSPACE_SLUG!;

async function planeGet(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-API-Key": API_KEY },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Plane API ${path} → ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const projectsData = await planeGet(`/api/v1/workspaces/${WS}/projects/`);
    const projects: any[] = projectsData.results ?? projectsData ?? [];

    const enriched = await Promise.all(
      projects.map(async (project: any) => {
        const pid = project.id;

        const [issuesData, statesData, labelsData, cyclesData, modulesData, membersData] =
          await Promise.all([
            planeGet(`/api/v1/workspaces/${WS}/projects/${pid}/issues/?per_page=250`),
            planeGet(`/api/v1/workspaces/${WS}/projects/${pid}/states/`),
            planeGet(`/api/v1/workspaces/${WS}/projects/${pid}/labels/`),
            planeGet(`/api/v1/workspaces/${WS}/projects/${pid}/cycles/`),
            planeGet(`/api/v1/workspaces/${WS}/projects/${pid}/modules/`),
            planeGet(`/api/v1/workspaces/${WS}/projects/${pid}/members/`),
          ]);

        const issues: any[]  = issuesData.results  ?? issuesData  ?? [];
        const states: any[]  = statesData.results  ?? statesData  ?? [];
        const labels: any[]  = labelsData.results  ?? labelsData  ?? [];
        const cycles: any[]  = cyclesData.results  ?? cyclesData  ?? [];
        const modules: any[] = modulesData.results ?? modulesData ?? [];
        const members: any[] = membersData.results ?? membersData ?? [];

        const stateMap  = Object.fromEntries(states.map((s: any)  => [s.id, s]));
        const labelMap  = Object.fromEntries(labels.map((l: any)  => [l.id, l]));
        const cycleMap  = Object.fromEntries(cycles.map((c: any)  => [c.id, c]));
        const moduleMap = Object.fromEntries(modules.map((m: any) => [m.id, m]));
        const memberMap = Object.fromEntries(
          members.map((m: any) => [m.member?.id ?? m.id, m.member ?? m])
        );

        const [cycleIssueEntries, moduleIssueEntries] = await Promise.all([
          Promise.all(cycles.map(async (c: any) => {
            const d = await planeGet(`/api/v1/workspaces/${WS}/projects/${pid}/cycles/${c.id}/cycle-issues/`).catch(() => []);
            return (d.results ?? d ?? []).map((ci: any) => ({ issueId: ci.issue ?? ci.issue_id, cycleId: c.id }));
          })),
          Promise.all(modules.map(async (m: any) => {
            const d = await planeGet(`/api/v1/workspaces/${WS}/projects/${pid}/modules/${m.id}/module-issues/`).catch(() => []);
            return (d.results ?? d ?? []).map((mi: any) => ({ issueId: mi.issue ?? mi.issue_id, moduleId: m.id }));
          })),
        ]);

        const issueCycleMap: Record<string, string> = {};
        for (const entries of cycleIssueEntries)
          for (const { issueId, cycleId } of entries)
            if (issueId) issueCycleMap[issueId] = cycleMap[cycleId]?.name ?? cycleId;

        const issueModulesMap: Record<string, string[]> = {};
        for (const entries of moduleIssueEntries)
          for (const { issueId, moduleId } of entries) {
            if (!issueId) continue;
            if (!issueModulesMap[issueId]) issueModulesMap[issueId] = [];
            const name = moduleMap[moduleId]?.name ?? moduleId;
            if (!issueModulesMap[issueId].includes(name)) issueModulesMap[issueId].push(name);
          }

        return issues.map((issue: any) => {
          const assigneeNames = (issue.assignees ?? [])
            .map((id: string) => { const m = memberMap[id]; return m ? `${m.display_name ?? m.first_name ?? ""} ${m.last_name ?? ""}`.trim() : id; })
            .filter(Boolean);
          const cmb = memberMap[issue.created_by];
          const createdByName = cmb ? `${cmb.display_name ?? cmb.first_name ?? ""} ${cmb.last_name ?? ""}`.trim() : issue.created_by ?? "";
          const state = stateMap[issue.state];
          return {
            id: issue.id,
            sequence_id: issue.sequence_id,
            name: issue.name,
            priority: issue.priority ?? "none",
            state_id: issue.state,
            state_name: state?.name ?? "—",
            state_color: state?.color ?? "#64748b",
            assignees: assigneeNames,
            created_by: createdByName,
            created_by_id: issue.created_by,
            created_at: issue.created_at,
            due_date: issue.due_date ?? null,
            labels: (issue.label_ids ?? []).map((lid: string) => labelMap[lid]?.name ?? lid),
            cycle: issueCycleMap[issue.id] ?? null,
            modules: issueModulesMap[issue.id] ?? [],
            project_id: pid,
            project_name: project.name,
            project_identifier: project.identifier,
          };
        });
      })
    );

    const allIssues = enriched.flat();
    const all_members = new Map<string, string>();
    const all_states = new Map<string, string>();
    const all_cycles = new Set<string>();
    const all_modules = new Set<string>();

    for (const issue of allIssues) {
      issue.assignees.forEach((a: string) => all_members.set(a, a));
      if (issue.created_by) all_members.set(issue.created_by, issue.created_by);
      if (issue.state_name) all_states.set(issue.state_id, issue.state_name);
      if (issue.cycle) all_cycles.add(issue.cycle);
      issue.modules.forEach((m: string) => all_modules.add(m));
    }

    return NextResponse.json({
      issues: allIssues,
      filters: {
        projects: projects.map((p: any) => ({ id: p.id, name: p.name })),
        members: Array.from(all_members.keys()),
        states: Array.from(all_states.entries()).map(([id, name]) => ({ id, name })),
        priorities: ["urgent", "high", "medium", "low", "none"],
        cycles: Array.from(all_cycles),
        modules: Array.from(all_modules),
      },
    });
  } catch (err: any) {
    console.error("Plane API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
