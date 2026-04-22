"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { waitlistAPI, authAPI } from "@/services/api";
import api from "@/services/api";

type AuthFormProps = {
  mode: "login" | "register";
  onSuccess?: () => void;
  className?: string;
  defaultEmail?: string;
};

export default function AuthForm({ mode, onSuccess, className = "", defaultEmail = "" }: AuthFormProps) {
  const locale = useLocale();
  const isEn = locale === "en";

  const { login, isAuthenticated, isLoading, error: authError, clearError } = useAuthStore();
  const { fetchSettings } = useSettingsStore();

  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [motivation, setMotivation] = useState("");
  const [localError, setLocalError] = useState("");

  // Waitlist state
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistAlready, setWaitlistAlready] = useState(false);

  // Forgot Password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // When auth changes externally, notify parent (login mode only)
  useEffect(() => {
    if (isAuthenticated && onSuccess && mode === "login") {
      onSuccess();
    }
  }, [isAuthenticated, onSuccess, mode]);

  const handleWaitlistSubmit = async () => {
    if (!email.trim() || !email.includes("@")) {
      setLocalError(isEn ? "Enter a valid email." : "Introduce un email válido.");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError(isEn ? "Passwords do not match." : "Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 6) {
      setLocalError(isEn ? "Password must be at least 6 characters." : "La contraseña debe tener mínimo 6 caracteres.");
      return;
    }

    setWaitlistLoading(true);
    setLocalError("");
    try {
      const res = await waitlistAPI.submit(email.trim().toLowerCase(), "register", locale, motivation, password);
      setWaitlistSubmitted(true);
      setWaitlistAlready(res.data?.already_registered || false);
    } catch {
      // Show success regardless to avoid email enumeration leaks
      setWaitlistSubmitted(true);
    } finally {
      setWaitlistLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError("");

    if (mode === "register") {
      await handleWaitlistSubmit();
    } else {
      await login(email, password);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError(null);
    try {
      await authAPI.forgotPassword(forgotEmail, locale);
      setForgotSent(true);
    } catch (err: any) {
      setForgotError(err.response?.data?.detail || (isEn ? "Failed to send recovery email." : "Error al enviar el correo."));
    } finally {
      setForgotLoading(false);
    }
  };

  const currentError = authError || localError;

  /** Forgot Password Panel */
  if (showForgot && mode === "login") {
    return (
      <div className={`animate-in fade-in slide-in-from-top-2 duration-300 ${className}`}>
        {forgotSent ? (
          <div className="bg-risk-green/10 border border-risk-green/30 rounded-xl p-6 text-center">
            <div className="text-3xl mb-3">📧</div>
            <h3 className="text-lg font-bold text-risk-green mb-2">
              {isEn ? "Recovery Email Sent" : "Correo de Recuperación Enviado"}
            </h3>
            <p className="text-sm text-iron-400 mb-4">
              {isEn
                ? "If an account exists with that email, you'll receive a reset link shortly."
                : "Si existe una cuenta con ese correo, recibirás un enlace de restablecimiento en breve."
              }
            </p>
            <div className="bg-risk-yellow/10 border border-risk-yellow/20 rounded-lg px-4 py-2.5 text-xs text-risk-yellow mt-2">
              ⚠️ {isEn
                ? "Important: Check your spam/junk folder if you don't see the email within a few minutes."
                : "Importante: Revisa tu carpeta de spam/correo no deseado si no ves el email en unos minutos."
              }
            </div>
            <button
              onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(""); }}
              className="text-sm text-risk-green hover:underline mt-4 inline-block"
            >
              {isEn ? "Back to Login" : "Volver al Login"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <p className="text-sm text-iron-400 mb-2">
              {isEn
                ? "Enter your email and we'll send you a secure link to reset your password."
                : "Introduce tu email y te enviaremos un enlace seguro para restablecer tu contraseña."
              }
            </p>
            <Input
              label="Email"
              type="email"
              placeholder="trader@example.com"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              required
            />
            {forgotError && (
              <div className="bg-risk-red/10 border border-risk-red/30 rounded-lg p-3">
                <p className="text-risk-red text-sm">{forgotError}</p>
              </div>
            )}
            <Button type="submit" isLoading={forgotLoading} className="w-full">
              {isEn ? "Send Recovery Link" : "Enviar Enlace de Recuperación"}
            </Button>
            <button
              type="button"
              onClick={() => { setShowForgot(false); setForgotError(null); }}
              className="block w-full text-center text-sm text-iron-500 hover:text-iron-300 transition-colors mt-2"
            >
              {isEn ? "Back to Login" : "Volver al Login"}
            </button>
          </form>
        )}
      </div>
    );
  }

  /** Waitlist success screen */
  if (waitlistSubmitted && mode === "register") {
    return (
      <div className={`animate-in fade-in zoom-in-95 duration-500 ${className}`}>
        <div className="bg-risk-green/10 border border-risk-green/30 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">{waitlistAlready ? "👋" : "🛡️"}</div>
          <h3 className="text-lg font-bold text-risk-green mb-2">
            {waitlistAlready
              ? (isEn ? "You're already on the list!" : "¡Ya estás en la lista!")
              : (isEn ? "You're in the queue." : "Estás en la cola.")}
          </h3>
          <p className="text-sm text-iron-400 leading-relaxed">
            {waitlistAlready
              ? (isEn
                  ? "We already have your request. We'll email you when your spot is ready."
                  : "Ya tenemos tu solicitud. Te avisamos cuando tu plaza esté lista.")
              : (isEn
                  ? "We'll email you when your access is activated. No action needed on your end."
                  : "Te avisaremos por email cuando tu acceso esté activado. No tienes que hacer nada más.")}
          </p>
          <p className="text-xs text-iron-600 mt-3">
            {isEn ? "Check spam if you don't receive it." : "Revisa spam si no lo recibes."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
      <Input
        label="Email"
        type="email"
        placeholder="trader@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <div>
        <Input
          label={isEn ? "Password" : "Contraseña"}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {mode === "login" && (
           <button
             type="button"
             onClick={() => { setShowForgot(true); setForgotEmail(email); }}
             className="text-xs text-iron-500 hover:text-risk-green transition-colors mt-2 ml-1"
           >
             {isEn ? "Forgot your password?" : "¿Olvidaste la contraseña?"}
           </button>
        )}
      </div>

      {mode === "register" && (
        <>
          <Input
            label={isEn ? "Confirm Password" : "Confirmar Contraseña"}
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {/* Optional motivation field */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-iron-400">
              {isEn ? "What brought you here?" : "¿Qué te trajo aquí?"}
              <span className="ml-1 text-iron-600 font-normal text-xs">
                {isEn ? "(optional)" : "(opcional)"}
              </span>
            </label>
            
            <div className="flex flex-wrap gap-2">
              {(isEn 
                ? ["Trade Funded Accounts", "Control my Drawdowns", "Automate Risk Management"]
                : ["Operar Cuentas Fondeadas", "Controlar mis Drawdowns", "Gestión de Riesgo Auto."]
              ).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    if (motivation.includes(opt)) {
                      setMotivation(motivation.replace(opt, "").replace(/\|\s*\|/g, "|").replace(/^\|\s*|\s*\|$/g, "").trim());
                    } else {
                      setMotivation(motivation ? `${motivation} | ${opt}` : opt);
                    }
                  }}
                  className={`px-3 py-1 text-xs rounded-full border transition-all ${
                    motivation.includes(opt)
                      ? "bg-risk-green/20 border-risk-green/50 text-risk-green"
                      : "bg-surface-primary border-iron-800/50 text-iron-400 hover:border-iron-600/50"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>

            <textarea
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder={isEn
                ? "e.g. I keep blowing funded accounts during drawdowns (or more details)..."
                : "ej: Sigo quemando cuentas fondeadas en los drawdowns (o más detalles)..."}
              rows={2}
              className="w-full bg-surface-primary border border-iron-800/50 rounded-md px-3 py-2 text-sm text-iron-200 placeholder:text-iron-600 focus:outline-none focus:border-risk-green/50 resize-none transition-colors"
            />
          </div>
        </>
      )}

      {currentError && (
        <div className={`border rounded-lg p-3 ${
          currentError.toLowerCase().includes("already registered") || currentError.toLowerCase().includes("ya registrad")
            ? "bg-amber-500/10 border-amber-500/30"
            : "bg-risk-red/10 border-risk-red/30"
        }`}>
          <p className={`text-sm ${
            currentError.toLowerCase().includes("already registered") || currentError.toLowerCase().includes("ya registrad")
              ? "text-amber-400"
              : "text-risk-red"
          }`}>
            {currentError}
          </p>
          {mode === "register" && currentError.toLowerCase().includes("already registered") && (
            <p className="text-sm text-iron-400 mt-2">
              {isEn ? "You already have an account." : "Ya tienes una cuenta."}{" "}
              <Link href={`/${locale}/login`} className="text-risk-green hover:underline font-medium">
                {isEn ? "Login →" : "Iniciar sesión →"}
              </Link>
            </p>
          )}
        </div>
      )}

      <Button
        type="submit"
        isLoading={isLoading || waitlistLoading}
        className="w-full text-lg shadow-[0_0_25px_rgba(0,230,118,0.25)]"
      >
        {mode === "login"
          ? (isEn ? "Sign In" : "Iniciar Sesión")
          : (isEn ? "Join the waitlist →" : "Unirme a la lista →")}
      </Button>
    </form>
  );
}
