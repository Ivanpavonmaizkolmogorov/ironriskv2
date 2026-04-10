/** Wizard Step 3 — Hard Stops (Max Drawdown, Daily Loss) + Submit. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useWizardStore } from "@/store/useWizardStore";
import { useStrategyStore } from "@/store/useStrategyStore";

export default function StepThree() {
  const router = useRouter();
  const { stepOneData, stepThreeData, updateStepThree, setStep, submitStrategy, isSubmitting, error } =
    useWizardStore();
  const { fetchStrategies } = useStrategyStore();

  const canSubmit = stepThreeData.maxDrawdown > 0 && stepThreeData.dailyLoss > 0;

  const handleSubmit = async () => {
    const strategyId = await submitStrategy();
    if (strategyId) {
      await fetchStrategies();
      if (stepOneData.tradingAccountId) {
        router.push(`/dashboard/account/${stepOneData.tradingAccountId}`);
      } else {
        router.push("/dashboard");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-iron-100 mb-1">Define Pain Limits</h2>
        <p className="text-sm text-iron-500">
          Set the hard stops that the system will monitor in real-time.
        </p>
      </div>

      <div className="bg-surface-tertiary border border-iron-700 rounded-lg p-4">
        <p className="text-xs text-iron-400 uppercase tracking-wider mb-3">💀 Hard Stops</p>
        <div className="space-y-4">
          <Input
            label="Max Drawdown Allowed ($)"
            type="number"
            placeholder="e.g. 5000"
            value={stepThreeData.maxDrawdown || ""}
            onChange={(e) =>
              updateStepThree({ maxDrawdown: parseFloat(e.target.value) || 0 })
            }
          />
          <Input
            label="Max Daily Loss ($)"
            type="number"
            placeholder="e.g. 1000"
            value={stepThreeData.dailyLoss || ""}
            onChange={(e) =>
              updateStepThree({ dailyLoss: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
      </div>

      {/* Factor de Escalado */}
      <div className="bg-surface-tertiary border border-amber-500/20 rounded-lg p-4">
        <p className="text-xs text-amber-400 uppercase tracking-wider mb-3">📐 Factor de Escalado</p>
        <div className="flex items-start gap-4">
          <div className="w-40">
            <Input
              type="number"
              step="any"
              min="0.01"
              placeholder="1.0 (sin escalar)"
              defaultValue={stepThreeData.riskMultiplier === 1 ? "" : stepThreeData.riskMultiplier}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                updateStepThree({ riskMultiplier: v > 0 ? v : 1 });
              }}
            />
          </div>
          <p className="text-[10px] text-iron-500 leading-relaxed flex-1">
            Si tu BT fue hecho con un lote menor al que usas en live, introduce el multiplicador.
            <br/>Ej: BT a <span className="text-iron-300">0.01</span> lotes, live a <span className="text-iron-300">1.0</span> lote → factor = <span className="text-amber-400 font-mono">100</span>
            <br/>Escala métricas, distribuciones, equity curve y EA limits.
            {stepThreeData.riskMultiplier !== 1 && (
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                ×{stepThreeData.riskMultiplier}
              </span>
            )}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-risk-red/10 border border-risk-red/30 rounded-lg p-3">
          <p className="text-risk-red text-sm">{error}</p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={() => setStep(2)}>
          ← Back
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={isSubmitting}>
          🚀 Create Strategy
        </Button>
      </div>
    </div>
  );
}
