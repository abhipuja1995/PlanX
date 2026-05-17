"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { PricingNav } from "@/components/pricing/PricingNav";
import { StatusBadge, MarginBadge } from "@/components/pricing/StatusBadge";

const S = {
  page:   { minHeight: "100vh", background: "#0f172a", color: "#f8fafc", fontFamily: "system-ui, sans-serif" },
  header: { padding: "24px 32px 0", display: "flex", alignItems: "center", justifyContent: "space-between" },
  body:   { padding: "0 32px 32px" },
  card:   { background: "#1e293b", borderRadius: 12, border: "1px solid #334155", padding: 24, marginBottom: 16 },
  label:  { display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4, fontWeight: 500,
            textTransform: "uppercase" as const, letterSpacing: 0.4 },
  textarea: { background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "9px 12px",
              color: "#f8fafc", fontSize: 13, width: "100%", boxSizing: "border-box" as const, resize: "vertical" as const,
              outline: "none", minHeight: 80 },
  btnPrimary: { background: "#38bdf8", color: "#0f172a", border: "none", borderRadius: 8,
                padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#1e293b", color: "#94a3b8", border: "1px solid #334155",
                  borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer" },
  kv: { display: "flex", justifyContent: "space-between", padding: "8px 0",
        borderBottom: "1px solid #0f172a", fontSize: 13 },
};

export default function ReviewPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [quote,  setQuote]  = useState<any>(null);
  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]   = useState("");

  useEffect(() => {
    fetch(`/api/pricing/quotes/${id}`).then(r => r.json()).then(setQuote);
  }, [id]);

  async function submit() {
    setSubmitting(true); setError("");
    const res = await fetch(`/api/pricing/quotes/${id}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discount_justification: justification }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Submit failed"); setSubmitting(false); return; }
    router.push(`/pricing?submitted=${quote?.quote_number}`);
  }

  if (!quote) return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <span style={{ color: "#475569" }}>Loading…</span></div>;

  const pricing  = quote.quote_pricing?.[0];
  const channels = quote.quote_channels ?? [];
  const addons   = quote.quote_addons ?? [];
  const colorMap: Record<string, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{quote.customer_name}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
            {quote.quote_number} · <StatusBadge status={quote.status} />
          </div>
        </div>
        <button style={S.btnSecondary} onClick={() => router.push("/pricing")}>← Quotes</button>
      </div>

      <div style={{ padding: "16px 32px 0" }}>
        <PricingNav quoteId={id} status={quote.status} />
      </div>

      <div style={S.body}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Left: summary */}
          <div>
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Quote Summary</div>
              <div style={S.kv}><span style={{ color: "#64748b" }}>Customer</span><span style={{ fontWeight: 500 }}>{quote.customer_name}</span></div>
              <div style={S.kv}><span style={{ color: "#64748b" }}>Quote #</span><span style={{ color: "#38bdf8", fontWeight: 600 }}>{quote.quote_number}</span></div>
              <div style={S.kv}><span style={{ color: "#64748b" }}>Commitment</span><span>{quote.commitment_period_months} months</span></div>
              <div style={S.kv}><span style={{ color: "#64748b" }}>Validity</span><span>{quote.validity_days} days</span></div>
            </div>

            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>
                Channels ({channels.length})
              </div>
              {channels.map((ch: any, i: number) => (
                <div key={i} style={{ ...S.kv, flexWrap: "wrap" as const, gap: 4 }}>
                  <span style={{ color: "#64748b" }}>Ch {i + 1}</span>
                  <span style={{ fontSize: 12 }}>
                    {ch.channel_type} · {ch.plan_type} · {ch.concurrent_channels} channels · {(ch.monthly_minutes ?? 0).toLocaleString()} min/mo
                  </span>
                </div>
              ))}
              {addons.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #0f172a" }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>Add-ons: </span>
                  <span style={{ fontSize: 12 }}>{addons.map((a: any) => a.name).join(", ")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: pricing + submit */}
          <div>
            {pricing ? (
              <div style={{ ...S.card, borderColor: (colorMap[pricing.color_indicator] ?? "#334155") + "40" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Pricing Summary</span>
                  <MarginBadge status={pricing.profit_status} pct={Number(pricing.gross_margin_pct)} />
                </div>
                <div style={S.kv}><span style={{ color: "#64748b" }}>Final Price</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: colorMap[pricing.color_indicator] }}>
                    ₹{Number(pricing.final_price).toFixed(4)}/min
                  </span>
                </div>
                <div style={S.kv}><span style={{ color: "#64748b" }}>Manual Discount</span><span>{Number(pricing.manual_discount_pct).toFixed(1)}%</span></div>
                <div style={S.kv}><span style={{ color: "#64748b" }}>Gross Margin</span>
                  <span style={{ color: colorMap[pricing.color_indicator], fontWeight: 600 }}>{Number(pricing.gross_margin_pct).toFixed(1)}%</span>
                </div>
                <div style={S.kv}><span style={{ color: "#64748b" }}>Monthly Revenue</span>
                  <span>₹{Number(pricing.total_mrc).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
                <div style={S.kv}><span style={{ color: "#64748b" }}>Contract Revenue</span>
                  <span style={{ fontWeight: 600 }}>₹{Number(pricing.total_arc).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
                {pricing.approval_required && (
                  <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, fontSize: 12, color: "#f59e0b" }}>
                    ⚠ This quote requires approval before finalisation
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...S.card, textAlign: "center", color: "#475569", padding: 32 }}>
                <div>Run pricing calculation before submitting</div>
                <button style={{ ...S.btnSecondary, marginTop: 12 }} onClick={() => router.push(`/pricing/${id}/pricing`)}>
                  Go to Pricing →
                </button>
              </div>
            )}

            {pricing && (
              <div style={S.card}>
                <label style={S.label}>Discount Justification {pricing.approval_required ? "*" : "(optional)"}</label>
                <textarea style={S.textarea} value={justification} onChange={e => setJustification(e.target.value)}
                  placeholder="Explain the pricing rationale, strategic value, or discount reason…" />
                {error && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{error}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                  <button style={S.btnSecondary} onClick={() => router.push(`/pricing/${id}/pricing`)}>← Back</button>
                  <button style={{ ...S.btnPrimary, opacity: submitting ? 0.6 : 1 }}
                    onClick={submit} disabled={submitting || (!justification && pricing.approval_required)}>
                    {submitting ? "Submitting…" : pricing.approval_required ? "Submit for Approval" : "Finalise Quote"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
