import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { routing } from "@/i18n/routing";
import ThemeProvider from "@/components/ui/ThemeProvider";
import { MetricsProvider } from "@/contexts/MetricsContext";
import AdminToolbar from "@/components/ui/AdminToolbar";
import ImpersonateBanner from "@/components/ui/ImpersonateBanner";
import BugReportButton from "@/components/ui/BugReportButton";
import LocaleSync from "@/components/LocaleSync";
import "../globals.css";

const seoByLocale: Record<string, { title: string; description: string; keywords: string }> = {
  es: {
    title: "IronRisk — Controla tu Drawdown con Datos Reales | Gestión de Riesgo para Traders",
    description:
      "¿Tu sistema es rentable pero el drawdown te destruye? IronRisk proyecta tu backtest sobre MetaTrader 5 para que tomes decisiones con datos, no con miedo. Análisis Bayesiano de tu estrategia de trading.",
    keywords:
      "drawdown trading, gestión de riesgo trading, control drawdown metatrader, backtest metatrader 5, psicología trading, risk management, algo trading, trading algorítmico, análisis bayesiano trading, monitorizar VPS trading, alerta desconexión EA metatrader, vigilancia bot trading",
  },
  en: {
    title: "IronRisk — Drawdown Control with Real Data | Risk Management for Traders",
    description:
      "Your system is profitable but drawdown kills your discipline? IronRisk projects your backtest onto MetaTrader 5 so you make decisions with data, not fear. Bayesian analysis for your trading strategy.",
    keywords:
      "drawdown management, trading risk control, metatrader risk management, backtest analysis, algo trading tools, trading psychology, bayesian trading analysis, drawdown control metatrader, VPS trading monitoring, EA disconnection alert, trading bot uptime",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const seo = seoByLocale[locale] || seoByLocale.en;

  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    authors: [{ name: "IronRisk" }],
    icons: {
      icon: "/favicon.svg",
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: "https://www.ironrisk.pro",
      siteName: "IronRisk",
      locale: locale === "es" ? "es_ES" : "en_US",
      type: "website",
      images: [
        {
          url: "https://www.ironrisk.pro/og-image.png",
          width: 1200,
          height: 630,
          alt: "IronRisk — Control de Riesgo con Datos Reales",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: ["https://www.ironrisk.pro/og-image.png"],
    },
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: "https://www.ironrisk.pro",
      languages: {
        es: "https://www.ironrisk.pro/es",
        en: "https://www.ironrisk.pro/en",
      },
    },
  };
}

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
  const cookieStore = await cookies();
  const disableAnalytics = cookieStore.get("disable-analytics")?.value === "true";

  return (
    <html lang={locale} className="dark">
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0d0f12" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
        {/* Apple PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="IronRisk" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Mobile */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="min-h-screen min-h-dvh bg-surface-primary text-iron-200 antialiased">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <MetricsProvider>
              {children}
              <ImpersonateBanner />
              <AdminToolbar />
              <BugReportButton />
              <LocaleSync />
            </MetricsProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
        {!disableAnalytics && <Analytics />}
        {/* Rogue Service Worker Killer */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (let registration of registrations) {
                    registration.unregister();
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

