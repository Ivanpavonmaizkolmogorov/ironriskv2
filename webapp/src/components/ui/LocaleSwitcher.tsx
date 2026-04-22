"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";

/** Minimal EN / ES toggle for auth pages (login, register). */
export default function LocaleSwitcher() {
  const locale = useLocale();
  // usePathname() returns path WITHOUT locale prefix e.g. "/register"
  const pathname = usePathname();

  // Strip leading locale segment if present (safety guard)
  const stripped = pathname.replace(/^\/(en|es)/, "") || "/";

  const enPath = `/en${stripped}`;
  const esPath = `/es${stripped}`;

  return (
    <div className="flex items-center gap-1 text-xs font-mono">
      <Link
        href={enPath}
        className={`px-1.5 py-0.5 rounded transition-colors ${
          locale === "en"
            ? "text-iron-100 bg-iron-800"
            : "text-iron-500 hover:text-iron-300"
        }`}
      >
        EN
      </Link>
      <span className="text-iron-700">/</span>
      <Link
        href={esPath}
        className={`px-1.5 py-0.5 rounded transition-colors ${
          locale === "es"
            ? "text-iron-100 bg-iron-800"
            : "text-iron-500 hover:text-iron-300"
        }`}
      >
        ES
      </Link>
    </div>
  );
}
