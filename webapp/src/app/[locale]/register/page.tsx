/** Register Page */
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/useAuthStore";
import { waitlistAPI } from "@/services/api";

export default function RegisterPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("landing");
  const isEn = locale === "en";
  const { register, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [localError, setLocalError] = useState("");
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.push(`/${locale}/dashboard`);
  }, [isAuthenticated, router, locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError("");

    if (password !== confirmPassword) {
      setLocalError(isEn ? "Passwords do not match" : "Las contraseñas no coinciden");
      return;
    }
    if (password.length < 6) {
      setLocalError(isEn ? "Password must be at least 6 characters" : "La contraseña debe tener mínimo 6 caracteres");
      return;
    }
    await register(email, password, inviteCode);
  };

  const handleWaitlist = async () => {
    if (!email.trim() || !email.includes("@")) return;
    setWaitlistLoading(true);
    try {
      await waitlistAPI.submit(email, "register_no_code");
      setWaitlistSubmitted(true);
    } catch {
      // Even if it fails, show success to not lose the impression
      setWaitlistSubmitted(true);
    } finally {
      setWaitlistLoading(false);
    }
  };

  const showInvalidCode = error?.toLowerCase().includes("invalid beta") || error?.toLowerCase().includes("invalid_invite");

  return (
    <main className="min-h-screen flex items-center justify-center px-6 relative">
      <Link 
        href={`/${locale}`} 
        className="absolute top-6 left-6 md:top-8 md:left-8 text-sm text-iron-500 hover:text-iron-300 flex items-center gap-2 transition-colors"
      >
        <span>←</span> {isEn ? "Back to Home" : "Volver al inicio"}
      </Link>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-iron-100">
            IRON<span className="text-risk-green">RISK</span>
          </h1>
          <p className="text-sm text-iron-500 mt-2">
            {isEn ? "Create your control tower account" : "Crea tu torre de control"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="trader@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label={t("password")}
            type="password"
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            label={isEn ? "Confirm Password" : "Confirmar Contraseña"}
            type="password"
            placeholder={t("passwordPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          
          <div className="pt-2">
            <Input
              label={t("betaCodeLabel")}
              type="text"
              placeholder={t("betaCodePlaceholder")}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="border-risk-blue/40 focus:border-risk-blue font-mono"
            />
          </div>

          {(error || localError) && (
            <div className={`border rounded-lg p-3 ${
              error?.toLowerCase().includes("already registered") || error?.toLowerCase().includes("ya registrad")
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-risk-red/10 border-risk-red/30"
            }`}>
              <p className={`text-sm ${
                error?.toLowerCase().includes("already registered") || error?.toLowerCase().includes("ya registrad")
                  ? "text-amber-400"
                  : "text-risk-red"
              }`}>
                {showInvalidCode ? t("errorInvalidCode") : (error || localError)}
              </p>
              {error?.toLowerCase().includes("already registered") && (
                <p className="text-sm text-iron-400 mt-2">
                  {isEn ? "You already have an account." : "Ya tienes una cuenta."}{" "}
                  <Link href={`/${locale}/login`} className="text-risk-green hover:underline font-medium">
                    {t("login")} →
                  </Link>
                </p>
              )}
            </div>
          )}

          {/* Waitlist CTA when invalid code */}
          {showInvalidCode && !waitlistSubmitted && email.trim() && (
            <div className="bg-risk-green/5 border border-risk-green/20 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-500">
              <p className="text-sm text-iron-300 mb-3">
                {isEn
                  ? "No code yet? Leave your email and we'll notify you when spots open up."
                  : "¿Aún no tienes código? Deja tu email y te avisamos cuando haya plazas disponibles."}
              </p>
              <button
                type="button"
                onClick={handleWaitlist}
                disabled={waitlistLoading}
                className="w-full py-2.5 px-4 bg-risk-green/15 border border-risk-green/30 text-risk-green text-sm font-semibold rounded-lg hover:bg-risk-green/25 hover:border-risk-green/50 transition-all duration-300 disabled:opacity-50"
              >
                {waitlistLoading
                  ? "..."
                  : isEn
                    ? `📩 Notify me at ${email}`
                    : `📩 Avisarme a ${email}`}
              </button>
            </div>
          )}

          {/* Success state */}
          {waitlistSubmitted && (
            <div className="bg-risk-green/10 border border-risk-green/30 rounded-xl p-4 text-center animate-in fade-in duration-500">
              <p className="text-risk-green font-semibold text-sm">
                {isEn ? "🎉 You're on the list!" : "🎉 ¡Estás en la lista!"}
              </p>
              <p className="text-iron-400 text-xs mt-1">
                {isEn
                  ? "We'll email you when new spots open. Meanwhile, try the free simulator!"
                  : "Te avisaremos cuando haya plazas. ¡Mientras, prueba el simulador gratis!"}
              </p>
              <Link
                href={`/${locale}/simulate`}
                className="inline-block mt-3 px-4 py-2 bg-risk-green text-surface-primary text-sm font-bold rounded-lg hover:shadow-[0_0_20px_rgba(0,230,118,0.3)] transition-all"
              >
                {isEn ? "Try Free Simulator →" : "Probar Simulador Gratis →"}
              </Link>
            </div>
          )}

          <Button type="submit" isLoading={isLoading} className="w-full mt-2">
            {t("register")}
          </Button>

          <p className="text-xs text-iron-400 mt-4 text-center leading-relaxed px-2">
            {t("betaNoCodeMsg")}
          </p>
        </form>

        <p className="text-center text-sm text-iron-500 mt-6">
          {isEn ? "Already have an account?" : "¿Ya tienes una cuenta?"}{" "}
          <Link href={`/${locale}/login`} className="text-risk-green hover:underline">
            {t("login")}
          </Link>
        </p>
      </div>
    </main>
  );
}
