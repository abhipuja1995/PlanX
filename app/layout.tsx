import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nirmaan — Issue Tracker",
  description: "Issue tracking dashboard for cr-product workspace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
