import React, { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { Strategy } from "@/types/strategy";

// ─── OOP Risk Variable Registry ──────────────────────────────────

interface RiskVar {
  key: string;
  label: string;
  unit: string;
  snapKey: string;
}

const RISK_VARIABLES: RiskVar[] = [
  { key: "max_drawdown", label: "Max Drawdown", unit: "$", snapKey: "DrawdownMetric" },
  { key: "daily_loss", label: "Daily Loss", unit: "$", snapKey: "DailyLossMetric" },
  { key: "consecutive_losses", label: "Consecutive Losses", unit: "", snapKey: "ConsecutiveLossesMetric" },
  { key: "stagnation_days", label: "Stagnation Days", unit: "days", snapKey: "StagnationDaysMetric" },
  { key: "stagnation_trades", label: "Stagnation Trades", unit: "trades", snapKey: "StagnationTradesMetric" },
];

// ─── Component ──────────────────────────────────────────────────

interface EditStrategyModalProps {
  strategy: Strategy;
  onSave: (id: string, updates: Partial<Strategy>) => Promise<boolean | void>;
  onClose: () => void;
  onOpenChart?: (metricName: string, value: number) => void;
}

export default function EditStrategyModal({
  strategy,
  onSave,
  onClose,
  onOpenChart,
}: EditStrategyModalProps) {
  const [name, setName] = useState(strategy.name);
  const [magicNumber, setMagicNumber] = useState(strategy.magic_number.toString());
  const [isSaving, setIsSaving] = useState(false);

  // ── Risk config state (OOP: each RiskVar maps to a toggleable limit) ──
  const defaultRiskConfig: Record<string, { enabled: boolean; limit: number }> = {};
  for (const rv of RISK_VARIABLES) {
    const existing = (strategy.risk_config as Record<string, { enabled: boolean; limit: number }> | undefined)?.[rv.key];
    defaultRiskConfig[rv.key] = {
      enabled: existing?.enabled ?? false,
      limit: existing?.limit ?? 0,
    };
  }
  const [riskConfig, setRiskConfig] = useState(defaultRiskConfig);

  const toggleRisk = (key: string) => {
    setRiskConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  };

  const setRiskLimit = (key: string, value: string) => {
    setRiskConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], limit: parseFloat(value) || 0 },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(strategy.id, {
        name,
        magic_number: parseInt(magicNumber, 10),
        max_drawdown_limit: riskConfig.max_drawdown?.limit || 0,
        daily_loss_limit: riskConfig.daily_loss?.limit || 0,
        risk_config: riskConfig,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-secondary border border-iron-800 rounded-xl p-6 w-full max-w-xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
           onClick={onClose}
           className="absolute top-4 right-4 text-iron-500 hover:text-iron-300"
        >
          ✕
        </button>

        <h3 className="text-xl font-bold text-iron-100 mb-6">Edit Strategy</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-iron-300 mb-1">
                 Strategy Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-iron-300 mb-1">
                 Magic Number
              </label>
              <Input
                type="number"
                value={magicNumber}
                onChange={(e) => setMagicNumber(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Risk Config Section — OOP: iterates RISK_VARIABLES registry */}
          <div className="border-t border-iron-700 pt-5 mt-4">
            <p className="text-xs uppercase text-iron-500 mb-4 tracking-wider font-semibold">
              ⚠️ EA Hard Limits vs Backtest Reference
            </p>
            <div className="space-y-3">
              {RISK_VARIABLES.map((rv) => {
                const cfg = riskConfig[rv.key];
                
                // Extract Reference val from metrics_snapshot (if available)
                let refValue: number | undefined;
                if (strategy.metrics_snapshot?.[rv.snapKey]) {
                    const params = strategy.metrics_snapshot[rv.snapKey] as Record<string, number>;
                    const maxKey = Object.keys(params || {}).find(k => k.startsWith("max_"));
                    if (maxKey) refValue = params[maxKey];
                }

                return (
                  <div
                    key={rv.key}
                    className={`flex flex-col gap-2 p-3 rounded-lg border transition-all ${
                      cfg.enabled
                        ? "border-risk-blue/40 bg-risk-blue/5"
                        : "border-iron-800 bg-surface-primary/50 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3 w-full">
                      {/* Label */}
                      <span className="text-sm text-iron-200 font-medium w-40 flex-shrink-0">
                        {rv.label}
                      </span>
                      
                      {/* Backtest Reference (Read Only) */}
                      <div className="flex-1 text-xs text-iron-500 truncate flex items-center gap-2">
                         {refValue !== undefined ? (
                           <>
                             Backtest Ref: <span className="font-mono text-iron-300">{refValue.toFixed(1)}{rv.unit}</span>
                           </>
                         ) : (
                           <span className="italic">No backtest data</span>
                         )}
                      </div>

                      {/* Hard Limit Input */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs uppercase tracking-wider font-semibold text-iron-500`}>
                          EA Limit:
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            value={cfg.limit}
                            onChange={(e) => setRiskLimit(rv.key, e.target.value)}
                            className="w-24 bg-surface-primary border border-iron-700 text-iron-200 rounded px-2 py-1 text-sm font-mono outline-none focus:border-risk-blue text-right"
                          />
                          {rv.unit && (
                            <span className="text-xs text-iron-500 w-8">{rv.unit}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving} className="bg-risk-blue hover:bg-risk-blue/90 text-white">
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
