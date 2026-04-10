"use client";

import React, { useEffect, useState } from "react";

/** Fields we want the user to map from their CSV */
export const MAPPING_FIELDS = [
  { key: "profit", label: "Profit", required: true, hint: "e.g. Profit, Beneficio, PnL" },
  { key: "commission", label: "Commission", required: false, hint: "e.g. Commission, Comisión" },
  { key: "swap", label: "Swap", required: false, hint: "e.g. Swap" },
  { key: "exit_time", label: "Exit Time", required: false, hint: "e.g. Close Time, Exit Time, Date" },
] as const;

/** Common aliases to auto-detect columns */
export const AUTO_DETECT: Record<string, string[]> = {
  profit: ["profit", "beneficio", "pnl", "net profit", "net_profit"],
  commission: ["commission", "comision", "comisión"],
  swap: ["swap"],
  exit_time: ["exit_time", "close time", "exit time", "close_time", "fecha/hora_1", "time_1", "time.1", "cierre", "exit"],
};

export const autoDetectMapping = (headers: string[]): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const normalized = headers.map((h) => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(AUTO_DETECT)) {
    // 1. Try exact match first
    let idx = normalized.findIndex((h) => aliases.includes(h));
    
    // 2. Try partial match if no exact match
    if (idx === -1) {
      idx = normalized.findIndex((h) => aliases.some(alias => h.includes(alias)));
    }
    
    if (idx >= 0) {
      mapping[field] = headers[idx];
    }
  }
  return mapping;
};

export interface CsvColumnMapperProps {
  csvHeaders: string[];
  initialMapping?: Record<string, string>;
  onMappingChange: (mapping: Record<string, string>, isProfitMapped: boolean) => void;
}

export default function CsvColumnMapper({ csvHeaders, initialMapping, onMappingChange }: CsvColumnMapperProps) {
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>(initialMapping || {});

  // Update parent whenever internal mapping changes
  useEffect(() => {
    const isProfitMapped = !!columnMapping.profit;
    onMappingChange(columnMapping, isProfitMapped);
  }, [columnMapping, onMappingChange]);

  const updateMapping = (field: string, csvCol: string) => {
    const newMapping = { ...columnMapping };
    if (csvCol === "") {
      delete newMapping[field];
    } else {
      newMapping[field] = csvCol;
    }
    setColumnMapping(newMapping);
  };

  const isProfitMapped = !!columnMapping.profit;

  if (!csvHeaders || csvHeaders.length === 0) return null;

  return (
    <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5 space-y-4 text-left w-full mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-iron-200">📋 Column Mapping</h3>
        <span className="text-xs text-iron-500">
          {isProfitMapped ? "✓ Ready" : "⚠ Map the Profit column"}
        </span>
      </div>

      {MAPPING_FIELDS.map(({ key, label, required, hint }) => (
        <div key={key} className="flex items-center gap-3 w-full">
          <div className="w-32 shrink-0 overflow-hidden">
            <span className={`text-sm font-medium ${required ? "text-iron-100" : "text-iron-400"}`}>
              {label}
              {required && <span className="text-risk-red ml-1">*</span>}
            </span>
            <p className="text-xs text-iron-600 truncate">{hint}</p>
          </div>
          <div className="flex-1 min-w-0">
            <select
              value={columnMapping[key] || ""}
              onChange={(e) => updateMapping(key, e.target.value)}
              className={`
                w-full truncate bg-surface-tertiary border rounded-lg px-3 py-2
                text-sm text-iron-100 focus:outline-none focus:ring-1
                transition-colors
                ${columnMapping[key]
                  ? "border-risk-green/40 focus:ring-risk-green/30"
                  : "border-iron-700 focus:ring-iron-500"
                }
              `}
            >
              <option value="">— {required ? "Select column" : "Skip (optional)"} —</option>
              {csvHeaders.map((h) => {
                const displayLabel = h.length > 40 ? h.substring(0, 40) + "..." : h;
                return (
                  <option key={h} value={h} className="truncate max-w-[200px]">
                    {displayLabel}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      ))}

      {!isProfitMapped && (
        <p className="text-amber-400 text-sm mt-2">
          ⚠ Please map the "Profit" column to continue.
        </p>
      )}
    </div>
  );
}
