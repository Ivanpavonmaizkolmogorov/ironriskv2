import React, { useState, useEffect } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { Strategy } from "@/types/strategy";
import { tradingAccountAPI } from "@/services/api";
import type { TradingAccount } from "@/types/tradingAccount";

interface RiskVar {
  key: string;
  label: string;
  unit: string;
}

const RISK_VARIABLES: RiskVar[] = [
  { key: "max_drawdown", label: "Max Drawdown", unit: "$" },
  { key: "daily_loss", label: "Daily Loss", unit: "$" },
  { key: "consecutive_losses", label: "Consecutive Losses", unit: "" },
  { key: "stagnation_days", label: "Stagnation Days", unit: "days" },
  { key: "stagnation_trades", label: "Stagnation Trades", unit: "trades" },
];

interface EditStrategyModalProps {
  strategy: Strategy;
  onSave: (id: string, updates: Partial<Strategy>) => Promise<boolean | void>;
  onClose: () => void;
}

export default function EditStrategyModal({
  strategy,
  onSave,
  onClose,
}: EditStrategyModalProps) {
  const [name, setName] = useState(strategy.name);
  const [magicNumber, setMagicNumber] = useState(strategy.magic_number.toString());
  const [tradingAccountId, setTradingAccountId] = useState(strategy.trading_account_id || "");
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Risk config state
  const defaultRiskConfig: Record<string, { enabled: boolean; limit: number }> = {};
  for (const rv of RISK_VARIABLES) {
    const existing = (strategy.risk_config as Record<string, { enabled: boolean; limit: number }> | undefined)?.[rv.key];
    defaultRiskConfig[rv.key] = {
      enabled: existing?.enabled ?? false,
      limit: existing?.limit ?? 0,
    };
  }
  const [riskConfig, setRiskConfig] = useState(defaultRiskConfig);

  useEffect(() => {
    tradingAccountAPI.list().then((res) => setAccounts(res.data));
  }, []);

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
        trading_account_id: tradingAccountId,
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
      <div className="bg-surface-secondary border border-iron-800 rounded-xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
           onClick={onClose}
           className="absolute top-4 right-4 text-iron-500 hover:text-iron-300"
        >
          ✕
        </button>

        <h3 className="text-xl font-bold text-iron-100 mb-6">Edit Strategy</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div>
            <label className="block text-sm font-medium text-iron-300 mb-1">
               Trading Account
            </label>
            <select
              value={tradingAccountId}
              onChange={(e) => setTradingAccountId(e.target.value)}
              required
              className="w-full bg-surface-primary border border-iron-700 text-iron-200 rounded-lg px-4 py-3 outline-none focus:border-risk-blue focus:ring-1 focus:ring-risk-blue transition-colors appearance-none"
            >
              <option value="" disabled>Select Trading Account</option>
              {accounts.map(acc => (
                 <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

          {/* Risk Config Section */}
          <div className="border-t border-iron-700 pt-4 mt-2">
            <p className="text-xs uppercase text-iron-500 mb-3 tracking-wider font-semibold">
              ⚠️ Risk Variables (monitored by EA)
            </p>
            <div className="space-y-2">
              {RISK_VARIABLES.map((rv) => {
                const cfg = riskConfig[rv.key];
                return (
                  <div
                    key={rv.key}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      cfg.enabled
                        ? "border-risk-blue/40 bg-risk-blue/5"
                        : "border-iron-800 bg-surface-primary/50 opacity-60"
                    }`}
                  >
                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleRisk(rv.key)}
                      className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${
                        cfg.enabled ? "bg-risk-blue" : "bg-iron-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          cfg.enabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>

                    {/* Label */}
                    <span className="text-sm text-iron-200 flex-1 font-medium">
                      {rv.label}
                    </span>

                    {/* Limit input */}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        value={cfg.limit}
                        onChange={(e) => setRiskLimit(rv.key, e.target.value)}
                        disabled={!cfg.enabled}
                        className="w-24 bg-surface-primary border border-iron-700 text-iron-200 rounded px-2 py-1 text-sm font-mono outline-none focus:border-risk-blue disabled:opacity-40 disabled:cursor-not-allowed text-right"
                      />
                      {rv.unit && (
                        <span className="text-xs text-iron-500 w-8">{rv.unit}</span>
                      )}
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
