/** Dashboard — Strategy list + charts for selected strategy. */
"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { useStrategyStore } from "@/store/useStrategyStore";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StrategyCard from "@/components/features/StrategyCard";
import EquityCurve from "@/components/features/charts/EquityCurve";
import GaussBell from "@/components/features/charts/GaussBell";

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user, logout, loadUser } = useAuthStore();
  const { strategies, selectedStrategy, isLoading, fetchStrategies, selectStrategy, deleteStrategy } =
    useStrategyStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    loadUser();
    fetchStrategies();
  }, [isAuthenticated, router, loadUser, fetchStrategies]);

  if (!isAuthenticated) return null;

  return (
    <main className="min-h-screen bg-surface-primary">
      {/* Top bar */}
      <nav className="sticky top-0 z-50 bg-surface-primary/80 backdrop-blur-xl border-b border-iron-800">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <span className="text-lg font-bold text-iron-100">
            IRON<span className="text-risk-green">RISK</span>
            <span className="text-xs text-iron-600 ml-2">TOWER</span>
          </span>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/tokens">
              <Button variant="ghost" size="sm">🔑 Tokens</Button>
            </Link>
            <Link href="/dashboard/wizard">
              <Button size="sm">+ New Strategy</Button>
            </Link>
            <span className="text-xs text-iron-500">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Strategy list */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-sm font-semibold text-iron-400 uppercase tracking-wider">
              Strategies ({strategies.length})
            </h2>

            {isLoading && (
              <p className="text-sm text-iron-500 animate-pulse">Loading...</p>
            )}

            {strategies.map((s) => (
              <StrategyCard
                key={s.id}
                strategy={s}
                isSelected={selectedStrategy?.id === s.id}
                onSelect={() => selectStrategy(s.id)}
                onDelete={() => deleteStrategy(s.id)}
              />
            ))}

            {!isLoading && strategies.length === 0 && (
              <Card>
                <p className="text-center text-iron-500 text-sm py-8">
                  No strategies yet.
                  <br />
                  <Link href="/dashboard/wizard" className="text-risk-green hover:underline">
                    Create your first one →
                  </Link>
                </p>
              </Card>
            )}
          </div>

          {/* Right: Charts */}
          <div className="lg:col-span-2 space-y-6">
            {selectedStrategy ? (
              <>
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-iron-100">
                      📈 Equity Curve — {selectedStrategy.name}
                    </h3>
                    <span className="text-xs font-mono text-iron-500">
                      {selectedStrategy.total_trades} trades
                    </span>
                  </div>
                  <EquityCurve data={selectedStrategy.equity_curve || []} />
                </Card>

                {selectedStrategy.gauss_params && (
                  <Card>
                    <h3 className="text-lg font-semibold text-iron-100 mb-4">
                      🔔 PnL Distribution (Gauss)
                    </h3>
                    <GaussBell params={selectedStrategy.gauss_params} />
                  </Card>
                )}

                {/* Metrics snapshot */}
                {selectedStrategy.metrics_snapshot && (
                  <Card>
                    <h3 className="text-lg font-semibold text-iron-100 mb-4">
                      🧮 Risk Metrics Snapshot
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(selectedStrategy.metrics_snapshot).map(([key, params]) => {
                        const displayName = key.replace("Metric", "").replace(/([A-Z])/g, " $1").trim();
                        const maxKey = Object.keys(params).find((k) => k.startsWith("max_"));
                        const maxValue = maxKey ? (params as Record<string, number>)[maxKey] : 0;
                        return (
                          <div key={key} className="bg-surface-tertiary rounded-lg p-3 text-center">
                            <p className="text-xs text-iron-500 uppercase mb-1">{displayName}</p>
                            <p className="text-lg font-mono text-iron-200">
                              {typeof maxValue === "number" ? maxValue.toFixed(1) : "—"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <Card className="flex items-center justify-center h-96">
                <p className="text-iron-500 text-sm">
                  ← Select a strategy to view its analysis
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
