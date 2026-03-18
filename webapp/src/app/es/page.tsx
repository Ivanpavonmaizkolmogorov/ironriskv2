/** Landing Page — IronRisk V2 with Supabase waitlist.
 *  Works on Vercel — /api/waitlist runs as a serverless function.
 *  Zero server costs. Data goes to your Supabase DB.
 */
"use client";

import React, { useState } from "react";
import Image from "next/image";

export default function LandingPageES() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing" }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
        setSuccessMessage(data.message || "¡Estás en la lista!");
        setEmail("");
      } else {
        setError(data.error || "Error al enviar.");
      }
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const EmailForm = ({ id, large = false }: { id: string; large?: boolean }) => {
    if (submitted) {
      return (
        <div className={`flex items-center gap-3 justify-center ${large ? "py-4" : "py-2"}`}>
          <span className="text-risk-green text-2xl">✓</span>
          <span className="text-risk-green font-medium">
            {successMessage || "¡Estás en la lista! Te avisaremos al lanzar."}
          </span>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center" id={id}>
        <input
          type="email"
          required
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`
            bg-surface-tertiary border border-iron-700 rounded-xl
            text-iron-100 placeholder-iron-500 focus:outline-none
            focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20
            transition-colors duration-200
            ${large ? "px-6 py-4 text-base min-w-[300px]" : "px-4 py-3 text-sm min-w-[260px]"}
          `}
        />
        <button
          type="submit"
          disabled={isLoading}
          className={`
            bg-risk-green/20 text-risk-green border border-risk-green/40
            rounded-xl font-medium whitespace-nowrap
            hover:bg-risk-green/30 hover:shadow-[0_0_30px_rgba(0,230,118,0.2)]
            transition-all duration-300 disabled:opacity-50
            ${large ? "px-8 py-4 text-base" : "px-6 py-3 text-sm"}
          `}
        >
          {isLoading ? "Enviando..." : large ? "🛡️ Quiero Acceso Anticipado" : "Activar Escudo →"}
        </button>
        {error && <p className="text-risk-red text-sm mt-1">{error}</p>}
      </form>
    );
  };

  return (
    <main className="min-h-screen bg-surface-primary">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-surface-primary/80 backdrop-blur-xl border-b border-iron-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-bold text-iron-100 tracking-tight">
            IRON<span className="text-risk-green">RISK</span>
          </span>
          <div className="flex items-center gap-6">
            <div className="flex gap-2 text-sm font-medium">
              <span className="text-iron-100 cursor-default">ES</span>
              <span className="text-iron-600">/</span>
              <a href="/" className="text-iron-500 hover:text-iron-300 transition-colors">EN</a>
            </div>
            <a
              href="#waitlist"
              className="px-4 py-2 text-sm bg-risk-green/20 text-risk-green border border-risk-green/30 rounded-lg hover:bg-risk-green/30 transition-all"
            >
              Acceso Anticipado
            </a>
          </div>
        </div>
      </nav>

      {/* Hero — El Síntoma */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-risk-green/30 bg-risk-green/10 text-xs text-risk-green font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-risk-green animate-pulse" />
            Beta Cerrada Oficial
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-iron-50 leading-tight mb-6">
            No es falta de disciplina.
            <br />
            <span className="text-risk-green">Es ceguera probabilística.</span>
          </h1>
          <p className="text-lg md:text-xl text-iron-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Tu backtest ya demostró que el sistema funciona. IronRisk proyecta esa certeza
            estadística directamente sobre tu MetaTrader — para que tu cerebro deje de
            sabotear lo que tus datos ya probaron.
          </p>

          {/* Hero email capture */}
          <EmailForm id="hero-form" />

          <p className="text-sm font-medium text-iron-400 mt-6 tracking-wide">
            Tecnología de control de riesgo basada en matemática pura. Cero fe, 100% probabilidad.
          </p>
        </div>

        {/* The Shield Mockup */}
        <div className="max-w-5xl mx-auto mt-16 rounded-xl overflow-hidden border border-iron-800 shadow-[0_0_50px_rgba(0,230,118,0.1)] relative">
          <div className="absolute inset-0 bg-gradient-to-t from-surface-primary via-transparent to-transparent z-10" />
          <Image
            src="/ironrisk-shield-mockup.png"
            alt="IronRisk MT4/MT5 Shield Dashboard Mockup"
            width={1600}
            height={900}
            className="w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity duration-700"
            priority
          />
        </div>
      </section>

      {/* El Diagnóstico */}
      <section id="how" className="py-20 px-6 border-t border-iron-800">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-iron-100 text-center mb-4">
            Tu sistema es rentable. Tu biología, no.
          </h2>
          <p className="text-iron-500 text-center max-w-2xl mx-auto mb-16">
            El cortisol no entiende de varianza. Cuando ves el PnL caer en vivo, tu amígdala
            entra en modo supervivencia. Revenge trading. Saltarse reglas. Sabotaje.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: "📊",
                title: "1. Sube tu Backtest",
                desc: "Carga el CSV de tu Strategy Tester. Python calcula la distribución estadística completa de tu varianza.",
              },
              {
                icon: "🛡️",
                title: "2. Define tus Límites",
                desc: "Max Drawdown, pérdida diaria. Los umbrales que tu yo racional establece cuando el mercado está cerrado.",
              },
              {
                icon: "📡",
                title: "3. Conecta el EA",
                desc: "Pega tu API Token en el EA. IronRisk proyecta el escudo visual en tu MT4/MT5 en tiempo real.",
              },
            ].map((step, i) => (
              <div
                key={i}
                className="bg-surface-secondary border border-iron-800 rounded-xl p-6 hover:border-iron-600 transition-all group"
              >
                <span className="text-3xl mb-4 block">{step.icon}</span>
                <h3 className="text-lg font-semibold text-iron-100 mb-2">{step.title}</h3>
                <p className="text-sm text-iron-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* La Cura */}
      <section className="py-20 px-6 border-t border-iron-800 bg-surface-secondary">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-iron-100 mb-4">
            El Pacto de Ulises
          </h2>
          <p className="text-iron-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            Átate al mástil. Deja que el sistema navegue. IronRisk es el cortafuegos visual
            que impide que el ruido del mercado active tu modo supervivencia.
          </p>

          <div className="grid md:grid-cols-2 gap-6 text-left">
            <div className="bg-surface-primary border border-iron-700 rounded-xl p-6">
              <h4 className="text-risk-red font-semibold mb-3">❌ Sin IronRisk</h4>
              <ul className="space-y-2 text-sm text-iron-400">
                <li>• Ves -$800 y entras en pánico</li>
                <li>• Cierras la operación perdedora prematuramente</li>
                <li>• Abres revenge trades para &quot;recuperar&quot;</li>
                <li>• Destruyes la estadística de tu sistema</li>
              </ul>
            </div>
            <div className="bg-surface-primary border border-risk-green/20 rounded-xl p-6">
              <h4 className="text-risk-green font-semibold mb-3">✓ Con IronRisk</h4>
              <ul className="space-y-2 text-sm text-iron-400">
                <li>• Ves -$800 y el termómetro marca <span className="text-risk-green">NORMAL (1σ)</span></li>
                <li>• Sabes que tu backtest tuvo drawdowns de -$2,400</li>
                <li>• Tu cerebro recibe la señal: &quot;esto es varianza normal&quot;</li>
                <li>• Dejas que el sistema trabaje sin intervención</li>
              </ul>
            </div>
          </div>

          <div className="mt-12 p-6 bg-surface-primary border border-iron-800 rounded-xl max-w-3xl mx-auto text-left flex gap-4 items-start shadow-sm hover:border-iron-600 transition-colors">
            <span className="text-3xl mt-1">⚡</span>
            <div>
              <h5 className="text-iron-200 font-semibold mb-2 text-lg">No es un Kill-Switch</h5>
              <p className="text-iron-500 text-sm md:text-base leading-relaxed">
                IronRisk no bloquea tu pantalla ni cierra tus operaciones a la fuerza. Odiamos perder el control de la cuenta tanto como tú. Externalizamos tu mapa de riesgo visualmente para que tu corteza prefrontal tome las decisiones correctas, en frío y sin pánico.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final — Waitlist with Supabase */}
      <section id="waitlist" className="py-20 px-6 border-t border-iron-800">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-iron-100 mb-4">
            Deja de pelear contra tu biología.
          </h2>
          <p className="text-iron-500 mb-8 leading-relaxed">
            Tu sistema ya tiene edge. Solo necesitas un cortafuegos visual que lo proteja de ti mismo.
            <br /><br />
            <span className="text-iron-200 font-medium">Únete a la lista oficial y sé de los primeros en probar IronRisk Shield cuando abramos plazas para la Beta Cerrada.</span>
            <br /><br />
            <span className="text-iron-500 text-sm italic">
              IronRisk es una herramienta &apos;indie&apos;, construida por un algo-trader en su tiempo libre. Pura artesanía, sin prisas ni presiones corporativas.
            </span>
          </p>

          {/* Main email capture */}
          <EmailForm id="cta-form" large />

          <p className="text-xs text-iron-600 mt-4">
            🔒 Solo usamos tu email para notificarte el lanzamiento. Cero spam.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-iron-800 py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-iron-600">
          <span>IRON<span className="text-iron-400">RISK</span> V2 © 2026</span>
          <span>Datos fríos. Cero gurús.</span>
        </div>
      </footer>
    </main>
  );
}
