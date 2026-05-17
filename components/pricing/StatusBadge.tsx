const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:              { label: "Draft",            color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  pending_approval:   { label: "Pending Approval", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  approved:           { label: "Approved",         color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
  rejected:           { label: "Rejected",         color: "#ef4444", bg: "rgba(239,68,68,0.12)"  },
  revision_requested: { label: "Revision Needed",  color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  finalized:          { label: "Finalized",        color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
};

const MARGIN_META: Record<string, { color: string; label: string }> = {
  healthy:      { color: "#22c55e", label: "Healthy"      },
  near_minimum: { color: "#f59e0b", label: "Near Minimum" },
  loss:         { color: "#ef4444", label: "Loss"         },
};

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: "#94a3b8", bg: "rgba(148,163,184,0.12)" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
      fontWeight: 600, color: m.color, background: m.bg, textTransform: "uppercase", letterSpacing: 0.5,
    }}>{m.label}</span>
  );
}

export function MarginBadge({ status, pct }: { status: string; pct?: number }) {
  const m = MARGIN_META[status] ?? { color: "#94a3b8", label: status };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px",
      borderRadius: 4, fontSize: 11, fontWeight: 600,
      color: m.color, background: `${m.color}20`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, display: "inline-block" }} />
      {pct !== undefined ? `${pct.toFixed(1)}%` : m.label}
    </span>
  );
}
