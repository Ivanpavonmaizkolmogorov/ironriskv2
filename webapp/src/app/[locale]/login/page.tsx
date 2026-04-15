/** Login Page */
"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale } from "next-intl";
import LocaleSwitcher from "@/components/ui/LocaleSwitcher";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/useAuthStore";
import { authAPI } from "@/services/api";

export default function LoginPage() {
  const router = useRouter();
  const locale = useLocale();
  const { login, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Forgot password flow
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const isEn = locale === "en";
  const searchParams = useSearchParams();
  const justVerified = searchParams.get("verified") === "true";

  useEffect(() => {
    if (isAuthenticated) router.push("/dashboard");
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login(email, password);
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

  return (
    <main className="min-h-screen flex items-center justify-center px-6 relative">
      <Link 
        href={`/${locale}`} 
        className="absolute top-6 left-6 md:top-8 md:left-8 text-sm text-iron-500 hover:text-iron-300 flex items-center gap-2 transition-colors"
      >
        <span>←</span> {isEn ? "Back to Home" : "Volver al inicio"}
      </Link>
      <div className="absolute top-6 right-6 md:top-8 md:right-8">
        <LocaleSwitcher />
      </div>
      
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-iron-100">
            IRON<span className="text-risk-green">RISK</span>
          </h1>
          <p className="text-sm text-iron-500 mt-2">
            {isEn ? "Access your risk dashboard" : "Accede a tu panel de riesgo"}
          </p>
        </div>

        {/* ═══ Forgot Password Panel ═══ */}
        {showForgot ? (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
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
                  className="text-sm text-risk-green hover:underline"
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
        ) : (
          <>
            {/* ═══ Email Verified Success Banner ═══ */}
            {justVerified && (
              <div className="bg-risk-green/10 border border-risk-green/30 rounded-xl p-4 mb-4 text-center animate-in fade-in duration-500">
                <p className="text-risk-green font-semibold text-sm">
                  {isEn ? "✓ Email verified successfully!" : "✓ ¡Email verificado correctamente!"}
                </p>
                <p className="text-iron-400 text-xs mt-1">
                  {isEn ? "You can now log in." : "Ya puedes iniciar sesión."}
                </p>
              </div>
            )}

            {/* ═══ Login Form ═══ */}
            <form onSubmit={handleSubmit} className="space-y-4">
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
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setForgotEmail(email); }}
                  className="text-xs text-iron-500 hover:text-risk-green transition-colors mt-2 ml-1"
                >
                  {isEn ? "Forgot your password?" : "¿Olvidaste la contraseña?"}
                </button>
              </div>

              {error && (
                <div className="bg-risk-red/10 border border-risk-red/30 rounded-lg p-3">
                  <p className="text-risk-red text-sm">{error}</p>
                </div>
              )}

              <Button type="submit" isLoading={isLoading} className="w-full">
                {isEn ? "Sign In" : "Iniciar Sesión"}
              </Button>
            </form>

            <p className="text-center text-sm text-iron-500 mt-6">
              {isEn ? "No account?" : "¿Sin cuenta?"}{" "}
              <Link href="/register" className="text-risk-green hover:underline">
                {isEn ? "Register" : "Regístrate"}
              </Link>
            </p>
            <div className="border-t border-iron-800/60 mt-8 pt-6 text-center">
              <p className="text-sm text-iron-400 mb-3">
                {isEn ? "Not ready to commit?" : "¿Aún no te decides?"}
              </p>
              <Link 
                href={`/${locale}/simulate`} 
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-tertiary border border-iron-700 hover:border-risk-blue/50 text-risk-blue rounded-lg text-sm font-medium transition-all hover:bg-risk-blue/10"
              >
                {isEn ? "Try the Free Simulator" : "Prueba el Simulador Gratis"} 🧠
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
