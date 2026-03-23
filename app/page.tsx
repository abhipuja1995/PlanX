"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from "recharts";

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
  cycle_end_date: string | null;
  completed_at: string | null;
  updated_at: string | null;
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

const INSIGHT_TAGS = ["Bug", "Lender Integration", "Vendor Integration"];

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

function isOverdue(i: Issue): boolean {
  if (!i.due_date) return false;
  if (i.state_group === "completed" || i.state_group === "cancelled") return false;
  return overdueDays(i.due_date) !== null;
}

function isDoneAfterDue(i: Issue): boolean {
  if (i.state_group !== "completed" || !i.due_date) return false;
  const ref = i.completed_at ?? i.updated_at;
  return !!ref && new Date(ref) > new Date(i.due_date);
}

function isSpillover(i: Issue): boolean {
  if (!i.cycle_end_date) return false;
  if (i.state_group === "completed" || i.state_group === "cancelled") return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(i.cycle_end_date) < today;
}

function isWithinDays(dateStr: string | null, days: number): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) >= new Date(Date.now() - days * 86400000);
}

const isThisWeek  = (i: Issue) => isWithinDays(i.created_at, 7);
const isThisMonth = (i: Issue) => isWithinDays(i.created_at, 30);

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

// ── Clickable count button ────────────────────────────────────────────────
function ClickCount({ count, color, onClick }: { count: number; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={count === 0}
      style={{ background: "none", border: "none", padding: 0, cursor: count > 0 ? "pointer" : "default",
        color: count > 0 ? (color ?? "#60a5fa") : "var(--text-secondary)",
        fontWeight: count > 0 ? 700 : 400, fontSize: "inherit",
        textDecoration: count > 0 ? "underline dotted" : "none" }}>
      {count}
    </button>
  );
}

// ── Drilldown modal ───────────────────────────────────────────────────────
function DrilldownModal({ title, issues, onClose }: { title: string; issues: Issue[]; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: "5vh", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#1e293b", border: "1px solid var(--border-glass)", borderRadius: 16,
          width: "min(860px, 92vw)", maxHeight: "85vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)", marginBottom: "5vh" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "1rem 1.5rem", borderBottom: "1px solid var(--border-glass)", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>{title}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
              {issues.length} issue{issues.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-glass)",
              borderRadius: 8, color: "var(--text-secondary)", width: 32, height: 32,
              cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ×
          </button>
        </div>
        {/* List */}
        <div style={{ overflowY: "auto", padding: "0.25rem 0" }}>
          {issues.length === 0
            ? <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>No issues.</div>
            : issues.map((issue, idx) => (
              <div key={issue.id}
                style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 1.5rem",
                  borderBottom: idx < issues.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  transition: "background 0.1s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: issue.state_color, flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span>
                    <a href={issueUrl(issue)} target="_blank" rel="noopener noreferrer"
                      style={{ color: "#60a5fa", fontWeight: 700, fontSize: "0.8rem", textDecoration: "none", fontFamily: "monospace" }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}>
                      {issue.project_identifier}-{issue.sequence_id}
                    </a>
                    {" "}
                    <a href={issueUrl(issue)} target="_blank" rel="noopener noreferrer"
                      style={{ color: "var(--text-primary)", fontSize: "0.85rem", textDecoration: "none" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#93c5fd")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-primary)")}>
                      {issue.name}
                    </a>
                  </span>
                  <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{issue.state_name}</span>
                    {issue.assignees.length > 0 && <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>· {issue.assignees.join(", ")}</span>}
                    {issue.due_date && <span style={{ fontSize: "0.72rem", color: isOverdue(issue) ? "#ef4444" : "var(--text-secondary)" }}>· Due {fmt(issue.due_date)}</span>}
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}


// ── Helpers for insights ──────────────────────────────────────────────────
function staleDays(i: Issue): number {
  const ref = i.updated_at || i.created_at;
  if (!ref) return 0;
  const diff = (Date.now() - new Date(ref).getTime()) / 86400000;
  return Math.floor(diff);
}
function isStale(i: Issue): boolean {
  return !isDone(i) && staleDays(i) >= 5;
}
function cycleDays(i: Issue): number | null {
  if (!i.completed_at || !i.created_at) return null;
  const diff = (new Date(i.completed_at).getTime() - new Date(i.created_at).getTime()) / 86400000;
  return diff > 0 ? Math.round(diff) : null;
}
function getWeekBuckets(n = 8) {
  const now = new Date();
  return Array.from({ length: n }, (_, idx) => {
    const start = new Date(now);
    start.setDate(now.getDate() - (n - 1 - idx) * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return {
      label: start.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      start,
      end,
    };
  });
}

// ── RAG badge ─────────────────────────────────────────────────────────────
function RAGBadge({ rag, label }: { rag: string; label: string }) {
  const color = rag === "green" ? "#22c55e" : rag === "amber" ? "#f59e0b" : "#ef4444";
  const bg    = rag === "green" ? "rgba(34,197,94,0.12)" : rag === "amber" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)";
  const dot   = rag === "green" ? "🟢" : rag === "amber" ? "🟡" : "🔴";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px", background: bg, border: `1px solid ${color}40`, borderRadius: 9999, fontSize: "0.85rem", fontWeight: 700, color }}>
      {dot} {label}
    </span>
  );
}

// ── Insights sub-components ───────────────────────────────────────────────
function AIInsightCard({ icon, title, items, color, loading }: { icon: string; title: string; items: string[]; color: string; loading: boolean }) {
  return (
    <div style={{ background: "var(--bg-card)", border: `1px solid ${color}30`, borderRadius: 14, padding: "1.2rem 1.4rem", flex: 1, minWidth: 260 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: "1.2rem" }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: "0.9rem", color }}>{title}</span>
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1,2,3].map(n => <div key={n} style={{ height: 14, background: "rgba(255,255,255,0.06)", borderRadius: 7, width: `${60 + n*10}%`, animation: "pulse 1.5s ease-in-out infinite" }} />)}
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ display: "flex", gap: 8, fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <span style={{ color, flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricTile({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-glass)", borderRadius: 12, padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: "1.6rem", fontWeight: 800, color, lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{sub}</span>}
    </div>
  );
}

const CHART_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#84cc16"];

// ── InsightsTab ────────────────────────────────────────────────────────────
function InsightsTab({ issues }: { issues: Issue[] }) {
  const [subTab, setSubTab] = useState<"summary" | "charts" | "daily" | "weekly">("summary");
  const [drilldown, setDrilldown] = useState<{ title: string; issues: Issue[] } | null>(null);
  const [stateTime, setStateTime] = useState<"all" | "week" | "month">("all");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [creatorSearch, setCreatorSearch]   = useState("");
  const [aiData, setAiData]   = useState<Record<string, unknown> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const openDrilldown = (title: string, list: Issue[]) => setDrilldown({ title, issues: list });
  const closeDrilldown = () => setDrilldown(null);

  const thS: React.CSSProperties = { padding: "6px 10px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", background: "rgba(15,23,42,0.3)" };
  const tdS: React.CSSProperties = { padding: "8px 10px", verticalAlign: "middle", fontSize: "0.82rem" };
  const tblStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
  const rowStyle: React.CSSProperties = { borderBottom: "1px solid rgba(255,255,255,0.04)" };

  // ── Core metrics ──────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0,0,0,0);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const active   = useMemo(() => issues.filter(i => !isDone(i)), [issues]);
  const total    = active.length;
  const overdueIssues    = useMemo(() => issues.filter(i => !isDone(i) && isOverdue(i)), [issues]);
  const anomalyIssues    = useMemo(() => issues.filter(i => !isDone(i) && ANOMALY_TYPES.some(a => a.check(i))), [issues]);
  const unassignedIssues = useMemo(() => issues.filter(i => !isDone(i) && i.assignees.length === 0), [issues]);
  const noDateIssues     = useMemo(() => issues.filter(i => !isDone(i) && !i.due_date), [issues]);
  const staleIssues      = useMemo(() => issues.filter(isStale), [issues]);
  const wipIssues        = useMemo(() => issues.filter(i => i.state_group === "started"), [issues]);
  const completedThisWeek= useMemo(() => issues.filter(i => isDone(i) && i.completed_at && new Date(i.completed_at) >= weekAgo), [issues]);
  const createdThisWeek  = useMemo(() => issues.filter(i => i.created_at && new Date(i.created_at) >= weekAgo), [issues]);

  const avgCycleTimeDays = useMemo(() => {
    const times = issues.filter(isDone).map(cycleDays).filter((d): d is number => d !== null);
    return times.length ? times.reduce((s,v) => s+v, 0) / times.length : 0;
  }, [issues]);

  const bugIssues   = useMemo(() => issues.filter(i => i.labels.includes("Bug")), [issues]);
  const bugsThisWeek = bugIssues.filter(i => i.created_at && new Date(i.created_at) >= weekAgo).length;
  const bugsResolved = bugIssues.filter(i => isDone(i) && i.completed_at && new Date(i.completed_at) >= weekAgo).length;

  // ── Charts data ───────────────────────────────────────────────────────
  const weekBuckets = useMemo(() => getWeekBuckets(8), []);

  const createdVsResolvedData = useMemo(() =>
    weekBuckets.map(w => ({
      week: w.label,
      Created: issues.filter(i => i.created_at && new Date(i.created_at) >= w.start && new Date(i.created_at) < w.end).length,
      Resolved: issues.filter(i => isDone(i) && i.completed_at && new Date(i.completed_at) >= w.start && new Date(i.completed_at) < w.end).length,
    })),
  [issues, weekBuckets]);

  const stateDonutData = useMemo(() => {
    const m = new Map<string, { count: number; color: string }>();
    for (const i of issues) {
      const e = m.get(i.state_name) ?? { count: 0, color: i.state_color };
      e.count++;
      m.set(i.state_name, e);
    }
    return Array.from(m.entries())
      .map(([name, { count, color }]) => ({ name, value: count, color }))
      .sort((a,b) => b.value - a.value);
  }, [issues]);

  const priorityChartData = useMemo(() =>
    ["urgent","high","medium","low","none"].map(p => ({
      name: PRIORITY_META[p].label,
      value: issues.filter(i => i.priority === p).length,
      color: PRIORITY_META[p].color,
    })).filter(d => d.value > 0),
  [issues]);

  const wipByAssignee = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of wipIssues) {
      const names = i.assignees.length > 0 ? i.assignees : ["Unassigned"];
      for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value)
      .slice(0, 10);
  }, [wipIssues]);

  const cycleTimeByProject = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const i of issues.filter(isDone)) {
      const d = cycleDays(i);
      if (d === null) continue;
      const arr = m.get(i.project_name) ?? [];
      arr.push(d);
      m.set(i.project_name, arr);
    }
    return Array.from(m.entries())
      .map(([name, days]) => ({ name, avg: Math.round(days.reduce((s,v)=>s+v,0)/days.length), count: days.length }))
      .sort((a,b) => b.avg - a.avg);
  }, [issues]);

  // ── Summary tab data ──────────────────────────────────────────────────
  const byPriority = useMemo(() =>
    ["urgent","high","medium","low","none"].map(p => ({
      key: p, label: PRIORITY_META[p].label,
      count: active.filter(i => i.priority === p).length,
      color: PRIORITY_META[p].color,
      issues: active.filter(i => i.priority === p),
    })),
  [active]);

  const byStateEnhanced = useMemo(() => {
    const base = stateTime === "week" ? issues.filter(isThisWeek) : stateTime === "month" ? issues.filter(isThisMonth) : issues;
    const map = new Map<string, { color: string; issuesTotal: Issue[]; issuesOverdue: Issue[]; issuesDoneAfterDue: Issue[] }>();
    for (const i of base) {
      const e = map.get(i.state_name) ?? { color: i.state_color, issuesTotal: [], issuesOverdue: [], issuesDoneAfterDue: [] };
      e.issuesTotal.push(i);
      if (isOverdue(i)) e.issuesOverdue.push(i);
      if (isDoneAfterDue(i)) e.issuesDoneAfterDue.push(i);
      map.set(i.state_name, e);
    }
    return Array.from(map.entries()).map(([name, e]) => ({ name, ...e })).sort((a,b) => b.issuesTotal.length - a.issuesTotal.length);
  }, [issues, stateTime]);

  const byCycleEnhanced = useMemo(() => {
    const cycleMap = new Map<string, { end_date: string | null; issues: Issue[] }>();
    const noCycleIssues: Issue[] = [];
    for (const i of issues) {
      if (!i.cycle) { noCycleIssues.push(i); continue; }
      const e = cycleMap.get(i.cycle) ?? { end_date: i.cycle_end_date, issues: [] };
      e.issues.push(i); cycleMap.set(i.cycle, e);
    }
    const stateCounts: Record<string,number> = {};
    for (const i of issues) stateCounts[i.state_name] = (stateCounts[i.state_name] ?? 0) + 1;
    const topStates = Object.entries(stateCounts).sort(([,a],[,b]) => b-a).slice(0,6).map(([s]) => s);
    const rows = Array.from(cycleMap.entries()).map(([cycleName, { end_date, issues: cIssues }]) => {
      const byState: Record<string,Issue[]> = {};
      const spilled: Issue[] = [];
      for (const i of cIssues) { byState[i.state_name] ??= []; byState[i.state_name].push(i); if (isSpillover(i)) spilled.push(i); }
      return { cycleName, end_date, total: cIssues.length, byState, spilled, allIssues: cIssues };
    }).sort((a,b) => b.total - a.total);
    if (noCycleIssues.length > 0) {
      const byState: Record<string,Issue[]> = {};
      for (const i of noCycleIssues) { byState[i.state_name] ??= []; byState[i.state_name].push(i); }
      rows.push({ cycleName: "(No Cycle)", end_date: null, total: noCycleIssues.length, byState, spilled: [], allIssues: noCycleIssues });
    }
    return { rows, topStates };
  }, [issues]);

  const byModuleEnhanced = useMemo(() => {
    const modMap = new Map<string, { issues: Issue[]; byState: Record<string,Issue[]> }>();
    for (const i of issues) {
      const mods = i.modules.length > 0 ? i.modules : ["(No Module)"];
      for (const m of mods) {
        const e = modMap.get(m) ?? { issues: [], byState: {} };
        e.issues.push(i); e.byState[i.state_name] ??= []; e.byState[i.state_name].push(i); modMap.set(m, e);
      }
    }
    const stateCounts: Record<string,number> = {};
    for (const i of issues) stateCounts[i.state_name] = (stateCounts[i.state_name] ?? 0) + 1;
    const topStates = Object.entries(stateCounts).sort(([,a],[,b]) => b-a).slice(0,6).map(([s]) => s);
    return {
      rows: Array.from(modMap.entries()).map(([modName, { issues: mIssues, byState }]) => ({ modName, total: mIssues.length, byState, allIssues: mIssues })).sort((a,b) => b.total - a.total),
      topStates,
    };
  }, [issues]);

  const byTagEnhanced = useMemo(() =>
    INSIGHT_TAGS.map(tag => {
      const tagIssues = issues.filter(i => i.labels.includes(tag));
      const byState: Record<string,{ count: number; color: string; issues: Issue[] }> = {};
      for (const i of tagIssues) { byState[i.state_name] ??= { count: 0, color: i.state_color, issues: [] }; byState[i.state_name].count++; byState[i.state_name].issues.push(i); }
      return { tag, tagIssues, weekIssues: tagIssues.filter(isThisWeek), monthIssues: tagIssues.filter(isThisMonth), byState };
    }),
  [issues]);

  const byAssigneeFiltered = useMemo(() => {
    const map = new Map<string,{ total: Issue[]; open: Issue[]; overdue: Issue[]; done: Issue[]; spillovers: Issue[] }>();
    for (const i of issues) {
      const names = i.assignees.length > 0 ? i.assignees : ["(Unassigned)"];
      for (const name of names) {
        const e = map.get(name) ?? { total: [], open: [], overdue: [], done: [], spillovers: [] };
        e.total.push(i);
        if (i.state_group === "completed") e.done.push(i);
        else { e.open.push(i); if (isOverdue(i)) e.overdue.push(i); if (isSpillover(i)) e.spillovers.push(i); }
        map.set(name, e);
      }
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, ...d }))
      .filter(a => !assigneeSearch || a.name.toLowerCase().includes(assigneeSearch.toLowerCase()))
      .sort((a,b) => b.total.length - a.total.length);
  }, [issues, assigneeSearch]);

  // Creators for filter
  const allCreators = useMemo(() => {
    const m = new Map<string,{ name: string; issues: Issue[] }>();
    for (const i of issues) {
      const e = m.get(i.created_by) ?? { name: i.created_by, issues: [] };
      e.issues.push(i); m.set(i.created_by, e);
    }
    return Array.from(m.values()).filter(c => !creatorSearch || c.name.toLowerCase().includes(creatorSearch.toLowerCase())).sort((a,b) => b.issues.length - a.issues.length);
  }, [issues, creatorSearch]);

  const TAG_COLORS: Record<string,string> = { "Bug": "#ef4444", "Lender Integration": "#a78bfa", "Vendor Integration": "#38bdf8" };

  // ── AI Insights fetch ─────────────────────────────────────────────────
  const fetchAI = useCallback(async () => {
    setAiLoading(true); setAiError(null);
    try {
      const recentlyCompleted = completedThisWeek.slice(0, 5).map(i => ({ id: `${i.project_identifier}-${i.sequence_id}`, name: i.name }));
      const upcomingDue = issues.filter(i => !isDone(i) && i.due_date && new Date(i.due_date) >= today && new Date(i.due_date) <= new Date(today.getTime() + 7*86400000))
        .sort((a,b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
        .slice(0, 5).map(i => ({ id: `${i.project_identifier}-${i.sequence_id}`, name: i.name, due: i.due_date }));
      const topCompletedProject = (() => {
        const m = new Map<string,number>();
        for (const i of completedThisWeek) m.set(i.project_name, (m.get(i.project_name) ?? 0) + 1);
        return Array.from(m.entries()).sort(([,a],[,b]) => b-a)[0]?.[0] ?? null;
      })();
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total, overdue: overdueIssues.length, wip: wipIssues.length, stale: staleIssues.length,
          unassigned: unassignedIssues.length, noDate: noDateIssues.length, anomalyCount: anomalyIssues.length,
          createdThisWeek: createdThisWeek.length, resolvedThisWeek: completedThisWeek.length,
          completedThisWeek: completedThisWeek.length, avgCycleTimeDays,
          bugsThisWeek, bugsResolved, recentlyCompleted, upcomingDue, topCompletedProject,
        }),
      });
      const data = await res.json();
      setAiData(data);
    } catch (e: unknown) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }, [total, overdueIssues, wipIssues, staleIssues, unassignedIssues, noDateIssues, anomalyIssues, createdThisWeek, completedThisWeek, avgCycleTimeDays, bugsThisWeek, bugsResolved, issues, today]);

  useEffect(() => {
    if ((subTab === "daily" || subTab === "weekly") && !aiData && !aiLoading) {
      fetchAI();
    }
  }, [subTab]);

  const kpi: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-glass)", borderRadius: 12, padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: 4 };

  const subTabStyle = (k: string): React.CSSProperties => ({
    padding: "7px 18px", borderRadius: 9999, fontSize: "0.82rem", fontWeight: 600,
    cursor: "pointer", border: `1px solid ${subTab === k ? "#3b82f6" : "var(--border-glass)"}`,
    background: subTab === k ? "rgba(59,130,246,0.15)" : "transparent",
    color: subTab === k ? "#60a5fa" : "var(--text-secondary)",
    transition: "all 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {drilldown && <DrilldownModal title={drilldown.title} issues={drilldown.issues} onClose={closeDrilldown} />}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* Sub-tab nav */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { k: "summary", label: "📊 Summary" },
          { k: "charts",  label: "📈 Charts" },
          { k: "daily",   label: "🤖 Daily AI Snapshot" },
          { k: "weekly",  label: "📅 Weekly Report" },
        ].map(t => (
          <button key={t.k} onClick={() => setSubTab(t.k as typeof subTab)} style={subTabStyle(t.k)}>{t.label}</button>
        ))}
      </div>

      {/* KPI row — always visible */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "1rem" }}>
        {[
          { label: "Active",    val: total,                   color: "#60a5fa", list: active },
          { label: "Overdue",   val: overdueIssues.length,    color: "#ef4444", list: overdueIssues },
          { label: "WIP",       val: wipIssues.length,        color: "#a78bfa", list: wipIssues },
          { label: "Stale 5d+", val: staleIssues.length,      color: "#f59e0b", list: staleIssues },
          { label: "Anomalies", val: anomalyIssues.length,    color: "#f97316", list: anomalyIssues },
          { label: "No Due Date",val: noDateIssues.length,    color: "#fbbf24", list: noDateIssues },
        ].map(k => (
          <div key={k.label} style={kpi}>
            <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>{k.label}</span>
            <span style={{ fontSize: "1.8rem", fontWeight: 800, color: k.color, lineHeight: 1 }}>
              <ClickCount count={k.val} color={k.color} onClick={() => openDrilldown(k.label, k.list)} />
            </span>
            <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>{total > 0 ? ((k.val / total) * 100).toFixed(0) : 0}%</span>
          </div>
        ))}
      </div>

      {/* ── SUMMARY TAB ── */}
      {subTab === "summary" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Priority */}
          <InsightCard title="By Priority" accent="#f97316">
            {byPriority.map(p => (
              <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 130, fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{p.label}</div>
                <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 9999, overflow: "hidden" }}>
                  <div style={{ width: `${total > 0 ? (p.count / total) * 100 : 0}%`, height: "100%", background: p.color, borderRadius: 9999 }} />
                </div>
                <div style={{ width: 42, textAlign: "right", fontSize: "0.78rem", color: "var(--text-secondary)", flexShrink: 0 }}>
                  <ClickCount count={p.count} color={p.color} onClick={() => openDrilldown(`Priority: ${p.label}`, p.issues)} />
                </div>
              </div>
            ))}
          </InsightCard>

          {/* By State */}
          <InsightCard title="By State" accent="#60a5fa">
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {(["all","week","month"] as const).map(t => (
                <button key={t} onClick={() => setStateTime(t)} style={{ padding: "4px 12px", borderRadius: 9999, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", border: `1px solid ${stateTime === t ? "#3b82f6" : "var(--border-glass)"}`, background: stateTime === t ? "rgba(59,130,246,0.15)" : "transparent", color: stateTime === t ? "#60a5fa" : "var(--text-secondary)" }}>
                  {t === "all" ? "All Time" : t === "week" ? "This Week" : "This Month"}
                </button>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={tblStyle}><thead><tr>
                <th style={thS}>State</th>
                <th style={{ ...thS, textAlign: "right" }}>Total</th>
                <th style={{ ...thS, textAlign: "right" }}>Overdue</th>
                <th style={{ ...thS, textAlign: "right" }}>Done After Due</th>
              </tr></thead><tbody>
                {byStateEnhanced.map(s => (
                  <tr key={s.name} style={rowStyle} onMouseEnter={e=>(e.currentTarget.style.background="rgba(59,130,246,0.04)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <td style={tdS}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />{s.name}</span></td>
                    <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={s.issuesTotal.length} onClick={() => openDrilldown(`State: ${s.name}`, s.issuesTotal)} /></td>
                    <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={s.issuesOverdue.length} color="#ef4444" onClick={() => openDrilldown(`State: ${s.name} — Overdue`, s.issuesOverdue)} /></td>
                    <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={s.issuesDoneAfterDue.length} color="#f97316" onClick={() => openDrilldown(`State: ${s.name} — Done After Due`, s.issuesDoneAfterDue)} /></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </InsightCard>

          {/* By Cycle */}
          <InsightCard title="By Cycle" accent="#a78bfa">
            {byCycleEnhanced.rows.length === 0
              ? <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>No cycle data yet…</span>
              : <div style={{ overflowX: "auto" }}>
                  <table style={tblStyle}><thead><tr>
                    <th style={thS}>Cycle</th>
                    <th style={{ ...thS, textAlign: "right" }}>End Date</th>
                    <th style={{ ...thS, textAlign: "right" }}>Total</th>
                    {byCycleEnhanced.topStates.map(s => <th key={s} style={{ ...thS, textAlign: "right" }}>{s}</th>)}
                    <th style={{ ...thS, textAlign: "right", color: "#f97316" }}>Spilled</th>
                  </tr></thead><tbody>
                    {byCycleEnhanced.rows.map(row => (
                      <tr key={row.cycleName} style={rowStyle} onMouseEnter={e=>(e.currentTarget.style.background="rgba(167,139,250,0.04)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                        <td style={{ ...tdS, fontWeight: 600, minWidth: 120, whiteSpace: "nowrap", color: row.cycleName === "(No Cycle)" ? "var(--text-secondary)" : "#c4b5fd" }}>{row.cycleName}</td>
                        <td style={{ ...tdS, textAlign: "right", color: "var(--text-secondary)", fontSize: "0.75rem" }}>{fmt(row.end_date)}</td>
                        <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={row.total} color="#a78bfa" onClick={() => openDrilldown(`Cycle: ${row.cycleName}`, row.allIssues)} /></td>
                        {byCycleEnhanced.topStates.map(s => <td key={s} style={{ ...tdS, textAlign: "right" }}><ClickCount count={row.byState[s]?.length ?? 0} onClick={() => openDrilldown(`Cycle: ${row.cycleName} — ${s}`, row.byState[s] ?? [])} /></td>)}
                        <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={row.spilled.length} color="#f97316" onClick={() => openDrilldown(`Cycle: ${row.cycleName} — Spillovers`, row.spilled)} /></td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>}
          </InsightCard>

          {/* By Module */}
          <InsightCard title="By Module" accent="#34d399">
            {byModuleEnhanced.rows.length === 0
              ? <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>No module data yet…</span>
              : <div style={{ overflowX: "auto" }}>
                  <table style={tblStyle}><thead><tr>
                    <th style={thS}>Module</th>
                    <th style={{ ...thS, textAlign: "right" }}>Total</th>
                    {byModuleEnhanced.topStates.map(s => <th key={s} style={{ ...thS, textAlign: "right" }}>{s}</th>)}
                  </tr></thead><tbody>
                    {byModuleEnhanced.rows.map(row => (
                      <tr key={row.modName} style={rowStyle} onMouseEnter={e=>(e.currentTarget.style.background="rgba(52,211,153,0.04)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                        <td style={{ ...tdS, fontWeight: 600, minWidth: 140, whiteSpace: "nowrap", color: row.modName === "(No Module)" ? "var(--text-secondary)" : "#6ee7b7" }}>{row.modName}</td>
                        <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={row.total} color="#34d399" onClick={() => openDrilldown(`Module: ${row.modName}`, row.allIssues)} /></td>
                        {byModuleEnhanced.topStates.map(s => <td key={s} style={{ ...tdS, textAlign: "right" }}><ClickCount count={row.byState[s]?.length ?? 0} onClick={() => openDrilldown(`Module: ${row.modName} — ${s}`, row.byState[s] ?? [])} /></td>)}
                      </tr>
                    ))}
                  </tbody></table>
                </div>}
          </InsightCard>

          {/* Tags */}
          <InsightCard title="Tags — Bug · Lender Integration · Vendor Integration" accent="#38bdf8">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {byTagEnhanced.map(t => {
                const color = TAG_COLORS[t.tag] ?? "#60a5fa";
                return (
                  <div key={t.tag} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color }}>{t.tag}</div>
                    <div style={{ display: "flex", gap: 14 }}>
                      {[{ label: "Week", list: t.weekIssues },{ label: "Month", list: t.monthIssues },{ label: "All", list: t.tagIssues }].map(({ label, list }) => (
                        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: "1.4rem", fontWeight: 800, color, lineHeight: 1 }}><ClickCount count={list.length} color={color} onClick={() => openDrilldown(`${t.tag} — ${label}`, list)} /></span>
                          <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>{label}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {Object.entries(t.byState).sort(([,a],[,b]) => b.count - a.count).map(([sName, { count, color: sColor, issues: sIssues }]) => (
                        <div key={sName} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: sColor, flexShrink: 0 }} />{sName}
                          </span>
                          <ClickCount count={count} color={color} onClick={() => openDrilldown(`${t.tag} — ${sName}`, sIssues)} />
                        </div>
                      ))}
                      {Object.keys(t.byState).length === 0 && <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>No issues</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </InsightCard>

          {/* By Assignee with search */}
          <InsightCard title="By Assignee" accent="#38bdf8">
            <input
              placeholder="🔍 Search assignee…"
              value={assigneeSearch} onChange={e => setAssigneeSearch(e.target.value)}
              style={{ marginBottom: 10, padding: "6px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-glass)", borderRadius: 8, color: "var(--text-primary)", fontSize: "0.82rem", outline: "none", width: 260 }}
            />
            <div style={{ overflowX: "auto" }}>
              <table style={tblStyle}><thead><tr>
                <th style={thS}>Assignee</th>
                <th style={{ ...thS, textAlign: "right" }}>Total</th>
                <th style={{ ...thS, textAlign: "right" }}>Open</th>
                <th style={{ ...thS, textAlign: "right", color: "#ef4444" }}>Overdue</th>
                <th style={{ ...thS, textAlign: "right", color: "#34d399" }}>Done</th>
                <th style={{ ...thS, textAlign: "right", color: "#f97316" }}>Spillovers</th>
              </tr></thead><tbody>
                {byAssigneeFiltered.map(a => (
                  <tr key={a.name} style={rowStyle} onMouseEnter={e=>(e.currentTarget.style.background="rgba(56,189,248,0.04)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <td style={{ ...tdS, fontWeight: 600, minWidth: 140, whiteSpace: "nowrap", color: a.name === "(Unassigned)" ? "var(--text-secondary)" : "var(--text-primary)" }}>{a.name}</td>
                    <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={a.total.length} onClick={() => openDrilldown(`${a.name} — All`, a.total)} /></td>
                    <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={a.open.length} color="#60a5fa" onClick={() => openDrilldown(`${a.name} — Open`, a.open)} /></td>
                    <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={a.overdue.length} color="#ef4444" onClick={() => openDrilldown(`${a.name} — Overdue`, a.overdue)} /></td>
                    <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={a.done.length} color="#34d399" onClick={() => openDrilldown(`${a.name} — Done`, a.done)} /></td>
                    <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={a.spillovers.length} color="#f97316" onClick={() => openDrilldown(`${a.name} — Spillovers`, a.spillovers)} /></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </InsightCard>

          {/* By Creator with search */}
          <InsightCard title="By Creator" accent="#c084fc">
            <input
              placeholder="🔍 Search creator…"
              value={creatorSearch} onChange={e => setCreatorSearch(e.target.value)}
              style={{ marginBottom: 10, padding: "6px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-glass)", borderRadius: 8, color: "var(--text-primary)", fontSize: "0.82rem", outline: "none", width: 260 }}
            />
            <div style={{ overflowX: "auto" }}>
              <table style={tblStyle}><thead><tr>
                <th style={thS}>Creator</th>
                <th style={{ ...thS, textAlign: "right" }}>Total Created</th>
                <th style={{ ...thS, textAlign: "right" }}>Open</th>
                <th style={{ ...thS, textAlign: "right", color: "#34d399" }}>Done</th>
              </tr></thead><tbody>
                {allCreators.map(c => {
                  const done = c.issues.filter(isDone);
                  const open = c.issues.filter(i => !isDone(i));
                  return (
                    <tr key={c.name} style={rowStyle} onMouseEnter={e=>(e.currentTarget.style.background="rgba(192,132,252,0.04)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                      <td style={{ ...tdS, fontWeight: 600, minWidth: 140, whiteSpace: "nowrap" }}>{c.name}</td>
                      <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={c.issues.length} color="#c084fc" onClick={() => openDrilldown(`Created by ${c.name}`, c.issues)} /></td>
                      <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={open.length} color="#60a5fa" onClick={() => openDrilldown(`Created by ${c.name} — Open`, open)} /></td>
                      <td style={{ ...tdS, textAlign: "right" }}><ClickCount count={done.length} color="#34d399" onClick={() => openDrilldown(`Created by ${c.name} — Done`, done)} /></td>
                    </tr>
                  );
                })}
              </tbody></table>
            </div>
          </InsightCard>
        </div>
      )}

      {/* ── CHARTS TAB ── */}
      {subTab === "charts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Created vs Resolved */}
          <InsightCard title="Created vs Resolved — Last 8 Weeks" accent="#3b82f6">
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={createdVsResolvedData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                  <Bar dataKey="Created"  fill="#3b82f6" radius={[4,4,0,0]} />
                  <Bar dataKey="Resolved" fill="#22c55e" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 20, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                ⚡ This week: <strong style={{ color: "#3b82f6" }}>{createdThisWeek.length} created</strong> vs <strong style={{ color: "#22c55e" }}>{completedThisWeek.length} resolved</strong>
                {createdThisWeek.length > completedThisWeek.length ? <span style={{ color: "#f59e0b", marginLeft: 6 }}>⚠ Backlog growing</span> : <span style={{ color: "#22c55e", marginLeft: 6 }}>✓ Keeping pace</span>}
              </span>
            </div>
          </InsightCard>

          {/* State Distribution + Priority side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <InsightCard title="State Distribution" accent="#8b5cf6">
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stateDonutData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {stateDonutData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color || CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </InsightCard>

            <InsightCard title="Priority Breakdown" accent="#f59e0b">
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priorityChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={65} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" radius={[0,4,4,0]}>
                      {priorityChartData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </InsightCard>
          </div>

          {/* WIP by Assignee */}
          <InsightCard title="Work In Progress — By Assignee (Top 10)" accent="#a78bfa">
            <div style={{ width: "100%", height: Math.max(200, wipByAssignee.length * 36 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wipByAssignee} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0,4,4,0]} name="WIP Issues" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </InsightCard>

          {/* Cycle Time by Project */}
          {cycleTimeByProject.length > 0 && (
            <InsightCard title={`Cycle Time by Project — Avg ${avgCycleTimeDays.toFixed(1)} days`} accent="#10b981">
              <div style={{ width: "100%", height: Math.max(200, cycleTimeByProject.length * 36 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cycleTimeByProject} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} unit="d" />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                    <Tooltip formatter={(v: unknown) => [`${v} days`, "Avg Cycle Time"]} contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="avg" fill="#10b981" radius={[0,4,4,0]} name="Avg days" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </InsightCard>
          )}

          {/* Stale Issues */}
          <InsightCard title={`Stale Issues — No Updates in 5+ Days (${staleIssues.length})`} accent="#f59e0b">
            {staleIssues.length === 0
              ? <span style={{ color: "#22c55e", fontSize: "0.85rem" }}>✓ No stale issues — great job keeping things moving!</span>
              : <div style={{ overflowX: "auto" }}>
                  <table style={tblStyle}><thead><tr>
                    <th style={thS}>Issue</th>
                    <th style={{ ...thS, textAlign: "right" }}>Stale Days</th>
                    <th style={thS}>State</th>
                    <th style={thS}>Assignee</th>
                    <th style={thS}>Project</th>
                  </tr></thead><tbody>
                    {staleIssues.slice(0, 20).map(i => (
                      <tr key={i.id} style={rowStyle} onMouseEnter={e=>(e.currentTarget.style.background="rgba(245,158,11,0.04)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                        <td style={{ ...tdS, maxWidth: 260 }}>
                          <a href={issueUrl(i)} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 500 }}>{i.project_identifier}-{i.sequence_id} {i.name}</a>
                        </td>
                        <td style={{ ...tdS, textAlign: "right" }}>
                          <span style={{ color: "#f59e0b", fontWeight: 700 }}>{staleDays(i)}d</span>
                        </td>
                        <td style={tdS}><span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: i.state_color }} />{i.state_name}</span></td>
                        <td style={{ ...tdS, color: "var(--text-secondary)" }}>{i.assignees[0] ?? "—"}</td>
                        <td style={{ ...tdS, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{i.project_name}</td>
                      </tr>
                    ))}
                  </tbody></table>
                  {staleIssues.length > 20 && <div style={{ padding: "8px 10px", color: "var(--text-secondary)", fontSize: "0.75rem" }}>+{staleIssues.length - 20} more stale issues</div>}
                </div>}
          </InsightCard>
        </div>
      )}

      {/* ── DAILY AI SNAPSHOT TAB ── */}
      {subTab === "daily" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
              AI-generated snapshot based on current issue data · {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
            <button onClick={fetchAI} disabled={aiLoading} style={{ padding: "6px 16px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 8, color: "#60a5fa", fontSize: "0.78rem", fontWeight: 600, cursor: aiLoading ? "not-allowed" : "pointer", opacity: aiLoading ? 0.6 : 1 }}>
              {aiLoading ? "⟳ Generating…" : "↻ Refresh"}
            </button>
          </div>

          {aiError && <div style={{ color: "#f87171", fontSize: "0.82rem", padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>Error: {aiError}</div>}

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <AIInsightCard icon="✅" title="What's On Track" items={(aiData?.onTrack as string[]) ?? []} color="#22c55e" loading={aiLoading} />
            <AIInsightCard icon="🚧" title="Blockers" items={(aiData?.blockers as string[]) ?? []} color="#ef4444" loading={aiLoading} />
            <AIInsightCard icon="💡" title="Where Improvements Needed" items={(aiData?.improvements as string[]) ?? []} color="#f59e0b" loading={aiLoading} />
          </div>

          {/* Quick metrics row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "1rem" }}>
            <MetricTile label="Avg Cycle Time" value={`${avgCycleTimeDays.toFixed(1)}d`} sub="from created to done" color="#10b981" />
            <MetricTile label="WIP Count" value={wipIssues.length} sub={wipIssues.length > 30 ? "⚠ High WIP" : "Within range"} color="#8b5cf6" />
            <MetricTile label="Stale Issues" value={staleIssues.length} sub="5+ days unchanged" color="#f59e0b" />
            <MetricTile label="This Week Created" value={createdThisWeek.length} sub={`${completedThisWeek.length} resolved`} color="#3b82f6" />
            <MetricTile label="Bugs This Week" value={bugsThisWeek} sub={`${bugsResolved} resolved`} color="#ef4444" />
          </div>
        </div>
      )}

      {/* ── WEEKLY REPORT TAB ── */}
      {subTab === "weekly" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
              Week ending {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
            <button onClick={fetchAI} disabled={aiLoading} style={{ padding: "6px 16px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 8, color: "#60a5fa", fontSize: "0.78rem", fontWeight: 600, cursor: aiLoading ? "not-allowed" : "pointer", opacity: aiLoading ? 0.6 : 1 }}>
              {aiLoading ? "⟳ Generating…" : "↻ Refresh"}
            </button>
          </div>

          {/* 1. Executive Summary */}
          <InsightCard title="1 · Executive Summary" accent="#60a5fa">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* RAG */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>Overall Status:</span>
                {aiLoading
                  ? <div style={{ height: 32, width: 120, background: "rgba(255,255,255,0.06)", borderRadius: 9999, animation: "pulse 1.5s ease-in-out infinite" }} />
                  : <RAGBadge rag={(aiData?.rag as string) ?? "amber"} label={(aiData?.ragLabel as string) ?? "Calculating…"} />}
              </div>
              {/* Key achievement */}
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: "0.72rem", color: "#60a5fa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>🏆 Key Achievement</div>
                {aiLoading
                  ? <div style={{ height: 14, background: "rgba(255,255,255,0.06)", borderRadius: 7, width: "80%", animation: "pulse 1.5s ease-in-out infinite" }} />
                  : <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.6 }}>{(aiData?.keyAchievement as string) ?? "—"}</p>}
              </div>
              {/* Top 3 risks */}
              <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: "0.72rem", color: "#ef4444", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>🔴 Top 3 Risks / Blockers</div>
                {aiLoading
                  ? [1,2,3].map(n => <div key={n} style={{ height: 13, background: "rgba(255,255,255,0.06)", borderRadius: 7, width: `${50+n*12}%`, marginBottom: 6, animation: "pulse 1.5s ease-in-out infinite" }} />)
                  : <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                      {((aiData?.topRisks as string[]) ?? []).map((r, i) => <li key={i} style={{ fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{r}</li>)}
                    </ol>}
              </div>
            </div>
          </InsightCard>

          {/* 2. Core Automation Metrics */}
          <InsightCard title="2 · Core Automation Metrics" accent="#10b981">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: 16 }}>
              <MetricTile label="Created This Week" value={createdThisWeek.length} sub={`${completedThisWeek.length} resolved`} color="#3b82f6" />
              <MetricTile label="Resolution Rate" value={createdThisWeek.length > 0 ? `${((completedThisWeek.length / createdThisWeek.length)*100).toFixed(0)}%` : "N/A"} sub={createdThisWeek.length > 0 && completedThisWeek.length >= createdThisWeek.length ? "✓ Keeping pace" : "⚠ Falling behind"} color="#10b981" />
              <MetricTile label="Time Saved (est.)" value={`~${Math.round(completedThisWeek.length * 0.5)}h`} sub="via automated tracking" color="#8b5cf6" />
            </div>
            {/* Mini created vs resolved chart */}
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={createdVsResolvedData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gCreated"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                    <linearGradient id="gResolved" x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="Created"  stroke="#3b82f6" fill="url(#gCreated)"  strokeWidth={2} />
                  <Area type="monotone" dataKey="Resolved" stroke="#22c55e" fill="url(#gResolved)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </InsightCard>

          {/* 3. Workflow Performance */}
          <InsightCard title="3 · Workflow Performance (Flow Analysis)" accent="#a78bfa">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
              <MetricTile label="Cycle Time" value={`${avgCycleTimeDays.toFixed(1)}d`} sub="avg In Progress → Done" color="#10b981" />
              <MetricTile label="Work In Progress" value={wipIssues.length} sub={wipIssues.length > 30 ? "High — potential bottleneck" : "Healthy WIP level"} color={wipIssues.length > 30 ? "#ef4444" : "#8b5cf6"} />
              <MetricTile label="Stale Tickets" value={staleIssues.length} sub={`${issues.length > 0 ? ((staleIssues.length/issues.length)*100).toFixed(0) : 0}% of all issues`} color={staleIssues.length > 20 ? "#ef4444" : "#f59e0b"} />
            </div>
          </InsightCard>

          {/* 4. Task Breakdown */}
          <InsightCard title="4 · Task Breakdown" accent="#f59e0b">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              {/* Accomplished */}
              <div>
                <div style={{ fontSize: "0.75rem", color: "#22c55e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>✅ Accomplished This Week</div>
                {completedThisWeek.length === 0
                  ? <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>No completions this week</span>
                  : <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                      {completedThisWeek.slice(0, 8).map(i => (
                        <li key={i.id} style={{ display: "flex", gap: 7, fontSize: "0.8rem" }}>
                          <span style={{ color: "#22c55e", flexShrink: 0 }}>✓</span>
                          <a href={issueUrl(i)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-secondary)", textDecoration: "none", lineHeight: 1.4 }}
                            onMouseEnter={e=>(e.currentTarget.style.color="#93c5fd")} onMouseLeave={e=>(e.currentTarget.style.color="var(--text-secondary)")}>
                            <strong>{i.project_identifier}-{i.sequence_id}</strong> {i.name}
                          </a>
                        </li>
                      ))}
                      {completedThisWeek.length > 8 && <li style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>+{completedThisWeek.length - 8} more</li>}
                    </ul>}
              </div>
              {/* Upcoming */}
              <div>
                <div style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>📅 Upcoming Priorities (Next 7 Days)</div>
                {(() => {
                  const nextWeek = new Date(today.getTime() + 7*86400000);
                  const upcoming = issues.filter(i => !isDone(i) && i.due_date && new Date(i.due_date) >= today && new Date(i.due_date) <= nextWeek).sort((a,b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")).slice(0, 8);
                  return upcoming.length === 0
                    ? <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>No issues due in the next 7 days</span>
                    : <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                        {upcoming.map(i => (
                          <li key={i.id} style={{ display: "flex", gap: 7, fontSize: "0.8rem", alignItems: "flex-start" }}>
                            <span style={{ color: "#f59e0b", flexShrink: 0, fontSize: "0.7rem", marginTop: 2 }}>{fmt(i.due_date)}</span>
                            <a href={issueUrl(i)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-secondary)", textDecoration: "none", lineHeight: 1.4 }}
                              onMouseEnter={e=>(e.currentTarget.style.color="#93c5fd")} onMouseLeave={e=>(e.currentTarget.style.color="var(--text-secondary)")}>
                              <strong>{i.project_identifier}-{i.sequence_id}</strong> {i.name}
                            </a>
                          </li>
                        ))}
                      </ul>;
                })()}
              </div>
            </div>

            {/* Bugs moment */}
            <div style={{ marginTop: 16, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: "0.72rem", color: "#ef4444", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>🐛 Bugs Moment</div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 8 }}>
                <MetricTile label="Bugs This Week" value={bugsThisWeek} sub="newly reported" color="#ef4444" />
                <MetricTile label="Bugs Resolved" value={bugsResolved} sub="this week" color="#22c55e" />
                <MetricTile label="Total Open Bugs" value={bugIssues.filter(i => !isDone(i)).length} sub="all time" color="#f97316" />
              </div>
              {aiLoading
                ? <div style={{ height: 13, background: "rgba(255,255,255,0.06)", borderRadius: 7, width: "60%", animation: "pulse 1.5s ease-in-out infinite" }} />
                : <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-secondary)" }}>{(aiData?.bugsMoment as string) ?? `${bugsThisWeek} bugs reported, ${bugsResolved} resolved this week.`}</p>}
            </div>
          </InsightCard>
        </div>
      )}
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
  const { data: session } = useSession();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overall" | "overdue" | "anomaly" | "insights">("overall");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [fProjects,    setFProjects]    = useState<string[]>([]);
  const [fCreatedBys,  setFCreatedBys]  = useState<string[]>([]);
  const [fAssignees,   setFAssignees]   = useState<string[]>([]);
  const [fModules,     setFModules]     = useState<string[]>([]);
  const [fCycles,      setFCycles]      = useState<string[]>([]);
  const [fPriorities,  setFPriorities]  = useState<string[]>([]);
  const [fStates,      setFStates]      = useState<string[]>([]);
  const [fDateFrom,    setFDateFrom]    = useState<string>("");
  const [fDateTo,      setFDateTo]      = useState<string>("");

  const loadData = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    return fetch("/api/issues")
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setIssues(data.issues);
        setFilterOptions(data.filters);
        setLoading(false);
        setRefreshing(false);
        setLastUpdated(new Date());

        setEnriching(true);
        return fetch("/api/issues?enrich=1")
          .then(r => r.json())
          .then(enriched => {
            if (enriched.error) return;
            const enrichMap = new Map(enriched.issues.map((i: Issue) => [i.id, i]));
            setIssues(prev => prev.map(issue => {
              const e = enrichMap.get(issue.id) as Issue | undefined;
              if (!e) return issue;
              return { ...issue, cycle: e.cycle, modules: e.modules, cycle_end_date: e.cycle_end_date, completed_at: e.completed_at, updated_at: e.updated_at };
            }));
            setFilterOptions(prev => prev ? {
              ...prev,
              cycles: enriched.filters.cycles,
              modules: enriched.filters.modules,
            } : prev);
            setLastUpdated(new Date());
          })
          .catch(() => {})
          .finally(() => setEnriching(false));
      })
      .catch(e => { setError(e.message); setLoading(false); setRefreshing(false); });
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 30 * 60 * 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasFilters = fProjects.length || fCreatedBys.length || fAssignees.length || fModules.length || fCycles.length || fPriorities.length || fStates.length || fDateFrom || fDateTo;
  const clearFilters = () => { setFProjects([]); setFCreatedBys([]); setFAssignees([]); setFModules([]); setFCycles([]); setFPriorities([]); setFStates([]); setFDateFrom(""); setFDateTo(""); };

  const filtered = useMemo(() => {
    let list = issues;
    if (fProjects.length)   list = list.filter(i => fProjects.includes(i.project_id));
    if (fCreatedBys.length) list = list.filter(i => fCreatedBys.includes(i.created_by));
    if (fAssignees.length)  list = list.filter(i => i.assignees.some(a => fAssignees.includes(a)));
    if (fModules.length)    list = list.filter(i => i.modules.some(m => fModules.includes(m)));
    if (fCycles.length)     list = list.filter(i => i.cycle && fCycles.includes(i.cycle));
    if (fPriorities.length) list = list.filter(i => fPriorities.includes(i.priority));
    if (fStates.length)     list = list.filter(i => fStates.includes(i.state_name));
    if (fDateFrom)          list = list.filter(i => !!i.created_at && i.created_at.slice(0, 10) >= fDateFrom);
    if (fDateTo)            list = list.filter(i => !!i.created_at && i.created_at.slice(0, 10) <= fDateTo);
    if (activeTab === "overdue") {
      list = list.filter(i => !isDone(i) && overdueDays(i.due_date) !== null);
      list = [...list].sort((a, b) => (overdueDays(b.due_date) ?? 0) - (overdueDays(a.due_date) ?? 0));
    }
    return list;
  }, [issues, fProjects, fCreatedBys, fAssignees, fModules, fCycles, fPriorities, fStates, fDateFrom, fDateTo, activeTab]);

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 800, background: "linear-gradient(to right, #60a5fa, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", margin: 0 }}>
            Nirmaan
          </h1>
          {session?.user && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{session.user.email}</span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                style={{ padding: "5px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, color: "#f87171", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", margin: 0 }}>
            Workspace: cr-product &middot; {loading ? "Loading..." : `${issues.length} total issues`}
            {enriching && <span style={{ marginLeft: 10, fontSize: "0.78rem", color: "#a78bfa" }}>↻ Loading cycle &amp; module data…</span>}
          </p>
          {lastUpdated && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", opacity: 0.7 }}>
              Last updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 8, color: "#60a5fa", fontSize: "0.78rem", fontWeight: 600, cursor: loading || refreshing ? "not-allowed" : "pointer", opacity: loading || refreshing ? 0.5 : 1 }}
          >
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none" }}>↻</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
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
          <MultiSelect label="State"      selected={fStates}     options={Array.from(new Map(filterOptions.states.map(s => [s.name, s])).values()).map(s => ({ value: s.name, label: s.name }))} onChange={setFStates} />
          {/* Date range filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 130 }}>
            <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Created From</label>
            <input type="date" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)}
              style={{ background: "rgba(15,23,42,0.8)", border: `1px solid ${fDateFrom ? "#3b82f6" : "var(--border-glass)"}`, color: fDateFrom ? "var(--text-primary)" : "var(--text-secondary)", padding: "6px 10px", borderRadius: 8, fontSize: "0.82rem", outline: "none", cursor: "pointer", colorScheme: "dark" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 130 }}>
            <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Created To</label>
            <input type="date" value={fDateTo} onChange={e => setFDateTo(e.target.value)}
              style={{ background: "rgba(15,23,42,0.8)", border: `1px solid ${fDateTo ? "#3b82f6" : "var(--border-glass)"}`, color: fDateTo ? "var(--text-primary)" : "var(--text-secondary)", padding: "6px 10px", borderRadius: 8, fontSize: "0.82rem", outline: "none", cursor: "pointer", colorScheme: "dark" }} />
          </div>
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
