/** Dashboard — Strategy list + charts for selected strategy. */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { useStrategyStore } from "@/store/useStrategyStore";
import { strategyAPI } from "@/services/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StrategyCard from "@/components/features/StrategyCard";
import EditStrategyModal from "@/components/features/EditStrategyModal";
import EquityCurve from "@/components/features/charts/EquityCurve";
import GaussBell from "@/components/features/charts/GaussBell";

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const { isAuthenticated, user, logout, loadUser } = useAuthStore();
  const { strategies, selectedStrategy, isLoading, fetchStrategies, selectStrategy, deleteStrategy, updateStrategy } =
    useStrategyStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    loadUser();
    fetchStrategies();
  }, [mounted, isAuthenticated, router, loadUser, fetchStrategies]);

  // --- Multi-select helpers ---
  const toggleCheck = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedIds.size === strategies.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(strategies.map((s) => s.id)));
  };

  const handleDeleteSelected = async () => {
    const count = checkedIds.size;
    if (!confirm(`⚠️ Delete ${count} selected strateg${count === 1 ? "y" : "ies"}? This cannot be undone.`)) return;
    setIsDeleting(true);
    for (const id of checkedIds) {
      try { await strategyAPI.delete(id); } catch { /* skip errors */ }
    }
    setCheckedIds(new Set());
    setIsDeleting(false);
    fetchStrategies();
  };

  if (!mounted || !isAuthenticated) return null;

  const allChecked = strategies.length > 0 && checkedIds.size === strategies.length;
  const someChecked = checkedIds.size > 0;

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
            <Link href="/dashboard/trading-accounts">
              <Button variant="ghost" size="sm">🏦 Trading Accounts</Button>
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
            {/* Header row: title + select-all checkbox */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {strategies.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-iron-600 bg-surface-tertiary cursor-pointer accent-emerald-500"
                    title={allChecked ? "Deselect all" : "Select all"}
                  />
                )}
                <h2 className="text-sm font-semibold text-iron-400 uppercase tracking-wider">
                  Strategies ({strategies.length})
                </h2>
              </div>
            </div>

            {/* Bulk actions toolbar */}
            {someChecked && (
              <div className="bg-surface-secondary border border-iron-700 rounded-lg px-4 py-2.5 flex items-center justify-between animate-in fade-in">
                <span className="text-xs text-iron-300">
                  {checkedIds.size} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" onClick={handleDeleteSelected}
                    disabled={isDeleting} isLoading={isDeleting}>
                    🗑 Delete Selected
                  </Button>
                </div>
              </div>
            )}

            {isLoading && (
              <p className="text-sm text-iron-500 animate-pulse">Loading...</p>
            )}

            {strategies.map((s) => (
              <StrategyCard
                key={s.id}
                strategy={s}
                isSelected={selectedStrategy?.id === s.id}
                showCheckbox
                isChecked={checkedIds.has(s.id)}
                onCheck={(checked) => toggleCheck(s.id, checked)}
                onSelect={() => selectStrategy(s.id)}
                onEdit={() => {
                  selectStrategy(s.id);
                  setIsEditModalOpen(true);
                }}
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
                    <h3 className="text-lg font-semibold text-iron-100 flex items-center gap-3">
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

      {isEditModalOpen && selectedStrategy && (
        <EditStrategyModal
          strategy={selectedStrategy}
          onSave={updateStrategy}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </main>
  );
}
