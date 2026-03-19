/** Wizard Step 2 — CSV Upload with client-side pre-validation. */
"use client";

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useWizardStore } from "@/store/useWizardStore";
import { useStrategyStore } from "@/store/useStrategyStore";

export default function StepTwo() {
  const router = useRouter();
  const { fetchStrategies } = useStrategyStore();
  const { stepTwoData, updateStepTwo, setStep, submitStrategy, isSubmitting, error } = useWizardStore();

  const handleSubmit = async () => {
    const strategyId = await submitStrategy();
    if (strategyId) {
      await fetchStrategies();
      router.push("/dashboard");
    }
  };

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      if (!file) {
        updateStepTwo({ file: null, previewRows: 0, isValid: false });
        return;
      }

      // Pre-validate: read first few lines
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        const rowCount = Math.max(0, lines.length - 1); // exclude header
        updateStepTwo({
          file,
          previewRows: rowCount,
          isValid: rowCount > 0,
        });
      };
      reader.readAsText(file);
    },
    [updateStepTwo]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-iron-100 mb-1">Upload Backtest Data</h2>
        <p className="text-sm text-iron-500">
          Upload your Strategy Tester CSV. Must contain a &quot;profit&quot; column.
        </p>
      </div>

      {/* Drop zone */}
      <label
        className={`
          flex flex-col items-center justify-center w-full h-40
          border-2 border-dashed rounded-xl cursor-pointer
          transition-all duration-200
          ${stepTwoData.isValid
            ? "border-risk-green/50 bg-risk-green/5"
            : "border-iron-700 bg-surface-tertiary hover:border-iron-500"
          }
        `}
      >
        <div className="text-center">
          {stepTwoData.file ? (
            <>
              <p className="text-risk-green font-mono text-sm">✓ {stepTwoData.file.name}</p>
              <p className="text-iron-400 text-xs mt-1">
                {stepTwoData.previewRows} trades detected
              </p>
            </>
          ) : (
            <>
              <p className="text-iron-400 text-sm">📄 Drop your CSV here or click to browse</p>
              <p className="text-iron-600 text-xs mt-1">Supports MT4/MT5 Strategy Tester format</p>
            </>
          )}
        </div>
        <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
      </label>

      {stepTwoData.file && !stepTwoData.isValid && (
        <p className="text-risk-red text-sm">⚠ CSV appears empty. Please check the file.</p>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={() => setStep(1)} disabled={isSubmitting}>
          ← Back
        </Button>
        <Button onClick={handleSubmit} disabled={!stepTwoData.isValid} isLoading={isSubmitting}>
          🚀 Upload & Create Strategy
        </Button>
      </div>
    </div>
  );
}
