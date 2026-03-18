/** Strategy Wizard page — 3-step onboarding flow. */
"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import StepIndicator from "@/components/ui/StepIndicator";
import StepOne from "@/components/features/wizard/StepOne";
import StepTwo from "@/components/features/wizard/StepTwo";
import StepThree from "@/components/features/wizard/StepThree";
import { useAuthStore } from "@/store/useAuthStore";
import { useWizardStore } from "@/store/useWizardStore";

export default function WizardPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { currentStep, reset } = useWizardStore();

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

  // Reset wizard on mount
  useEffect(() => {
    reset();
  }, [reset]);

  if (!isAuthenticated) return null;

  return (
    <main className="min-h-screen bg-surface-primary">
      {/* Top bar */}
      <nav className="sticky top-0 z-50 bg-surface-primary/80 backdrop-blur-xl border-b border-iron-800">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-iron-400 hover:text-iron-200 transition-colors">
            ← Back to Dashboard
          </Link>
          <span className="text-sm font-semibold text-iron-100">Strategy Wizard</span>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-12">
        <StepIndicator
          currentStep={currentStep}
          totalSteps={3}
          labels={["Identity", "Data", "Limits"]}
        />

        <Card>
          {currentStep === 1 && <StepOne />}
          {currentStep === 2 && <StepTwo />}
          {currentStep === 3 && <StepThree />}
        </Card>
      </div>
    </main>
  );
}
