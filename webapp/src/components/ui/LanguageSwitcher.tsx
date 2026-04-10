"use client";

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const toggleLanguage = () => {
    const nextLocale = locale === 'en' ? 'es' : 'en';
    startTransition(() => {
      // Preserve search parameters
      const params = searchParams.toString();
      const query = params ? `?${params}` : '';
      router.replace(`${pathname}${query}`, { locale: nextLocale, scroll: false });
    });
  };

  return (
    <button
      onClick={toggleLanguage}
      disabled={isPending}
      className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold tracking-wider text-iron-400 border border-iron-800 rounded-md bg-surface-tertiary hover:text-iron-200 hover:border-iron-600 transition-colors disabled:opacity-50 shrink-0"
      title="Toggle language"
    >
      <span className={locale === 'en' ? 'text-iron-100' : 'text-iron-600'}>EN</span>
      <span className="text-iron-700">/</span>
      <span className={locale === 'es' ? 'text-iron-100' : 'text-iron-600'}>ES</span>
    </button>
  );
}
