"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { User } from "@/types/auth";
import { preferencesAPI } from "@/services/api";

// ─── Types ────────────────────────────────────────────────────
interface DownloadItem {
  name: string;
  desc: { es: string; en: string };
  file: string;
  icon: string;
}

interface UserProfileDropdownProps {
  user: User | null;
  onLogout: () => void;
  onOpenSettings?: () => void;
  onOpenTheme?: () => void;
  showBayesSandbox?: boolean;
  apiToken?: string;
  onCopyToken?: () => void;
  copied?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  action?: () => void;
  danger?: boolean;
  dividerAfter?: boolean;
  adminOnly?: boolean;
  href?: string;
}

// ─── Downloads Registry ───────────────────────────────────────
const DOWNLOADS: DownloadItem[] = [
  {
    name: "IronRisk Dashboard EA",
    desc: { es: "Expert Advisor para MetaTrader 5", en: "Expert Advisor for MetaTrader 5" },
    file: "/downloads/IronRisk_Dashboard.mq5",
    icon: "📊",
  },
  {
    name: "SQX Uploader",
    desc: { es: "Envía backtests de SQX a IronRisk", en: "Send SQX backtests to IronRisk" },
    file: "/downloads/IronRisk_SQX_Uploader.java",
    icon: "☁️",
  },
  {
    name: "Magic Number Assigner",
    desc: { es: "Asigna MagicNumbers a estrategias SQX", en: "Auto-assign MagicNumbers in SQX" },
    file: "/downloads/IronRisk_SQX_MagicAssigner.java",
    icon: "🔢",
  },
  {
    name: "IronRisk Uninstaller",
    desc: { es: "Limpia de forma segura los archivos MT5", en: "Safely purges IronRisk from MT5" },
    file: "/downloads/Uninstall-IronRisk.bat",
    icon: "🗑️",
  },
];

// ─── Helpers ──────────────────────────────────────────────────
function getInitials(email: string): string {
  const name = email.split("@")[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getAvatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 60%, 45%)`;
}

// ─── Component ────────────────────────────────────────────────
export default function UserProfileDropdown({
  user,
  onLogout,
  onOpenSettings,
  onOpenTheme,
  showBayesSandbox = false,
  apiToken,
  onCopyToken,
  copied,
}: UserProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowTools(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showTools) { setShowTools(false); }
        else { setIsOpen(false); }
      }
    };
    if (isOpen) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, showTools]);

  const toggleLanguage = useCallback(async () => {
    const nextLocale = locale === "en" ? "es" : "en";
    // Sync locale to backend for Telegram i18n — must complete BEFORE navigation
    // because router.replace with a new locale causes a full page reload
    try { 
      await preferencesAPI.updateLocale(nextLocale); 
      // ONLY navigate if the backend successfully stored the new language
      startTransition(() => {
        const params = searchParams.toString();
        const query = params ? `?${params}` : "";
        router.replace(`${pathname}${query}`, { locale: nextLocale, scroll: false });
      });
    } catch (error) {
      console.error("Failed to sync locale to backend, aborting UI language change:", error);
      // Give a visual indication so the user isn't stuck wondering why it didn't click
      alert("No se pudo cambiar el idioma en el servidor. Reintenta en unos segundos.");
    }
    setIsOpen(false);
  }, [locale, router, pathname, searchParams]);

  if (!user) return null;

  const initials = getInitials(user.email);
  const avatarBg = getAvatarColor(user.email);
  const isAdmin = user.is_admin === true;

  // ─── Menu Items (OOP-style declarative config) ───
  const menuItems: MenuItem[] = [
    ...(isAdmin
      ? [{
          id: "tools",
          label: locale === "es" ? "Herramientas" : "Tools",
          icon: "🔧",
          action: () => setShowTools(true),
          adminOnly: true,
        }]
      : []),
    {
      id: "theme",
      label: locale === "es" ? "Tema visual" : "Visual theme",
      icon: "🎨",
      action: () => { setIsOpen(false); setTimeout(() => onOpenTheme?.(), 150); },
    },
    {
      id: "language",
      label: locale === "es" ? "Cambiar a English" : "Cambiar a Español",
      icon: "🌐",
      action: toggleLanguage,
    },
    {
      id: "settings",
      label: locale === "es" ? "Configuración" : "Settings",
      icon: "⚙️",
      action: () => { onOpenSettings?.(); setIsOpen(false); },
      dividerAfter: true,
    },
    ...(showBayesSandbox && isAdmin
      ? [{
          id: "bayes",
          label: "Bayes Sandbox",
          icon: "🧠",
          href: "/dashboard/bayes-sandbox",
          adminOnly: true,
          dividerAfter: true,
        }]
      : []),
    {
      id: "logout",
      label: locale === "es" ? "Cerrar sesión" : "Sign out",
      icon: "🚪",
      action: onLogout,
      danger: true,
    },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Button */}
      <button
        onClick={() => { setIsOpen((prev) => !prev); setShowTools(false); }}
        className="relative flex items-center gap-2 rounded-full transition-all duration-200 group"
        title={user.email}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-md ring-2 ring-transparent group-hover:ring-iron-600 transition-all"
          style={{ backgroundColor: avatarBg }}
        >
          {initials}
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-surface-secondary border border-iron-700 rounded-xl shadow-2xl z-[60] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">

          {/* ═══ Tools Sub-panel ═══ */}
          {showTools ? (
            <>
              {/* Tools Header */}
              <div className="px-4 pt-3 pb-2 border-b border-iron-800 flex items-center gap-2">
                <button
                  onClick={() => setShowTools(false)}
                  className="text-iron-500 hover:text-iron-200 transition-colors text-xs"
                >
                  ←
                </button>
                <h3 className="text-xs font-bold text-iron-200 uppercase tracking-wider">
                  {locale === "es" ? "🔧 Herramientas" : "🔧 Tools"}
                </h3>
              </div>

              {/* Token Section */}
              {apiToken && (
                <div className="px-4 py-2.5 border-b border-iron-800 bg-iron-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-iron-500 uppercase tracking-wider font-semibold shrink-0">⚡ Token:</span>
                      <span className="text-[11px] font-mono text-cyan-400 truncate">{apiToken.substring(0, 16)}...</span>
                    </div>
                    <button
                      onClick={() => onCopyToken?.()}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded transition-all shrink-0 ${
                        copied
                          ? "bg-risk-green/20 text-risk-green"
                          : "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                      }`}
                    >
                      {copied ? "✅ OK" : locale === "es" ? "COPIAR" : "COPY"}
                    </button>
                  </div>
                </div>
              )}

              {/* Downloads List */}
              <div className="p-2 space-y-1">
                {DOWNLOADS.map((dl) => (
                  <a
                    key={dl.file}
                    href={dl.file}
                    download
                    className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-iron-800/60 transition-colors group"
                    onClick={() => { setIsOpen(false); setShowTools(false); }}
                  >
                    <span className="text-lg mt-0.5">{dl.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-iron-200 group-hover:text-iron-50">
                        {dl.name}
                      </div>
                      <p className="text-[10px] text-iron-500 mt-0.5">
                        {locale === "es" ? dl.desc.es : dl.desc.en}
                      </p>
                    </div>
                    <span className="text-iron-600 group-hover:text-cyan-400 transition-colors ml-auto mt-1 text-xs shrink-0">↓</span>
                  </a>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* ═══ Main Menu ═══ */}
              {/* User Header */}
              <div className="px-4 pt-4 pb-3 border-b border-iron-800">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg shrink-0"
                    style={{ backgroundColor: avatarBg }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-iron-100 truncate">
                      {user.email.split("@")[0]}
                    </p>
                    <p className="text-[10px] text-iron-500 truncate">{user.email}</p>
                    {isAdmin && (
                      <span className="inline-block mt-1 text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 uppercase tracking-wider">
                        Admin
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="py-1.5">
                {menuItems.map((item) => {
                  if (item.href) {
                    return (
                      <React.Fragment key={item.id}>
                        <a
                          href={item.href}
                          className="flex items-center gap-3 px-4 py-2 text-xs text-iron-300 hover:text-iron-100 hover:bg-iron-800/50 transition-colors"
                          onClick={() => setIsOpen(false)}
                        >
                          <span className="text-sm w-5 text-center">{item.icon}</span>
                          <span className="font-medium">{item.label}</span>
                          {item.adminOnly && (
                            <span className="ml-auto text-[9px] text-amber-500/60 font-mono">admin</span>
                          )}
                        </a>
                        {item.dividerAfter && <div className="mx-3 my-1 border-t border-iron-800" />}
                      </React.Fragment>
                    );
                  }
                  return (
                    <React.Fragment key={item.id}>
                      <button
                        onClick={item.action}
                        disabled={item.id === "language" && isPending}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-xs transition-colors ${
                          item.danger
                            ? "text-iron-400 hover:text-risk-red hover:bg-risk-red/5"
                            : "text-iron-300 hover:text-iron-100 hover:bg-iron-800/50"
                        } disabled:opacity-50`}
                      >
                        <span className="text-sm w-5 text-center">{item.icon}</span>
                        <span className="font-medium">{item.label}</span>
                        {item.id === "language" && (
                          <span className="ml-auto text-[10px] font-mono text-iron-600">
                            {locale === "es" ? "ES → EN" : "EN → ES"}
                          </span>
                        )}
                        {item.id === "tools" && (
                          <span className="ml-auto text-[10px] text-iron-600">→</span>
                        )}
                        {item.adminOnly && (
                          <span className="ml-auto text-[9px] text-amber-500/60 font-mono">admin</span>
                        )}
                      </button>
                      {item.dividerAfter && <div className="mx-3 my-1 border-t border-iron-800" />}
                    </React.Fragment>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
