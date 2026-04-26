"use client";

import React from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Eye, X } from "lucide-react";

/**
 * Red banner that appears at the top of every page when an admin is
 * impersonating another user. Shows who is being viewed and a button
 * to switch back to the admin account.
 */
export default function ImpersonateBanner() {
  const { isImpersonating, impersonatingEmail, stopImpersonating } = useAuthStore();

  if (!isImpersonating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm font-semibold shadow-lg shadow-red-900/40 animate-in slide-in-from-top-2">
      <Eye className="w-4 h-4 shrink-0" />
      <span>
        Viendo como: <span className="font-mono bg-red-700/60 px-2 py-0.5 rounded">{impersonatingEmail}</span>
      </span>
      <button
        onClick={stopImpersonating}
        className="flex items-center gap-1.5 ml-4 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors text-xs font-bold uppercase tracking-wide"
      >
        <X className="w-3.5 h-3.5" />
        Volver a mi cuenta
      </button>
    </div>
  );
}
