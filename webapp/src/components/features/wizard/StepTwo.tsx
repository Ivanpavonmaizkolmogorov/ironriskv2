/** Wizard Step 2 — CSV Upload with column mapping panel. */
"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useWizardStore } from "@/store/useWizardStore";
import { useStrategyStore } from "@/store/useStrategyStore";

/** Fields we want the user to map from their CSV */
const MAPPING_FIELDS = [
  { key: "profit", label: "Profit", required: true, hint: "e.g. Profit, Beneficio, PnL" },
  { key: "commission", label: "Commission", required: false, hint: "e.g. Commission, Comisión" },
  { key: "swap", label: "Swap", required: false, hint: "e.g. Swap" },
  { key: "exit_time", label: "Exit Time", required: false, hint: "e.g. Close Time, Exit Time, Date" },
] as const;

/** Common aliases to auto-detect columns */
const AUTO_DETECT: Record<string, string[]> = {
  profit: ["profit", "beneficio", "pnl", "net_profit"],
  commission: ["commission", "comision", "comisión"],
  swap: ["swap"],
  exit_time: ["exit_time", "close_time", "date", "exit_date", "close_date", "time", "fecha"],
};

export default function StepTwo() {
  const router = useRouter();
  const { fetchStrategies } = useStrategyStore();
  const {
    stepTwoData, updateStepTwo, setStep,
    submitStrategy, isSubmitting, error,
  } = useWizardStore();

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [showMapping, setShowMapping] = useState(false);

  const handleSubmit = async () => {
    const strategyId = await submitStrategy(columnMapping);
    if (strategyId) {
      await fetchStrategies();
      router.push("/dashboard");
    }
  };

  /** Auto-detect mapping based on common column names */
  const autoDetect = (headers: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    const normalized = headers.map((h) => h.trim().replace(/['"]/g, "").replace(/\s+/g, "_").toLowerCase());

    for (const [field, aliases] of Object.entries(AUTO_DETECT)) {
      const idx = normalized.findIndex((h) => aliases.includes(h));
      if (idx >= 0) {
        mapping[field] = headers[idx];
      }
    }
    return mapping;
  };

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      if (!file) {
        updateStepTwo({ file: null, previewRows: 0, isValid: false });
        setCsvHeaders([]);
        setShowMapping(false);
        setColumnMapping({});
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        const rowCount = Math.max(0, lines.length - 1);

        // Detect delimiter and extract headers
        const firstLine = lines[0] || "";
        let headers: string[];
        if (firstLine.includes("\t")) {
          headers = firstLine.split("\t");
        } else if (firstLine.includes(";")) {
          headers = firstLine.split(";");
        } else {
          headers = firstLine.split(",");
        }
        headers = headers.map((h) => h.trim().replace(/^["']|["']$/g, ""));

        setCsvHeaders(headers);
        const detected = autoDetect(headers);
        setColumnMapping(detected);
        setShowMapping(true);

        updateStepTwo({
          file,
          previewRows: rowCount,
          isValid: rowCount > 0 && !!detected.profit,
        });
      };
      reader.readAsText(file);
    },
    [updateStepTwo]
  );

  const updateMapping = (field: string, csvCol: string) => {
    const newMapping = { ...columnMapping };
    if (csvCol === "") {
      delete newMapping[field];
    } else {
      newMapping[field] = csvCol;
    }
    setColumnMapping(newMapping);

    // isValid = has file + has profit mapping
    updateStepTwo({ isValid: stepTwoData.previewRows > 0 && !!newMapping.profit });
  };

  const isProfitMapped = !!columnMapping.profit;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-iron-100 mb-1">Upload Backtest Data</h2>
        <p className="text-sm text-iron-500">
          Upload your Strategy Tester CSV. We&apos;ll detect the columns and let you map them.
        </p>
      </div>

      {/* Drop zone */}
      <label
        className={`
          flex flex-col items-center justify-center w-full h-40
          border-2 border-dashed rounded-xl cursor-pointer
          transition-all duration-200
          ${stepTwoData.file
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
                {stepTwoData.previewRows} rows · {csvHeaders.length} columns detected
              </p>
            </>
          ) : (
            <>
              <p className="text-iron-400 text-sm">📄 Drop your CSV here or click to browse</p>
              <p className="text-iron-600 text-xs mt-1">Supports any CSV format (MT4/MT5, custom, etc.)</p>
            </>
          )}
        </div>
        <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
      </label>

      {/* Column Mapping Panel */}
      {showMapping && csvHeaders.length > 0 && (
        <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-iron-200">📋 Column Mapping</h3>
            <span className="text-xs text-iron-500">
              {isProfitMapped ? "✓ Ready" : "⚠ Map the Profit column"}
            </span>
          </div>

          {MAPPING_FIELDS.map(({ key, label, required, hint }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="w-32 shrink-0">
                <span className={`text-sm font-medium ${required ? "text-iron-100" : "text-iron-400"}`}>
                  {label}
                  {required && <span className="text-risk-red ml-1">*</span>}
                </span>
                <p className="text-xs text-iron-600">{hint}</p>
              </div>
              <select
                value={columnMapping[key] || ""}
                onChange={(e) => updateMapping(key, e.target.value)}
                className={`
                  flex-1 bg-surface-tertiary border rounded-lg px-3 py-2
                  text-sm text-iron-100 focus:outline-none focus:ring-1
                  transition-colors
                  ${columnMapping[key]
                    ? "border-risk-green/40 focus:ring-risk-green/30"
                    : "border-iron-700 focus:ring-iron-500"
                  }
                `}
              >
                <option value="">— {required ? "Select column" : "Skip (optional)"} —</option>
                {csvHeaders.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {stepTwoData.file && !stepTwoData.isValid && !isProfitMapped && (
        <p className="text-amber-400 text-sm">⚠ Please map the &quot;Profit&quot; column to continue.</p>
      )}

      {error && (
        <div className="bg-risk-red/10 border border-risk-red/30 rounded-lg p-3">
          <p className="text-risk-red text-sm">{error}</p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={() => setStep(1)} disabled={isSubmitting}>
          ← Back
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!stepTwoData.isValid || !isProfitMapped}
          isLoading={isSubmitting}
        >
          🚀 Upload &amp; Create Strategy
        </Button>
      </div>
    </div>
  );
}
