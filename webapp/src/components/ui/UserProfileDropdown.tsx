"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { User } from "@/types/auth";

// ─── Types ────────────────────────────────────────────────────
interface UserProfileDropdownProps {
  user: User | null;
  onLogout: () => void;
  onOpenSettings?: () => void;
  onOpenTheme?: () => void;
  showBayesSandbox?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  action?: () => void;
  component?: React.ReactNode;
  danger?: boolean;
  dividerAfter?: boolean;
  adminOnly?: boolean;
  href?: string;
}

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
}: UserProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
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
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    if (isOpen) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  const toggleLanguage = useCallback(() => {
    const nextLocale = locale === "en" ? "es" : "en";
    startTransition(() => {
      const params = searchParams.toString();
      const query = params ? `?${params}` : "";
      router.replace(`${pathname}${query}`, { locale: nextLocale, scroll: false });
    });
    setIsOpen(false);
  }, [locale, router, pathname, searchParams]);

  if (!user) return null;

  const initials = getInitials(user.email);
  const avatarBg = getAvatarColor(user.email);
  const isAdmin = user.is_admin === true;

  // ─── Menu Items (OOP-style declarative config) ───
  const menuItems: MenuItem[] = [
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
        onClick={() => setIsOpen((prev) => !prev)}
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
        <div className="absolute right-0 top-full mt-2 w-64 bg-surface-secondary border border-iron-700 rounded-xl shadow-2xl z-[60] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
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
                  </button>
                  {item.dividerAfter && <div className="mx-3 my-1 border-t border-iron-800" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
