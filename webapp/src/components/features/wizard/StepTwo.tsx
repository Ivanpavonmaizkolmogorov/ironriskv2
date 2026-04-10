/** Wizard Step 2 — CSV Upload with column mapping panel. */
"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useWizardStore } from "@/store/useWizardStore";
import { useStrategyStore } from "@/store/useStrategyStore";

import CsvColumnMapper, { autoDetectMapping } from "@/components/ui/CsvColumnMapper";

export default function StepTwo() {
  const router = useRouter();
  const { fetchStrategies } = useStrategyStore();
  const {
    stepOneData, stepTwoData, updateStepTwo, setStep,
    submitStrategy, isSubmitting, error,
  } = useWizardStore();

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [showMapping, setShowMapping] = useState(false);

  const handleSubmit = async () => {
    const strategyId = await submitStrategy(columnMapping);
    if (strategyId) {
      await fetchStrategies();
      const accountId = stepOneData.tradingAccountId;
      router.push(accountId ? `/dashboard/account/${accountId}` : "/dashboard");
    }
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
        const detected = autoDetectMapping(headers);
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

  const updateMappingFromComponent = useCallback((newMapping: Record<string, string>, isProfitMapped: boolean) => {
    setColumnMapping(newMapping);
    updateStepTwo({ isValid: stepTwoData.previewRows > 0 && isProfitMapped });
  }, [stepTwoData.previewRows, updateStepTwo]);

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
        <CsvColumnMapper 
          csvHeaders={csvHeaders} 
          initialMapping={columnMapping} 
          onMappingChange={updateMappingFromComponent} 
        />
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
