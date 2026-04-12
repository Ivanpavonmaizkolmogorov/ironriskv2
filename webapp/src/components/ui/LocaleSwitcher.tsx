"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";

/** Minimal EN / ES toggle for auth pages (login, register). */
export default function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  // Replace /es/ with /en/ or vice-versa
  const otherLocale = locale === "en" ? "es" : "en";
  const newPath = pathname.replace(`/${locale}`, `/${otherLocale}`);

  return (
    <div className="flex items-center gap-1 text-xs font-mono">
      <Link
        href={locale === "en" ? pathname : newPath}
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
        href={locale === "es" ? pathname : newPath}
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
