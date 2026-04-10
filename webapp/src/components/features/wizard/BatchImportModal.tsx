/** Batch Import Modal — upload multiple CSV files at once with shared column mapping. */
"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { strategyAPI, portfolioAPI } from "@/services/api";
import { useStrategyStore } from "@/store/useStrategyStore";
import { useWizardStore } from "@/store/useWizardStore";

import CsvColumnMapper, { autoDetectMapping } from "@/components/ui/CsvColumnMapper";

/* ─────────────────── Types ─────────────────────────────────────────────── */
interface FileEntry {
  file: File;
  name: string;       // Editable strategy name
  magic: string;      // Editable magic number (string for input)
  rows: number;       // Detected row count
  status: "ready" | "uploading" | "done" | "error";
  error?: string;
}

type Stage = "drop" | "map" | "preview";

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tradingAccountId: string;
}

/* ─────────────────── Helpers ───────────────────────────────────────────── */

/** Parse filename: "9_w30.csv" → { magic: "9", name: "9_w30" } (keeps full name) */
function parseFilename(filename: string): { magic: string; name: string } {
  const base = filename.replace(/\.csv$/i, "");
  const match = base.match(/^(\d+)_/);
  return { magic: match ? match[1] : "", name: base };
}

/** Detect delimiter and extract headers from first line of CSV text */
function extractHeaders(text: string): string[] {
  const firstLine = text.split("\n")[0] || "";
  let headers: string[];
  if (firstLine.includes("\t")) headers = firstLine.split("\t");
  else if (firstLine.includes(";")) headers = firstLine.split(";");
  else headers = firstLine.split(",");
  return headers.map((h) => h.trim().replace(/^["']|["']$/g, ""));
}

/** Count data rows */
function countRows(text: string): number {
  return Math.max(0, text.split("\n").filter((l) => l.trim().length > 0).length - 1);
}



/* ─────────────────── Component ─────────────────────────────────────────── */
export default function BatchImportModal({ isOpen, onClose, tradingAccountId }: BatchImportModalProps) {
  const router = useRouter();
  const { fetchStrategies } = useStrategyStore();
  const { 
    stepThreeData, 
    isBatchImporting: isImporting, 
    setIsBatchImporting: setIsImporting,
    batchProgress: progress,
    setBatchProgress: setProgress 
  } = useWizardStore();

  const [stage, setStage] = useState<Stage>("drop");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [existingMagics, setExistingMagics] = useState<Set<number>>(new Set());
  const cancelRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch existing strategies to detect duplicates
  useEffect(() => {
    if (isOpen) {
      strategyAPI.list().then((res) => {
        const magics = new Set<number>();
        for (const s of res.data) {
          if (s.magic_number && s.magic_number !== 0) magics.add(s.magic_number);
        }
        setExistingMagics(magics);
      }).catch(() => {});
    }
  }, [isOpen]);

  /** Check if a magic number already exists */
  const isDuplicate = (magic: string): boolean => {
    const num = parseInt(magic);
    return !isNaN(num) && num !== 0 && existingMagics.has(num);
  };

  /* ── Stage 1: Drop zone ────────────────────────────────────────────── */
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newEntries: FileEntry[] = [];
    let firstHeaders: string[] = [];

    const fileArray = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".csv"));
    if (fileArray.length === 0) return;

    let loaded = 0;
    fileArray.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const headers = extractHeaders(text);
        const rows = countRows(text);
        const parsed = parseFilename(file.name);

        if (loaded === 0) {
          firstHeaders = headers;
          setCsvHeaders(headers);
          setColumnMapping(autoDetectMapping(headers));
        }

        newEntries.push({
          file,
          name: parsed.name,
          magic: parsed.magic,
          rows,
          status: "ready",
        });

        loaded++;
        if (loaded === fileArray.length) {
          setEntries(newEntries);
          setStage("map");
        }
      };
      reader.readAsText(file);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  /* ── Stage 2: Column mapping ───────────────────────────────────────── */
  const updateMapping = (field: string, csvCol: string) => {
    setColumnMapping((prev) => {
      const next = { ...prev };
      if (csvCol === "") delete next[field];
      else next[field] = csvCol;
      return next;
    });
  };

  const isProfitMapped = !!columnMapping.profit;

  /* ── Stage 3: Preview table ────────────────────────────────────────── */
  const updateEntry = (idx: number, field: "name" | "magic", value: string) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e))
    );
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ── Import all ────────────────────────────────────────────────────── */
  const handleImportAll = async () => {
    setIsImporting(true);
    setProgress({ done: 0, total: entries.length });
    cancelRef.current = false;

    const CONCURRENCY = 5;
    let currentDone = 0;

    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      if (cancelRef.current) break;

      const chunk = entries.slice(i, i + CONCURRENCY).map((entry, offset) => ({ entry, idx: i + offset }));
      
      await Promise.allSettled(chunk.map(async ({ entry, idx }) => {
        if (entry.status === "done") {
          currentDone++;
          setProgress((p) => ({ ...p, done: currentDone }));
          return;
        }

        setEntries((prev) => prev.map((e, j) => (j === idx ? { ...e, status: "uploading" } : e)));

        const formData = new FormData();
        formData.append("trading_account_id", tradingAccountId);
        formData.append("name", entry.name);
        formData.append("description", "");
        formData.append("magic_number", entry.magic || "0");
        formData.append("start_date", "");
        formData.append("max_drawdown_limit", String(stepThreeData.maxDrawdown));
        formData.append("daily_loss_limit", String(stepThreeData.dailyLoss));
        formData.append("skip_recalc", "true"); // Fast Mass Upload!
        if (Object.keys(columnMapping).length > 0) {
          formData.append("column_mapping", JSON.stringify(columnMapping));
        }
        formData.append("file", entry.file);

        try {
          await strategyAPI.upload(formData);
          setEntries((prev) => prev.map((e, j) => (j === idx ? { ...e, status: "done" } : e)));
        } catch (err: unknown) {
          const message = (err as any)?.response?.data?.detail || "Upload failed";
          setEntries((prev) => prev.map((e, j) => j === idx ? { ...e, status: "error", error: message } : e));
        }

        currentDone++;
        setProgress((p) => ({ ...p, done: currentDone }));
      }));
    }

    try {
      if (currentDone > 0) await portfolioAPI.recalculateAll(tradingAccountId);
    } catch { /* skip errors */ }

    setIsImporting(false);
    await fetchStrategies();
  };

  const allDone = entries.length > 0 && entries.every((e) => e.status === "done");
  const hasErrors = entries.some((e) => e.status === "error");

  /* ── Reset ─────────────────────────────────────────────────────────── */
  const handleClose = () => {
    setStage("drop");
    setEntries([]);
    setCsvHeaders([]);
    setColumnMapping({});
    setIsImporting(false);
    setProgress({ done: 0, total: 0 });
    onClose();
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-surface-primary border border-iron-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header (Sticky) */}
        <div className="bg-surface-primary border-b border-iron-800 px-6 py-4 flex flex-col justify-center shadow-sm z-10 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-iron-100">📦 Batch Import</h2>
              <p className="text-xs text-iron-500 mt-0.5">
                {stage === "drop" && "Select multiple CSV files"}
                {stage === "map" && "Map columns to IronRisk fields"}
                {stage === "preview" && `${entries.length} strategies ready to import`}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-iron-500 hover:text-iron-200 text-xl transition-colors"
              disabled={isImporting}
            >
              ✕
            </button>
          </div>
          
          {/* Sticky Progress bar */}
          {isImporting && (
            <div className="mt-4 space-y-1">
              <div className="flex justify-between text-xs text-iron-400">
                <span>Importing...</span>
                <span>
                  {progress.done}/{progress.total}
                </span>
              </div>
              <div className="w-full bg-iron-800 rounded-full h-2">
                <div
                  className="bg-risk-green h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      progress.total > 0
                        ? (progress.done / progress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ════════════════ STAGE 1: DROP ZONE ════════════════ */}
          {stage === "drop" && (
            <label
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center justify-center w-full h-52 border-2 border-dashed border-iron-700 bg-surface-tertiary hover:border-iron-500 rounded-xl cursor-pointer transition-all duration-200"
            >
              <div className="text-center">
                <p className="text-4xl mb-3">📄</p>
                <p className="text-iron-300 text-sm font-medium">
                  Drop your CSV files here or click to browse
                </p>
                <p className="text-iron-600 text-xs mt-2">
                  Multiple files supported · Any CSV format
                </p>
              </div>
              <input
                type="file"
                accept=".csv"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
            </label>
          )}

          {/* ════════════════ STAGE 2: COLUMN MAPPING ════════════════ */}
          {stage === "map" && (
            <>
              <CsvColumnMapper
                csvHeaders={csvHeaders}
                initialMapping={columnMapping}
                onMappingChange={(map) => setColumnMapping(map)}
              />

              {/* Files summary */}
              <div className="text-sm text-iron-400">
                {entries.length} file{entries.length > 1 ? "s" : ""} selected:
                <span className="text-iron-200 ml-1">
                  {entries.map((e) => e.file.name).join(", ")}
                </span>
              </div>

            </>
          )}

          {/* ════════════════ STAGE 3: PREVIEW TABLE ════════════════ */}
          {stage === "preview" && (
            <>
              {/* duplicate warning banner */}
              {entries.some((e) => isDuplicate(e.magic) && e.status === "ready") && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
                  <span className="text-amber-400 text-sm shrink-0">⚠️</span>
                  <p className="text-amber-300 text-sm">
                    Some magic numbers already exist. Those strategies will be <strong>updated</strong> with
                    new trades from the CSV (existing data is preserved, only new trades are incorporated).
                  </p>
                </div>
              )}

              {/* Table */}
              <div className="overflow-x-auto border border-iron-700 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-secondary text-iron-400 text-xs uppercase">
                      <th className="px-4 py-3 text-left w-8">#</th>
                      <th className="px-4 py-3 text-left">Filename</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left w-24">Magic</th>
                      <th className="px-4 py-3 text-center w-16">Rows</th>
                      <th className="px-4 py-3 text-center w-24">Status</th>
                      <th className="px-4 py-3 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => (
                      <tr
                        key={idx}
                        className={`border-t border-iron-800 ${
                          entry.status === "done"
                            ? "bg-risk-green/5"
                            : entry.status === "error"
                            ? "bg-risk-red/5"
                            : ""
                        }`}
                      >
                        <td className="px-4 py-2.5 text-iron-500">{idx + 1}</td>
                        <td className="px-4 py-2.5 text-iron-300 font-mono text-xs truncate max-w-[180px]">
                          {entry.file.name}
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={entry.name}
                            onChange={(e) =>
                              updateEntry(idx, "name", e.target.value)
                            }
                            disabled={isImporting || entry.status === "done"}
                            className="w-full bg-surface-tertiary border border-iron-700 rounded px-2 py-1 text-sm text-iron-100 focus:outline-none focus:ring-1 focus:ring-iron-500 disabled:opacity-50"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={entry.magic}
                              onChange={(e) =>
                                updateEntry(idx, "magic", e.target.value)
                              }
                              disabled={isImporting || entry.status === "done"}
                              placeholder="0"
                              className={`w-full bg-surface-tertiary border rounded px-2 py-1 text-sm text-iron-100 focus:outline-none focus:ring-1 focus:ring-iron-500 disabled:opacity-50 ${
                                isDuplicate(entry.magic)
                                  ? "border-amber-500/50"
                                  : "border-iron-700"
                              }`}
                            />
                            {isDuplicate(entry.magic) && (
                              <span
                                className="text-amber-400 text-xs shrink-0 cursor-help"
                                title={`Magic ${entry.magic} already exists`}
                              >
                                ⚠️
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center text-iron-400">
                          {entry.rows}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {entry.status === "ready" && (
                            <span className="text-iron-400">Ready</span>
                          )}
                          {entry.status === "uploading" && (
                            <span className="text-amber-400 animate-pulse">
                              ⏳
                            </span>
                          )}
                          {entry.status === "done" && (
                            <span className="text-risk-green">✓ Done</span>
                          )}
                          {entry.status === "error" && (
                            <span
                              className="text-risk-red cursor-help"
                              title={entry.error}
                            >
                              ✗ Error
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {!isImporting && entry.status !== "done" && (
                            <button
                              onClick={() => removeEntry(idx)}
                              className="text-iron-600 hover:text-risk-red transition-colors"
                              title="Remove"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Error summary */}
              {hasErrors && !isImporting && (
                <p className="text-risk-red text-sm">
                  Some files failed. Hover the ✗ to see the error. You can retry
                  by clicking Import again.
                </p>
              )}

              {/* Success */}
              {allDone && (
                <div className="bg-risk-green/10 border border-risk-green/30 rounded-lg p-4 text-center">
                  <p className="text-risk-green font-medium">
                    ✅ All {entries.length} strategies imported successfully!
                  </p>
                </div>
              )}

            </>
          )}
        </div>

        {/* ════════════════ FOOTERS ════════════════ */}
        {stage === "map" && (
          <div className="bg-surface-primary p-4 border-t border-iron-800 flex justify-between shrink-0">
            <Button
              variant="ghost"
              onClick={() => {
                setStage("drop");
                setEntries([]);
              }}
            >
              ← Back
            </Button>
            <Button
              onClick={() => setStage("preview")}
              disabled={!isProfitMapped}
            >
              Next → Preview
            </Button>
          </div>
        )}

        {stage === "preview" && (
          <div className="bg-surface-primary p-4 border-t border-iron-800 flex justify-between shrink-0">
            <Button
              variant="ghost"
              onClick={() => setStage("map")}
              disabled={isImporting}
            >
              ← Mapping
            </Button>
            <div className="flex gap-3">
              {isImporting && !allDone && (
                <Button
                  variant="ghost"
                  className="text-risk-red hover:bg-risk-red/10 border border-risk-red/30"
                  onClick={() => { cancelRef.current = true; }}
                >
                  ⏹ Cancel
                </Button>
              )}
              {allDone ? (
                <Button
                  onClick={() => {
                    handleClose();
                    router.push(`/dashboard/account/${tradingAccountId}`);
                  }}
                >
                  Go to Account →
                </Button>
              ) : (
                <Button
                  onClick={handleImportAll}
                  disabled={
                    isImporting ||
                    entries.length === 0 ||
                    entries.every((e) => !e.name.trim())
                  }
                  isLoading={isImporting}
                >
                  🚀 Import {entries.filter((e) => e.status !== "done").length}{" "}
                  Strategies
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
