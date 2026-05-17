"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { StatusBadge, MarginBadge } from "@/components/pricing/StatusBadge";

const S = {
  page:    { minHeight: "100vh", background: "#0f172a", color: "#f8fafc", fontFamily: "system-ui, sans-serif" },
  header:  { padding: "24px 32px 0", display: "flex", alignItems: "center", justifyContent: "space-between" },
  title:   { fontSize: 20, fontWeight: 700, color: "#f8fafc" },
  btn:     { background: "#38bdf8", color: "#0f172a", border: "none", borderRadius: 8, padding: "8px 18px",
             fontSize: 13, fontWeight: 600, cursor: "pointer" },
  table:   { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th:      { padding: "10px 16px", textAlign: "left" as const, color: "#64748b", fontWeight: 500,
             borderBottom: "1px solid #1e293b", fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  td:      { padding: "12px 16px", borderBottom: "1px solid #1e293b", color: "#cbd5e1", verticalAlign: "middle" as const },
  card:    { background: "#1e293b", borderRadius: 12, border: "1px solid #334155", overflow: "hidden" },
  empty:   { textAlign: "center" as const, padding: 48, color: "#475569" },
};

export default function PricingListPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/pricing/quotes")
      .then(r => r.json())
      .then(data => { setQuotes(Array.isArray(data) ? data : []); setLoading(false); });
  }, [status]);

  if (status === "loading" || loading) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "#475569" }}>Loading quotes…</span>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.title}>Pricing Quotes</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {session?.user?.email} · {quotes.length} quotes
          </div>
        </div>
        <button style={S.btn} onClick={() => router.push("/pricing/new")}>+ New Quote</button>
      </div>

      <div style={{ padding: "24px 32px" }}>
        <div style={S.card}>
          {quotes.length === 0 ? (
            <div style={S.empty}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, marginBottom: 4 }}>No quotes yet</div>
              <div style={{ fontSize: 12, color: "#334155" }}>Create your first quote to get started</div>
            </div>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  {["Quote #","Customer","Status","Margin","Final Price","Created",""].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map((q: any) => {
                  const pricing = q.quote_pricing?.[0];
                  return (
                    <tr key={q.id} style={{ cursor: "pointer" }}
                        onClick={() => router.push(`/pricing/${q.id}/channel-volume`)}>
                      <td style={{ ...S.td, color: "#38bdf8", fontWeight: 600 }}>{q.quote_number}</td>
                      <td style={S.td}>
                        <div style={{ fontWeight: 500, color: "#f1f5f9" }}>{q.customer_name}</div>
                        {q.customer_email && <div style={{ fontSize: 11, color: "#475569" }}>{q.customer_email}</div>}
                      </td>
                      <td style={S.td}><StatusBadge status={q.status} /></td>
                      <td style={S.td}>
                        {pricing?.profit_status
                          ? <MarginBadge status={pricing.profit_status} pct={Number(pricing.gross_margin_pct)} />
                          : <span style={{ color: "#475569", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={S.td}>
                        {pricing?.final_price
                          ? <span style={{ fontFamily: "monospace" }}>₹{Number(pricing.final_price).toFixed(4)}</span>
                          : <span style={{ color: "#475569" }}>—</span>}
                      </td>
                      <td style={{ ...S.td, color: "#64748b", fontSize: 12 }}>
                        {new Date(q.created_at).toLocaleDateString("en-IN")}
                      </td>
                      <td style={S.td}>
                        <span style={{ color: "#38bdf8", fontSize: 12 }}>Open →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
