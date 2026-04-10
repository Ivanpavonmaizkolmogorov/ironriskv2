import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

interface PactBannerProps {
  unconfiguredCount: number;
  accountId: string;
  onConfigure?: () => void;
}

export default function PactBanner({ unconfiguredCount, accountId, onConfigure }: PactBannerProps) {
  const router = useRouter();
  const locale = useLocale();

  if (unconfiguredCount === 0) return null;

  return (
    <div className="w-full max-w-7xl mx-auto px-6 mt-4 mb-0">
      <div className="px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between gap-4 animate-in slide-in-from-top-4 fade-in duration-300 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-500/90 truncate">
            <span className="font-bold mr-2">
              {locale === 'es' 
                ? `Pacto de Ulises Incompleto (${unconfiguredCount}):` 
                : `Ulysses Pact Incomplete (${unconfiguredCount}):`}
            </span>
            {locale === 'es'
              ? 'Tus estrategias están conectadas pero estás volando a ciegas sin límites de riesgo definidos.'
              : 'Strategies connected but flying blind without defined risk limits.'}
          </p>
        </div>
        {onConfigure && (
          <button
            onClick={onConfigure}
            className="shrink-0 px-3 py-1.5 bg-amber-500 text-iron-900 font-bold text-[10px] uppercase tracking-wider rounded hover:bg-amber-400 focus:outline-none transition-colors whitespace-nowrap"
          >
            {locale === 'es' ? 'Configurar Límites ⚙️' : 'Configure Limits ⚙️'}
          </button>
        )}
      </div>
    </div>
  );
}
