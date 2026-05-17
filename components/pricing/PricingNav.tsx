"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const STEPS = [
  { label: "Channel & Volume", path: "channel-volume" },
  { label: "Pricing & Finalise", path: "pricing" },
  { label: "Review & Submit", path: "review" },
];

export function PricingNav({ quoteId, status }: { quoteId: string; status?: string }) {
  const pathname = usePathname();
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1e293b", marginBottom: 24 }}>
      {STEPS.map((step, i) => {
        const href = `/pricing/${quoteId}/${step.path}`;
        const active = pathname.includes(step.path);
        const locked = status && !["draft","revision_requested"].includes(status) && i > 1;
        return (
          <Link key={step.path} href={locked ? "#" : href} style={{
            padding: "10px 20px", fontSize: 13, fontWeight: active ? 600 : 400,
            color: active ? "#38bdf8" : "#94a3b8",
            borderBottom: active ? "2px solid #38bdf8" : "2px solid transparent",
            textDecoration: "none", cursor: locked ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}>
            <span style={{ marginRight: 6, color: "#475569" }}>{i + 1}.</span>
            {step.label}
          </Link>
        );
      })}
    </div>
  );
}

export function TopNav() {
  const pathname = usePathname();
  return (
    <div style={{
      background: "#0f172a", borderBottom: "1px solid #1e293b",
      padding: "0 24px", display: "flex", alignItems: "center", gap: 8, height: 48,
    }}>
      <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: 15, marginRight: 16 }}>Nirmaan</span>
      {[
        { label: "Issues", href: "/" },
        { label: "Pricing", href: "/pricing" },
      ].map(({ label, href }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 13,
            color: active ? "#f8fafc" : "#94a3b8",
            background: active ? "#1e293b" : "transparent",
            textDecoration: "none", fontWeight: active ? 500 : 400,
          }}>{label}</Link>
        );
      })}
    </div>
  );
}
