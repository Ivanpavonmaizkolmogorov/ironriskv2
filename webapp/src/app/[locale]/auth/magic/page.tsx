"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "@/i18n/routing";
import api from "@/services/api";

export default function MagicPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const isEn = locale === "en";
  const { loadUser } = useAuthStore();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg(isEn ? "No token found in the link." : "Token no encontrado en el enlace.");
      return;
    }

    api
      .post("/api/auth/magic", { token })
      .then(async (res) => {
        const accessToken = res.data?.access_token;
        if (!accessToken) throw new Error("No token in response");
        // Store JWT
        localStorage.setItem("ironrisk_jwt", accessToken);
        // Hydrate auth store
        await loadUser();
        router.replace("/dashboard");
      })
      .catch((err) => {
        const detail = err?.response?.data?.detail || err?.message || (isEn ? "Unknown error." : "Error desconocido.");
        setErrorMsg(detail);
        setStatus("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-surface-primary flex flex-col items-center justify-center gap-6">
        <div className="w-12 h-12 border-4 border-iron-800 border-t-risk-green rounded-full animate-spin shadow-[0_0_15px_rgba(0,230,118,0.4)]" />
        <p className="text-iron-400 text-sm font-mono">
          {isEn ? "Activating access..." : "Activando acceso..."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-primary flex flex-col items-center justify-center gap-6 px-4">
      <div className="max-w-md w-full bg-surface-secondary border border-red-500/30 rounded-2xl p-8 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-red-400 mb-3">
          {isEn ? "Invalid link" : "Enlace no válido"}
        </h1>
        <p className="text-sm text-iron-400 leading-relaxed mb-6">{errorMsg}</p>
        <a
          href={`/${locale}/register`}
          className="inline-block px-6 py-2.5 bg-risk-green/15 border border-risk-green/30 text-risk-green text-sm font-semibold rounded-lg hover:bg-risk-green/25 transition-colors"
        >
          {isEn ? "← Back to register" : "← Volver al registro"}
        </a>
      </div>
    </div>
  );
}
