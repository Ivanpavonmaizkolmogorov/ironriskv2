/** Wizard Step 3 — Hard Stops (Max Drawdown, Daily Loss) + Submit. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useWizardStore } from "@/store/useWizardStore";
import { useStrategyStore } from "@/store/useStrategyStore";
import { useTranslations } from "next-intl";

export default function StepThree() {
  const router = useRouter();
  const { stepOneData, stepThreeData, updateStepThree, setStep, submitStrategy, isSubmitting, error } =
    useWizardStore();
  const { fetchStrategies } = useStrategyStore();
  const t = useTranslations("wizard");

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
        <h2 className="text-lg font-semibold text-iron-100 mb-1">{t("step3Title")}</h2>
        <p className="text-sm text-iron-500">
          {t("step3Desc")}
        </p>
      </div>

      <div className="bg-surface-tertiary border border-iron-700 rounded-lg p-4">
        <p className="text-xs text-iron-400 uppercase tracking-wider mb-3">{t("hardStops")}</p>
        <div className="space-y-4">
          <Input
            label={t("maxDdLabel")}
            type="number"
            placeholder={t("maxDdPlaceholder")}
            value={stepThreeData.maxDrawdown || ""}
            onChange={(e) =>
              updateStepThree({ maxDrawdown: parseFloat(e.target.value) || 0 })
            }
          />
          <Input
            label={t("dailyLossLabel")}
            type="number"
            placeholder={t("dailyLossPlaceholder")}
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
          {t("back")}
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={isSubmitting}>
          {t("createStrategy")}
        </Button>
      </div>
    </div>
  );
}
