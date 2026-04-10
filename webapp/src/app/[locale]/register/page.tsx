/** Register Page */
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/useAuthStore";

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
                {error?.toLowerCase().includes("invalid beta") || error?.toLowerCase().includes("invalid_invite") ? t("errorInvalidCode") : (error || localError)}
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
