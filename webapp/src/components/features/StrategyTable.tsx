/** Strategy Table — compact, dense, sortable table with search, totals & visual indicators. */
"use client";

import React, { useMemo, useState } from "react";
import type { RiskAsset, Strategy, Portfolio } from "@/types/strategy";
import { metricFormatter } from "@/utils/MetricFormatter";
import MetricTooltip from "@/components/ui/MetricTooltip";
import { TableViewDef, BacktestView } from "./tableConfigs";
import TradeLogDrawer from "./TradeLogDrawer";
import { strategyAPI, portfolioAPI } from "@/services/api";

/* ─── Types ─── */
type SortKey = string;
type SortDir = "asc" | "desc";

interface StrategyTableProps {
  strategies: RiskAsset[];
  selectedId?: string;
  selectedChildId?: string;
  checkedIds: Set<string>;
  allChecked: boolean;
  someChecked: boolean;
  onToggleAll: () => void;
  onToggleCheck: (id: string, checked: boolean) => void;
  onSelect: (id: string) => void;
  onSelectChild?: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  view?: TableViewDef;
  universeContext?: RiskAsset[];
}

/* ─── Helpers ─── */
function pnlRatio(value: number, absMax: number): number {
  if (absMax === 0) return 0;
  return Math.min(Math.abs(value) / absMax, 1);
}

function pnlOpacity(value: number, absMax: number): number {
  if (absMax === 0) return 0.6;
  return 0.4 + 0.6 * pnlRatio(value, absMax);
}

/* ─── Column header component ─── */
function SortHeader({
  label, sortKey, currentKey, currentDir, onSort, align = "right", metricKey
}: {
  label: string; sortKey: SortKey; currentKey: SortKey | null;
  currentDir: SortDir; onSort: (k: SortKey) => void; align?: "left" | "right" | "center"; metricKey?: string;
}) {
  const active = currentKey === sortKey;
  const arrow = active ? (currentDir === "asc" ? " ▲" : " ▼") : "";
  const alignCls = align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";

  return (
    <th
      className={`px-1 sm:px-3 py-1.5 sm:py-2.5 font-medium cursor-pointer select-none hover:text-iron-200 transition-colors ${alignCls} ${active ? "text-iron-200" : ""}`}
      onClick={() => onSort(sortKey)}
    >
      <div className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"}`}>
        {metricKey ? (
          <MetricTooltip metricKey={metricKey} variant="table" />
        ) : (
          <span>{label}</span>
        )}
        <span>{arrow}</span>
      </div>
    </th>
  );
}

/* ─── Main Component ─── */
export default function StrategyTable({
  strategies, selectedId, selectedChildId, checkedIds, allChecked, someChecked,
  onToggleAll, onToggleCheck, onSelect, onSelectChild, onEdit, onDelete,
  view = BacktestView, universeContext
}: StrategyTableProps) {

  /* Accordion State */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* Trade Log Drawer State */
  const [drawerTarget, setDrawerTarget] = useState<{ id: string, name: string, type: "STRATEGY" | "PORTFOLIO" } | null>(null);

  /* Search */
  const [search, setSearch] = useState("");

  /* Sorting */
  const [sortKey, setSortKey] = useState<SortKey | null>(view.defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(view.defaultSortDir);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc"); // names default asc, numbers desc
    }
  };

  /* ─── Lazy Load Bayesian Data (throttled queue) ─── */
  const [bayesCache, setBayesCache] = useState<Record<string, any>>({});
  const requestedBayes = React.useRef<Set<string>>(new Set());
  const abortRef = React.useRef<AbortController | null>(null);
  const queueRunning = React.useRef(false);
  const [bayesProgress, setBayesProgress] = useState<{ loaded: number; total: number } | null>(null);

  // Stable key: only changes when the set of IDs changes (not on poll refresh)
  const strategyIds = useMemo(() => strategies.map(s => s.id).sort().join(","), [strategies]);

  React.useEffect(() => {
    if (view.id !== "bayesian") return;
    if (queueRunning.current) return; // Queue already in progress, don't restart

    const controller = new AbortController();
    abortRef.current = controller;

    // Collect all IDs we haven't fetched yet
    const pending: { id: string; isPortfolio: boolean }[] = [];
    strategies.forEach(s => {
      if (!requestedBayes.current.has(s.id)) {
        pending.push({ id: s.id, isPortfolio: "strategy_ids" in s });
        requestedBayes.current.add(s.id);
      }
      if ("strategy_ids" in s && s.strategy_ids) {
        s.strategy_ids.forEach((childId: string) => {
          if (!requestedBayes.current.has(childId)) {
            pending.push({ id: childId, isPortfolio: false });
            requestedBayes.current.add(childId);
          }
        });
      }
    });

    if (pending.length === 0) return;

    // Process in batches of 5 with per-request timeout
    const BATCH_SIZE = 5;
    const TIMEOUT_MS = 15000; // 15s max per request

    const fetchWithTimeout = (id: string, isPortfolio: boolean) => {
      const api = isPortfolio ? portfolioAPI : strategyAPI;
      return Promise.race([
        api.getBayes(id).then(res => ({ id, data: res.data })),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: ${id}`)), TIMEOUT_MS)
        ),
      ]);
    };

    queueRunning.current = true;
    setBayesProgress({ loaded: 0, total: pending.length });
    let loadedCount = 0;

    (async () => {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        if (controller.signal.aborted) break;

        const batch = pending.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(({ id, isPortfolio }) => fetchWithTimeout(id, isPortfolio))
        );

        if (controller.signal.aborted) break;

        // Merge successful results into cache
        const newEntries: Record<string, any> = {};
        results.forEach(r => {
          if (r.status === "fulfilled") newEntries[r.value.id] = r.value.data;
        });
        loadedCount += batch.length;
        setBayesProgress({ loaded: loadedCount, total: pending.length });

        if (Object.keys(newEntries).length > 0) {
          setBayesCache(prev => ({ ...prev, ...newEntries }));
        }
      }
      queueRunning.current = false;
      setBayesProgress(null);
    })();

    return () => { controller.abort(); queueRunning.current = false; setBayesProgress(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id, strategyIds]);

  const strategiesWithCache = useMemo(() => {
    if (view.id !== "bayesian") return strategies;
    return strategies.map(s => ({
      ...s,
      bayesian_breakdown: bayesCache[s.id] || s.bayesian_breakdown
    })) as RiskAsset[];
  }, [strategies, bayesCache, view.id]);

  /* Filtered + sorted list */
  const processed = useMemo(() => {
    let list = strategiesWithCache;

    // Filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => {
        if (s.name.toLowerCase().includes(q)) return true;
        if ("magic_number" in s && String(s.magic_number).includes(q)) return true;
        return false;
      });
    }

    // Sort
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      const col = view.columns.find(c => c.id === sortKey);
      
      list = [...list].sort((a, b) => {
        let va: number | string = 0;
        let vb: number | string = 0;
        
        if (col) {
           va = col.sortValue(a);
           vb = col.sortValue(b);
           if (va === undefined || va === null) va = -999999;
           if (vb === undefined || vb === null) vb = -999999;
        }
        
        if (typeof va === 'string' && typeof vb === 'string') {
           return va.localeCompare(vb) * dir;
        }

        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }

    return list;
  }, [strategiesWithCache, search, sortKey, sortDir, view.columns]);

  const universeContextWithCache = useMemo(() => {
    if (view.id !== "bayesian") return universeContext || [];
    return universeContext?.map(s => ({
      ...s,
      bayesian_breakdown: bayesCache[s.id] || s.bayesian_breakdown
    })) as RiskAsset[];
  }, [universeContext, bayesCache, view.id]);



  const [prevView, setPrevView] = useState(view.id);
  if (view.id !== prevView) {
    // When view changes from outside, reset auto sort keys
    setSortKey(view.defaultSortKey);
    setSortDir(view.defaultSortDir);
    setPrevView(view.id);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden gap-2">
      {/* Search bar */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-iron-500 text-sm pointer-events-none">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search strategies..."
          className="w-full bg-surface-secondary border border-iron-800 rounded-lg pl-9 pr-3 py-2 text-sm text-iron-200
            placeholder:text-iron-600 focus:outline-none focus:border-risk-green/40 focus:ring-1 focus:ring-risk-green/20
            transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-iron-500 hover:text-iron-200 text-xs"
          >✕</button>
        )}
      </div>

      {/* Results count when filtered */}
      {search.trim() && (
        <p className="text-xs text-iron-500 px-1">
          {processed.length} of {strategies.length} strategies
        </p>
      )}

      {/* Bayesian loading progress */}
      {bayesProgress && view.id === "bayesian" && (
        <div className="px-3 py-2 bg-iron-900/80 border border-iron-700/50 rounded-lg flex items-center gap-3">
          <div className="relative w-4 h-4 flex-shrink-0">
            <div className="absolute inset-0 border-2 border-iron-600 border-t-emerald-500 rounded-full animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-iron-300 font-medium">
                Analyzing {bayesProgress.loaded}/{bayesProgress.total} strategies…
              </span>
              <span className="text-xs text-iron-500 font-mono">
                {Math.round((bayesProgress.loaded / bayesProgress.total) * 100)}%
              </span>
            </div>
            <div className="w-full h-1 bg-iron-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${(bayesProgress.loaded / bayesProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto rounded-lg border border-iron-800 bg-surface-secondary">
        <table className="w-full text-[10px] sm:text-sm border-collapse">
          <thead>
            <tr className="border-b border-iron-700 text-iron-500 text-[10px] uppercase tracking-wider sticky top-0 bg-surface-secondary z-10">
              <th className="px-2 py-2 text-center w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                  onChange={onToggleAll}
                  className="w-3.5 h-3.5 rounded border-iron-600 bg-surface-tertiary cursor-pointer accent-emerald-500"
                  title={allChecked ? "Deselect all" : "Select all"}
                />
              </th>
              {/* Expander Column Header */}
              <th className="px-1 py-2 w-6"></th>
              {view.columns.map(c => (
                <SortHeader key={c.id} label={c.label} metricKey={c.metricKey} sortKey={c.id} currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align={c.align || "right"} />
              ))}
              <th className="text-center px-1 py-2 font-medium w-12"></th>
            </tr>
          </thead>

          <tbody>
            {processed.map((s, idx) => {
              const isSelected = s.id === selectedId;

              return (
                <React.Fragment key={s.id}>
                  <tr
                    onClick={() => onSelect(s.id)}
                    className={`
                      border-b border-iron-800/40 cursor-pointer transition-all duration-150
                      ${idx % 2 === 0 ? "bg-transparent" : "bg-iron-900/30"}
                      ${isSelected
                        ? "!bg-risk-green/10 border-l-[3px] border-l-risk-green shadow-[inset_0_0_20px_rgba(0,230,118,0.05)]"
                        : "hover:bg-surface-tertiary/50 border-l-[3px] border-l-transparent"
                      }
                    `}
                  >
                    {/* Checkbox */}
                    <td className="px-1.5 sm:px-3 py-1 sm:py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={checkedIds.has(s.id)}
                        onChange={(e) => { e.stopPropagation(); onToggleCheck(s.id, e.target.checked); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded border-iron-600 bg-surface-tertiary cursor-pointer accent-emerald-500"
                      />
                    </td>

                    {/* Expander */}
                    <td className="px-1 py-1.5 text-center cursor-pointer" onClick={(e) => toggleExpand(s.id, e)}>
                      {"strategy_ids" in s && (s.strategy_ids?.length || 0) > 0 && (
                        <button className="text-iron-500 hover:text-iron-300 transition-colors text-[10px] pb-0.5">
                          {expandedIds.has(s.id) ? "▼" : "▶"}
                        </button>
                      )}
                    </td>

                    {/* OOP Dynamic Columns */}
                    {view.columns.map(c => (
                      <td key={c.id} className={`px-1 sm:px-3 py-1 sm:py-1.5 ${c.align === "left" ? "text-left" : c.align === "center" ? "text-center" : "text-right"}`}>
                        {c.renderCell(s, processed)}
                      </td>
                    ))}

                    {/* Actions */}
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex justify-center gap-0.5 opacity-40 hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDrawerTarget({ id: s.id, name: s.name, type: "strategy_ids" in s ? "PORTFOLIO" : "STRATEGY" }); }}
                          className="text-iron-400 hover:text-risk-cyan transition-colors px-1 py-0.5 rounded hover:bg-risk-cyan/10 text-xs"
                          title="View Trades"
                        >🔍</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(s.id); }}
                          className="text-iron-400 hover:text-iron-100 transition-colors px-1 py-0.5 rounded hover:bg-surface-tertiary text-xs"
                          title="Edit"
                        >⚙️</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                          className="text-iron-400 hover:text-risk-red transition-colors px-1 py-0.5 rounded hover:bg-risk-red/10 text-xs"
                          title="Delete"
                        >🗑</button>
                      </div>
                    </td>
                  </tr>

                  {/* Child Rows (OOP Render) */}
                  {expandedIds.has(s.id) && "strategy_ids" in s && s.strategy_ids?.map((childId: string, childIdx: number) => {
                      const child = universeContextWithCache?.find(u => u.id === childId);
                      if (!child) return null;
                      const isLast = childIdx === ((s as Portfolio).strategy_ids!.length - 1);
                      const isChildSelected = child.id === (selectedChildId || selectedId);
                      
                      return (
                        <tr 
                          key={`child-${s.id}-${child.id}`} 
                          onClick={(e) => { e.stopPropagation(); if (onSelectChild) onSelectChild(child.id); else onSelect(child.id); }}
                          className={`
                            bg-black/20 text-[13px] transition-all cursor-pointer border-l-[3px] border-l-transparent
                            ${isLast ? "border-b border-iron-800/40" : ""}
                            ${isChildSelected 
                              ? "!bg-risk-green/10 border-l-[3px] !border-l-risk-green shadow-[inset_0_0_20px_rgba(0,230,118,0.05)] opacity-100 font-medium" 
                              : "hover:bg-surface-secondary/50 opacity-70 hover:opacity-100"
                            }
                          `}
                        >
                          {/* Empty Checkbox & Expander */}
                          <td className="px-3 py-1.5" />
                          <td className="px-1 py-1.5 text-right text-iron-700 font-mono text-xs pr-2">↳</td>

                          {/* OOP Dynamic Columns */}
                          {view.columns.map(c => (
                            <td key={c.id} className={`px-1 sm:px-3 py-1 sm:py-1.5 scale-95 origin-left ${c.align === "left" ? "text-left" : c.align === "center" ? "text-center" : "text-right"}`}>
                              {c.renderCell(child, universeContextWithCache || processed, true)}
                            </td>
                          ))}

                          {/* Actions for child */}
                          <td className="px-2 py-1.5 text-center">
                            <div className="flex justify-center gap-0.5 opacity-40 hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDrawerTarget({ id: child.id, name: child.name, type: "STRATEGY" }); }}
                                  className="text-iron-400 hover:text-risk-cyan transition-colors px-1 py-0.5 rounded hover:bg-risk-cyan/10 text-xs"
                                  title="View Trades"
                                >🔍</button>
                            </div>
                          </td>
                        </tr>
                      );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>

          {/* Totals footer */}
          <tfoot>
            <tr className="sticky bottom-0 bg-surface-secondary border-t-2 border-iron-700 text-xs uppercase tracking-wider">
              <td className="px-3 py-2.5" />
              <td className="px-1 py-2.5" />
               {view.columns.map(c => (
                <td key={c.id} className={`px-1 sm:px-3 py-2 sm:py-2.5 ${c.align === "left" ? "text-left" : c.align === "center" ? "text-center" : "text-right"}`}>
                   {c.renderFooter ? c.renderFooter(processed) : ""}
                </td>
              ))}
              <td className="px-2 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>

      <TradeLogDrawer 
        isOpen={drawerTarget !== null}
        onClose={() => setDrawerTarget(null)}
        targetId={drawerTarget?.id || null}
        targetName={drawerTarget?.name || ""}
        type={drawerTarget?.type || "STRATEGY"}
      />
    </div>
  );
}
