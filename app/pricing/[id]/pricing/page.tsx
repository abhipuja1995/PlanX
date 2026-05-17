"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PricingNav } from "@/components/pricing/PricingNav";
import { StatusBadge, MarginBadge } from "@/components/pricing/StatusBadge";

const VENDOR_FIELDS = ["lowest_vendor_cost","avg_vendor_cost","preferred_vendor_cost","floor_price"];

const S = {
  page:   { minHeight: "100vh", background: "#0f172a", color: "#f8fafc", fontFamily: "system-ui, sans-serif" },
  header: { padding: "24px 32px 0", display: "flex", alignItems: "center", justifyContent: "space-between" },
  body:   { padding: "0 32px 32px" },
  card:   { background: "#1e293b", borderRadius: 12, border: "1px solid #334155", padding: 24, marginBottom: 16 },
  label:  { display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4, fontWeight: 500,
            textTransform: "uppercase" as const, letterSpacing: 0.4 },
  input:  { background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "9px 12px",
            color: "#f8fafc", fontSize: 14, width: "100%", boxSizing: "border-box" as const, outline: "none" },
  btnPrimary: { background: "#38bdf8", color: "#0f172a", border: "none", borderRadius: 8,
                padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#1e293b", color: "#94a3b8", border: "1px solid #334155",
                  borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer" },
  row:    { display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 0", borderBottom: "1px solid #0f172a" },
  metric: { fontSize: 12, color: "#94a3b8" },
  value:  { fontSize: 14, fontWeight: 600, color: "#f1f5f9", fontFamily: "monospace" },
};

function MetricRow({ label, value, highlight, sub }: { label: string; value: string; highlight?: string; sub?: string }) {
  return (
    <div style={S.row}>
      <span style={S.metric}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{ ...S.value, color: highlight || "#f1f5f9" }}>{value}</span>
        {sub && <div style={{ fontSize: 11, color: "#475569" }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function PricingFinalisePage() {
  const router   = useRouter();
  const { id }   = useParams<{ id: string }>();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string;

  const [quote,    setQuote]   = useState<any>(null);
  const [salesPrice, setSalesPrice] = useState("");
  const [discount,   setDiscount]   = useState("0");
  const [result,   setResult]  = useState<any>(null);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState("");

  useEffect(() => {
    fetch(`/api/pricing/quotes/${id}`).then(r => r.json()).then(data => {
      setQuote(data);
      const p = data.quote_pricing?.[0];
      if (p) {
        setResult(p);
        if (p.sales_input_price) setSalesPrice(String(p.sales_input_price));
        if (p.manual_discount_pct) setDiscount(String(p.manual_discount_pct));
      }
    });
  }, [id]);

  async function calculate() {
    if (!salesPrice) { setError("Enter a sales price first"); return; }
    setLoading(true); setError("");
    const res = await fetch(`/api/pricing/quotes/${id}/calculate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sales_input_price: Number(salesPrice), manual_discount_pct: Number(discount) }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Calculation failed"); setLoading(false); return; }
    setResult(data); setLoading(false);
  }

  const canSeeVendor = ["finance","admin","super_admin"].includes(role);
  const colorMap: Record<string, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };
  const indicatorColor = result ? colorMap[result.color_indicator] ?? "#94a3b8" : "#94a3b8";

  if (!quote) return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <span style={{ color: "#475569" }}>Loading…</span></div>;

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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 16 }}>
          {/* Input Panel */}
          <div>
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: "#94a3b8" }}>Price Input</div>
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Sales Input Price (₹/min)</label>
                <input style={S.input} type="number" step="0.0001" min={0}
                  value={salesPrice} onChange={e => setSalesPrice(e.target.value)}
                  placeholder="0.0000" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Manual Discount %</label>
                <input style={S.input} type="number" step="0.5" min={0} max={100}
                  value={discount} onChange={e => setDiscount(e.target.value)} />
              </div>
              {error && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>{error}</div>}
              <button style={{ ...S.btnPrimary, width: "100%", opacity: loading ? 0.6 : 1 }}
                onClick={calculate} disabled={loading}>
                {loading ? "Calculating…" : "Calculate Pricing"}
              </button>
            </div>

            {result?.recommended_discount_pct > 0 && (
              <div style={{ ...S.card, border: "1px solid rgba(56,189,248,0.3)", background: "rgba(56,189,248,0.05)" }}>
                <div style={{ fontSize: 12, color: "#38bdf8", fontWeight: 600, marginBottom: 4 }}>
                  💡 Recommended Additional Discount
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#38bdf8" }}>
                  {Number(result.recommended_discount_pct).toFixed(1)}%
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                  Based on commitment volume & tenure. Not auto-applied.
                </div>
              </div>
            )}
          </div>

          {/* Results Panel */}
          <div>
            {result ? (
              <>
                <div style={{ ...S.card, borderColor: indicatorColor + "40" }}>
                  {/* Margin indicator */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Pricing Result</div>
                    <MarginBadge status={result.profit_status} pct={Number(result.gross_margin_pct)} />
                  </div>

                  <MetricRow label="Base Price"         value={`₹${Number(result.base_price).toFixed(4)}/min`} />
                  <MetricRow label="Suggested Price"    value={`₹${Number(result.suggested_price).toFixed(4)}/min`} />
                  <MetricRow label="Sales Input Price"  value={`₹${Number(result.sales_input_price).toFixed(4)}/min`} />
                  <MetricRow label="Manual Discount"    value={`${Number(result.manual_discount_pct).toFixed(1)}%`} />
                  <MetricRow label="Channel Discount"   value={`${Number(result.channel_discount_pct).toFixed(1)}%`} />
                  <MetricRow label="Final Price"        value={`₹${Number(result.final_price).toFixed(4)}/min`} highlight={indicatorColor} />
                  <MetricRow label="Gross Margin"       value={`${Number(result.gross_margin_pct).toFixed(1)}%`} highlight={indicatorColor} />
                  <MetricRow label="Gross Profit"       value={`₹${Number(result.gross_profit).toFixed(4)}/min`} />
                  <MetricRow label="Monthly Revenue"    value={`₹${Number(result.total_mrc).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} />
                  <MetricRow label="Contract Revenue"   value={`₹${Number(result.total_arc).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                    sub={`${quote.commitment_period_months}m ARC`} />
                  <MetricRow label="Approval Required"
                    value={result.approval_required ? "Yes" : "No"}
                    highlight={result.approval_required ? "#f59e0b" : "#22c55e"} />

                  {/* Vendor-only fields */}
                  {canSeeVendor && result.lowest_vendor_cost && (
                    <>
                      <div style={{ borderTop: "1px solid #334155", margin: "12px 0", paddingTop: 12 }}>
                        <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>Internal — Finance View</div>
                        <MetricRow label="Vendor Cost (Lowest)" value={`₹${Number(result.lowest_vendor_cost).toFixed(4)}/min`} />
                        <MetricRow label="Vendor Cost (Average)" value={`₹${Number(result.avg_vendor_cost).toFixed(4)}/min`} />
                        <MetricRow label="Floor Price"           value={`₹${Number(result.floor_price).toFixed(4)}/min`} highlight="#f59e0b" />
                      </div>
                    </>
                  )}
                </div>

                {/* Claude Insight */}
                {result.pricing_insight && (
                  <div style={{ ...S.card, background: "rgba(56,189,248,0.04)", borderColor: "rgba(56,189,248,0.2)" }}>
                    <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      Claude Pricing Insight
                    </div>
                    <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>{result.pricing_insight}</div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button style={S.btnSecondary} onClick={() => router.push(`/pricing/${id}/channel-volume`)}>← Back</button>
                  <button style={S.btnPrimary} onClick={() => router.push(`/pricing/${id}/review`)}>Review & Submit →</button>
                </div>
              </>
            ) : (
              <div style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
                <div style={{ textAlign: "center", color: "#475569" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
                  <div style={{ fontSize: 13 }}>Enter a price and click Calculate</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
