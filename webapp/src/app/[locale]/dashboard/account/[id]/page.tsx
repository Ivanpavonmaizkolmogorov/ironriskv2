/** Dashboard — Strategy list + charts for selected strategy. */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { useWizardStore } from "@/store/useWizardStore";
import { useStrategyStore } from "@/store/useStrategyStore";
import { usePortfolioStore } from "@/store/usePortfolioStore";
import { useThemeStore } from "@/store/useThemeStore";
import { metricFormatter } from "@/utils/MetricFormatter";
import { strategyAPI, tradingAccountAPI, portfolioAPI } from "@/services/api";
import type { TradingAccount } from "@/types/tradingAccount";
import type { EquityPoint } from "@/types/strategy";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ThemeSelector from "@/components/features/ThemeSelector";
import StrategyTable from "@/components/features/StrategyTable";
import EditStrategyModal from "@/components/features/EditStrategyModal";
import WorkspaceSettingsModal from "@/components/features/WorkspaceSettingsModal";
import EquityCurve from "@/components/features/charts/EquityCurve";
import OrphanInbox from "@/components/features/OrphanInbox";
import PactBanner from "@/components/features/PactBanner";
import { useTranslations, useLocale } from "next-intl";
import MetricTooltip from "@/components/ui/MetricTooltip";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { ALL_TABLE_VIEWS, BacktestView, type TableViewDef } from "@/components/features/tableConfigs";
import { DASHBOARD_VIEWS } from "@/components/features/dashboard/dashboardViewConfigs";
import type { DashboardContext } from "@/components/features/dashboard/dashboardViewConfigs";
import ConnectionStatus from "@/components/ui/ConnectionStatus";
import { getConnectionMonitor } from "@/services/ConnectionMonitor";
import InteractiveDistribution from "@/components/features/charts/InteractiveDistribution";
import AlertsDrawer from "@/components/features/AlertsDrawer";
import api from "@/services/api";


export default function DashboardPage() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations("metrics");
  const tWorkspace = useTranslations("workspaceManager");
  const accountId = params.id as string;
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [copied, setCopied] = useState(false);
  const [chartData, setChartData] = useState<any>(null);
  const [isInteractiveMode, setIsInteractiveMode] = useState<boolean>(false);
  const { effectiveThemeData } = useThemeStore();
  const isLightMode = effectiveThemeData?.mode === "light";

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isWorkspaceSettingsOpen, setIsWorkspaceSettingsOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{done: number, total: number} | null>(null);
  const [deletedSuccess, setDeletedSuccess] = useState<string | null>(null);

  // Global alerts
  const [isGlobalAlertsOpen, setIsGlobalAlertsOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [telegramLinked, setTelegramLinked] = useState(true); // optimistic default

  const searchParams = useSearchParams();

  // Table View Engine state
  const [tableView, setTableView] = useState<TableViewDef>(BacktestView);

  // Dashboard Top-Level View Engine state
  const [activeDashboardView, setActiveDashboardView] = useState<string>(searchParams.get("view") || "inspector");

  const [checkedPortfolioIds, setCheckedPortfolioIds] = useState<Set<string>>(new Set());
  const [isCreatingPortfolio, setIsCreatingPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [activeTab, setActiveTab] = useState<"strategies" | "portfolios">((searchParams.get("tab") as any) || "strategies");

  // Keep URL search params in sync so language switcher doesn't lose state
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    
    if (activeDashboardView !== "inspector" && url.searchParams.get("view") !== activeDashboardView) {
      url.searchParams.set("view", activeDashboardView);
      changed = true;
    } else if (activeDashboardView === "inspector" && url.searchParams.has("view")) {
      url.searchParams.delete("view");
      changed = true;
    }

    if (activeTab !== "strategies" && url.searchParams.get("tab") !== activeTab) {
      url.searchParams.set("tab", activeTab);
      changed = true;
    } else if (activeTab === "strategies" && url.searchParams.has("tab")) {
      url.searchParams.delete("tab");
      changed = true;
    }

    if (changed) {
      window.history.replaceState({}, "", url.toString());
    }
  }, [activeDashboardView, activeTab]);

  // Fetch alert count + telegram status on mount
  useEffect(() => {
    api.get("/api/alerts/user/all").then(r => setAlertCount((r.data || []).length)).catch(() => {});
    api.get("/api/telegram/status").then(r => setTelegramLinked(r.data.is_linked)).catch(() => {});
  }, []);

  
  // Batch Import Progress
  const { isBatchImporting, batchProgress } = useWizardStore();
  const [activeChartMetric, setActiveChartMetric] = useState<string | null>(null);
  const [lastChartReq, setLastChartReq] = useState<{metric: string, value?: number} | null>(null);
  const [chartUrl, setChartUrl] = useState<string | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [liveEquity, setLiveEquity] = useState<{ curve: EquityPoint[]; trades: number; pnl: number; totalAll: number } | null>(null);
  const [liveEquityVersion, setLiveEquityVersion] = useState(0);

  // Fork dropdown for "+ Strategy" button
  const [showNewStrategyFork, setShowNewStrategyFork] = useState(false);

  // ═══ Splitter state ═══
  const DEFAULT_SPLIT = 0.55;
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT);
  const splitterContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const onSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !splitterContainerRef.current) return;
      const rect = splitterContainerRef.current.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      const ratio = Math.min(0.85, Math.max(0.15, y / rect.height));
      setSplitRatio(ratio);
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);
  const { isAuthenticated, user, logout, loadUser } = useAuthStore();
  const { strategies, selectedStrategy, isLoading, fetchStrategies, selectStrategy, deleteStrategy, updateStrategy } =
    useStrategyStore();
  const { portfolios, selectedPortfolio, isLoading: isPortfoliosLoading, fetchPortfolios, selectPortfolio, deletePortfolio, createPortfolio } =
    usePortfolioStore();

  // Check if any strategy has magic_number=0 (blocks manual creation)
  const hasMagicZero = strategies.some((s: any) => s.magic_number === 0);

  const unconfiguredCount = strategies.filter((s: any) => {
    const rc = s.risk_config;
    return !rc || !rc.max_drawdown || !rc.max_drawdown.limit || rc.max_drawdown.limit === 0;
  }).length;

  const activeAsset = selectedPortfolio || selectedStrategy;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    loadUser();
    if (accountId) {
      fetchStrategies(accountId);
      fetchPortfolios(accountId);
      tradingAccountAPI.list().then(res => {
        const found = res.data.find((a: TradingAccount) => a.id === accountId);
        if (found) {
           setAccount(found);
           useThemeStore.getState().setWorkspaceContext(accountId, found.theme || null);
        }
      }).catch(console.error);
      
      const interval = setInterval(() => {
        fetchStrategies(accountId, true); // Quiet background poll every 5s
      }, 5000);
      return () => {
         clearInterval(interval);
         useThemeStore.getState().setWorkspaceContext(null, null); // Clear context on unmount
      };
    }
  }, [mounted, isAuthenticated, router, loadUser, fetchStrategies, accountId]);

  // Feed EA heartbeat timestamps to the ConnectionMonitor
  useEffect(() => {
    if (strategies.length > 0) {
      getConnectionMonitor().updateEaHeartbeat(strategies);
    }
  }, [strategies]);

  // Fetch live equity curve when active asset is selected
  useEffect(() => {
    if (!activeAsset || !account?.api_token) {
      setLiveEquity(null);
      return;
    }
    const isPortfolio = "strategy_ids" in activeAsset;
    let API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    if (typeof window !== "undefined" && window.location.protocol === "https:" && API_URL.startsWith("http://")) {
      API_URL = API_URL.replace("http://", "https://");
    }
    const encodedToken = encodeURIComponent(account.api_token);
    const ts = Date.now();
    const url = isPortfolio 
       ? `${API_URL}/api/live/equity-curve-portfolio/${encodedToken}/${activeAsset.id}?t=${ts}`
       : `${API_URL}/api/live/equity-curve/${encodedToken}/${(activeAsset as any).magic_number}?t=${ts}`;
       
    console.log("[LiveEquity] Fetching:", url);
    fetch(url, { cache: "no-store" })
      .then(r => {
        console.log("[LiveEquity] Response status:", r.status);
        return r.json();
      })
      .then(data => {
        console.log("[LiveEquity] Data:", data.total_trades, "trades, pnl:", data.net_profit, "allTrades:", data.total_all_trades);
        setLiveEquity({
          curve: data.equity_curve || [],
          trades: data.total_trades,
          pnl: data.net_profit,
          totalAll: data.total_all_trades ?? 0,
        });
      })
      .catch((err) => { console.error("[LiveEquity] Error:", err); setLiveEquity(null); });
  }, [activeAsset?.id, account?.api_token, liveEquityVersion]);

  const copyToken = () => {
    if (!account) return;
    navigator.clipboard.writeText(account.api_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Track the user's preferred metric across strategy switches
  const userMetricRef = useRef<string>("max_drawdown");

  const openChart = async (metricName: string, value?: number, isUserClick = false, forceRefresh = false) => {
    if (!activeAsset) return;
    if (isUserClick) {
      console.log(`[openChart] USER CLICKED ${metricName}! Updating ref.`);
      userMetricRef.current = metricName; // Remember user's explicit choice
    }
    if (!forceRefresh && lastChartReq?.metric === metricName && lastChartReq?.value === value) {
      console.log(`[openChart] Bailing out -> no change`);
      return; // Skip if no change
    }
    setLastChartReq({ metric: metricName, value });
    setChartLoading(true);
    setActiveChartMetric(metricName);
    try {
      const isPortfolio = "strategy_ids" in activeAsset;
      const res = isPortfolio 
        ? await portfolioAPI.getChart(activeAsset.id, metricName, value)
        : await strategyAPI.getChart(activeAsset.id, metricName, value);
        
      const resData = isPortfolio
        ? await portfolioAPI.getChartData(activeAsset.id, metricName, value)
        : await strategyAPI.getChartData(activeAsset.id, metricName, value);

      const url = URL.createObjectURL(res.data);
      if (chartUrl) URL.revokeObjectURL(chartUrl); // Clean up previous memory
      setChartUrl(url);
      setChartData(resData.data);
    } catch (error) {
      console.error("Failed to load chart", error);
    } finally {
      setChartLoading(false);
    }
  };

  const prevStrategyIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeAsset) {
      if (chartUrl) {
         URL.revokeObjectURL(chartUrl);
         setChartUrl(null);
      }
      setChartData(null);
      setActiveChartMetric(null);
      setLastChartReq(null);
      prevStrategyIdRef.current = null;
      return;
    }

    const isNewStrategy = prevStrategyIdRef.current !== activeAsset.id;
    prevStrategyIdRef.current = activeAsset.id;

    if (!activeAsset.metrics_snapshot) {
      return;
    }

    // Use the user's preferred metric (persisted across switches)
    const metric = userMetricRef.current;
    const riskCfg = activeAsset.risk_config as any;
    const hasHeartbeat = !!riskCfg?.last_updated;
    const val = hasHeartbeat ? riskCfg?.[metric]?.current : undefined;

    if (isNewStrategy) {
      // Strategy changed: force reload bypassing the cache check
      // (React batches setLastChartReq(null) so it won't be flushed yet)
      console.log(`[useEffect] IS NEW STRATEGY -> Forcing reload with metric: ${metric}`);
      openChart(metric, val, false, true);
    } else {
      // Same strategy, polling refresh: silently update chart data if value changed
      console.log(`[useEffect] Polling refresh -> silently opening metric: ${metric}`);
      openChart(metric, val);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAsset?.id, activeAsset?.risk_config]);

  // --- Multi-select helpers ---
  const toggleCheck = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedIds.size === strategies.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(strategies.map((s) => s.id)));
  };

  const handleDeleteSelected = async () => {
    const count = checkedIds.size;
    if (!confirm(`⚠️ Delete ${count} selected strateg${count === 1 ? "y" : "ies"}? This cannot be undone.`)) return;
    setIsDeleting(true);
    setDeleteProgress({ done: 0, total: count });
    
    try {
      await strategyAPI.bulkDelete(Array.from(checkedIds));
      setDeleteProgress({ done: count, total: count });
    } catch { /* skip errors */ }
    
    setCheckedIds(new Set());
    setIsDeleting(false);
    fetchStrategies(accountId);
    if (accountId) fetchPortfolios(accountId);
  };

  if (!mounted || !isAuthenticated) return null;

  const allChecked = strategies.length > 0 && checkedIds.size === strategies.length;
  const someChecked = checkedIds.size > 0;

  const allPortfoliosChecked = portfolios.length > 0 && checkedPortfolioIds.size === portfolios.length;
  const somePortfoliosChecked = checkedPortfolioIds.size > 0;

  const handleCreatePortfolio = async () => {
    if (!newPortfolioName.trim() || checkedIds.size < 1) return;
    setIsCreatingPortfolio(true);
    const success = await createPortfolio(accountId, newPortfolioName, Array.from(checkedIds));
    if (success) {
      setNewPortfolioName("");
      setCheckedIds(new Set()); // Clear selection after creating
      // Deselect strategy to show the new Portfolio
      selectStrategy("");
    }
    setIsCreatingPortfolio(false);
  };

  const handleDeleteSelectedPortfolios = async () => {
    const count = checkedPortfolioIds.size;
    if (!confirm(`⚠️ Delete ${count} selected portfolio${count === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setIsDeleting(true);
    setDeleteProgress({ done: 0, total: count });
    let done = 0;
    for (const id of checkedPortfolioIds) {
      try { await deletePortfolio(id); } catch { /* skip */ }
      done++;
      setDeleteProgress({ done, total: count });
    }
    setCheckedPortfolioIds(new Set());
    setIsDeleting(false);
  };

  return (
    <main className="h-screen flex flex-col bg-surface-primary overflow-hidden relative">
      {/* ── FULL SCREEN OVERLAY FOR DELETION ── */}
      {isDeleting && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-surface-primary/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-16 h-16 border-4 border-iron-800 border-t-risk-red rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(255,82,82,0.5)]"></div>
          <h2 className="text-2xl font-bold text-iron-100 mb-2">Deleting Items...</h2>
          <p className="text-sm text-risk-red font-mono">Executing cascade deletion on portfolios & strategies</p>

          {deleteProgress && deleteProgress.total > 0 && (
            <div className="mt-8 w-64 space-y-2">
              <div className="flex justify-between text-[11px] text-iron-400 font-medium uppercase tracking-wider">
                <span>Removing...</span>
                <span>{deleteProgress.done} / {deleteProgress.total}</span>
              </div>
              <div className="w-full bg-iron-800 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-risk-red h-1.5 rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${(deleteProgress.done / deleteProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top bar */}
      <nav className="shrink-0 bg-surface-primary/80 backdrop-blur-xl border-b border-iron-800 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/dashboard" className="text-xs sm:text-sm text-iron-400 hover:text-iron-200 transition-colors shrink-0">
              ← {tWorkspace("navWorkspaces")}
            </Link>
            <span className="text-sm font-semibold text-iron-100 truncate">
              {account ? account.name : "..."}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <ThemeSelector mode="workspace" />
            <LanguageSwitcher />
            {account && (
              <div className="hidden md:flex items-center bg-risk-green/10 border border-risk-green/30 rounded-lg px-2 py-1 gap-2">
                <span className="text-xs text-iron-400">{tWorkspace("tokenLabel")}</span>
                <span className="text-xs font-mono text-risk-green">{account.api_token.substring(0, 12)}...</span>
                <button onClick={copyToken} className="text-xs text-risk-green hover:text-risk-green/70">
                  {copied ? tWorkspace("copied") : tWorkspace("btnCopy")}
                </button>
              </div>
            )}

            {/* Global Import Progress Bar */}
            {isBatchImporting && (
              <div className="w-32 lg:w-48 ml-2 mr-2 space-y-1">
                <div className="flex justify-between text-[10px] text-iron-400 font-medium">
                  <span>Importing...</span>
                  <span>{batchProgress.done}/{batchProgress.total}</span>
                </div>
                <div className="w-full bg-iron-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-risk-green h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${batchProgress.total > 0 ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* 🔔 Global Alerts Button */}
            <button
              onClick={() => setIsGlobalAlertsOpen(true)}
              className="relative flex items-center gap-1.5 bg-iron-800/60 hover:bg-iron-700/80 border border-iron-700/50 hover:border-risk-blue/40 rounded-lg px-3 py-1.5 transition-all duration-200 group"
              title="Gestionar alertas Telegram"
            >
              <span className="text-base group-hover:animate-[bellShake_0.5s_ease-in-out]">🔔</span>
              <span className="text-xs font-semibold text-iron-300 group-hover:text-iron-100 hidden sm:inline">
                {locale === 'es' ? 'Alertas' : 'Alerts'}
              </span>
              {alertCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-risk-blue text-white text-[10px] font-bold rounded-full px-1 shadow-[0_0_8px_rgba(59,130,246,0.4)] animate-in zoom-in-50 duration-200">
                  {alertCount}
                </span>
              )}
              {alertCount === 0 && !telegramLinked && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)] animate-pulse" 
                  title="Telegram no conectado" />
              )}
            </button>

            <div className="relative">
              <Button size="sm" onClick={() => setShowNewStrategyFork(prev => !prev)}>
                <span className="hidden sm:inline">{tWorkspace("btnNewStrategy")}</span>
                <span className="sm:hidden font-bold text-lg leading-none px-1">+</span>
              </Button>
              {showNewStrategyFork && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-surface-secondary border border-iron-700 rounded-xl p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200 space-y-2">
                  <Link href={`/dashboard/wizard?accountId=${accountId}`}
                    className="flex items-start gap-3 p-3 rounded-lg border border-iron-700 hover:border-emerald-500/60 hover:bg-emerald-500/5 transition-all text-left group"
                    onClick={() => setShowNewStrategyFork(false)}
                  >
                    <span className="text-xl">📊</span>
                    <div>
                      <span className="text-xs font-semibold text-iron-200">{tWorkspace("optionUpload")}</span>
                      <p className="text-[10px] text-iron-500 mt-0.5">{tWorkspace("optionUploadDesc")}</p>
                    </div>
                  </Link>
                  {hasMagicZero ? (
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-iron-800 opacity-50 cursor-not-allowed">
                      <span className="text-xl">🚫</span>
                      <div>
                        <span className="text-xs font-semibold text-iron-400">{tWorkspace("optionManual")}</span>
                        <p className="text-[10px] text-iron-600 mt-0.5">{tWorkspace("optionManualBlocked")}</p>
                      </div>
                    </div>
                  ) : (
                    <Link href={`/${locale}/dashboard/simulate?accountId=${accountId}&mode=manual`}
                      className="flex items-start gap-3 p-3 rounded-lg border border-iron-700 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all text-left group"
                      onClick={() => setShowNewStrategyFork(false)}
                    >
                      <span className="text-xl">✋</span>
                      <div>
                        <span className="text-xs font-semibold text-iron-200">{tWorkspace("optionManual")}</span>
                        <p className="text-[10px] text-iron-500 mt-0.5">{tWorkspace("optionManualDesc")}</p>
                      </div>
                    </Link>
                  )}
                </div>
              )}
            </div>
            <OrphanInbox accountId={accountId} onLinked={() => { fetchStrategies(accountId); setLiveEquityVersion(v => v + 1); }} />
            {account && user?.is_admin && (
              <Link href="/dashboard/bayes-sandbox" title="Bayes Sandbox (Master)">
                <Button variant="ghost" size="sm" className="text-iron-500 hover:text-[#00aaff] transition-colors">
                  🧠
                </Button>
              </Link>
            )}
            {account && (
              <Button variant="ghost" size="sm" onClick={() => setIsWorkspaceSettingsOpen(true)}
                className="text-iron-400 hover:text-iron-200 px-2 sm:px-3">
                <span className="hidden sm:inline">{tWorkspace("btnSettings")}</span>
                <span className="sm:hidden text-lg leading-none" title={tWorkspace("btnSettings")}>⚙️</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" className="px-2 sm:px-3 sm:min-w-[120px] text-center" onClick={() => {
              router.push(`/${locale}`);
              setTimeout(() => {
                useAuthStore.getState().logout();
              }, 200);
            }}>
              <span className="hidden sm:inline">{t("logout")}</span>
              <span className="sm:hidden text-lg leading-none" title={t("logout")}>🚪</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Global Alerts Drawer */}
      {isGlobalAlertsOpen && account && (
        <AlertsDrawer
          isOpen={isGlobalAlertsOpen}
          onClose={() => {
            setIsGlobalAlertsOpen(false);
            api.get("/api/alerts/user/all").then(r => setAlertCount((r.data || []).length)).catch(() => {});
            api.get("/api/telegram/status").then(r => setTelegramLinked(r.data.is_linked)).catch(() => {});
          }}
          strategies={strategies}
          portfolios={portfolios}
          accountId={account?.id || ""}
          initialTargetId={typeof selectedStrategy === 'string' ? selectedStrategy : selectedStrategy?.id}
        />
      )}

      <PactBanner 
        unconfiguredCount={unconfiguredCount} 
        accountId={accountId} 
        onConfigure={() => {
          const unconfigured = strategies.find((s: any) => {
            const rc = s.risk_config;
            return !rc || !rc.max_drawdown || !rc.max_drawdown.limit || rc.max_drawdown.limit === 0;
          });
          if (unconfigured) {
            setActiveTab("strategies");
            selectPortfolio("");
            selectStrategy(unconfigured.id);
            setIsEditModalOpen(true);
          }
        }}
      />

      <div ref={splitterContainerRef} className="flex-1 min-h-0 max-w-7xl mx-auto w-full px-3 sm:px-6 py-3 sm:py-4 flex flex-col">

        {/* TOP: Terminal Analytics — scrollable panel */}
        <div className="overflow-auto" style={{ height: `calc(${splitRatio * 100}% - 20px)` }}>
          <div className="w-full flex flex-col">
            {/* === DASHBOARD TOP LAYER (VIEW CONTROLLER) === */}
            <div className="flex flex-col gap-4">
              {/* Toolbar */}
              <div className="flex bg-surface-tertiary p-1 rounded-lg border border-iron-800 w-fit max-w-full overflow-x-auto scrollbar-hide">
                {DASHBOARD_VIEWS.map((dv) => {
                  const isActive = activeDashboardView === dv.id;
                  const dvName = dv.id === "ml-bayes" ? tWorkspace("tabBayes") : dv.id === "inspector" ? tWorkspace("tabInspector") : dv.id === "macro" ? tWorkspace("tabMacro") : dv.id === "vs-mode" ? tWorkspace("tabVs") : dv.name;
                  return (
                    <button
                      key={dv.id}
                      onClick={() => setActiveDashboardView(dv.id)}
                      className={`
                        px-3 py-1 text-[11px] uppercase tracking-wider font-bold rounded flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap
                        ${isActive ? "bg-iron-700 text-iron-50 shadow-[0_2px_10px_rgba(0,0,0,0.5)] border border-iron-600/50" : "text-iron-500 border border-transparent hover:text-iron-300 hover:bg-iron-800/50"}
                      `}
                    >
                      {dvName}
                    </button>
                  );
                })}
              </div>

              {/* Injected View */}
              {activeAsset ? (() => {
                 const ctx: DashboardContext = {
                   activeAsset,
                   liveEquity,
                   chartLoading,
                   chartUrl,
                   chartData,
                   activeChartMetric,
                   lastChartReq,
                   openChart,
                   setLiveEquityVersion,
                   liveEquityVersion,
                   accountId,
                   fetchStrategies,
                   tWorkspace,
                   isLightMode,
                   isInteractiveMode,
                   setIsInteractiveMode
                 };
                 const currentView = DASHBOARD_VIEWS.find(v => v.id === activeDashboardView);
                 return currentView ? currentView.renderComponent(ctx) : null;
              })() : (
               <Card className="flex items-center justify-center py-12">
                 <p className="text-iron-500 text-sm">
                   Click on any strategy or portfolio below to view its advanced analytics
                 </p>
               </Card>
              )}
            </div>
          </div>
        </div>

          {/* ═══ DRAGGABLE SPLITTER ═══ */}
          <div
            className="group relative flex items-center justify-center shrink-0 py-1.5 cursor-row-resize"
            onMouseDown={onSplitterMouseDown}
          >
            <div className="absolute w-full h-[2px] rounded-full bg-iron-800 group-hover:bg-cyan-500/60 transition-colors" />
            
            <div 
              className="relative z-10 flex items-center gap-2 bg-surface-primary px-3 opacity-0 group-hover:opacity-100 transition-opacity" 
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setSplitRatio(0.85); }}
                className="w-5 h-5 rounded-full bg-iron-800 hover:bg-cyan-500/20 border border-iron-700 hover:border-cyan-500/50 flex items-center justify-center text-iron-500 hover:text-cyan-400 transition-colors"
                title="Maximizar Panel Superior"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5l4 4 4-4" />
                </svg>
              </button>
              
              <button
                onClick={(e) => { e.stopPropagation(); setSplitRatio(DEFAULT_SPLIT); }}
                className="w-5 h-5 rounded-full bg-iron-800 hover:bg-iron-700 border border-iron-700 flex items-center justify-center text-iron-500 hover:text-iron-300 transition-colors"
                title="Restablecer Equilibrio"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 8h12M8 2v12" />
                </svg>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); setSplitRatio(0.15); }}
                className="w-5 h-5 rounded-full bg-iron-800 hover:bg-cyan-500/20 border border-iron-700 hover:border-cyan-500/50 flex items-center justify-center text-iron-500 hover:text-cyan-400 transition-colors"
                title="Maximizar Panel Inferior"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 11l4-4 4 4" />
                </svg>
              </button>
            </div>
          </div>

          {/* BOTTOM: Tab Switcher + Data Grids */}
          <div className="flex-1 min-h-0 flex flex-col w-full gap-3 overflow-y-auto pr-2 pb-8">

            {/* ── Tab Bar & View Switcher ── */}
            <div className="flex items-center justify-between border-b border-iron-800 shrink-0">
              {/* Left side: Content Tabs */}
              <div className="flex items-center gap-0">
                <button
                  onClick={() => setActiveTab("strategies")}
                  className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
                    activeTab === "strategies"
                      ? "text-iron-100 border-risk-green"
                      : "text-iron-500 border-transparent hover:text-iron-300 hover:border-iron-600"
                  }`}
                >
                  Strategies ({strategies.length})
                </button>
                <button
                  onClick={() => setActiveTab("portfolios")}
                  className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
                    activeTab === "portfolios"
                      ? "text-iron-100 border-cyan-400"
                      : "text-iron-500 border-transparent hover:text-iron-300 hover:border-iron-600"
                  }`}
                >
                  <span className="text-cyan-400 text-[10px]">●</span>
                  Portfolios ({portfolios.filter(p => !p.is_default).length})
                </button>
              </div>
              
              {/* Right side: Table View Switcher (OOP) */}
              <div className="flex items-center gap-1 bg-surface-tertiary p-1 rounded-md mr-4 mb-2 border border-iron-700">
                 {ALL_TABLE_VIEWS.map(v => (
                    <button 
                      key={v.id} 
                      onClick={() => setTableView(v)}
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded font-medium transition-colors ${tableView.id === v.id ? 'bg-risk-green/10 text-risk-green border border-risk-green/20' : 'text-iron-500 border border-transparent hover:text-iron-300 hover:bg-iron-800'}`}
                    >
                       {v.name}
                    </button>
                 ))}
              </div>
            </div>

            {/* ── STRATEGIES TAB ── */}
            {activeTab === "strategies" && (
              <>
                {/* Bulk actions toolbar */}
                {someChecked && (
                  <div className="bg-surface-secondary border border-iron-700 rounded-lg px-4 py-2 flex flex-wrap items-center justify-between gap-4 animate-in fade-in shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-iron-300 font-medium bg-iron-800 px-2 py-1 rounded">
                        {checkedIds.size} selected
                      </span>
                      
                      {checkedIds.size > 1 && (
                        <div className="flex items-center gap-2 ml-4">
                          <input 
                            type="text" 
                            placeholder="New Portfolio Name..." 
                            value={newPortfolioName}
                            onChange={(e) => setNewPortfolioName(e.target.value)}
                            className="bg-iron-900 border border-iron-700 rounded px-2 py-1 text-xs text-iron-200 w-48 focus:outline-none focus:border-cyan-500/50"
                            onKeyDown={(e) => { if (e.key === "Enter") handleCreatePortfolio(); }}
                          />
                          <Button size="sm" onClick={handleCreatePortfolio} disabled={!newPortfolioName.trim() || isCreatingPortfolio} isLoading={isCreatingPortfolio}>
                            Merge into Portfolio
                          </Button>
                        </div>
                      )}
                    </div>

                    <Button variant="danger" size="sm" onClick={handleDeleteSelected}
                      disabled={isDeleting} isLoading={isDeleting}>
                      🗑 Delete
                    </Button>
                  </div>
                )}

                {isLoading && (
                  <p className="text-sm text-iron-500 animate-pulse">Loading strategies...</p>
                )}

                {!isLoading && strategies.length > 0 && (
                  <div className="flex-1 min-h-[300px]">
                    <StrategyTable
                      view={tableView}
                      strategies={strategies}
                      selectedId={selectedStrategy?.id}
                      checkedIds={checkedIds}
                      allChecked={allChecked}
                      someChecked={someChecked}
                      onToggleAll={toggleAll}
                      onToggleCheck={toggleCheck}
                      onSelect={(id) => { selectPortfolio(""); selectStrategy(id); }}
                      onEdit={(id) => {
                        selectPortfolio("");
                        selectStrategy(id);
                        setIsEditModalOpen(true);
                      }}
                      onDelete={async (id) => {
                        if (!confirm("⚠️ Delete this strategy? Any custom portfolios using it will also be deleted.")) return;
                        await deleteStrategy(id);
                        if (accountId) fetchPortfolios(accountId);
                      }}
                    />
                  </div>
                )}

                {!isLoading && strategies.length === 0 && (
                  <Card>
                    <div className="py-6 space-y-4">
                      <p className="text-center text-iron-400 text-sm font-medium">{tWorkspace("emptyWorkspace")}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4">
                        <Link href={`/dashboard/wizard?accountId=${accountId}`}
                          className="flex flex-col items-center gap-2 p-4 rounded-xl border border-iron-700 hover:border-emerald-500/60 hover:bg-emerald-500/5 transition-all">
                          <span className="text-2xl">📊</span>
                          <span className="text-sm font-medium text-iron-200">{tWorkspace("optionUpload")}</span>
                          <span className="text-[10px] text-iron-500 text-center">{tWorkspace("optionUploadDesc")}</span>
                        </Link>
                        {hasMagicZero ? (
                          <div className="flex flex-col items-center gap-2 p-4 rounded-xl border border-iron-800 opacity-50 cursor-not-allowed">
                            <span className="text-2xl">🚫</span>
                            <span className="text-sm font-medium text-iron-400">{tWorkspace("optionManual")}</span>
                            <span className="text-[10px] text-iron-600 text-center">{tWorkspace("optionManualBlocked")}</span>
                          </div>
                        ) : (
                          <Link href={`/${locale}/dashboard/simulate?accountId=${accountId}&mode=manual`}
                            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-iron-700 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all">
                            <span className="text-2xl">✋</span>
                            <span className="text-sm font-medium text-iron-200">{tWorkspace("optionManual")}</span>
                            <span className="text-[10px] text-iron-500 text-center">{tWorkspace("optionManualDesc")}</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* ── PORTFOLIOS TAB ── */}
            {activeTab === "portfolios" && (
              <>
                {somePortfoliosChecked && (
                  <div className="bg-surface-secondary border border-iron-700 rounded-lg px-4 py-2 flex items-center justify-between animate-in fade-in">
                    <span className="text-xs text-iron-300">
                      {checkedPortfolioIds.size} selected
                    </span>
                    <Button variant="danger" size="sm" onClick={handleDeleteSelectedPortfolios}
                      disabled={isDeleting} isLoading={isDeleting}>
                      🗑 Delete Selected
                    </Button>
                  </div>
                )}

                {portfolios.filter(p => !p.is_default).length > 0 ? (
                  <div className="flex-1 min-h-[300px]">
                    <StrategyTable
                      view={tableView}
                      strategies={portfolios.filter(p => !p.is_default)}
                      universeContext={strategies}
                      selectedId={selectedPortfolio?.id}
                      selectedChildId={selectedStrategy?.id}
                      checkedIds={checkedPortfolioIds}
                      allChecked={allPortfoliosChecked}
                      someChecked={somePortfoliosChecked}
                      onToggleAll={() => {
                        const nonDef = portfolios.filter(p => !p.is_default);
                        if (checkedPortfolioIds.size === nonDef.length) setCheckedPortfolioIds(new Set());
                        else setCheckedPortfolioIds(new Set(nonDef.map((p) => p.id)));
                      }}
                      onToggleCheck={(id, checked) => {
                        setCheckedPortfolioIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(id); else next.delete(id);
                          return next;
                        });
                      }}
                      onSelect={(id) => { selectStrategy(""); selectPortfolio(id); }}
                      onSelectChild={(id) => { selectPortfolio(""); selectStrategy(id); }}
                      onEdit={async (id) => {
                        const p = portfolios.find(x => x.id === id);
                        if (!p || p.is_default) return;
                        selectStrategy("");
                        selectPortfolio(id);
                        setIsEditModalOpen(true);
                      }}
                      onDelete={async (id) => {
                        if (!confirm("⚠️ Delete this portfolio? This cannot be undone.")) return;
                        await deletePortfolio(id);
                        if (accountId) fetchPortfolios(accountId);
                      }}
                    />
                  </div>
                ) : (
                  <Card>
                    <p className="text-center text-iron-500 text-sm py-8">
                      No custom portfolios yet.<br />
                      <span className="text-iron-600">Select 2+ strategies in the Strategies tab and click "Merge into Portfolio".</span>
                    </p>
                  </Card>
                )}
              </>
            )}
        </div>
      </div>

      {isEditModalOpen && (selectedStrategy || selectedPortfolio) && (
        <EditStrategyModal
          strategy={(selectedStrategy || selectedPortfolio)!}
          onSave={async (id, data) => {
            if (selectedStrategy) {
              const ok = await updateStrategy(id, data);
              // Refresh live equity chart (aliases may have changed)
              setLiveEquityVersion(v => v + 1);
              // Refresh global alert count
              api.get("/api/alerts/user/all").then(r => setAlertCount((r.data || []).length)).catch(() => {});
              return ok;
            } else if (selectedPortfolio) {
              const res = await portfolioAPI.update(id, data);
              await fetchPortfolios(accountId);
              api.get("/api/alerts/user/all").then(r => setAlertCount((r.data || []).length)).catch(() => {});
              return !!res?.data;
            }
          }}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
      {isWorkspaceSettingsOpen && account && (
        <WorkspaceSettingsModal
          account={account}
          onClose={() => setIsWorkspaceSettingsOpen(false)}
          onSaved={() => {
            tradingAccountAPI.list().then(res => {
              const found = res.data.find((a: TradingAccount) => a.id === accountId);
              if (found) setAccount(found);
            });
          }}
        />
      )}
      <ConnectionStatus />
    </main>
  );
}
