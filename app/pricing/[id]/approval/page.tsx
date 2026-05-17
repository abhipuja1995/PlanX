"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { StatusBadge, MarginBadge } from "@/components/pricing/StatusBadge";

const S = {
  page:   { minHeight: "100vh", background: "#0f172a", color: "#f8fafc", fontFamily: "system-ui, sans-serif" },
  header: { padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  body:   { padding: "0 32px 32px" },
  card:   { background: "#1e293b", borderRadius: 12, border: "1px solid #334155", padding: 24, marginBottom: 16 },
  label:  { display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4, fontWeight: 500,
            textTransform: "uppercase" as const, letterSpacing: 0.4 },
  textarea: { background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "9px 12px",
              color: "#f8fafc", fontSize: 13, width: "100%", boxSizing: "border-box" as const, resize: "vertical" as const,
              outline: "none", minHeight: 80 },
  kv:   { display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #0f172a", fontSize: 13 },
  btnApprove: { background: "#22c55e", color: "#fff", border: "none", borderRadius: 8,
                padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnReject:  { background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnRevise:  { background: "rgba(249,115,22,0.1)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)",
                borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#1e293b", color: "#94a3b8", border: "1px solid #334155",
                  borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer" },
};

export default function ApprovalPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string;

  const [quote,    setQuote]    = useState<any>(null);
  const [remarks,  setRemarks]  = useState("");
  const [acting,   setActing]   = useState("");
  const [error,    setError]    = useState("");

  useEffect(() => {
    fetch(`/api/pricing/quotes/${id}`).then(r => r.json()).then(setQuote);
  }, [id]);

  const canApprove = ["manager","finance","admin","super_admin"].includes(role);
  const canSeeVendor = ["finance","admin","super_admin"].includes(role);

  async function act(action: "approved" | "rejected" | "revision_requested") {
    setActing(action); setError("");
    const res = await fetch(`/api/pricing/quotes/${id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, remarks }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Action failed"); setActing(""); return; }
    router.push(`/pricing?approved=${quote?.quote_number}`);
  }

  if (!quote) return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <span style={{ color: "#475569" }}>Loading…</span></div>;

  const pricing  = quote.quote_pricing?.[0];
  const approval = quote.approval_requests?.[0];
  const colorMap: Record<string, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };
  const iColor   = colorMap[pricing?.color_indicator] ?? "#94a3b8";

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

      <div style={S.body}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Left */}
          <div>
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Quote Details</div>
              <div style={S.kv}><span style={{ color: "#64748b" }}>Customer</span><span style={{ fontWeight: 500 }}>{quote.customer_name}</span></div>
              <div style={S.kv}><span style={{ color: "#64748b" }}>Quote #</span><span style={{ color: "#38bdf8" }}>{quote.quote_number}</span></div>
              <div style={S.kv}><span style={{ color: "#64748b" }}>Requested by</span><span>{approval?.requested_by ?? quote.created_by}</span></div>
              <div style={S.kv}><span style={{ color: "#64748b" }}>Commitment</span><span>{quote.commitment_period_months} months</span></div>
              {approval?.discount_justification && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #0f172a" }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>DISCOUNT JUSTIFICATION</div>
                  <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>{approval.discount_justification}</div>
                </div>
              )}
            </div>

            {pricing && (
              <div style={{ ...S.card, borderColor: iColor + "40" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Pricing Summary</span>
                  <MarginBadge status={pricing.profit_status} pct={Number(pricing.gross_margin_pct)} />
                </div>
                <div style={S.kv}><span style={{ color: "#64748b" }}>Final Price</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: iColor }}>₹{Number(pricing.final_price).toFixed(4)}/min</span>
                </div>
                <div style={S.kv}><span style={{ color: "#64748b" }}>Gross Margin</span>
                  <span style={{ color: iColor, fontWeight: 600 }}>{Number(pricing.gross_margin_pct).toFixed(1)}%</span>
                </div>
                <div style={S.kv}><span style={{ color: "#64748b" }}>Monthly Revenue</span>
                  <span>₹{Number(pricing.total_mrc).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
                <div style={S.kv}><span style={{ color: "#64748b" }}>Contract Revenue</span>
                  <span style={{ fontWeight: 600 }}>₹{Number(pricing.total_arc).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>

                {canSeeVendor && pricing.lowest_vendor_cost && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #0f172a" }}>
                    <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>INTERNAL — FINANCE</div>
                    <div style={S.kv}><span style={{ color: "#64748b" }}>Vendor Cost (Lowest)</span>
                      <span style={{ fontFamily: "monospace" }}>₹{Number(pricing.lowest_vendor_cost).toFixed(4)}/min</span>
                    </div>
                    <div style={S.kv}><span style={{ color: "#64748b" }}>Floor Price</span>
                      <span style={{ fontFamily: "monospace", color: "#f59e0b" }}>₹{Number(pricing.floor_price).toFixed(4)}/min</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: action */}
          <div>
            {canApprove && quote.status === "pending_approval" ? (
              <div style={S.card}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>Approval Action</div>
                <label style={S.label}>Remarks {acting === "revision_requested" ? "*" : "(optional)"}</label>
                <textarea style={S.textarea} value={remarks} onChange={e => setRemarks(e.target.value)}
                  placeholder="Add remarks for the sales team…" />
                {error && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{error}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button style={{ ...S.btnApprove, opacity: acting === "approved" ? 0.6 : 1 }}
                    onClick={() => act("approved")} disabled={!!acting}>
                    {acting === "approved" ? "Approving…" : "✓ Approve"}
                  </button>
                  <button style={{ ...S.btnRevise, opacity: acting === "revision_requested" ? 0.6 : 1 }}
                    onClick={() => act("revision_requested")} disabled={!!acting || !remarks}>
                    {acting === "revision_requested" ? "Sending…" : "↩ Request Revision"}
                  </button>
                  <button style={{ ...S.btnReject, opacity: acting === "rejected" ? 0.6 : 1 }}
                    onClick={() => act("rejected")} disabled={!!acting}>
                    {acting === "rejected" ? "Rejecting…" : "✕ Reject"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 10 }}>
                  Request Revision requires remarks. Approval notification will be sent to {quote.created_by}.
                </div>
              </div>
            ) : (
              <div style={{ ...S.card, textAlign: "center", color: "#475569", padding: 32 }}>
                {!canApprove
                  ? <div>You don't have permission to approve quotes.</div>
                  : <div>This quote is in <strong>{quote.status}</strong> state and cannot be actioned.</div>
                }
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
