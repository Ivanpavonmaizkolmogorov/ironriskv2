"use client";

import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useLocale } from "next-intl";
import { useState, useEffect } from "react";

/**
 * Floating bug report button — opens Telegram DM with @IronRisk_Ivan
 * with a pre-filled message including page context.
 * Only visible when the user is authenticated.
 */
export default function BugReportButton() {
  const { isAuthenticated, user } = useAuthStore();
  const { adminTelegramHandle, fetchSettings } = useSettingsStore();
  const locale = useLocale();
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { 
    setMounted(true); 
    fetchSettings();
  }, [fetchSettings]);

  if (!mounted || !isAuthenticated) return null;

  const currentPage = window.location.pathname;
  const userEmail = user?.email || "unknown";
  const isEn = locale === "en";

  const message = encodeURIComponent(
    isEn
      ? `🐛 Bug Report — IronRisk\n\nPage: ${currentPage}\nAccount: ${userEmail}\n\nDescription:\n`
      : `🐛 Reporte — IronRisk\n\nPágina: ${currentPage}\nCuenta: ${userEmail}\n\nDescripción:\n`
  );

  const telegramUrl = `https://t.me/${adminTelegramHandle.replace('@', '')}?text=${message}`;

  return (
    <a
      href={telegramUrl}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed bottom-14 right-2 scale-[0.65] origin-bottom-right md:scale-100 md:bottom-20 md:right-6 z-50 flex items-center gap-2 bg-surface-secondary border border-iron-700 hover:border-risk-blue/50 rounded-full shadow-lg hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all duration-300 group"
      title={isEn ? "Report a bug" : "Reportar un problema"}
      style={{ padding: isHovered ? "10px 18px 10px 14px" : "10px" }}
    >
      <span className="text-lg leading-none">🐛</span>
      {isHovered && (
        <span className="text-xs font-medium text-iron-300 whitespace-nowrap animate-in fade-in slide-in-from-right-2 duration-200">
          {isEn ? "Report Bug" : "Reportar Bug"}
        </span>
      )}
    </a>
  );
}
