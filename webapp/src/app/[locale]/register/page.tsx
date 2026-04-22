/** Register Page */
"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import LocaleSwitcher from "@/components/ui/LocaleSwitcher";
import AuthForm from "@/components/features/auth/AuthForm";
import { useAuthStore } from "@/store/useAuthStore";

export default function RegisterPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("landing");
  const { isAuthenticated } = useAuthStore();
  const isEn = locale === "en";

  useEffect(() => {
    if (isAuthenticated) router.push(`/${locale}/dashboard`);
  }, [isAuthenticated, router, locale]);

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
            {isEn ? "Request early access" : "Solicita acceso anticipado"}
          </p>
        </div>

        <AuthForm mode="register" />


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
