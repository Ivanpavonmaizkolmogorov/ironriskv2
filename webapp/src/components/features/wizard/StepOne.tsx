/** Wizard Step 1 — Strategy Name, Description, MagicNumber, StartDate. */
"use client";

import React from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useWizardStore } from "@/store/useWizardStore";

export default function StepOne() {
  const { stepOneData, updateStepOne, setStep } = useWizardStore();

  const canProceed = stepOneData.name.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-iron-100 mb-1">Strategy Identity</h2>
        <p className="text-sm text-iron-500">Define your strategy&apos;s core parameters.</p>
      </div>

      <Input
        label="Strategy Name"
        placeholder="e.g. MeanReversion_EURUSD_H1"
        value={stepOneData.name}
        onChange={(e) => updateStepOne({ name: e.target.value })}
      />

      <Input
        label="Description (optional)"
        placeholder="Brief description of your strategy logic"
        value={stepOneData.description}
        onChange={(e) => updateStepOne({ description: e.target.value })}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Magic Number"
          type="number"
          placeholder="0 = manual trading"
          value={stepOneData.magicNumber || ""}
          onChange={(e) => updateStepOne({ magicNumber: parseInt(e.target.value) || 0 })}
        />
        <Input
          label="Start Date"
          type="date"
          value={stepOneData.startDate}
          onChange={(e) => updateStepOne({ startDate: e.target.value })}
        />
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={() => setStep(2)} disabled={!canProceed}>
          Next → Upload CSV
        </Button>
      </div>
    </div>
  );
}
