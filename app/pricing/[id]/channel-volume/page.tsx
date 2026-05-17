"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { PricingNav } from "@/components/pricing/PricingNav";
import { StatusBadge } from "@/components/pricing/StatusBadge";

const CHANNEL_TYPES = ["inbound", "outbound", "blended"];
const PLAN_TYPES    = ["pulse", "unlimited"];
const ADDON_TYPES   = [
  { type: "agentic_voice", label: "Agentic Voice" },
  { type: "ai_services",   label: "AI Services"   },
  { type: "recording",     label: "Call Recording" },
  { type: "analytics",     label: "Analytics Dashboard" },
  { type: "other",         label: "Custom Add-on" },
];

const emptyChannel = () => ({
  channel_type: "inbound", plan_type: "pulse",
  concurrent_channels: 10, avg_call_duration_sec: 60,
  monthly_minutes: 10000, traffic_distribution: { peak: 60, off_peak: 40 },
  commitment_volume: undefined as number | undefined,
  discount_at_channel: 0, sort_order: 0,
});

const S = {
  page:   { minHeight: "100vh", background: "#0f172a", color: "#f8fafc", fontFamily: "system-ui, sans-serif" },
  header: { padding: "24px 32px 0", display: "flex", alignItems: "center", justifyContent: "space-between" },
  body:   { padding: "0 32px 32px" },
  card:   { background: "#1e293b", borderRadius: 12, border: "1px solid #334155", padding: 24, marginBottom: 16 },
  label:  { display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: 0.4 },
  input:  { background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "7px 10px",
            color: "#f8fafc", fontSize: 13, width: "100%", boxSizing: "border-box" as const, outline: "none" },
  btnPrimary: { background: "#38bdf8", color: "#0f172a", border: "none", borderRadius: 8,
                padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8,
                  padding: "9px 16px", fontSize: 13, cursor: "pointer" },
  btnDanger: { background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)",
               borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" },
};

export default function ChannelVolumePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote]       = useState<any>(null);
  const [channels, setChannels] = useState([emptyChannel()]);
  const [addons, setAddons]     = useState<any[]>([]);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    fetch(`/api/pricing/quotes/${id}`)
      .then(r => r.json())
      .then(data => {
        setQuote(data);
        if (data.quote_channels?.length) setChannels(data.quote_channels);
        if (data.quote_addons?.length)   setAddons(data.quote_addons);
      });
  }, [id]);

  const updateChannel = (i: number, k: string, v: unknown) =>
    setChannels(cs => cs.map((c, idx) => idx === i ? { ...c, [k]: v } : c));

  const removeChannel = (i: number) => setChannels(cs => cs.filter((_, idx) => idx !== i));
  const addChannel    = () => setChannels(cs => [...cs, emptyChannel()]);

  const toggleAddon = (type: string, label: string) => {
    setAddons(as => as.find(a => a.addon_type === type)
      ? as.filter(a => a.addon_type !== type)
      : [...as, { addon_type: type, name: label, unit_price: 0, quantity: 1, discount: 0 }]
    );
  };
  const updateAddon = (type: string, k: string, v: unknown) =>
    setAddons(as => as.map(a => a.addon_type === type ? { ...a, [k]: v } : a));

  async function save() {
    setSaving(true);
    await Promise.all([
      fetch(`/api/pricing/quotes/${id}/channels`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channels.map((c, i) => ({ ...c, sort_order: i }))),
      }),
      fetch(`/api/pricing/quotes/${id}/addons`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addons),
      }),
    ]);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveAndNext() {
    await save();
    router.push(`/pricing/${id}/pricing`);
  }

  if (!quote) return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <span style={{ color: "#475569" }}>Loading…</span></div>;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{quote.customer_name}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
            {quote.quote_number} · <StatusBadge status={quote.status} /> · {quote.commitment_period_months}m commitment
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.btnSecondary} onClick={() => router.push("/pricing")}>← Quotes</button>
          <button style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>
            {saved ? "Saved ✓" : saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div style={{ padding: "16px 32px 0" }}>
        <PricingNav quoteId={id} status={quote.status} />
      </div>

      <div style={S.body}>
        {/* Channels */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Channels</div>
          <button style={S.btnSecondary} onClick={addChannel}>+ Add Channel</button>
        </div>

        {channels.map((ch, i) => (
          <div key={i} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Channel {i + 1}</span>
              {channels.length > 1 && <button style={S.btnDanger} onClick={() => removeChannel(i)}>Remove</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <div>
                <label style={S.label}>Channel Type</label>
                <select style={S.input} value={ch.channel_type}
                  onChange={e => updateChannel(i, "channel_type", e.target.value)}>
                  {CHANNEL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Plan Type</label>
                <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                  {PLAN_TYPES.map(p => (
                    <button key={p} onClick={() => updateChannel(i, "plan_type", p)} style={{
                      flex: 1, padding: "7px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer",
                      border: ch.plan_type === p ? "1px solid #38bdf8" : "1px solid #334155",
                      background: ch.plan_type === p ? "rgba(56,189,248,0.12)" : "#0f172a",
                      color: ch.plan_type === p ? "#38bdf8" : "#94a3b8",
                    }}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={S.label}>Concurrent Channels</label>
                <input style={S.input} type="number" min={1} value={ch.concurrent_channels}
                  onChange={e => updateChannel(i, "concurrent_channels", Number(e.target.value))} />
              </div>
              <div>
                <label style={S.label}>Monthly Minutes</label>
                <input style={S.input} type="number" min={0} value={ch.monthly_minutes ?? ""}
                  onChange={e => updateChannel(i, "monthly_minutes", Number(e.target.value))} />
              </div>
              {ch.plan_type === "pulse" && (
                <div>
                  <label style={S.label}>Avg Call Duration (sec)</label>
                  <input style={S.input} type="number" min={1} value={ch.avg_call_duration_sec ?? ""}
                    onChange={e => updateChannel(i, "avg_call_duration_sec", Number(e.target.value))} />
                </div>
              )}
              <div>
                <label style={S.label}>Peak Traffic %</label>
                <input style={S.input} type="number" min={0} max={100}
                  value={ch.traffic_distribution?.peak ?? 60}
                  onChange={e => updateChannel(i, "traffic_distribution", {
                    peak: Number(e.target.value), off_peak: 100 - Number(e.target.value)
                  })} />
              </div>
              <div>
                <label style={S.label}>Off-Peak Traffic %</label>
                <input style={{ ...S.input, color: "#64748b" }} readOnly
                  value={100 - (ch.traffic_distribution?.peak ?? 60)} />
              </div>
              <div>
                <label style={S.label}>Channel Discount %</label>
                <input style={S.input} type="number" min={0} max={100} step={0.5}
                  value={ch.discount_at_channel}
                  onChange={e => updateChannel(i, "discount_at_channel", Number(e.target.value))} />
              </div>
              <div>
                <label style={S.label}>Commitment Volume</label>
                <input style={S.input} type="number" min={0} value={ch.commitment_volume ?? ""}
                  onChange={e => updateChannel(i, "commitment_volume", e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Optional" />
              </div>
            </div>
          </div>
        ))}

        {/* Add-ons */}
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 8 }}>Add-ons</div>
        <div style={S.card}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {ADDON_TYPES.map(({ type, label }) => {
              const active = addons.find(a => a.addon_type === type);
              return (
                <div key={type}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: active ? 8 : 0 }}>
                    <input type="checkbox" id={type} checked={!!active}
                      onChange={() => toggleAddon(type, label)}
                      style={{ width: 14, height: 14, accentColor: "#38bdf8" }} />
                    <label htmlFor={type} style={{ fontSize: 13, color: "#cbd5e1", cursor: "pointer" }}>{label}</label>
                  </div>
                  {active && (
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6, paddingLeft: 22 }}>
                      <input style={S.input} type="number" min={0} step={0.01} placeholder="Unit price (₹)"
                        value={active.unit_price || ""} onChange={e => updateAddon(type, "unit_price", Number(e.target.value))} />
                      <input style={S.input} type="number" min={1} placeholder="Qty"
                        value={active.quantity || ""} onChange={e => updateAddon(type, "quantity", Number(e.target.value))} />
                      <input style={S.input} type="number" min={0} max={100} placeholder="Disc %"
                        value={active.discount || ""} onChange={e => updateAddon(type, "discount", Number(e.target.value))} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button style={S.btnSecondary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Draft"}</button>
          <button style={S.btnPrimary} onClick={saveAndNext}>Save & Continue →</button>
        </div>
      </div>
    </div>
  );
}
