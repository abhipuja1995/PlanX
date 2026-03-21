import { NextResponse } from "next/server";
import { PlaneClient } from "@/lib/plane-client";

const WS = process.env.PLANE_WORKSPACE_SLUG!;
const client = new PlaneClient(process.env.PLANE_API_KEY!, process.env.PLANE_BASE_URL!);

function arr(data: any): any[] { return data?.results ?? data ?? []; }

function toMap<T>(items: T[], key: keyof T): Record<string, T> {
  return Object.fromEntries(items.map(i => [i[key], i]));
}

export async function GET() {
  try {
    const projects: any[] = arr(await client.listProjects(WS));

    const enriched = await Promise.all(projects.map(async (project: any) => {
      const pid = project.id;

      const [issues, states, labels, cycles, modules, members] = await Promise.all([
        client.listIssues(WS, pid).then(arr),
        client.listStates(WS, pid).then(arr),
        client.listLabels(WS, pid).then(arr),
        client.listCycles(WS, pid).then(arr),
        client.listModules(WS, pid).then(arr),
        client.listProjectMembers(WS, pid).then(arr),
      ]);

      const stateMap  = toMap(states, "id");
      const labelMap  = toMap(labels, "id");
      const cycleMap  = toMap(cycles, "id");
      const moduleMap = toMap(modules, "id");
      const memberMap = Object.fromEntries(
        members.map((m: any) => [m.member?.id ?? m.id, m.member ?? m])
      );

      // Build issue → cycle/module mappings
      const [cycleEntries, moduleEntries] = await Promise.all([
        Promise.all(cycles.map(async (c: any) => {
          const items = arr(await client.listCycleIssues(WS, pid, c.id).catch(() => []));
          return items.map((ci: any) => ({ issueId: ci.issue ?? ci.issue_id, cycleId: c.id }));
        })),
        Promise.all(modules.map(async (m: any) => {
          const items = arr(await client.listModuleIssues(WS, pid, m.id).catch(() => []));
          return items.map((mi: any) => ({ issueId: mi.issue ?? mi.issue_id, moduleId: m.id }));
        })),
      ]);

      const issueCycle: Record<string, string> = {};
      for (const entries of cycleEntries)
        for (const { issueId, cycleId } of entries)
          if (issueId) issueCycle[issueId] = cycleMap[cycleId]?.name ?? cycleId;

      const issueModules: Record<string, string[]> = {};
      for (const entries of moduleEntries)
        for (const { issueId, moduleId } of entries) {
          if (!issueId) continue;
          issueModules[issueId] ??= [];
          const name = moduleMap[moduleId]?.name ?? moduleId;
          if (!issueModules[issueId].includes(name)) issueModules[issueId].push(name);
        }

      function resolveMember(id: string) {
        const m = memberMap[id];
        return m ? `${m.display_name ?? m.first_name ?? ""} ${m.last_name ?? ""}`.trim() : id;
      }

      return issues.map((issue: any) => {
        const state = stateMap[issue.state];
        return {
          id: issue.id,
          sequence_id: issue.sequence_id,
          name: issue.name,
          priority: issue.priority ?? "none",
          state_id: issue.state,
          state_name: state?.name ?? "—",
          state_color: state?.color ?? "#64748b",
          assignees: (issue.assignees ?? []).map(resolveMember).filter(Boolean),
          created_by: resolveMember(issue.created_by),
          created_by_id: issue.created_by,
          created_at: issue.created_at,
          due_date: issue.due_date ?? null,
          labels: (issue.label_ids ?? []).map((lid: string) => labelMap[lid]?.name ?? lid),
          cycle: issueCycle[issue.id] ?? null,
          modules: issueModules[issue.id] ?? [],
          project_id: pid,
          project_name: project.name,
          project_identifier: project.identifier,
        };
      });
    }));

    const allIssues = enriched.flat();

    const memberSet = new Map<string, string>();
    const stateSet  = new Map<string, string>();
    const cycleSet  = new Set<string>();
    const moduleSet = new Set<string>();

    for (const i of allIssues) {
      i.assignees.forEach((a: string) => memberSet.set(a, a));
      if (i.created_by) memberSet.set(i.created_by, i.created_by);
      if (i.state_name) stateSet.set(i.state_id, i.state_name);
      if (i.cycle) cycleSet.add(i.cycle);
      i.modules.forEach((m: string) => moduleSet.add(m));
    }

    return NextResponse.json({
      issues: allIssues,
      filters: {
        projects: projects.map((p: any) => ({ id: p.id, name: p.name })),
        members: Array.from(memberSet.keys()),
        states: Array.from(stateSet.entries()).map(([id, name]) => ({ id, name })),
        priorities: ["urgent", "high", "medium", "low", "none"],
        cycles: Array.from(cycleSet),
        modules: Array.from(moduleSet),
      },
    });
  } catch (err: any) {
    console.error("Plane API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
