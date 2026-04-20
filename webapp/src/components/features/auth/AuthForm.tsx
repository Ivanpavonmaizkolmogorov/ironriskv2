"use client";

import React, { useState, useEffect } from "react";
import { QRCodeSVG } from 'qrcode.react';
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

  const { login, register, isAuthenticated, isLoading, error: authError, clearError } = useAuthStore();
  const { adminTelegramHandle, fetchSettings } = useSettingsStore();

  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [localError, setLocalError] = useState("");

  // Waitlist state
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistAlready, setWaitlistAlready] = useState(false);
  const [motivation, setMotivation] = useState("");
  const [showTelegramQR, setShowTelegramQR] = useState(false);

  // Forgot Password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  
  // High level loading for combined flows (eg: Register -> Create Workspace)
  const [isProcessing, setIsProcessing] = useState(false);
  const displayLoading = isLoading || isProcessing;

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // When auth changes externally, notify parent
  useEffect(() => {
    if (isAuthenticated && onSuccess) {
      onSuccess();
    }
  }, [isAuthenticated, onSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError("");

    if (mode === "register") {
      if (password !== confirmPassword) {
        setLocalError(isEn ? "Passwords do not match" : "Las contraseñas no coinciden");
        return;
      }
      if (password.length < 6) {
        setLocalError(isEn ? "Password must be at least 6 characters" : "La contraseña debe tener mínimo 6 caracteres");
        return;
      }
      if (!workspaceName.trim()) {
         setLocalError(isEn ? "Workspace Name is required" : "El Nombre de Workspace es requerido");
         return;
      }

      setIsProcessing(true);
      try {
        await register(email, password, inviteCode);
        const currentError = useAuthStore.getState().error;
        if (currentError) throw new Error(currentError);
        
        // Auto create Workspace
        try {
          await api.post('/api/trading-accounts/', {
            name: workspaceName,
            account_number: "000000",
            broker: ""
          });
        } catch (accountErr) {
           console.error("Failed to auto-create workspace:", accountErr);
           // proceed anyway, they are registered.
        }

        if (onSuccess) onSuccess();
      } catch (err) {
        // Error is already mapped in authStore if it failed in register
      } finally {
        setIsProcessing(false);
      }

    } else {
      // Login Mode
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

  const handleWaitlist = async () => {
    if (!email.trim() || !email.includes("@")) return;
    setWaitlistLoading(true);
    try {
      const res = await waitlistAPI.submit(email, "register_no_code", locale, motivation);
      setWaitlistSubmitted(true);
      setWaitlistAlready(res.data?.already_registered || false);
    } catch {
      // Even if it fails, show success to not lose the impression
      setWaitlistSubmitted(true);
    } finally {
      setWaitlistLoading(false);
    }
  };

  const currentError = authError || localError;
  const showInvalidCode = mode === "register" && (currentError?.toLowerCase().includes("invalid beta") || currentError?.toLowerCase().includes("invalid_invite") || currentError?.toLowerCase().includes("incorrecto") || currentError?.toLowerCase().includes("caducado"));

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
          <div className="pt-2 border-t border-iron-800 border-dashed mt-4 mb-2" />
          <Input
             label={isEn 
               ? "Workspace Name (Identifies your real trading account)" 
               : "Nombre del Workspace (Identifica tu cuenta real de trading)"}
             type="text"
             placeholder={isEn ? "e.g. Funded 100k Phase 1" : "ej. Fondeada 100k Fase 1"}
             value={workspaceName}
             onChange={(e) => setWorkspaceName(e.target.value)}
             required
          />
          <div className="pt-2">
            <Input
              label={isEn ? "🔑 Beta Access Code" : "🔑 Código de Acceso Beta"}
              type="password"
              placeholder={isEn ? "Enter your code" : "Introduce tu código"}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="border-risk-blue/40 focus:border-risk-blue font-mono"
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
            {showInvalidCode 
              ? (isEn ? "Invalid beta access code." : "Código de acceso beta inválido.") 
              : currentError}
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

      {/* Waitlist CTA when invalid code */}
      {showInvalidCode && !waitlistSubmitted && email.trim() && (
        <div className="bg-surface-secondary border border-risk-green/30 rounded-xl p-5 animate-in fade-in slide-in-from-top-2 duration-500 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 w-32 h-32 bg-risk-green/5 blur-[50px] rounded-full pointer-events-none" />
          <div className="relative z-10">
            <p className="text-sm font-bold text-iron-100 mb-1">
              {isEn ? "Join the Private Waitlist" : "Únete a la Lista de Espera Privada"}
            </p>
            <p className="text-xs text-iron-400 mb-4 leading-relaxed">
              {isEn
                ? "IronRisk is currently in closed beta. We release a very limited number of spots every week to ensure stability."
                : "IronRisk está en beta cerrada. Liberamos una cantidad muy reducida de plazas semanalmente para garantizar la estabilidad."}
            </p>

            <div className="flex flex-col gap-1.5 mb-4">
              <label className="text-[13px] font-semibold text-iron-200">
                {isEn 
                  ? "What problem are you looking to solve?" 
                  : "¿Qué problema buscas resolver?"}
                <span className="text-risk-green ml-1 font-normal italic">
                  {isEn ? "(Detailed answers get priority access 🚀)" : "(Las respuestas detalladas tienen prioridad 🚀)"}
                </span>
              </label>
              <textarea
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
                placeholder={isEn 
                  ? "E.g.: I keep blowing evaluation accounts during drawdowns and I need to calculate my true survival probabilities..." 
                  : "Ej: Sigo quemando cuentas de fondeo durante los drawdowns y necesito calcular mis probabilidades de supervivencia..."}
                rows={3}
                className="w-full bg-surface-primary border border-iron-700/80 rounded-lg px-3 py-2 text-[13px] text-iron-200 placeholder:text-iron-600 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 resize-none transition-all shadow-inner"
              />
            </div>
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
        </div>
      )}

      {/* Waitlist Success state */}
      {waitlistSubmitted && mode === "register" && (
        <div className="bg-risk-green/10 border border-risk-green/30 rounded-xl p-4 text-center animate-in fade-in duration-500">
          <p className="text-risk-green font-semibold text-sm">
            {waitlistAlready
              ? (isEn ? "👋 You're already on the list!" : "👋 ¡Ya estás en la lista!")
              : (isEn ? "🎉 You're on the list!" : "🎉 ¡Estás en la lista!")}
          </p>
          <p className="text-iron-300 text-xs mt-2 mb-3">
            {isEn
              ? "We'll email you when new spots open. Want to skip the line? Ask for a code directly!"
              : "Te avisaremos cuando haya plazas. ¿Quieres saltarte la fila? ¡Pídenos un código!"}
          </p>
          
          <button type="button" onClick={() => setShowTelegramQR(!showTelegramQR)} className="text-[#29B6F6] text-xs hover:text-[#4FC3F7] font-semibold underline underline-offset-2 transition-colors mb-3">
            {isEn ? "💬 Request code via Telegram" : "💬 Pedir código por Telegram"}
          </button>

          {showTelegramQR && (
            <div className="flex flex-col items-center gap-3 p-4 bg-surface-secondary border border-iron-800 rounded-xl mb-4 mx-auto w-fit animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-white p-2 rounded-lg">
                <QRCodeSVG
                  value={`https://t.me/${adminTelegramHandle.replace('@', '')}`}
                  size={120}
                  bgColor="#ffffff"
                  fgColor="#0a0a0a"
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-bold text-iron-100">{adminTelegramHandle}</span>
                <span className="text-[10px] text-iron-400">
                  {isEn ? 'Scan with your phone' : 'Escanea con tu móvil'}
                </span>
              </div>
              <a
                href={`https://t.me/${adminTelegramHandle.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#29B6F6] hover:text-[#4FC3F7] underline underline-offset-2"
              >
                {isEn ? 'Or open directly →' : 'O abrir directo →'}
              </a>
            </div>
          )}
        </div>
      )}

      <Button type="submit" isLoading={displayLoading} className="w-full text-lg shadow-[0_0_25px_rgba(0,230,118,0.25)]">
        {mode === "login" 
          ? (isEn ? "Sign In" : "Iniciar Sesión")
          : (isEn ? "Create Account & Enter" : "Crear Cuenta Gratis y Entrar →")}
      </Button>
    </form>
  );
}
