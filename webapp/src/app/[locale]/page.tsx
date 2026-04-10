/** Landing Page — IronRisk V2 (i18n via next-intl).
 *  Served by the [locale] dynamic route for both /en and /es.
 *  Waitlist handled via /api/waitlist serverless function on Vercel.
 */
"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

/* ── tiny helper: staggered fade-in on scroll ── */
function useFadeIn() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("ir-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".ir-fade").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

export default function LandingPage() {
  const t = useTranslations("landing");
  const locale = useLocale();
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  
  useFadeIn();

  const SimulateButton = ({ large = false }: { large?: boolean }) => (
    <div className="flex justify-center">
      <button
        onClick={() => {
          setIsNavigating(true);
          router.push(`/${locale}/simulate`);
        }}
        disabled={isNavigating}
        className={`
          flex items-center justify-center gap-2
          bg-risk-green text-surface-primary font-bold rounded-xl
          whitespace-nowrap ${isNavigating ? 'cursor-wait opacity-80' : 'cursor-pointer'}
          hover:shadow-[0_0_40px_rgba(0,230,118,0.35)] hover:scale-[1.03]
          active:scale-[0.98]
          transition-all duration-300
          ${large ? "px-8 py-5 text-lg min-w-[300px]" : "px-6 py-3 text-sm min-w-[260px]"}
        `}
      >
        {isNavigating ? (
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-surface-primary/30 border-t-surface-primary rounded-full animate-spin" />
            <span>{locale === 'en' ? 'Loading...' : 'Cargando...'}</span>
          </div>
        ) : (
          large ? t("emailBtnLarge") : t("emailBtnSmall")
        )}
      </button>
    </div>
  );


  return (
    <>
      {/* ── Injected animations ── */}
      <style jsx global>{`
        .ir-fade {
          opacity: 0;
          transform: translateY(32px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ir-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .ir-delay-1 { transition-delay: 0.1s; }
        .ir-delay-2 { transition-delay: 0.2s; }
        .ir-delay-3 { transition-delay: 0.3s; }
        .ir-delay-4 { transition-delay: 0.4s; }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes grid-move {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
        .ir-float { animation: float 6s ease-in-out infinite; }

        /* Animated grid background */
        .ir-grid-bg {
          background-size: 60px 60px;
          background-image:
            linear-gradient(to right, rgba(0,230,118,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,230,118,0.03) 1px, transparent 1px);
          animation: grid-move 20s linear infinite;
        }

        /* Glow pulse on hero CTA */
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(0,230,118,0.15); }
          50% { box-shadow: 0 0 40px rgba(0,230,118,0.3); }
        }
        .ir-glow { animation: glow-pulse 3s ease-in-out infinite; }

        /* Gradient text */
        .ir-gradient-text {
          background: linear-gradient(135deg, #00e676 0%, #00bfa5 50%, #69f0ae 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>

      <main className="min-h-screen bg-surface-primary relative overflow-hidden">
        {/* ── Ambient background effects ── */}
        <div className="fixed inset-0 pointer-events-none z-0">
          {/* Radial glow top */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(0,230,118,0.06)_0%,transparent_70%)]" />
          {/* Radial glow bottom-left */}
          <div className="absolute bottom-0 left-0 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(0,191,165,0.04)_0%,transparent_70%)]" />
          {/* Animated grid */}
          <div className="absolute inset-0 ir-grid-bg" />
        </div>

        {/* ── Transition Overlay ── */}
        {isNavigating && (
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-surface-primary/95 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="w-16 h-16 border-4 border-iron-800 border-t-risk-green rounded-full animate-spin mb-6 shadow-[0_0_30px_rgba(0,230,118,0.4)]"></div>
            <h2 className="text-2xl font-bold text-iron-100 mb-2">
              {locale === 'en' ? 'Booting Simulator...' : 'Iniciando Laboratorio...'}
            </h2>
            <p className="text-sm text-risk-green font-mono">
              {locale === 'en' ? 'Calibrating Edge Matrix' : 'Calibrando Matriz de Riesgo'}
            </p>
          </div>
        )}

        {/* ── Nav ── */}
        <nav className="fixed top-0 w-full z-50 bg-surface-primary/70 backdrop-blur-2xl border-b border-iron-800/50">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <span className="text-lg font-bold text-iron-100 tracking-tight">
              IRON<span className="text-risk-green">RISK</span>
            </span>
            <div className="flex items-center gap-5">
              <LanguageSwitcher />
              <div className="flex items-center gap-3">
                <a href={`/${locale}/login`} className="text-sm font-semibold text-iron-400 hover:text-white transition-colors">
                  {t("navLogin")}
                </a>
                <button
                  onClick={() => {
                    setIsNavigating(true);
                    router.push(`/${locale}/simulate`);
                  }}
                  disabled={isNavigating}
                  className="px-4 py-2 text-sm bg-risk-green/15 text-risk-green border border-risk-green/25 rounded-lg hover:bg-risk-green/25 hover:border-risk-green/40 transition-all duration-300"
                >
                  {t("navCta")}
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section className="relative z-10 pt-36 pb-24 px-6">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="ir-fade inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-risk-green/25 bg-risk-green/8 text-xs text-risk-green font-medium mb-10 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-risk-green animate-pulse shadow-[0_0_8px_rgba(0,230,118,0.6)]" />
              {t("badge")}
            </div>

            {/* Headline */}
            <h1 className="ir-fade ir-delay-1 text-4xl md:text-6xl lg:text-7xl font-bold text-iron-50 leading-[1.1] mb-8 tracking-tight">
              {t("heroTitle1")}
              <br />
              <span className="ir-gradient-text">{t("heroTitle2")}</span>
            </h1>

            {/* Sub */}
            <p className="ir-fade ir-delay-2 text-lg md:text-xl text-iron-400 max-w-2xl mx-auto mb-12 leading-relaxed">
              {t("heroDesc")}
            </p>

            {/* Hero CTA */}
            <div className="ir-fade ir-delay-3 ir-glow rounded-2xl inline-block mt-4">
              <SimulateButton large />
            </div>

            <p className="ir-fade ir-delay-4 text-sm font-medium text-iron-500 mt-8 tracking-wide">
              {t("heroTag")}
            </p>
          </div>

          {/* Mockup */}
          <div className="ir-fade ir-delay-4 max-w-5xl mx-auto mt-20 rounded-2xl overflow-hidden border border-iron-800/60 shadow-[0_0_80px_rgba(0,230,118,0.08)] relative group">
            <div className="absolute inset-0 bg-gradient-to-t from-surface-primary via-surface-primary/20 to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-b from-risk-green/5 via-transparent to-transparent z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <Image
              src="/ironrisk-shield-mockup.png"
              alt="IronRisk MetaTrader 5 Dashboard"
              width={1600}
              height={900}
              className="w-full h-auto object-cover opacity-85 group-hover:opacity-100 transition-all duration-700 group-hover:scale-[1.01]"
              priority
            />
          </div>
        </section>

        {/* ── How it Works ── */}
        <section id="how" className="relative z-10 py-24 px-6 border-t border-iron-800/40">
          <div className="max-w-5xl mx-auto">
            <h2 className="ir-fade text-2xl md:text-4xl font-bold text-iron-100 text-center mb-4 tracking-tight">
              {t("diagTitle")}
            </h2>
            <p className="ir-fade ir-delay-1 text-iron-500 text-center max-w-2xl mx-auto mb-16 text-lg leading-relaxed">
              {t("diagDesc")}
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: t("step1Icon"), title: t("step1Title"), desc: t("step1Desc") },
                { icon: t("step2Icon"), title: t("step2Title"), desc: t("step2Desc") },
                { icon: t("step3Icon"), title: t("step3Title"), desc: t("step3Desc") },
              ].map((step, i) => (
                <div
                  key={i}
                  className={`ir-fade ir-delay-${i + 1} bg-surface-secondary/60 backdrop-blur-sm border border-iron-800/60 rounded-2xl p-7
                    hover:border-risk-green/20 hover:bg-surface-secondary/80 hover:shadow-[0_0_30px_rgba(0,230,118,0.06)]
                    transition-all duration-500 group cursor-default`}
                >
                  <span className="text-4xl mb-5 block ir-float" style={{ animationDelay: `${i * 0.8}s` }}>
                    {step.icon}
                  </span>
                  <h3 className="text-lg font-semibold text-iron-100 mb-3 group-hover:text-risk-green transition-colors duration-300">
                    {step.title}
                  </h3>
                  <p className="text-sm text-iron-500 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>

            {/* ── Feature Highlights ── */}
            <div className="mt-16">
              <h3 className="ir-fade text-lg md:text-2xl font-bold text-iron-200 text-center mb-8 tracking-tight">
                {t("featSectionTitle")}
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                {[
                  { icon: t("feat1Icon"), title: t("feat1Title"), desc: t("feat1Desc") },
                  { icon: t("feat2Icon"), title: t("feat2Title"), desc: t("feat2Desc") },
                ].map((feat, i) => (
                  <div
                    key={i}
                    className={`ir-fade ir-delay-${i + 1} relative overflow-hidden bg-surface-secondary/40 backdrop-blur-sm border border-iron-800/50 rounded-2xl p-7
                      hover:border-risk-green/25 hover:shadow-[0_0_40px_rgba(0,230,118,0.08)]
                      transition-all duration-500 group cursor-default`}
                  >
                    {/* Subtle corner glow */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-risk-green/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <div className="relative">
                      <span className="text-3xl mb-4 block">{feat.icon}</span>
                      <h4 className="text-base font-semibold text-iron-100 mb-2 group-hover:text-risk-green transition-colors duration-300">
                        {feat.title}
                      </h4>
                      <p className="text-sm text-iron-500 leading-relaxed">{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── The Ulysses Pact ── */}
        <section className="relative z-10 py-24 px-6 border-t border-iron-800/40">
          {/* Section background accent */}
          <div className="absolute inset-0 bg-gradient-to-b from-surface-secondary/50 via-surface-primary to-surface-primary pointer-events-none" />

          <div className="relative max-w-4xl mx-auto text-center">
            <h2 className="ir-fade text-2xl md:text-4xl font-bold text-iron-100 mb-4 tracking-tight">
              {t("cureTitle")}
            </h2>
            <p className="ir-fade ir-delay-1 text-iron-400 max-w-2xl mx-auto mb-14 text-lg leading-relaxed">
              {t("cureDesc")}
            </p>

            {/* Comparison Cards */}
            <div className="grid md:grid-cols-2 gap-6 text-left">
              {/* Without */}
              <div className="ir-fade ir-delay-1 bg-surface-secondary/40 backdrop-blur-sm border border-risk-red/15 rounded-2xl p-7 hover:border-risk-red/30 transition-all duration-500">
                <h4 className="text-risk-red font-semibold mb-4 text-lg">{t("withoutTitle")}</h4>
                <ul className="space-y-3 text-sm text-iron-400">
                  <li className="flex items-start gap-2"><span className="text-risk-red/60 mt-0.5">•</span>{t("without1")}</li>
                  <li className="flex items-start gap-2"><span className="text-risk-red/60 mt-0.5">•</span>{t("without2")}</li>
                  <li className="flex items-start gap-2"><span className="text-risk-red/60 mt-0.5">•</span>{t("without3")}</li>
                  <li className="flex items-start gap-2"><span className="text-risk-red/60 mt-0.5">•</span>{t("without4")}</li>
                </ul>
              </div>

              {/* With */}
              <div className="ir-fade ir-delay-2 bg-surface-secondary/40 backdrop-blur-sm border border-risk-green/15 rounded-2xl p-7 hover:border-risk-green/30 hover:shadow-[0_0_30px_rgba(0,230,118,0.06)] transition-all duration-500">
                <h4 className="text-risk-green font-semibold mb-4 text-lg">{t("withTitle")}</h4>
                <ul className="space-y-3 text-sm text-iron-400">
                  <li className="flex items-start gap-2">
                    <span className="text-risk-green/60 mt-0.5">•</span>
                    <span>{t("with1pre")}<span className="text-risk-green font-medium">{t("with1green")}</span></span>
                  </li>
                  <li className="flex items-start gap-2"><span className="text-risk-green/60 mt-0.5">•</span>{t("with2")}</li>
                  <li className="flex items-start gap-2"><span className="text-risk-green/60 mt-0.5">•</span>{t("with3")}</li>
                  <li className="flex items-start gap-2"><span className="text-risk-green/60 mt-0.5">•</span>{t("with4")}</li>
                </ul>
              </div>
            </div>

            {/* Not a Kill-Switch */}
            <div className="ir-fade ir-delay-3 mt-14 p-7 bg-surface-secondary/30 backdrop-blur-sm border border-iron-800/50 rounded-2xl max-w-3xl mx-auto text-left flex gap-5 items-start hover:border-iron-600/50 transition-all duration-500 group">
              <span className="text-3xl mt-1 ir-float">⚡</span>
              <div>
                <h5 className="text-iron-200 font-semibold mb-2 text-lg group-hover:text-risk-green transition-colors duration-300">
                  {t("notKillTitle")}
                </h5>
                <p className="text-iron-500 text-sm md:text-base leading-relaxed">
                  {t("notKillDesc")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA / Waitlist ── */}
        <section id="waitlist" className="relative z-10 py-24 px-6 border-t border-iron-800/40">
          {/* Ambient glow behind CTA */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[500px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(0,230,118,0.06)_0%,transparent_70%)]" />
          </div>

          <div className="relative max-w-3xl mx-auto text-center">
            <h2 className="ir-fade text-3xl md:text-5xl font-bold text-iron-100 mb-6 tracking-tight">
              {t("ctaTitle")}
            </h2>
            <p className="ir-fade ir-delay-1 text-iron-400 mb-4 text-lg leading-relaxed">
              {t("ctaDesc")}
            </p>
            <p className="ir-fade ir-delay-2 text-iron-200 font-medium mb-4">
              {t("ctaJoin")}
            </p>
            <p className="ir-fade ir-delay-2 text-iron-600 text-sm italic mb-10">
              {t("ctaIndie")}
            </p>

            {/* Main CTA */}
            <div className="ir-fade ir-delay-3 ir-glow rounded-2xl inline-block mt-4">
              <SimulateButton large />
            </div>

            <p className="ir-fade ir-delay-4 text-xs text-iron-600 mt-6">
              {t("ctaPrivacy")}
            </p>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="relative z-10 border-t border-iron-800/40 py-8 px-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-iron-600">
            <span>
              IRON<span className="text-iron-400">RISK</span> V2 © {new Date().getFullYear()}
            </span>
            <span>{t("footerTagline")}</span>
          </div>
        </footer>
      </main>
    </>
  );
}
