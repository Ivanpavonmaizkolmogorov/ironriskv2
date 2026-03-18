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
  const { stepThreeData, updateStepThree, setStep, submitStrategy, isSubmitting, error } =
    useWizardStore();
  const { fetchStrategies } = useStrategyStore();

  const canSubmit = stepThreeData.maxDrawdown > 0 && stepThreeData.dailyLoss > 0;

  const handleSubmit = async () => {
    const strategyId = await submitStrategy();
    if (strategyId) {
      await fetchStrategies();
      router.push("/dashboard");
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
