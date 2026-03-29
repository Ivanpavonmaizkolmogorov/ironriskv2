"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import BayesSandbox from "@/components/features/BayesSandbox";
import { useStrategyStore } from "@/store/useStrategyStore";

export default function BayesSandboxPage() {
  const router = useRouter();
  const { strategies, fetchStrategies } = useStrategyStore();

  useEffect(() => {
    // Load strategies if empty
    if (strategies.length === 0) {
      fetchStrategies();
    }
  }, []);

  return (
    <div className="min-h-screen bg-surface-primary text-iron-100">
      {/* Navigation */}
      <div className="border-b border-iron-800 px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="text-sm text-iron-400 hover:text-iron-200 transition-colors"
        >
          ← Volver al Dashboard
        </button>
        <span className="text-[10px] text-iron-600 uppercase tracking-widest">
          Master Only · Fase 6
        </span>
      </div>

      {/* Sandbox */}
      <BayesSandbox />
    </div>
  );
}
