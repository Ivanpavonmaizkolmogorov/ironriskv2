/** Wizard Step 1 — Strategy Name, Description, MagicNumber, StartDate. */
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useWizardStore } from "@/store/useWizardStore";
import { tradingAccountAPI, strategyAPI } from "@/services/api";
import type { TradingAccount } from "@/types/tradingAccount";
import BatchImportModal from "./BatchImportModal";

export default function StepOne() {
  const searchParams = useSearchParams();
  const urlAccountId = searchParams.get("accountId");
  const { stepOneData, updateStepOne, setStep } = useWizardStore();
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [showBatch, setShowBatch] = useState(false);

  useEffect(() => {
    tradingAccountAPI.list().then(res => {
      setAccounts(res.data);
      if (urlAccountId) {
         updateStepOne({ tradingAccountId: urlAccountId });
      } else if (res.data.length > 0 && !stepOneData.tradingAccountId) {
        updateStepOne({ tradingAccountId: res.data[0].id });
      }
    }).catch(console.error);
  }, [urlAccountId, stepOneData.tradingAccountId, updateStepOne]);

  const canProceed = stepOneData.name.trim().length > 0 && stepOneData.tradingAccountId.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-iron-100 mb-1">Strategy Identity</h2>
        <p className="text-sm text-iron-500">Define your strategy&apos;s core parameters.</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-iron-200">Trading Account <span className="text-risk-red">*</span></label>
        {accounts.length === 0 ? (
          <p className="text-amber-400 text-sm py-2">No trading accounts. Please create one in Trading Accounts first.</p>
        ) : urlAccountId ? (
          <div className="w-full bg-surface-tertiary/50 border border-iron-800 rounded-lg px-4 py-2.5 text-iron-400 cursor-not-allowed">
            {accounts.find(a => a.id === urlAccountId)?.name || "Loading workspace..."} (Locked)
          </div>
        ) : (
          <select 
            value={stepOneData.tradingAccountId}
            onChange={(e) => updateStepOne({ tradingAccountId: e.target.value })}
            className="w-full bg-surface-tertiary border border-iron-700 rounded-lg px-4 py-2.5 text-iron-100 focus:outline-none focus:ring-1 focus:ring-iron-500 transition-colors"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name} {a.broker && `(${a.broker})`}</option>
            ))}
          </select>
        )}
      </div>

      {/* Batch import + Delete All shortcuts */}
      {stepOneData.tradingAccountId && (
        <div className="bg-surface-secondary border border-iron-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-iron-200">Multiple strategies?</p>
              <p className="text-xs text-iron-500">Import several CSVs at once with auto-detected names and magic numbers.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="danger" size="sm"
                onClick={async () => {
                  if (!confirm("⚠️ Delete ALL strategies? This cannot be undone.")) return;
                  try {
                    const res = await strategyAPI.deleteAll();
                    alert(res.data.detail);
                    window.location.reload();
                  } catch { alert("Delete failed"); }
                }}>
                🗑 Delete All
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowBatch(true)}
                className="text-iron-300 border border-iron-600 hover:text-iron-100">
                📦 Batch Import
              </Button>
            </div>
          </div>
        </div>
      )}

      <BatchImportModal
        isOpen={showBatch}
        onClose={() => setShowBatch(false)}
        tradingAccountId={stepOneData.tradingAccountId}
      />

      {/* ── Single strategy fields (below) ── */}

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
