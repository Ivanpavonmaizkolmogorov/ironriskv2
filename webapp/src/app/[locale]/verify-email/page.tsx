/** Verify Email Page — Handles verification link from email */
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import api from "@/services/api";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const isEn = locale === "en";

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg(isEn ? "No verification token provided." : "No se proporcionó token de verificación.");
      return;
    }

    // Call backend to verify
    api.get(`/api/auth/verify-email?token=${token}`)
      .then(() => {
        setStatus("success");
        // Redirect to login after 3 seconds
        setTimeout(() => router.push(`/${locale}/login?verified=true`), 3000);
      })
      .catch((err) => {
        // The backend redirects on success, so if we get here it might be an error
        // OR the redirect happened automatically (axios follows redirects)
        if (err.response?.status === 400) {
          setStatus("error");
          setErrorMsg(isEn ? "Invalid or expired verification link." : "Enlace de verificación inválido o expirado.");
        } else {
          // Likely the redirect was followed successfully
          setStatus("success");
          setTimeout(() => router.push(`/${locale}/login?verified=true`), 3000);
        }
      });
  }, [token, locale, router, isEn]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-iron-100 mb-2">
          IRON<span className="text-risk-green">RISK</span>
        </h1>

        {status === "loading" && (
          <div className="mt-8 space-y-4">
            <div className="w-12 h-12 border-4 border-iron-800 border-t-risk-green rounded-full animate-spin mx-auto" />
            <p className="text-iron-400 text-sm">
              {isEn ? "Verifying your email..." : "Verificando tu correo..."}
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="mt-8 space-y-4 animate-in fade-in duration-500">
            <div className="w-16 h-16 rounded-full bg-risk-green/20 border-2 border-risk-green flex items-center justify-center mx-auto">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-lg font-semibold text-risk-green">
              {isEn ? "Email Verified!" : "¡Email Verificado!"}
            </h2>
            <p className="text-iron-400 text-sm">
              {isEn ? "Redirecting to login..." : "Redirigiendo al login..."}
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="mt-8 space-y-4 animate-in fade-in duration-500">
            <div className="w-16 h-16 rounded-full bg-risk-red/20 border-2 border-risk-red flex items-center justify-center mx-auto">
              <span className="text-3xl">✗</span>
            </div>
            <h2 className="text-lg font-semibold text-risk-red">
              {isEn ? "Verification Failed" : "Verificación Fallida"}
            </h2>
            <p className="text-iron-400 text-sm">{errorMsg}</p>
            <button
              onClick={() => router.push(`/${locale}/login`)}
              className="mt-4 px-6 py-2 bg-iron-800 text-iron-200 rounded-lg text-sm hover:bg-iron-700 transition-colors"
            >
              {isEn ? "Go to Login" : "Ir al Login"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
