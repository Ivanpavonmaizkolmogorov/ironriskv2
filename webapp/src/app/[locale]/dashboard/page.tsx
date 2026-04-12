/** Token Manager page — dedicated page for API token management. */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import TradingAccountManager from "@/components/features/TradingAccountManager";
import Button from "@/components/ui/Button";
import ThemeSelector from "@/components/features/ThemeSelector";
import { useTranslations, useLocale } from "next-intl";
import { usePathname, useRouter as useI18nRouter } from "@/i18n/routing";

export default function TradingAccountsPage() {
  const router = useRouter();
  const i18nRouter = useI18nRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const t = useTranslations("workspaceManager");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated) router.push("/login");
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) return null;

  return (
    <main className="min-h-screen bg-surface-primary">
      <nav className="sticky top-0 z-50 bg-surface-primary/80 backdrop-blur-xl border-b border-iron-800">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <span className="text-lg font-bold text-iron-100">
            IRON<span className="text-risk-green">RISK</span>
          </span>
          <div className="flex items-center gap-4">
            <ThemeSelector mode="global" />
            <button
              onClick={() => i18nRouter.replace(pathname, { locale: locale === "en" ? "es" : "en" })}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold tracking-wider text-iron-400 border border-iron-800 rounded-md bg-surface-tertiary hover:text-iron-200 hover:border-iron-600 transition-colors disabled:opacity-50 shrink-0"
              title="Toggle language"
            >
              <span className={locale === "en" ? "text-iron-100" : "text-iron-600"}>EN</span>
              <span className="text-iron-700">/</span>
              <span className={locale === "es" ? "text-iron-100" : "text-iron-600"}>ES</span>
            </button>
            <Button variant="ghost" size="sm" className="min-w-[120px] text-center" onClick={() => {
              router.push(`/${locale}`);
              setTimeout(() => {
                useAuthStore.getState().logout();
              }, 200);
            }}>
              {t("logout")}
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-12">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-iron-100 mb-2">{t("pageTitle")}</h2>
            <p className="text-sm text-iron-500 max-w-md">
              {t("pageDesc")}
            </p>
          </div>

        </div>
        <TradingAccountManager />
      </div>
    </main>
  );
}
