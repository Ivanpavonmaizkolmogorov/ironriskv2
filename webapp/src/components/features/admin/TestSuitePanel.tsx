"use client";
import React, { useState, useCallback } from "react";
import api from "@/services/api";
import { Play, RefreshCw, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight } from "lucide-react";

interface SingleTestResult {
  name: string;
  group: string;
  passed: boolean;
  expected: string | null;
  actual: string | null;
  duration_ms: number;
  error: string | null;
}

interface TestSuiteResults {
  run_at: string | null;
  total: number;
  passed: number;
  failed: number;
  success_rate: number;
  duration_ms: number;
  groups: Record<string, SingleTestResult[]>;
  message?: string;
}

const GROUP_LABELS: Record<string, string> = {
  csv_import: "📄 CSV Import",
  bayes: "🧠 Bayesian Engine",
  bayes_live: "📈 Live Trade Updates",
};

function timeAgo(isoString: string | null): string {
  if (!isoString) return "never";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function TestRow({ test }: { test: SingleTestResult }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !test.passed && (test.error || test.expected || test.actual);

  return (
    <div className={`border rounded-lg overflow-hidden ${test.passed ? "border-risk-green/30" : "border-risk-red/40"}`}>
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
          hasDetail ? "cursor-pointer hover:bg-surface-secondary/50" : "cursor-default"
        }`}
      >
        {test.passed ? (
          <CheckCircle2 className="w-4 h-4 text-risk-green flex-shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-risk-red flex-shrink-0" />
        )}
        <span className={`text-sm font-mono flex-1 ${test.passed ? "text-iron-300" : "text-risk-red"}`}>
          {test.name}
        </span>
        <span className="text-iron-500 text-xs font-mono">{test.duration_ms.toFixed(0)}ms</span>
        {hasDetail && (
          expanded
            ? <ChevronDown className="w-3 h-3 text-iron-500 flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-iron-500 flex-shrink-0" />
        )}
      </button>

      {expanded && hasDetail && (
        <div className="px-4 pb-3 pt-0 border-t border-risk-red/20 bg-surface-secondary/30 space-y-1.5">
          {test.expected && (
            <div className="text-xs font-mono">
              <span className="text-iron-500">expected: </span>
              <span className="text-iron-200">{test.expected}</span>
            </div>
          )}
          {test.actual && (
            <div className="text-xs font-mono">
              <span className="text-iron-500">actual:   </span>
              <span className="text-risk-red">{test.actual}</span>
            </div>
          )}
          {test.error && (
            <pre className="text-xs text-risk-amber/80 font-mono whitespace-pre-wrap mt-1 max-h-32 overflow-y-auto">
              {test.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function GroupPanel({ groupKey, tests }: { groupKey: string; tests: SingleTestResult[] }) {
  const [open, setOpen] = useState(true);
  const passed = tests.filter(t => t.passed).length;
  const allPassed = passed === tests.length;

  return (
    <div className="border border-surface-tertiary rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-3 bg-surface-secondary/60 hover:bg-surface-secondary/80 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-iron-200 flex-1">
          {GROUP_LABELS[groupKey] ?? groupKey}
        </span>
        <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
          allPassed
            ? "text-risk-green border-risk-green/40 bg-risk-green/10"
            : "text-risk-red border-risk-red/40 bg-risk-red/10"
        }`}>
          {passed}/{tests.length}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-iron-500" /> : <ChevronRight className="w-4 h-4 text-iron-500" />}
      </button>

      {open && (
        <div className="p-4 space-y-2 bg-surface-primary/40">
          {tests.map(t => <TestRow key={t.name} test={t} />)}
        </div>
      )}
    </div>
  );
}

export default function TestSuitePanel() {
  const [results, setResults] = useState<TestSuiteResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCached = useCallback(async () => {
    try {
      const { data } = await api.get("/api/admin/tests/results");
      setResults(data);
    } catch {
      // Silently ignore — panel shows empty state
    }
  }, []);

  React.useEffect(() => { fetchCached(); }, [fetchCached]);

  const runTests = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/api/admin/tests/run");
      setResults(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Test runner failed unexpectedly.");
    } finally {
      setLoading(false);
    }
  };

  const successRate = results?.success_rate ?? 0;
  const barColor = successRate === 100 ? "bg-risk-green" : successRate >= 70 ? "bg-risk-amber" : "bg-risk-red";

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xl font-bold text-iron-100 flex items-center gap-2">
            🧪 Regression Test Suite
          </h2>
          <p className="text-iron-500 text-sm">
            Validates CSV import, Bayesian engine, and live trade updates against known fixtures.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {results?.run_at && (
            <div className="flex items-center gap-1.5 text-iron-500 text-xs">
              <Clock className="w-3.5 h-3.5" />
              Last run: {timeAgo(results.run_at)}
            </div>
          )}
          <button
            onClick={runTests}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary/20 hover:bg-accent-primary/30 border border-accent-primary/50 text-accent-primary rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
          >
            {loading
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />
            }
            {loading ? "Running..." : "▶ Run Tests"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-risk-red/10 border border-risk-red/40 rounded-lg p-3 text-risk-red text-sm font-mono">
          {error}
        </div>
      )}

      {/* Summary bar */}
      {results && results.total > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className={`font-bold ${results.failed === 0 ? "text-risk-green" : "text-risk-red"}`}>
              {results.failed === 0 ? "✅ All tests passing" : `❌ ${results.failed} test(s) failing`}
            </span>
            <span className="text-iron-400 font-mono text-xs">
              {results.passed}/{results.total} passed · {results.duration_ms.toFixed(0)}ms
            </span>
          </div>
          <div className="w-full h-2 bg-surface-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} transition-all duration-500 rounded-full`}
              style={{ width: `${successRate}%` }}
            />
          </div>
        </div>
      )}

      {/* No results yet */}
      {(!results || results.total === 0) && !loading && (
        <div className="text-center py-8 text-iron-500 text-sm border border-dashed border-surface-tertiary rounded-xl">
          {results?.message ?? "Click ▶ Run Tests to execute the regression suite."}
        </div>
      )}

      {/* Group panels */}
      {results && Object.entries(results.groups).length > 0 && (
        <div className="space-y-3">
          {Object.entries(results.groups).map(([groupKey, tests]) => (
            <GroupPanel key={groupKey} groupKey={groupKey} tests={tests} />
          ))}
        </div>
      )}
    </div>
  );
}
