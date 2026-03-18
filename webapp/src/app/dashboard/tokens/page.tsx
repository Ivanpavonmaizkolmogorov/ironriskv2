/** Token Manager page — dedicated page for API token management. */
"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import TokenManager from "@/components/features/TokenManager";

export default function TokensPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <main className="min-h-screen bg-surface-primary">
      <nav className="sticky top-0 z-50 bg-surface-primary/80 backdrop-blur-xl border-b border-iron-800">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-iron-400 hover:text-iron-200 transition-colors">
            ← Back to Dashboard
          </Link>
          <span className="text-sm font-semibold text-iron-100">API Token Manager</span>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-12">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-iron-100 mb-2">Connect your MetaTrader</h2>
          <p className="text-sm text-iron-500">
            Generate a unique API token below and paste it into your IronRisk EA&apos;s input
            parameters. Each token is tied to your account.
          </p>
        </div>
        <TokenManager />
      </div>
    </main>
  );
}
