/** Reset Password Page — validates JWT token and allows new password entry. */
"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { authAPI } from "@/services/api";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const locale = useLocale();
  const router = useRouter();

  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isEn = locale === "en";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError(isEn ? "Password must be at least 6 characters." : "La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(isEn ? "Passwords do not match." : "Las contraseñas no coinciden.");
      return;
    }
    if (!token) {
      setError(isEn ? "Invalid reset link." : "Enlace de restablecimiento inválido.");
      return;
    }

    setIsLoading(true);
    try {
      await authAPI.resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || (isEn ? "Failed to reset password. The link may have expired." : "Error al restablecer. El enlace puede haber caducado."));
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-iron-100 mb-4">
            IRON<span className="text-risk-green">RISK</span>
          </h1>
          <p className="text-iron-400">
            {isEn ? "Invalid or missing reset token." : "Token de restablecimiento inválido o ausente."}
          </p>
          <button
            onClick={() => router.push(`/${locale}/login`)}
            className="mt-6 text-risk-green hover:underline text-sm"
          >
            {isEn ? "Back to Login" : "Volver al Login"}
          </button>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-iron-100 mb-2">
            IRON<span className="text-risk-green">RISK</span>
          </h1>
          <div className="mt-8 bg-risk-green/10 border border-risk-green/30 rounded-xl p-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-lg font-bold text-risk-green mb-2">
              {isEn ? "Password Reset Successfully" : "Contraseña Restablecida"}
            </h2>
            <p className="text-sm text-iron-400 mb-4">
              {isEn
                ? "Your new password is active. You can now log in."
                : "Tu nueva contraseña está activa. Ya puedes iniciar sesión."
              }
            </p>
            <button
              onClick={() => router.push(`/${locale}/login`)}
              className="bg-risk-green text-surface-primary font-bold px-8 py-3 rounded-xl hover:brightness-110 transition-all shadow-[0_0_15px_rgba(0,230,118,0.2)]"
            >
              {isEn ? "Go to Login" : "Ir al Login"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-iron-100">
            IRON<span className="text-risk-green">RISK</span>
          </h1>
          <p className="text-sm text-iron-500 mt-2">
            {isEn ? "Set your new password" : "Establece tu nueva contraseña"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-iron-400">
              {isEn ? "New Password" : "Nueva Contraseña"}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-surface-tertiary border border-iron-700 rounded-lg px-4 py-2.5 text-sm text-iron-100 placeholder-iron-500 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-iron-400">
              {isEn ? "Confirm Password" : "Confirmar Contraseña"}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-surface-tertiary border border-iron-700 rounded-lg px-4 py-2.5 text-sm text-iron-100 placeholder-iron-500 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-colors"
            />
          </div>

          {error && (
            <div className="bg-risk-red/10 border border-risk-red/30 rounded-lg p-3">
              <p className="text-risk-red text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-risk-green text-surface-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(0,230,118,0.2)]"
          >
            {isLoading
              ? (isEn ? "Resetting..." : "Restableciendo...")
              : (isEn ? "Reset Password" : "Restablecer Contraseña")
            }
          </button>
        </form>

        <p className="text-center text-sm text-iron-500 mt-6">
          <button
            onClick={() => router.push(`/${locale}/login`)}
            className="text-risk-green hover:underline"
          >
            {isEn ? "Back to Login" : "Volver al Login"}
          </button>
        </p>
      </div>
    </main>
  );
}
