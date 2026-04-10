import SimulatorWizard from '@/components/features/simulate/SimulatorWizard';
import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';

import Link from 'next/link';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const t = await getTranslations({ locale: resolvedParams.locale, namespace: 'simulate' });
  return {
    title: `${t('title')} | IronRisk`,
    description: t('subtitle'),
  };
}

export default async function SimulatePage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale;
  const otherLocale = locale === 'es' ? 'en' : 'es';
  const currentLocaleLabel = locale === 'es' ? 'ES' : 'EN';
  const otherLocaleLabel = locale === 'es' ? 'EN' : 'ES';

  return (
    <main className="min-h-screen bg-surface-primary text-iron-200 antialiased relative overflow-hidden">
      
      {/* Background Effects */}
      <style>{`
        @keyframes grid-move {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
        .ir-grid-bg {
          background-size: 60px 60px;
          background-image:
            linear-gradient(to right, rgba(0,230,118,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,230,118,0.03) 1px, transparent 1px);
          animation: grid-move 20s linear infinite;
        }
      `}</style>
      <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-iron-800/20 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(0,191,165,0.04)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 ir-grid-bg opacity-60 pointer-events-none" />
      
      {/* ── Nav ── */}
      <nav className="fixed top-0 w-full z-50 bg-surface-primary/70 backdrop-blur-2xl border-b border-iron-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href={`/${locale}`} className="text-lg font-bold text-iron-100 tracking-tight hover:opacity-80 transition-opacity">
            IRON<span className="text-risk-green">RISK</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link href={`/${otherLocale}/simulate`} scroll={false} className="text-iron-500 hover:text-iron-300 transition-colors text-sm font-semibold tracking-wider bg-surface-secondary px-4 py-2 rounded-xl border border-iron-800/50">
              {currentLocaleLabel} <span className="text-iron-700">/</span> {otherLocaleLabel}
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className="container mx-auto px-4 pt-32 pb-16 relative z-10 w-full max-w-7xl">
        <SimulatorWizard />
      </div>
    </main>
  );
}
