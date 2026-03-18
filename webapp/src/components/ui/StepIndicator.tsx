/** Step Indicator — shows wizard progress. */
"use client";

import React from "react";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  labels: string[];
}

export default function StepIndicator({ currentStep, totalSteps, labels }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-mono font-bold
                  transition-all duration-300
                  ${isActive ? "bg-risk-green/20 text-risk-green border-2 border-risk-green shadow-[0_0_15px_rgba(0,230,118,0.3)]" : ""}
                  ${isCompleted ? "bg-risk-green text-surface-primary" : ""}
                  ${!isActive && !isCompleted ? "bg-surface-tertiary text-iron-500 border border-iron-700" : ""}
                `}
              >
                {isCompleted ? "✓" : step}
              </div>
              <span className={`text-xs font-medium ${isActive ? "text-risk-green" : "text-iron-500"}`}>
                {labels[i]}
              </span>
            </div>
            {step < totalSteps && (
              <div
                className={`w-16 h-px mt-[-18px] ${
                  isCompleted ? "bg-risk-green" : "bg-iron-700"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
