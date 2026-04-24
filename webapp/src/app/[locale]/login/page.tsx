/** Login Page */
"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale } from "next-intl";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import AuthForm from "@/components/features/auth/AuthForm";
import { useAuthStore } from "@/store/useAuthStore";

export default function LoginPage() {
  const router = useRouter();
  const locale = useLocale();
  const { isAuthenticated } = useAuthStore();
  const isEn = locale === "en";
  const searchParams = useSearchParams();
  const justVerified = searchParams.get("verified") === "true";

  return (
    <main className="min-h-screen flex items-center justify-center px-6 relative">
      <Link 
        href={`/${locale}`} 
        className="absolute top-6 left-6 md:top-8 md:left-8 text-sm text-iron-500 hover:text-iron-300 flex items-center gap-2 transition-colors"
      >
        <span>←</span> {isEn ? "Back to Home" : "Volver al inicio"}
      </Link>
      <div className="absolute top-6 right-6 md:top-8 md:right-8">
        <LanguageSwitcher />
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

        <AuthForm mode="login" onSuccess={() => router.push(`/${locale}/dashboard`)} />

            <p className="text-center text-sm text-iron-500 mt-6">
              {isEn ? "No account?" : "¿Sin cuenta?"}{" "}
              <Link href={`/${locale}/register`} className="text-risk-green hover:underline">
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
      </div>
    </main>
  );
}
