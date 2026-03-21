"use client";

import { useState, useEffect, useMemo, useRef } from "react";

interface Issue {
  id: string;
  sequence_id: number;
  name: string;
  priority: string;
  state_name: string;
  state_color: string;
  state_group: string;
  assignees: string[];
  created_by: string;
  created_by_id: string;
  created_at: string;
  start_date: string | null;
  due_date: string | null;
  labels: string[];
  cycle: string | null;
  modules: string[];
  parent: string | null;
  project_id: string;
  project_name: string;
  project_identifier: string;
}

interface FilterOptions {
  projects: { id: string; name: string }[];
  members: string[];
  states: { id: string; name: string }[];
  priorities: string[];
  cycles: string[];
  modules: string[];
  labels: string[];
}

const PLANE_BASE = "https://nirmaan.credresolve.com";

function issueUrl(issue: Issue) {
  return `${PLANE_BASE}/cr-product/projects/${issue.project_id}/issues/${issue.id}/`;
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: "Urgent", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  high:   { label: "High",   color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  medium: { label: "Medium", color: "#eab308", bg: "rgba(234,179,8,0.12)" },
  low:    { label: "Low",    color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  none:   { label: "None",   color: "#64748b", bg: "rgba(100,116,139,0.12)" },
};

const ANOMALY_TYPES = [
  { key: "no_start_date", label: "No Start Date", color: "#f97316", check: (i: Issue) => !i.start_date },
  { key: "no_due_date",   label: "No Due Date",   color: "#ef4444", check: (i: Issue) => !i.due_date },
  { key: "no_cycle",      label: "No Cycle",      color: "#a78bfa", check: (i: Issue) => !i.cycle },
  { key: "no_module",     label: "No Module",     color: "#34d399", check: (i: Issue) => i.modules.length === 0 },
  { key: "unassigned",    label: "Unassigned",    color: "#38bdf8", check: (i: Issue) => i.assignees.length === 0 },
];

const INSIGHT_TAGS = ["Bugs", "Integrations"];

function isDone(issue: Issue) {
  return issue.state_group === "completed" || issue.state_name.toLowerCase() === "done";
}

function overdueDays(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "9999px", fontSize: "0.72rem", fontWeight: 600, color, background: bg, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

// ── Tag cell with expand/collapse ─────────────────────────────────────────
function TagCell({ labels, color = "#38bdf8", bg = "rgba(56,189,248,0.1)", emptyColor = "var(--text-secondary)" }: {
  labels: string[]; color?: string; bg?: string; emptyColor?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (labels.length === 0) return <span style={{ color: emptyColor }}>—</span>;
  const SHOW = 2;
  const visible = expanded ? labels : labels.slice(0, SHOW);
  const hidden = labels.length - SHOW;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {visible.map(l => <Badge key={l} text={l} color={color} bg={bg} />)}
      {!expanded && hidden > 0 && (
        <button onClick={e => { e.stopPropagation(); setExpanded(true); }}
          style={{ fontSize: "0.7rem", color: "#60a5fa", background: "rgba(59,130,246,0.1)", border: "none", borderRadius: 9999, padding: "2px 7px", cursor: "pointer", fontWeight: 600 }}>
          +{hidden}
        </button>
      )}
      {expanded && labels.length > SHOW && (
        <button onClick={e => { e.stopPropagation(); setExpanded(false); }}
          style={{ fontSize: "0.7rem", color: "#94a3b8", background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 9999, padding: "2px 7px", cursor: "pointer" }}>
          less
        </button>
      )}
    </div>
  );
}

// ── Multi-select dropdown ─────────────────────────────────────────────────
function MultiSelect({ label, selected, options, onChange }: {
  label: string;
  selected: string[];
  options: { value: string; label: string }[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };

  const displayLabel = selected.length === 0 ? "All" : selected.length === 1
    ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
    : `${selected.length} selected`;

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140, position: "relative" }}>
      <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{label}</label>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: "rgba(15,23,42,0.8)", border: "1px solid var(--border-glass)", color: selected.length > 0 ? "var(--text-primary)" : "var(--text-secondary)", padding: "6px 10px", borderRadius: 8, fontSize: "0.82rem", outline: "none", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayLabel}</span>
        <span style={{ fontSize: "0.6rem", opacity: 0.6 }}>▼</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#1e293b", border: "1px solid var(--border-glass)", borderRadius: 8, minWidth: "100%", maxHeight: 220, overflowY: "auto", marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} style={{ width: "100%", padding: "6px 12px", background: "none", border: "none", borderBottom: "1px solid var(--border-glass)", color: "#ef4444", fontSize: "0.78rem", cursor: "pointer", textAlign: "left" }}>
              Clear
            </button>
          )}
          {options.map(o => (
            <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: "0.82rem", color: "var(--text-primary)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)}
                style={{ accentColor: "#3b82f6", width: 14, height: 14, cursor: "pointer", flexShrink: 0 }} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Issue row (parent + children) ────────────────────────────────────────
function IssueRow({ issue, children, showOverdue, depth = 0 }: {
  issue: Issue;
  children?: Issue[];
  showOverdue: boolean;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = children && children.length > 0;
  const pm = PRIORITY_META[issue.priority] ?? PRIORITY_META.none;
  const days = overdueDays(issue.due_date);
  const td: React.CSSProperties = { padding: "9px 14px" };
  const indentPx = depth * 20;

  return (
    <>
      <tr
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
        onMouseEnter={e => (e.currentTarget.style.background = depth > 0 ? "rgba(59,130,246,0.06)" : "rgba(59,130,246,0.04)")}
        onMouseLeave={e => (e.currentTarget.style.background = depth > 0 ? "rgba(59,130,246,0.02)" : "transparent")}
      >
        {/* Issue */}
        <td style={{ ...td, maxWidth: 280 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, paddingLeft: indentPx }}>
            {hasChildren ? (
              <button onClick={() => setExpanded(x => !x)}
                style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 4, background: "rgba(59,130,246,0.15)", border: "none", color: "#60a5fa", fontSize: "0.7rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                {expanded ? "▾" : "▸"}
              </button>
            ) : depth === 0 ? (
              <span style={{ width: 18, flexShrink: 0 }} />
            ) : (
              <span style={{ width: 18, flexShrink: 0, color: "var(--text-secondary)", fontSize: "0.8rem", textAlign: "center" }}>↳</span>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <a href={issueUrl(issue)} target="_blank" rel="noopener noreferrer"
                  style={{ color: "var(--text-secondary)", fontSize: "0.72rem", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#60a5fa")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text-secondary)")}>
                  {issue.project_identifier}-{issue.sequence_id}
                </a>
                {hasChildren && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#60a5fa", background: "rgba(59,130,246,0.15)", padding: "1px 6px", borderRadius: 9999 }}>
                    {children!.length}
                  </span>
                )}
              </div>
              <a href={issueUrl(issue)} target="_blank" rel="noopener noreferrer"
                style={{ fontWeight: 500, lineHeight: 1.4, color: "inherit", textDecoration: "none", wordBreak: "break-word" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#93c5fd")}
                onMouseLeave={e => (e.currentTarget.style.color = "inherit")}>
                {issue.name}
              </a>
            </div>
          </div>
        </td>
        {/* State */}
        <td style={td}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: issue.state_color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: "0.82rem" }}>{issue.state_name}</span>
          </span>
        </td>
        {/* Priority */}
        <td style={td}><Badge text={pm.label} color={pm.color} bg={pm.bg} /></td>
        {/* Assignee */}
        <td style={{ ...td, minWidth: 110 }}>
          {issue.assignees.length === 0
            ? <span style={{ color: "var(--text-secondary)" }}>—</span>
            : <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "0.82rem" }}>{issue.assignees.map(a => <span key={a}>{a}</span>)}</div>}
        </td>
        {/* Created by */}
        <td style={{ ...td, whiteSpace: "nowrap", fontSize: "0.82rem" }}>
          {issue.created_by || <span style={{ color: "var(--text-secondary)" }}>—</span>}
        </td>
        {/* Created */}
        <td style={{ ...td, whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.8rem" }}>{fmt(issue.created_at)}</td>
        {/* Start Date */}
        <td style={{ ...td, whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.8rem" }}>{fmt(issue.start_date)}</td>
        {/* Due Date */}
        <td style={td}>
          <span style={{ color: days ? "#ef4444" : "var(--text-secondary)", fontWeight: days ? 600 : 400, fontSize: "0.8rem", whiteSpace: "nowrap" }}>{fmt(issue.due_date)}</span>
        </td>
        {/* Overdue col */}
        {showOverdue && (
          <td style={td}>
            {days !== null ? <span style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", padding: "3px 10px", borderRadius: 9999, fontSize: "0.78rem", fontWeight: 700, whiteSpace: "nowrap" }}>{days}d</span> : "—"}
          </td>
        )}
        {/* Cycle */}
        <td style={td}>
          {issue.cycle ? <Badge text={issue.cycle} color="#a78bfa" bg="rgba(167,139,250,0.12)" /> : <span style={{ color: "var(--text-secondary)" }}>—</span>}
        </td>
        {/* Tags */}
        <td style={{ ...td, maxWidth: 160 }}>
          <TagCell labels={issue.labels} />
        </td>
        {/* Modules */}
        <td style={{ ...td, maxWidth: 180 }}>
          <TagCell labels={issue.modules} color="#34d399" bg="rgba(52,211,153,0.1)" />
        </td>
        {/* Project */}
        <td style={{ ...td, whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.8rem" }}>{issue.project_name}</td>
      </tr>
      {hasChildren && expanded && children!.map(child => (
        <IssueRow key={child.id} issue={child} showOverdue={showOverdue} depth={depth + 1} />
      ))}
    </>
  );
}

// ── Issue table ───────────────────────────────────────────────────────────
function IssueTable({ issues, allIssues, showOverdue }: { issues: Issue[]; allIssues: Issue[]; showOverdue: boolean }) {
  const childMap = useMemo(() => {
    const map = new Map<string, Issue[]>();
    const issueSet = new Set(issues.map(i => i.id));
    for (const i of allIssues) {
      if (i.parent && issueSet.has(i.parent)) {
        if (!map.has(i.parent)) map.set(i.parent, []);
        map.get(i.parent)!.push(i);
      }
    }
    return map;
  }, [issues, allIssues]);

  // Show only top-level issues (parent = null, or parent not in current list)
  const issueSet = useMemo(() => new Set(issues.map(i => i.id)), [issues]);
  const topLevel = useMemo(() => issues.filter(i => !i.parent || !issueSet.has(i.parent)), [issues, issueSet]);

  const th: React.CSSProperties = { padding: "10px 14px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-glass)", background: "rgba(15,23,42,0.4)" }}>
            <th style={th}>Issue</th>
            <th style={th}>State</th>
            <th style={th}>Priority</th>
            <th style={th}>Assignee</th>
            <th style={th}>Created by</th>
            <th style={th}>Created</th>
            <th style={th}>Start Date</th>
            <th style={th}>Due Date</th>
            {showOverdue && <th style={th}>Overdue</th>}
            <th style={th}>Cycle</th>
            <th style={th}>Tags</th>
            <th style={th}>Modules</th>
            <th style={th}>Project</th>
          </tr>
        </thead>
        <tbody>
          {topLevel.map(issue => (
            <IssueRow key={issue.id} issue={issue} children={childMap.get(issue.id)} showOverdue={showOverdue} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Insight bar ────────────────────────────────────────────────────────────
function InsightBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 130, fontSize: "0.78rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 9999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 9999, transition: "width 0.5s ease" }} />
      </div>
      <div style={{ width: 42, textAlign: "right", fontSize: "0.78rem", color: "var(--text-secondary)", flexShrink: 0 }}>{count}</div>
      <div style={{ width: 38, textAlign: "right", fontSize: "0.72rem", color: color, flexShrink: 0, fontWeight: 600 }}>{pct.toFixed(0)}%</div>
    </div>
  );
}

function InsightCard({ title, children, accent }: { title: string; children: React.ReactNode; accent: string }) {
  return (
    <div style={{ background: "var(--bg-card)", border: `1px solid ${accent}33`, borderRadius: 12, padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</div>
      {children}
    </div>
  );
}

// ── Insights tab ──────────────────────────────────────────────────────────
function InsightsTab({ issues }: { issues: Issue[] }) {
  const active = useMemo(() => issues.filter(i => !isDone(i)), [issues]);
  const total = active.length;

  // --- Priority ---
  const byPriority = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of active) counts[i.priority] = (counts[i.priority] ?? 0) + 1;
    return ["urgent", "high", "medium", "low", "none"].map(p => ({ key: p, label: PRIORITY_META[p].label, count: counts[p] ?? 0, color: PRIORITY_META[p].color }));
  }, [active]);

  // --- State ---
  const byState = useMemo(() => {
    const counts = new Map<string, { count: number; color: string }>();
    for (const i of active) {
      const cur = counts.get(i.state_name) ?? { count: 0, color: i.state_color };
      counts.set(i.state_name, { count: cur.count + 1, color: i.state_color });
    }
    return Array.from(counts.entries()).map(([name, { count, color }]) => ({ name, count, color })).sort((a, b) => b.count - a.count);
  }, [active]);

  // --- Cycle ---
  const byCycle = useMemo(() => {
    const counts = new Map<string, number>();
    let noCycle = 0;
    for (const i of active) {
      if (i.cycle) counts.set(i.cycle, (counts.get(i.cycle) ?? 0) + 1);
      else noCycle++;
    }
    const result = Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    if (noCycle > 0) result.push({ name: "No Cycle", count: noCycle });
    return result;
  }, [active]);

  // --- Module ---
  const byModule = useMemo(() => {
    const counts = new Map<string, number>();
    let noMod = 0;
    for (const i of active) {
      if (i.modules.length > 0) i.modules.forEach(m => counts.set(m, (counts.get(m) ?? 0) + 1));
      else noMod++;
    }
    const result = Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    if (noMod > 0) result.push({ name: "No Module", count: noMod });
    return result;
  }, [active]);

  // --- Tags (Bugs + Integrations only) ---
  const byInsightTag = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of active) {
      for (const label of i.labels) {
        if (INSIGHT_TAGS.includes(label)) counts[label] = (counts[label] ?? 0) + 1;
      }
    }
    return INSIGHT_TAGS.map(t => ({ name: t, count: counts[t] ?? 0 }));
  }, [active]);

  const CYCLE_COLORS = ["#a78bfa", "#818cf8", "#60a5fa", "#34d399", "#fbbf24", "#f87171"];
  const MODULE_COLORS = ["#34d399", "#10b981", "#6ee7b7", "#a3e635", "#4ade80", "#22d3ee"];

  const kpi: React.CSSProperties = {
    background: "var(--bg-card)", border: "1px solid var(--border-glass)", borderRadius: 12,
    padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: 4,
  };

  const overdue = issues.filter(i => !isDone(i) && overdueDays(i.due_date) !== null).length;
  const anomaly = issues.filter(i => !isDone(i) && ANOMALY_TYPES.some(a => a.check(i))).length;
  const unassigned = issues.filter(i => !isDone(i) && i.assignees.length === 0).length;
  const noDate = issues.filter(i => !isDone(i) && !i.due_date).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
        {[
          { label: "Active Issues", val: total, color: "#60a5fa" },
          { label: "Overdue", val: overdue, color: "#ef4444" },
          { label: "Anomalies", val: anomaly, color: "#f97316" },
          { label: "Unassigned", val: unassigned, color: "#38bdf8" },
          { label: "No Due Date", val: noDate, color: "#fbbf24" },
        ].map(k => (
          <div key={k.label} style={kpi}>
            <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em" }}>{k.label}</span>
            <span style={{ fontSize: "1.9rem", fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.val}</span>
            <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{total > 0 ? ((k.val / total) * 100).toFixed(0) : 0}% of active</span>
          </div>
        ))}
      </div>

      {/* Priority + State side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <InsightCard title="By Priority" accent="#f97316">
          {byPriority.map(p => <InsightBar key={p.key} label={p.label} count={p.count} total={total} color={p.color} />)}
        </InsightCard>
        <InsightCard title="By State" accent="#60a5fa">
          {byState.map(s => <InsightBar key={s.name} label={s.name} count={s.count} total={total} color={s.color} />)}
        </InsightCard>
      </div>

      {/* Cycle + Module side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <InsightCard title="By Cycle" accent="#a78bfa">
          {byCycle.length === 0
            ? <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>No cycle data yet — loading…</span>
            : byCycle.map((c, i) => <InsightBar key={c.name} label={c.name} count={c.count} total={total} color={c.name === "No Cycle" ? "#475569" : CYCLE_COLORS[i % CYCLE_COLORS.length]} />)
          }
        </InsightCard>
        <InsightCard title="By Module" accent="#34d399">
          {byModule.length === 0
            ? <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>No module data yet — loading…</span>
            : byModule.map((m, i) => <InsightBar key={m.name} label={m.name} count={m.count} total={total} color={m.name === "No Module" ? "#475569" : MODULE_COLORS[i % MODULE_COLORS.length]} />)
          }
        </InsightCard>
      </div>

      {/* Tag insights */}
      <InsightCard title={`Tags — Bugs & Integrations`} accent="#38bdf8">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {byInsightTag.map(t => (
            <div key={t.name} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: t.name === "Bugs" ? "#ef4444" : "#38bdf8" }}>{t.name}</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: t.name === "Bugs" ? "#ef4444" : "#38bdf8", lineHeight: 1 }}>{t.count}</div>
              <InsightBar label="" count={t.count} total={total} color={t.name === "Bugs" ? "#ef4444" : "#38bdf8"} />
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{total > 0 ? ((t.count / total) * 100).toFixed(1) : 0}% of active issues</div>
            </div>
          ))}
        </div>
      </InsightCard>
    </div>
  );
}

// ── Anomaly tab ───────────────────────────────────────────────────────────
function AnomalyTab({ issues }: { issues: Issue[] }) {
  const [activeAnomaly, setActiveAnomaly] = useState("all");
  const nonDone = useMemo(() => issues.filter(i => !isDone(i)), [issues]);

  const anomalyCounts = useMemo(() =>
    Object.fromEntries(ANOMALY_TYPES.map(a => [a.key, nonDone.filter(a.check).length])),
    [nonDone]
  );

  const issuesWithAnomalies = useMemo(() =>
    nonDone.map(i => ({ ...i, anomalies: ANOMALY_TYPES.filter(a => a.check(i)).map(a => a.key) }))
           .filter(i => i.anomalies.length > 0),
    [nonDone]
  );

  const filtered = useMemo(() =>
    activeAnomaly === "all" ? issuesWithAnomalies : issuesWithAnomalies.filter(i => i.anomalies.includes(activeAnomaly)),
    [issuesWithAnomalies, activeAnomaly]
  );

  const th: React.CSSProperties = { padding: "10px 14px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1.25rem" }}>
        <button onClick={() => setActiveAnomaly("all")} style={{ padding: "6px 14px", borderRadius: 9999, border: `1px solid ${activeAnomaly === "all" ? "#3b82f6" : "var(--border-glass)"}`, background: activeAnomaly === "all" ? "rgba(59,130,246,0.15)" : "transparent", color: activeAnomaly === "all" ? "#60a5fa" : "var(--text-secondary)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
          All anomalies ({issuesWithAnomalies.length})
        </button>
        {ANOMALY_TYPES.map(a => (
          <button key={a.key} onClick={() => setActiveAnomaly(a.key)} style={{ padding: "6px 14px", borderRadius: 9999, border: `1px solid ${activeAnomaly === a.key ? a.color : "var(--border-glass)"}`, background: activeAnomaly === a.key ? `${a.color}22` : "transparent", color: activeAnomaly === a.key ? a.color : "var(--text-secondary)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
            {a.label} ({anomalyCounts[a.key]})
          </button>
        ))}
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-glass)", borderRadius: 12, overflow: "hidden" }}>
        {filtered.length === 0
          ? <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>No anomalies found.</div>
          : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-glass)", background: "rgba(15,23,42,0.4)" }}>
                    <th style={th}>Issue</th>
                    <th style={th}>Anomalies</th>
                    <th style={th}>State</th>
                    <th style={th}>Priority</th>
                    <th style={th}>Assignee</th>
                    <th style={th}>Start Date</th>
                    <th style={th}>Due Date</th>
                    <th style={th}>Cycle</th>
                    <th style={th}>Modules</th>
                    <th style={th}>Project</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((issue, idx) => {
                    const pm = PRIORITY_META[issue.priority] ?? PRIORITY_META.none;
                    return (
                      <tr key={issue.id}
                        style={{ borderBottom: idx < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.04)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "10px 14px", maxWidth: 260 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <a href={issueUrl(issue)} target="_blank" rel="noopener noreferrer"
                              style={{ color: "var(--text-secondary)", fontSize: "0.72rem", fontWeight: 600, textDecoration: "none" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#60a5fa")}
                              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-secondary)")}>
                              {issue.project_identifier}-{issue.sequence_id}
                            </a>
                            <a href={issueUrl(issue)} target="_blank" rel="noopener noreferrer"
                              style={{ fontWeight: 500, lineHeight: 1.4, color: "inherit", textDecoration: "none" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#93c5fd")}
                              onMouseLeave={e => (e.currentTarget.style.color = "inherit")}>
                              {issue.name}
                            </a>
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", minWidth: 200 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {issue.anomalies.map(key => {
                              const a = ANOMALY_TYPES.find(t => t.key === key)!;
                              return <Badge key={key} text={a.label} color={a.color} bg={`${a.color}22`} />;
                            })}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                            <span style={{ width: 9, height: 9, borderRadius: "50%", background: issue.state_color, display: "inline-block", flexShrink: 0 }} />
                            {issue.state_name}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}><Badge text={pm.label} color={pm.color} bg={pm.bg} /></td>
                        <td style={{ padding: "10px 14px", minWidth: 120 }}>
                          {issue.assignees.length === 0
                            ? <span style={{ color: "#ef4444", fontSize: "0.82rem", fontWeight: 600 }}>Unassigned</span>
                            : <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{issue.assignees.map(a => <span key={a}>{a}</span>)}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          {issue.start_date ? <span style={{ color: "var(--text-secondary)" }}>{fmt(issue.start_date)}</span> : <span style={{ color: "#f97316", fontWeight: 600 }}>Missing</span>}
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          {issue.due_date ? <span style={{ color: "var(--text-secondary)" }}>{fmt(issue.due_date)}</span> : <span style={{ color: "#ef4444", fontWeight: 600 }}>Missing</span>}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {issue.cycle ? <Badge text={issue.cycle} color="#a78bfa" bg="rgba(167,139,250,0.12)" /> : <span style={{ color: "#a78bfa", fontWeight: 600 }}>Missing</span>}
                        </td>
                        <td style={{ padding: "10px 14px", maxWidth: 180 }}>
                          {issue.modules.length === 0
                            ? <span style={{ color: "#34d399", fontWeight: 600 }}>Missing</span>
                            : <TagCell labels={issue.modules} color="#34d399" bg="rgba(52,211,153,0.1)" />}
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{issue.project_name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
        {filtered.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border-glass)", padding: "10px 14px", color: "var(--text-secondary)", fontSize: "0.78rem" }}>
            Showing {filtered.length} issue{filtered.length !== 1 ? "s" : ""} with anomalies (Done excluded)
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function PlaneDashboard() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overall" | "overdue" | "anomaly" | "insights">("overall");

  const [fProjects,    setFProjects]    = useState<string[]>([]);
  const [fCreatedBys,  setFCreatedBys]  = useState<string[]>([]);
  const [fAssignees,   setFAssignees]   = useState<string[]>([]);
  const [fModules,     setFModules]     = useState<string[]>([]);
  const [fCycles,      setFCycles]      = useState<string[]>([]);
  const [fPriorities,  setFPriorities]  = useState<string[]>([]);
  const [fStates,      setFStates]      = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/issues")
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setIssues(data.issues);
        setFilterOptions(data.filters);
        setLoading(false);

        setEnriching(true);
        return fetch("/api/issues?enrich=1")
          .then(r => r.json())
          .then(enriched => {
            if (enriched.error) return;
            const enrichMap = new Map(enriched.issues.map((i: Issue) => [i.id, i]));
            setIssues(prev => prev.map(issue => {
              const e = enrichMap.get(issue.id) as Issue | undefined;
              if (!e) return issue;
              return { ...issue, cycle: e.cycle, modules: e.modules };
            }));
            setFilterOptions(prev => prev ? {
              ...prev,
              cycles: enriched.filters.cycles,
              modules: enriched.filters.modules,
            } : prev);
          })
          .catch(() => {})
          .finally(() => setEnriching(false));
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const hasFilters = fProjects.length || fCreatedBys.length || fAssignees.length || fModules.length || fCycles.length || fPriorities.length || fStates.length;
  const clearFilters = () => { setFProjects([]); setFCreatedBys([]); setFAssignees([]); setFModules([]); setFCycles([]); setFPriorities([]); setFStates([]); };

  const filtered = useMemo(() => {
    let list = issues;
    if (fProjects.length)   list = list.filter(i => fProjects.includes(i.project_id));
    if (fCreatedBys.length) list = list.filter(i => fCreatedBys.includes(i.created_by));
    if (fAssignees.length)  list = list.filter(i => i.assignees.some(a => fAssignees.includes(a)));
    if (fModules.length)    list = list.filter(i => i.modules.some(m => fModules.includes(m)));
    if (fCycles.length)     list = list.filter(i => i.cycle && fCycles.includes(i.cycle));
    if (fPriorities.length) list = list.filter(i => fPriorities.includes(i.priority));
    if (fStates.length)     list = list.filter(i => fStates.includes(i.state_name));
    if (activeTab === "overdue") {
      list = list.filter(i => !isDone(i) && overdueDays(i.due_date) !== null);
      list = [...list].sort((a, b) => (overdueDays(b.due_date) ?? 0) - (overdueDays(a.due_date) ?? 0));
    }
    return list;
  }, [issues, fProjects, fCreatedBys, fAssignees, fModules, fCycles, fPriorities, fStates, activeTab]);

  const overdueCount = useMemo(() => issues.filter(i => !isDone(i) && overdueDays(i.due_date) !== null).length, [issues]);
  const anomalyCount = useMemo(() => issues.filter(i => !isDone(i) && ANOMALY_TYPES.some(a => a.check(i))).length, [issues]);

  const tabs = [
    { key: "overall"  as const, label: "Overall",  count: issues.length },
    { key: "overdue"  as const, label: "Overdue",  count: overdueCount },
    { key: "anomaly"  as const, label: "Anomaly",  count: anomalyCount },
    { key: "insights" as const, label: "Insights", count: null },
  ];

  const showFilters = activeTab !== "anomaly" && activeTab !== "insights";

  return (
    <main style={{ padding: "2rem", minHeight: "100vh" }}>
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 800, background: "linear-gradient(to right, #60a5fa, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 4 }}>
          PlanX
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
          Workspace: cr-product &middot; {loading ? "Loading..." : `${issues.length} total issues`}
          {enriching && <span style={{ marginLeft: 10, fontSize: "0.78rem", color: "#a78bfa" }}>↻ Loading cycle &amp; module data…</span>}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-glass)", marginBottom: "1.5rem" }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: "8px 20px", background: "none", border: "none", borderBottom: activeTab === tab.key ? "2px solid #3b82f6" : "2px solid transparent", color: activeTab === tab.key ? "#3b82f6" : "var(--text-secondary)", fontWeight: activeTab === tab.key ? 700 : 400, fontSize: "0.9rem", cursor: "pointer", marginBottom: -1, display: "flex", alignItems: "center", gap: 6 }}>
            {tab.label}
            {tab.count !== null && tab.count > 0 && <span style={{ background: activeTab === tab.key ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.08)", color: activeTab === tab.key ? "#60a5fa" : "var(--text-secondary)", borderRadius: 9999, padding: "1px 8px", fontSize: "0.72rem", fontWeight: 700 }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Filters */}
      {showFilters && filterOptions && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-glass)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "1.25rem", alignItems: "flex-end" }}>
          <MultiSelect label="Project"    selected={fProjects}   options={filterOptions.projects.map(p   => ({ value: p.id,   label: p.name }))} onChange={setFProjects} />
          <MultiSelect label="Created by" selected={fCreatedBys} options={filterOptions.members.map(m    => ({ value: m,      label: m }))}       onChange={setFCreatedBys} />
          <MultiSelect label="Assignee"   selected={fAssignees}  options={filterOptions.members.map(m    => ({ value: m,      label: m }))}       onChange={setFAssignees} />
          <MultiSelect label="Module"     selected={fModules}    options={filterOptions.modules.map(m    => ({ value: m,      label: m }))}       onChange={setFModules} />
          <MultiSelect label="Cycle"      selected={fCycles}     options={filterOptions.cycles.map(c     => ({ value: c,      label: c }))}       onChange={setFCycles} />
          <MultiSelect label="Priority"   selected={fPriorities} options={filterOptions.priorities.map(p => ({ value: p,     label: PRIORITY_META[p]?.label ?? p }))} onChange={setFPriorities} />
          <MultiSelect label="State"      selected={fStates}     options={filterOptions.states.map(s     => ({ value: s.name, label: s.name }))} onChange={setFStates} />
          {hasFilters ? (
            <button onClick={clearFilters} style={{ padding: "6px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", alignSelf: "flex-end" }}>
              Clear all
            </button>
          ) : null}
        </div>
      )}

      {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "1rem 1.5rem", color: "#ef4444", marginBottom: "1rem" }}>Error: {error}</div>}
      {loading && <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-glass)", borderRadius: 12, padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading issues from Plane…</div>}

      {!loading && !error && activeTab === "insights" && <InsightsTab issues={issues} />}
      {!loading && !error && activeTab === "anomaly"  && <AnomalyTab issues={issues} />}

      {activeTab === "overdue" && !loading && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "0.75rem 1.25rem", marginBottom: "1rem", color: "#fca5a5", fontSize: "0.85rem" }}>
          ⚠️ {filtered.length} issue{filtered.length !== 1 ? "s" : ""} overdue — Done issues excluded — sorted by most days past due
        </div>
      )}

      {!loading && !error && activeTab !== "anomaly" && activeTab !== "insights" && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-glass)", borderRadius: 12, overflow: "hidden" }}>
          {filtered.length === 0
            ? <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>No issues match the current filters.</div>
            : <IssueTable issues={filtered} allIssues={issues} showOverdue={activeTab === "overdue"} />
          }
          {filtered.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border-glass)", padding: "10px 14px", color: "var(--text-secondary)", fontSize: "0.78rem" }}>
              Showing {filtered.length} of {issues.length} issues
            </div>
          )}
        </div>
      )}
    </main>
  );
}
