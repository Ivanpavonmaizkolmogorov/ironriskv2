import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IronRisk V2 — Real-Time Risk Management",
  description:
    "Visual firewall for algorithmic traders. Translate your backtest variance into a live anchor on MetaTrader.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-primary text-iron-200 antialiased">
        {children}
      </body>
    </html>
  );
}
