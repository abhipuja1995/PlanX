import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { TopNav } from "@/components/pricing/PricingNav";

export const metadata: Metadata = {
  title: "Nirmaan",
  description: "Issue tracking and pricing dashboard for cr-product workspace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#0f172a" }}>
        <SessionProvider>
          <TopNav />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
