import { NextResponse } from "next/server";
import { PlaneClient } from "@/lib/plane-client";

const WS = process.env.PLANE_WORKSPACE_SLUG!;
const client = new PlaneClient(process.env.PLANE_API_KEY!, process.env.PLANE_BASE_URL!);

function arr(data: any): any[] { return data?.results ?? data ?? []; }
function toMap<T>(items: T[], key: keyof T): Record<string, T> {
  return Object.fromEntries(items.map(i => [i[key], i]));
}

// Fetch with a timeout to avoid hanging
async function safeFetch(fn: () => Promise<any>, fallback: any = []): Promise<any> {
  try {
    return await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    const projects: any[] = arr(await client.listProjects(WS));

    // Process projects sequentially to avoid hammering Plane API
    const enriched: any[][] = [];
    for (const project of projects) {
      const pid = project.id;

      // Batch 1: issues + metadata in parallel
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

      // Check if issues already carry cycle_id / module_ids inline (Plane v2+)
      const sampleIssue = issues[0] ?? {};
      const hasCycleInline  = "cycle_id"   in sampleIssue;
      const hasModuleInline = "module_ids"  in sampleIssue;

      const issueCycle:   Record<string, string>   = {};
      const issueModules: Record<string, string[]>  = {};

      if (hasCycleInline) {
        // Use inline cycle_id
        for (const issue of issues) {
          if (issue.cycle_id && cycleMap[issue.cycle_id]) {
            issueCycle[issue.id] = cycleMap[issue.cycle_id].name;
          }
        }
      } else {
        // Fetch cycle-issues sequentially (one at a time) to avoid 522s
        for (const c of cycles) {
          const items = arr(await safeFetch(() => client.listCycleIssues(WS, pid, c.id)));
          for (const ci of items) {
            const iid = ci.issue ?? ci.issue_id;
            if (iid) issueCycle[iid] = cycleMap[c.id]?.name ?? c.id;
          }
        }
      }

      if (hasModuleInline) {
        // Use inline module_ids
        for (const issue of issues) {
          if (Array.isArray(issue.module_ids) && issue.module_ids.length > 0) {
            issueModules[issue.id] = issue.module_ids
              .map((mid: string) => moduleMap[mid]?.name ?? mid)
              .filter(Boolean);
          }
        }
      } else {
        // Fetch module-issues sequentially
        for (const m of modules) {
          const items = arr(await safeFetch(() => client.listModuleIssues(WS, pid, m.id)));
          for (const mi of items) {
            const iid = mi.issue ?? mi.issue_id;
            if (!iid) continue;
            issueModules[iid] ??= [];
            const name = moduleMap[m.id]?.name ?? m.id;
            if (!issueModules[iid].includes(name)) issueModules[iid].push(name);
          }
        }
      }

      function resolveMember(id: string) {
        const m = memberMap[id];
        return m ? `${m.display_name ?? m.first_name ?? ""} ${m.last_name ?? ""}`.trim() : (id ?? "");
      }

      enriched.push(issues.map((issue: any) => {
        const state = stateMap[issue.state];
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
          labels: (issue.label_ids ?? []).map((lid: string) => labelMap[lid]?.name ?? lid),
          cycle: issueCycle[issue.id] ?? null,
          modules: issueModules[issue.id] ?? [],
          project_id: pid,
          project_name: project.name,
          project_identifier: project.identifier,
        };
      }));
    }

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

    return NextResponse.json({
      issues: allIssues,
      filters: {
        projects: projects.map((p: any) => ({ id: p.id, name: p.name })),
        members: Array.from(memberSet.keys()),
        states: Array.from(stateSet.entries()).map(([id, name]) => ({ id, name })),
        priorities: ["urgent", "high", "medium", "low", "none"],
        cycles: Array.from(cycleSet),
        modules: Array.from(moduleSet),
        labels: Array.from(labelSet),
      },
    });
  } catch (err: any) {
    console.error("Plane API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
