/** Token Manager page — dedicated page for API token management. */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import TradingAccountManager from "@/components/features/TradingAccountManager";
import Button from "@/components/ui/Button";

export default function TradingAccountsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated } = useAuthStore();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated) router.push("/login");
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) return null;

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
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-iron-100 mb-2">Connect your MetaTrader</h2>
            <p className="text-sm text-iron-500 max-w-md">
              Generate a unique API token below and paste it into your IronRisk EA&apos;s input
              parameters. Each token is tied to your account.
            </p>
          </div>

        </div>
        <TradingAccountManager />
      </div>
    </main>
  );
}
