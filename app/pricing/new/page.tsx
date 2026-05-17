"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const S = {
  page:  { minHeight: "100vh", background: "#0f172a", color: "#f8fafc", fontFamily: "system-ui, sans-serif",
           display: "flex", alignItems: "center", justifyContent: "center" },
  card:  { background: "#1e293b", borderRadius: 12, border: "1px solid #334155", padding: 32, width: 480 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 24 },
  label: { display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 500 },
  input: { width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8,
           padding: "9px 12px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" as const,
           outline: "none" },
  row:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  btn:   { width: "100%", marginTop: 24, background: "#38bdf8", color: "#0f172a", border: "none",
           borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  back:  { background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13,
           marginBottom: 16, padding: 0 },
  err:   { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8,
           padding: "8px 12px", fontSize: 12, color: "#ef4444", marginBottom: 16 },
};

const PERIODS = [1, 3, 6, 12, 24, 36];

export default function NewQuotePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    customer_name: "", customer_email: "",
    commitment_period_months: 12, validity_days: 30,
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/pricing/quotes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to create quote"); setLoading(false); return; }
    router.push(`/pricing/${data.id}/channel-volume`);
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <button style={S.back} onClick={() => router.push("/pricing")}>← Back to quotes</button>
        <div style={S.title}>New Quote</div>
        {error && <div style={S.err}>{error}</div>}
        <form onSubmit={submit}>
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Customer Name *</label>
            <input style={S.input} required value={form.customer_name}
              onChange={e => set("customer_name", e.target.value)} placeholder="Acme Corp" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Customer Email</label>
            <input style={S.input} type="email" value={form.customer_email}
              onChange={e => set("customer_email", e.target.value)} placeholder="contact@acme.com" />
          </div>
          <div style={{ ...S.row, marginBottom: 16 }}>
            <div>
              <label style={S.label}>Commitment Period</label>
              <select style={S.input} value={form.commitment_period_months}
                onChange={e => set("commitment_period_months", Number(e.target.value))}>
                {PERIODS.map(p => <option key={p} value={p}>{p} month{p > 1 ? "s" : ""}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Quote Validity (days)</label>
              <input style={S.input} type="number" min={1} max={90} value={form.validity_days}
                onChange={e => set("validity_days", Number(e.target.value))} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={S.label}>Internal Notes</label>
            <textarea style={{ ...S.input, height: 72, resize: "vertical" }} value={form.notes}
              onChange={e => set("notes", e.target.value)} placeholder="Optional internal notes…" />
          </div>
          <button style={{ ...S.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? "Creating…" : "Create Quote →"}
          </button>
        </form>
      </div>
    </div>
  );
}
