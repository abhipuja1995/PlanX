/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { PlaneClient } from "@/lib/plane-client";

const WS = process.env.PLANE_WORKSPACE_SLUG!;
const client = new PlaneClient(process.env.PLANE_API_KEY!, process.env.PLANE_BASE_URL!);

function arr(data: any): any[] { return data?.results ?? (Array.isArray(data) ? data : []); }
function toMap<T>(items: T[], key: keyof T): Record<string, T> {
  return Object.fromEntries(items.map(i => [i[key], i]));
}

async function batchedMap<T, R>(items: T[], fn: (item: T) => Promise<R>, batchSize = 3): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batchResults = await Promise.allSettled(items.slice(i, i + batchSize).map(fn));
    results.push(...batchResults.map(r => r.status === "fulfilled" ? r.value : [] as any));
  }
  return results;
}

// Stage 1: fast — basic issue data only (no cycle/module N+1 calls)
// Stage 2: enrich — adds cycle/module mappings via separate /api/enrich endpoint
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const enrich = searchParams.get("enrich") === "1";

  try {
    const projects: any[] = arr(await client.listProjects(WS));

    const enriched = await Promise.all(projects.map(async (project: any) => {
      const pid = project.id;

      const [issues, states, labels, cycles, mods, members] = await Promise.all([
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
      const moduleMap = toMap(mods,   "id");
      const memberMap = Object.fromEntries(
        members.map((m: any) => [m.member?.id ?? m.id, m.member ?? m])
      );

      // N+1 cycle/module calls — only run on enrich request
      const issueCycle:   Record<string, { name: string; end_date: string | null }> = {};
      const issueModules: Record<string, string[]> = {};

      if (enrich) {
        const cycleResults = await batchedMap(cycles, async (c: any) => {
          const items = arr(await client.listCycleIssues(WS, pid, c.id).catch(() => []));
          const cy = cycleMap[c.id];
          const end_date = cy?.end_date ?? cy?.ended_at ?? null;
          // API returns full issue objects — the issue ID is in the `id` field
          return items.map((ci: any) => ({ iid: ci.id ?? ci.issue ?? ci.issue_id, name: cy?.name ?? c.id, end_date }));
        });
        for (const entries of cycleResults)
          for (const { iid, name, end_date } of (entries as any[]))
            if (iid) issueCycle[iid] = { name, end_date };

        const modResults = await batchedMap(mods, async (m: any) => {
          const items = arr(await client.listModuleIssues(WS, pid, m.id).catch(() => []));
          // API returns full issue objects — the issue ID is in the `id` field
          return items.map((mi: any) => ({ iid: mi.id ?? mi.issue ?? mi.issue_id, name: moduleMap[m.id]?.name ?? m.id }));
        });
        for (const entries of modResults)
          for (const { iid, name } of (entries as any[])) {
            if (!iid) continue;
            issueModules[iid] ??= [];
            if (!issueModules[iid].includes(name)) issueModules[iid].push(name);
          }
      }

      function resolveMember(id: string) {
        const m = memberMap[id];
        return m ? `${m.display_name ?? m.first_name ?? ""} ${m.last_name ?? ""}`.trim() : (id ?? "");
      }

      return issues.map((issue: any) => {
        const state = stateMap[issue.state];
        const labelIds: string[] = issue.labels ?? issue.label_ids ?? [];
        return {
          id: issue.id,
          sequence_id: issue.sequence_id,
          name: issue.name,
          priority: issue.priority ?? "none",
          state_id: issue.state,
          state_name: state?.name ?? "—",
          state_color: state?.color ?? "#64748b",
          state_group: state?.group ?? "",
          assignees: (issue.assignees ?? []).map(resolveMember).filter(Boolean),
          created_by: resolveMember(issue.created_by),
          created_by_id: issue.created_by,
          created_at: issue.created_at,
          start_date: issue.start_date ?? null,
          due_date: issue.target_date ?? null,
          completed_at: issue.completed_at ?? null,
          updated_at: issue.updated_at ?? null,
          labels: labelIds.map((lid: string) => labelMap[lid]?.name).filter(Boolean),
          cycle: issueCycle[issue.id]?.name ?? null,
          cycle_end_date: issueCycle[issue.id]?.end_date ?? null,
          modules: issueModules[issue.id] ?? [],
          parent: issue.parent ?? null,
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
    const labelSet  = new Set<string>();

    for (const i of allIssues) {
      i.assignees.forEach((a: string) => memberSet.set(a, a));
      if (i.created_by) memberSet.set(i.created_by, i.created_by);
      if (i.state_name) stateSet.set(i.state_id, i.state_name);
      if (i.cycle)  cycleSet.add(i.cycle);
      i.modules.forEach((m: string) => moduleSet.add(m));
      i.labels.forEach((l: string) => labelSet.add(l));
    }

    return NextResponse.json(
      {
        issues: allIssues,
        enriched: enrich,
        filters: {
          projects: projects.map((p: any) => ({ id: p.id, name: p.name })),
          members: Array.from(memberSet.keys()),
          states: Array.from(stateSet.entries()).map(([id, name]) => ({ id, name })),
          priorities: ["urgent", "high", "medium", "low", "none"],
          cycles: Array.from(cycleSet),
          modules: Array.from(moduleSet),
          labels: Array.from(labelSet),
        },
      },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
    );
  } catch (err: any) {
    console.error("Plane API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
