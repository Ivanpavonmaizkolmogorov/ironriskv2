/** Wizard store — ephemeral state for the 3-step strategy creation flow. */

import { create } from "zustand";
import { strategyAPI } from "@/services/api";

interface StepOneData {
  name: string;
  description: string;
  magicNumber: number;
  startDate: string;
}

interface StepTwoData {
  file: File | null;
  previewRows: number;
  isValid: boolean;
}

interface StepThreeData {
  maxDrawdown: number;
  dailyLoss: number;
}

interface WizardState {
  currentStep: 1 | 2 | 3;
  stepOneData: StepOneData;
  stepTwoData: StepTwoData;
  stepThreeData: StepThreeData;
  isSubmitting: boolean;
  error: string | null;
  setStep: (step: 1 | 2 | 3) => void;
  updateStepOne: (data: Partial<StepOneData>) => void;
  updateStepTwo: (data: Partial<StepTwoData>) => void;
  updateStepThree: (data: Partial<StepThreeData>) => void;
  submitStrategy: () => Promise<string | null>;
  reset: () => void;
}

const initialState = {
  currentStep: 1 as const,
  stepOneData: { name: "", description: "", magicNumber: 0, startDate: "" },
  stepTwoData: { file: null, previewRows: 0, isValid: false },
  stepThreeData: { maxDrawdown: 0, dailyLoss: 0 },
  isSubmitting: false,
  error: null,
};

export const useWizardStore = create<WizardState>((set, get) => ({
  ...initialState,

  setStep: (step) => set({ currentStep: step }),

  updateStepOne: (data) =>
    set((s) => ({ stepOneData: { ...s.stepOneData, ...data } })),

  updateStepTwo: (data) =>
    set((s) => ({ stepTwoData: { ...s.stepTwoData, ...data } })),

  updateStepThree: (data) =>
    set((s) => ({ stepThreeData: { ...s.stepThreeData, ...data } })),

  submitStrategy: async () => {
    const { stepOneData, stepTwoData, stepThreeData } = get();
    if (!stepTwoData.file) {
      set({ error: "No CSV file selected" });
      return null;
    }

    set({ isSubmitting: true, error: null });
    try {
      const formData = new FormData();
      formData.append("name", stepOneData.name);
      formData.append("description", stepOneData.description);
      formData.append("magic_number", String(stepOneData.magicNumber));
      formData.append("start_date", stepOneData.startDate || "");
      formData.append("max_drawdown_limit", String(stepThreeData.maxDrawdown));
      formData.append("daily_loss_limit", String(stepThreeData.dailyLoss));
      formData.append("file", stepTwoData.file);

      const res = await strategyAPI.upload(formData);
      set({ isSubmitting: false });
      return res.data.id;
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Upload failed";
      set({ error: message, isSubmitting: false });
      return null;
    }
  },

  reset: () => set(initialState),
}));
