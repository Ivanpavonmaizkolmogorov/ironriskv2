/** Landing Page — IronRisk V2 (English Version) with Supabase waitlist.
 *  Works on Vercel — /api/waitlist runs as a serverless function.
 *  Zero server costs. Data goes to your Supabase DB.
 */
"use client";

import React, { useState } from "react";
import Image from "next/image";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
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
        // Use 'landing-en' to track the source of the lead
        body: JSON.stringify({ email, source: "landing-en" }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
        setIsDuplicate(res.status === 200);
        setSuccessMessage(data.message || "You're on the list! We'll notify you when we launch.");
        setEmail("");
      } else {
        setError(data.error || "Error submitting. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const EmailForm = ({ id, large = false }: { id: string; large?: boolean }) => {
    if (submitted) {
      return (
        <div className={`flex items-center gap-3 justify-center ${large ? "py-4" : "py-2"}`}>
          <span className={`text-2xl ${isDuplicate ? "text-amber-400" : "text-risk-green"}`}>
            {isDuplicate ? "⚠" : "✓"}
          </span>
          <span className={`font-medium ${isDuplicate ? "text-amber-400" : "text-risk-green"}`}>
            {successMessage}
          </span>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center" id={id}>
        <input
          type="email"
          required
          placeholder="you@email.com"
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
          {isLoading ? "Sending..." : large ? "🚀 Get Early Access" : "Join Waitlist →"}
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
              <a href="/es" className="text-iron-500 hover:text-iron-300 transition-colors">ES</a>
              <span className="text-iron-600">/</span>
              <span className="text-iron-100 cursor-default">EN</span>
            </div>
            <a
              href="#waitlist"
              className="px-4 py-2 text-sm bg-risk-green/20 text-risk-green border border-risk-green/30 rounded-lg hover:bg-risk-green/30 transition-all"
            >
              Early Access
            </a>
          </div>
        </div>
      </nav>

      {/* Hero — The Symptom */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-risk-green/30 bg-risk-green/10 text-xs text-risk-green font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-risk-green animate-pulse" />
            Official Closed Beta
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-iron-50 leading-tight mb-6">
            It&apos;s not lack of discipline.
            <br />
            <span className="text-risk-green">It&apos;s probabilistic blindness.</span>
          </h1>
          <p className="text-lg md:text-xl text-iron-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Your backtest already proved the system works. IronRisk projects that statistical
            certainty directly onto your MetaTrader — so your brain stops sabotaging what
            your data has already proven.
          </p>

          {/* Hero email capture */}
          <EmailForm id="hero-form" />

          <p className="text-sm font-medium text-iron-400 mt-6 tracking-wide">
            Risk control technology based on pure mathematics. Zero faith, 100% probability.
          </p>
        </div>

        {/* The Shield Mockup */}
        <div className="max-w-5xl mx-auto mt-16 rounded-xl overflow-hidden border border-iron-800 shadow-[0_0_50px_rgba(0,230,118,0.1)] relative">
          <div className="absolute inset-0 bg-gradient-to-t from-surface-primary via-transparent to-transparent z-10" />
          <Image
            src="/ironrisk-shield-mockup.png"
            alt="IronRisk MT4/MT5 Dashboard Mockup"
            width={1600}
            height={900}
            className="w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity duration-700"
            priority
          />
        </div>
      </section>

      {/* The Diagnosis */}
      <section id="how" className="py-20 px-6 border-t border-iron-800">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-iron-100 text-center mb-4">
            Your system is profitable. Your biology isn&apos;t.
          </h2>
          <p className="text-iron-500 text-center max-w-2xl mx-auto mb-16">
            Cortisol doesn&apos;t understand variance. When you see your PnL drop live, your amygdala
            enters survival mode. Revenge trading. Rule breaking. Sabotage.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: "📊",
                title: "1. Upload Your Backtest",
                desc: "Upload your Strategy Tester CSV. Python computes the complete statistical distribution of your variance.",
              },
              {
                icon: "🛡️",
                title: "2. Define Your Limits",
                desc: "Max Drawdown, daily loss. The thresholds your rational self sets when the market is closed.",
              },
              {
                icon: "📡",
                title: "3. Connect the EA",
                desc: "Paste your API Token into the EA. IronRisk projects the visual shield onto your MT4/MT5 in real-time.",
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

      {/* The Cure */}
      <section className="py-20 px-6 border-t border-iron-800 bg-surface-secondary">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-iron-100 mb-4">
            The Ulysses Pact
          </h2>
          <p className="text-iron-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            Tie yourself to the mast. Let the system navigate. IronRisk is the visual firewall
            that prevents market noise from triggering your survival mode.
          </p>

          <div className="grid md:grid-cols-2 gap-6 text-left">
            <div className="bg-surface-primary border border-iron-700 rounded-xl p-6">
              <h4 className="text-risk-red font-semibold mb-3">❌ Without IronRisk</h4>
              <ul className="space-y-2 text-sm text-iron-400">
                <li>• You see -$800 and panic</li>
                <li>• You close the losing trade prematurely</li>
                <li>• You open revenge trades to &quot;recover&quot;</li>
                <li>• You destroy your system&apos;s statistical edge</li>
              </ul>
            </div>
            <div className="bg-surface-primary border border-risk-green/20 rounded-xl p-6">
              <h4 className="text-risk-green font-semibold mb-3">✓ With IronRisk</h4>
              <ul className="space-y-2 text-sm text-iron-400">
                <li>• You see -$800 and the thermometer shows <span className="text-risk-green">NORMAL (1σ)</span></li>
                <li>• You know your backtest had drawdowns of -$2,400</li>
                <li>• Your brain receives the signal: &quot;this is normal variance&quot;</li>
                <li>• You let the system work without intervention</li>
              </ul>
            </div>
          </div>

          <div className="mt-12 p-6 bg-surface-primary border border-iron-800 rounded-xl max-w-3xl mx-auto text-left flex gap-4 items-start shadow-sm hover:border-iron-600 transition-colors">
            <span className="text-3xl mt-1">⚡</span>
            <div>
              <h5 className="text-iron-200 font-semibold mb-2 text-lg">Not a Kill-Switch</h5>
              <p className="text-iron-500 text-sm md:text-base leading-relaxed">
                IronRisk does not lock your screen or force-close your trades. We hate losing control of the account just as much as you do. We externalize your risk map visually so your prefrontal cortex can make the right decisions, calmly and without panic.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final — Waitlist with Supabase */}
      <section id="waitlist" className="py-20 px-6 border-t border-iron-800">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-iron-100 mb-4">
            Stop fighting your biology.
          </h2>
          <p className="text-iron-500 mb-8 leading-relaxed">
            Your system already has an edge. You just need a visual firewall to protect it from yourself.
            <br /><br />
            <span className="text-iron-200 font-medium">Join the official waitlist and be among the first to test IronRisk when Closed Beta spots open.</span>
            <br /><br />
            <span className="text-iron-500 text-sm italic">
              IronRisk is an &apos;indie&apos; tool, built by an algo-trader in his spare time. Pure craftsmanship, no rush, no corporate pressure.
            </span>
          </p>

          {/* Main email capture */}
          <EmailForm id="cta-form" large />

          <p className="text-xs text-iron-600 mt-4">
            🔒 We only use your email to notify you of the launch. Zero spam.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-iron-800 py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-iron-600">
          <span>IRON<span className="text-iron-400">RISK</span> V2 © 2026</span>
          <span>Cold data. Zero gurus.</span>
        </div>
      </footer>
    </main>
  );
}
