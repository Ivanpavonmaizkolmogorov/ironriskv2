"use client";

import React, { useState } from "react";
import { useLocale } from "next-intl";
import api from "@/services/api";

interface EmailVerificationBannerProps {
  userEmail: string;
  onVerified?: () => void;
}

export default function EmailVerificationBanner({ userEmail, onVerified }: EmailVerificationBannerProps) {
  const locale = useLocale();
  const isEn = locale === "en";
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleResend = async () => {
    setResending(true);
    try {
      await api.post("/api/auth/resend-verification");
      setResent(true);
    } catch {
      // Silent fail
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between gap-3 animate-in fade-in duration-500">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-amber-400 text-sm shrink-0">📧</span>
        <p className="text-xs text-amber-300/90 truncate">
          {isEn
            ? `Verify your email (${userEmail}) to unlock all features.`
            : `Verifica tu email (${userEmail}) para desbloquear todas las funciones.`}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {resent ? (
          <span className="text-[10px] text-risk-green font-medium">
            {isEn ? "Sent! ✓" : "¡Enviado! ✓"}
          </span>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded px-2 py-1 hover:bg-amber-500/10 transition-all disabled:opacity-50"
          >
            {resending
              ? "..."
              : isEn ? "Resend" : "Reenviar"}
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="text-iron-600 hover:text-iron-400 transition-colors text-sm leading-none"
          title={isEn ? "Dismiss" : "Cerrar"}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
