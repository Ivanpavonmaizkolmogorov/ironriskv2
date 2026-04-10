import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import ThemeProvider from "@/components/ui/ThemeProvider";
import { MetricsProvider } from "@/contexts/MetricsContext";
import AdminToolbar from "@/components/ui/AdminToolbar";
import "../globals.css";

export const metadata: Metadata = {
  title: "IronRisk V2 — Real-Time Risk Management",
  description:
    "Visual firewall for algorithmic traders. Translate your backtest variance into a live anchor on MetaTrader.",
};

export default async function RootLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} className="dark">
      <body className="min-h-screen bg-surface-primary text-iron-200 antialiased">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <MetricsProvider>
              {children}
              <AdminToolbar />
            </MetricsProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
