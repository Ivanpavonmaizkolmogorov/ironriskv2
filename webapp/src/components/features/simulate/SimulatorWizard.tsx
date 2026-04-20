"use client";

import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslations } from 'next-intl';
import api, { strategyAPI, waitlistAPI } from '@/services/api';
import SimulateCharts from './SimulateCharts';
import UlyssesMoment from './UlyssesMoment';
import EquityCurve from '@/components/features/charts/EquityCurve';
import { UploadCloud, CheckCircle2, Eye, EyeOff, Shield, ChevronDown, ChevronUp, Info } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { useAuthStore } from '@/store/useAuthStore';
import { useSimulatorStore } from '@/store/useSimulatorStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useOnboardingStore, type TraderRiskConfig } from '@/store/useOnboardingStore';
import MetricTooltip from '@/components/ui/MetricTooltip';
import { calcBlindRisk, getBlindRiskZone } from "@/utils/blindRisk";
import { metricFormatter } from '@/utils/MetricFormatter';
import CsvColumnMapper, { autoDetectMapping } from '@/components/ui/CsvColumnMapper';
import { useSearchParams } from 'next/navigation';
import { useMetrics } from '@/contexts/MetricsContext';

const extractError = (err: any, fallback: string) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) return detail[0].msg || fallback;
  return err?.message || fallback;
};

export default function SimulatorWizard() {
  const t = useTranslations('simulate');
  const locale = useLocale();
  const router = useRouter();
  const { register, login } = useAuthStore();
  
  const { 
    activeTab, setActiveTab,
    params, setParams,
    csvPnl, csvFile, setCsvData,
    result, setResult,
    showOnboarding, setShowOnboarding
  } = useSimulatorStore();

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getDef } = useMetrics();

  // Onboarding UI State
  const [onboardData, setOnboardData] = useState({
    email: '',
    password: '',
    workspace: '',
    accountNumber: '',
    broker: '',
    magicNumber: '0',
    inviteCode: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const { adminTelegramHandle, fetchSettings } = useSettingsStore();
  const [onboardPhase, setOnboardPhase] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'register' | 'login'>('register');
  const [isEntering, setIsEntering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isProfitMapped, setIsProfitMapped] = useState(false);
  const [editingRiskKey, setEditingRiskKey] = useState<string | null>(null);

  // Waitlist state (for simulator onboarding modal)
  const [simWaitlistSubmitted, setSimWaitlistSubmitted] = useState(false);
  const [simWaitlistLoading, setSimWaitlistLoading] = useState(false);
  const [simWaitlistAlready, setSimWaitlistAlready] = useState(false);
  const [simMotivation, setSimMotivation] = useState("");
  const [showTelegramQR, setShowTelegramQR] = useState(false);

  // Demo preview state
  const [demoPreview, setDemoPreview] = useState<{
    rows: string[][];
    headers: string[];
    pnlIndex: number;
    file: File;
    downloadUrl: string;
  } | null>(null);

  // Fork is only used from workspace dropdown — public simulator goes straight to tabs
  const searchParams = useSearchParams();
  const urlMode = searchParams.get('mode'); // 'manual' | 'csv' | null
  const [forkDone] = useState(true); // Always skip fork on public simulator

  // bt_discount: real account (1) vs backtest (20)


  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Auto-set tab from URL mode (workspace links)
  React.useEffect(() => {
    if (urlMode === 'manual') { setActiveTab('manual'); }
    else if (urlMode === 'csv') { setActiveTab('csv'); }
  }, [urlMode, setActiveTab]);

  // Subscribe to onboarding store for conditional rendering (survives language switch)
  const traderRiskConfig = useOnboardingStore(state => state.traderRiskConfig);
  const riskSuggestions = useOnboardingStore(state => state.riskSuggestions);
  const hasRiskData = !!(result && traderRiskConfig && riskSuggestions);

  // Extract headers from file whenever it is uploaded or remounted
  React.useEffect(() => {
    let active = true;
    if (csvFile && csvHeaders.length === 0) {
      const fetchHeaders = async () => {
        setLoading(true);
        try {
          const formData = new FormData();
          formData.append('file', csvFile);
          const res = await api.post('/api/simulate/extract_headers', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          if (!active) return;
          const headers = res.data.headers || [];
          setCsvHeaders(headers);
          
          const detected = autoDetectMapping(headers);
          setColumnMapping(detected);
          setIsProfitMapped(!!detected.profit);
        } catch (err: any) {
          if (!active) return;
          console.error("Error extracting columns:", err);
          setError(extractError(err, "Error extracting columns from file"));
        } finally {
          if (active) setLoading(false);
        }
      };
      fetchHeaders();
    }
    return () => { active = false; };
  }, [csvFile, csvHeaders.length]);

  const storeSimulationInBackpack = (data: any) => {
    const suggestions = data.risk_suggestions;
    if (suggestions) {
      useOnboardingStore.getState().setSimulationResult(
        suggestions,
        data.decomposition || {},
        data.extracted_stats || {},
        csvFile,
        data.equity_curve || null,
        data.last_trade_date || null,
      );


      
      // Auto-scroll to ensure the risk panel + CTA is visible on smaller screens
      setTimeout(() => {
        document.getElementById('risk-panel-container')?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 300);
    }
  };

  const handleManualSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/simulate/', {
        win_rate: params.winRate / 100.0,
        avg_win: params.avgWin,
        avg_loss: params.avgLoss,
        std_win: params.stdWin,
        std_loss: params.stdLoss,
        n_trades: params.nTrades
      });
      setResult(res.data);
      storeSimulationInBackpack(res.data);
    } catch (err: any) {
      setError(extractError(err, "Error analyzing edge"));
    } finally {
      setLoading(false);
    }
  };

  const handleCsvSubmit = async () => {
    if (!csvFile || !isProfitMapped) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('column_mapping', JSON.stringify(columnMapping));
      
      const res = await api.post('/api/simulate/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      storeSimulationInBackpack(res.data);
    } catch (err: any) {
      setError(extractError(err, "Error analyzing CSV"));
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset UI state and store file. The useEffect will automatically trigger extraction.
    setCsvHeaders([]); 
    setColumnMapping({});
    setIsProfitMapped(false);
    setError(null);
    setCsvData([1], file); // Let useSimulatorStore keep track of the file globally
  };

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardData.email || !onboardData.password) {
      setError(t('errorFields'));
      return;
    }
    if (modalMode === 'register' && (!onboardData.workspace || !onboardData.accountNumber)) {
      setError(t('requiredFields'));
      return;
    }
    
    setOnboardingLoading(true);
    setOnboardPhase(null);
    setError(null);
    try {
      if (modalMode === 'register') {
        // Phase 1: Register User
        setOnboardPhase(t('phaseCreating'));
        await register(onboardData.email, onboardData.password, onboardData.inviteCode);
        const authError = useAuthStore.getState().error;
        if (authError) {
          throw new Error(authError);
        }
        
        // Phase 2: Create Workspace
        setOnboardPhase(t('phaseWorkspace'));
        const accRes = await api.post('/api/trading-accounts/', {
          name: onboardData.workspace,
          account_number: onboardData.accountNumber,
          broker: onboardData.broker
        });
        const accountId = accRes.data.id;

        // Phase 3: Create strategy from simulation data (backpack)
        const onboarding = useOnboardingStore.getState();
        if (onboarding.hasData && onboarding.traderRiskConfig) {
          setOnboardPhase(t('phaseRisk'));
          const strategyName = csvFile ? csvFile.name.replace(/\.[^.]+$/, '') : onboardData.workspace;
          await strategyAPI.createFromSimulation({
            trading_account_id: accountId,
            name: strategyName,
            risk_config: onboarding.traderRiskConfig,
            decomposition: onboarding.decomposition || {},
            risk_suggestions: onboarding.riskSuggestions || {},
            extracted_stats: onboarding.extractedStats || {},
            equity_curve: onboarding.equityCurve || [],
            start_date: onboarding.lastTradeDate || undefined,
          });
          onboarding.clear();
        } else if (csvFile) {
          // Fallback: old CSV upload flow
          setOnboardPhase(t('phaseImporting'));
          const formData = new FormData();
          formData.append('trading_account_id', accountId);
          formData.append('name', csvFile.name.replace(/\.[^.]+$/, ''));
          formData.append('file', csvFile);
          
          await api.post('/api/strategies/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        }
      } else {
        // Login mode
        await login(onboardData.email, onboardData.password);
        const authError = useAuthStore.getState().error;
        if (authError) {
          throw new Error(authError);
        }
      }

      // Phase 4: Success — Transport to Dashboard
      setOnboardPhase(t('phaseEntering'));
      const user = useAuthStore.getState().user;
      setIsEntering(true);
      setShowOnboarding(false);
      
      setTimeout(() => {
        useSimulatorStore.getState().reset();
        router.push(user?.is_admin ? '/admin/users' : '/dashboard');
      }, 800);

    } catch (err: any) {
      console.error(err);
      setError(extractError(err, "Failed"));
      setOnboardingLoading(false);
      setOnboardPhase(null);
    }
  };

  return (
    <>
      {/* Full screen loading overlay when entering app */}
      {isEntering && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-surface-primary/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-16 h-16 border-4 border-iron-800 border-t-risk-green rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(0,230,118,0.5)]"></div>
          <h2 className="text-2xl font-bold text-iron-100 mb-2">{t('enteringAuth')}</h2>
          <p className="text-sm text-risk-green font-mono">{t('enteringSession')}</p>
          <p className="text-xs text-risk-yellow mt-4 bg-risk-yellow/10 border border-risk-yellow/20 px-4 py-2 rounded-lg animate-in fade-in duration-700 delay-500">
            📧 {t('enteringEmail')}
          </p>
        </div>
      )}

    <div className="w-full flex flex-col gap-10 items-center">
      
      {/* Header */}
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl md:text-5xl font-bold text-iron-100 tracking-tight mb-4">
          {t('title')}
        </h1>
        <p className="text-xl text-iron-400">
          {t('subtitle')}
        </p>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center">
        
        {/* Phase 1: Input Form */}
        {!result && !loading && forkDone && (
        <div className="w-full max-w-lg flex flex-col gap-6 bg-surface-secondary border border-iron-800/40 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 duration-500">
          
          {/* Tabs */}
          <div className="flex bg-surface-primary border border-iron-800/30 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === 'manual' ? 'bg-iron-800 text-iron-100 shadow' : 'text-iron-500 hover:text-iron-300'}`}
            >
              {t('tabManual')}
            </button>
            <button 
              onClick={() => setActiveTab('csv')}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === 'csv' ? 'bg-iron-800 text-iron-100 shadow' : 'text-iron-500 hover:text-iron-300'}`}
            >
              {t('tabCsv')}
            </button>
          </div>

          {/* Tutorial / Helper Text */}
          <div className="bg-risk-blue/5 border border-risk-blue/20 rounded-lg p-4 flex gap-3 text-sm text-iron-300 leading-relaxed shadow-inner">
            <span className="text-risk-blue shrink-0">💡</span>
            <p>{activeTab === 'manual' ? t('guideManual') : t('guideCsv')}</p>
          </div>

          {activeTab === 'manual' ? (
            <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300">
              {Object.entries(params).map(([key, value]) => {
                const labelMap: Record<string, string> = {
                  winRate: t('winRate'),
                  avgWin: t('avgWin'),
                  avgLoss: t('avgLoss'),
                  stdWin: t('stdWin'),
                  stdLoss: t('stdLoss'),
                  nTrades: t('nTrades'),
                };
                const isStdField = key === 'stdWin' || key === 'stdLoss';
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-iron-400 flex items-center gap-1.5">
                      <span className="border-b border-dashed border-iron-600/60 hover:border-iron-300 cursor-help transition-colors select-none" title={t(`${key}Tooltip`)}>
                        {labelMap[key]}
                      </span>
                      {isStdField && (
                        <span className="relative group">
                          <Info className="w-3.5 h-3.5 text-iron-600 hover:text-risk-blue cursor-help transition-colors" />
                          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-surface-secondary border border-iron-700 rounded-xl text-xs text-iron-300 leading-relaxed shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 z-50">
                            <span className="block font-semibold text-iron-100 mb-1.5">💡 {key === 'stdWin' ? t('stdWin') : t('stdLoss')}</span>
                            {t(`${key}Tooltip`)}
                          </span>
                        </span>
                      )}
                    </label>
                    <input 
                      type="number"
                      step={key === 'nTrades' ? 1 : 0.1}
                      min={0}
                      value={value}
                      onChange={(e) => setParams({ ...params, [key]: Number(e.target.value) })}
                      className="bg-surface-primary border border-iron-800/50 rounded-md px-4 py-2 text-iron-200 focus:outline-none focus:border-risk-green/50 transition-colors"
                    />
                  </div>
                );
              })}
              <button 
                onClick={handleManualSubmit}
                disabled={loading}
                className="mt-4 w-full bg-iron-200 text-surface-primary font-bold py-3 rounded-md hover:bg-white transition-colors disabled:opacity-50"
              >
                {loading ? "..." : t('btnAnalyze')}
              </button>
              <div className="flex items-center gap-3 mt-2">
                <div className="h-px flex-1 bg-iron-800" />
                <span className="text-[10px] text-iron-600 uppercase tracking-wider">{t('orDivider')}</span>
                <div className="h-px flex-1 bg-iron-800" />
              </div>
              <button
                onClick={() => setParams({ winRate: 45.5, avgWin: 142.25, avgLoss: 89.12, stdWin: 93.29, stdLoss: 31.0, nTrades: 200 })}
                className="w-full px-4 py-2 bg-risk-blue/10 hover:bg-risk-blue/20 text-risk-blue text-sm font-medium rounded-md transition-colors border border-risk-blue/20 hover:border-risk-blue/40"
              >
                {t('btnDemo')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 items-center justify-center p-8 border-2 border-dashed border-iron-800 rounded-xl bg-surface-primary text-center animate-in fade-in zoom-in-95 duration-300">
              
              <input 
                type="file" 
                accept=".csv,.txt,.htm,.html,.xlsx,.xls"
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              
              {!csvFile ? (
                <>
                  <UploadCloud className="w-12 h-12 text-iron-600 mb-2" />
                  <p className="text-sm text-iron-400 mb-4">{t('dragDrop')}</p>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-iron-800 hover:bg-iron-700 text-iron-100 text-sm font-medium rounded-md transition-colors"
                  >
                    {t('selectFile')}
                  </button>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="h-px flex-1 bg-iron-800" />
                    <span className="text-[10px] text-iron-600 uppercase tracking-wider">{t('orDivider')}</span>
                    <div className="h-px flex-1 bg-iron-800" />
                  </div>
                  <button 
                    onClick={async () => {
                      setLoading(true);
                      setError(null);
                      try {
                        const res = await fetch('/data/demo_backtest.csv');
                        if (!res.ok) throw new Error('Demo file not found');
                        const text = await res.text();
                        const lines = text.trim().split('\n').map(l => l.split(';'));
                        const headers = lines[0] || [];
                        const dataRows = lines.slice(1);
                        // Find Profit/Loss column index
                        const pnlIdx = headers.findIndex(h => /profit|loss|pnl|p\/l/i.test(h.trim()));
                        const blob = new Blob([text], { type: 'text/csv' });
                        const demoFile = new File([blob], 'DEMO_GBPJPY_H1.csv', { type: 'text/csv' });
                        const downloadUrl = URL.createObjectURL(blob);
                        setDemoPreview({ rows: dataRows, headers, pnlIndex: pnlIdx >= 0 ? pnlIdx : -1, file: demoFile, downloadUrl });
                      } catch (err: any) {
                        setError(err.message || 'Error loading demo dataset');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading || !!demoPreview}
                    className="px-4 py-2 bg-risk-blue/10 hover:bg-risk-blue/20 text-risk-blue text-sm font-medium rounded-md transition-colors border border-risk-blue/20 hover:border-risk-blue/40 disabled:opacity-50"
                  >
                    {loading ? t('demoLoading') : t('btnDemo')}
                  </button>

                  {/* ─── Demo Preview Panel ─── */}
                  {demoPreview && (
                    <div className="w-full mt-4 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                      {/* Mini PnL curve */}
                      {demoPreview.pnlIndex >= 0 && (() => {
                        const pnlValues = demoPreview.rows.map(r => parseFloat(r[demoPreview.pnlIndex]?.replace(',', '.'))).filter(v => !isNaN(v));
                        if (pnlValues.length === 0) return null;
                        let cumulative = 0;
                        const equityData = pnlValues.map((v, i) => {
                          cumulative += v;
                          return { trade: i + 1, equity: cumulative };
                        });
                        const lastVal = equityData[equityData.length - 1]?.equity ?? 0;
                        const ddMax = Math.min(...equityData.map(d => d.equity));
                        return (
                          <div className="bg-surface-tertiary border border-iron-800 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] uppercase tracking-wider text-iron-500 font-semibold">Equity Curve (P/L)</span>
                              <div className="flex items-center gap-3">
                                <span className="text-[9px] text-iron-600">{pnlValues.length} trades</span>
                                <span className="text-[9px] text-iron-600">DD max: {ddMax.toFixed(2)} $</span>
                                <span className={`text-xs font-bold font-mono ${lastVal >= 0 ? 'text-risk-green' : 'text-red-400'}`}>
                                  {lastVal >= 0 ? '+' : ''}{lastVal.toFixed(2)} $
                                </span>
                              </div>
                            </div>
                            <EquityCurve data={equityData} variant="backtest" />
                          </div>
                        );
                      })()}

                      {/* Spreadsheet table preview */}
                      <div className="bg-surface-tertiary border border-iron-800 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-iron-800">
                          <span className="text-[10px] uppercase tracking-wider text-iron-500 font-semibold">
                            📋 Preview — {demoPreview.rows.length} filas × {demoPreview.headers.length} columnas
                          </span>
                          <a 
                            href={demoPreview.downloadUrl} 
                            download="DEMO_GBPJPY_H1.csv"
                            className="text-[10px] text-risk-blue hover:text-risk-blue/80 underline transition-colors"
                          >
                            ⬇ Descargar CSV
                          </a>
                        </div>
                        <div className="overflow-x-auto max-h-48 overflow-y-auto">
                          <table className="w-full text-[11px] font-mono">
                            <thead className="sticky top-0 bg-surface-secondary">
                              <tr>
                                <th className="px-2 py-1.5 text-left text-iron-500 font-semibold border-b border-iron-800">#</th>
                                {demoPreview.headers.map((h, i) => (
                                  <th key={i} className={`px-2 py-1.5 text-left font-semibold border-b border-iron-800 whitespace-nowrap ${i === demoPreview.pnlIndex ? 'text-risk-green' : 'text-iron-400'}`}>
                                    {h.trim()}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {demoPreview.rows.slice(0, 15).map((row, ri) => {
                                const pnl = demoPreview.pnlIndex >= 0 ? parseFloat(row[demoPreview.pnlIndex]?.replace(',', '.')) : NaN;
                                return (
                                  <tr key={ri} className="border-b border-iron-800/50 hover:bg-iron-800/30 transition-colors">
                                    <td className="px-2 py-1 text-iron-600">{ri + 1}</td>
                                    {row.map((cell, ci) => (
                                      <td key={ci} className={`px-2 py-1 whitespace-nowrap ${ci === demoPreview.pnlIndex ? (pnl >= 0 ? 'text-risk-green font-semibold' : 'text-red-400 font-semibold') : 'text-iron-300'}`}>
                                        {cell.trim()}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {demoPreview.rows.length > 15 && (
                          <div className="text-center text-[10px] text-iron-600 py-1.5 border-t border-iron-800">
                            ... {demoPreview.rows.length - 15} filas más
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            if (demoPreview.downloadUrl) URL.revokeObjectURL(demoPreview.downloadUrl);
                            setDemoPreview(null);
                          }}
                          className="flex-1 py-2.5 text-sm font-medium text-iron-400 hover:text-iron-200 bg-surface-tertiary border border-iron-700 rounded-md hover:border-iron-500 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => {
                            setCsvHeaders([]);
                            setColumnMapping({});
                            setIsProfitMapped(false);
                            setCsvData([1], demoPreview.file);
                            if (demoPreview.downloadUrl) URL.revokeObjectURL(demoPreview.downloadUrl);
                            setDemoPreview(null);
                          }}
                          className="flex-1 py-2.5 text-sm font-bold text-surface-primary bg-risk-green hover:bg-risk-green/90 rounded-md transition-colors"
                        >
                          ✓ Cargar estos datos
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-12 h-12 text-risk-green mb-2" />
                  <p className="text-sm text-iron-200 mb-2">
                    {t('readyToParse')} <span className="font-mono text-iron-400">{csvFile.name}</span>
                  </p>

                  <CsvColumnMapper 
                    csvHeaders={csvHeaders} 
                    initialMapping={columnMapping} 
                    onMappingChange={(map, isValid) => {
                      setColumnMapping(map);
                      setIsProfitMapped(isValid);
                    }} 
                  />

                  <button 
                    onClick={() => { setCsvData(null, null); setCsvHeaders([]); }}
                    className="text-xs text-iron-500 hover:text-iron-300 underline mb-4 mt-6"
                  >
                    {t('removeFile')}
                  </button>
                  <button 
                    onClick={handleCsvSubmit}
                    disabled={loading || !isProfitMapped}
                    className="w-full bg-iron-200 text-surface-primary font-bold py-3 rounded-md hover:bg-white transition-colors disabled:opacity-50"
                  >
                    {loading ? "..." : t('btnAnalyze')}
                  </button>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

        </div>
        )}

        {/* Phase 1.5: Loading State */}
        {loading && (
          <div className="w-full h-[500px] flex items-center justify-center bg-surface-secondary/50 border border-iron-800/40 rounded-2xl animate-pulse">
            <span className="text-iron-500 font-mono tracking-widest uppercase">{t('loadingMatrix')}</span>
          </div>
        )}

        {/* Phase 2: Results Full Width */}
        {result && !loading && (
          <div className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Header: Back Button + Summary */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-surface-secondary/20 p-3 rounded-2xl border border-iron-800/30">
              <button 
                onClick={() => setResult(null)} 
                className="text-iron-400 hover:text-white flex items-center gap-2 text-sm font-semibold transition-all bg-surface-primary px-5 py-2.5 rounded-xl border border-iron-800/50 hover:border-iron-600/50 hover:scale-[1.02] shadow-lg shrink-0"
              >
                {t('editParams')}
              </button>

              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-iron-500">
                {(() => {
                  const stats = result?.extracted_stats;
                  const isCsv = activeTab === 'csv';
                  if (stats) {
                    return (
                      <>
                        {activeTab === 'csv' && <span className="bg-risk-blue/10 px-2.5 py-1.5 rounded-lg border border-risk-blue/20 shadow-sm text-risk-blue font-semibold">📄 {csvFile ? csvFile.name : "Historial"}</span>}
                        <span title="Win Rate — % de trades ganadores" className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">WR: <span className="text-iron-300">{(stats.win_rate * (stats.win_rate < 1.01 ? 100 : 1)).toFixed(1)}%</span></span>
                        <span title="Media de ganancia por trade ganador" className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">Win: <span className="text-risk-green">${stats.avg_win.toFixed(2)}</span></span>
                        <span title="Media de pérdida por trade perdedor" className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">Loss: <span className="text-risk-red">${stats.avg_loss.toFixed(2)}</span></span>
                        {stats.std_win > 0 && <span title="Desviación típica de las ganancias — cuánto varían tus wins" className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">σW: <span className="text-iron-300">{Number(stats.std_win).toFixed(1)}</span></span>}
                        {stats.std_loss > 0 && <span title="Desviación típica de las pérdidas — cuánto varían tus losses" className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">σL: <span className="text-iron-300">{Number(stats.std_loss).toFixed(1)}</span></span>}
                        <span title="Número total de trades en el backtest" className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">N: <span className="text-iron-300">{stats.n_trades}</span></span>
                      </>
                    );
                  }
                  if (isCsv) {
                    return (
                      <span className="bg-surface-primary px-3 py-1.5 rounded-lg border border-iron-800/50 shadow-sm flex items-center gap-2">
                        <span className="text-iron-400">📄 CSV Upload:</span> <span className="text-iron-200 font-bold">{csvPnl?.length} trades</span>
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            <SimulateCharts data={result} />

              {/* ═══ ULYSSES MOMENT — Narrative bridge (Plan Paso 2) ═══ */}
              {hasRiskData && riskSuggestions && (
                <UlyssesMoment riskSuggestions={riskSuggestions} source={activeTab} />
              )}

              {/* ═══ RISK CONFIG + CTA — Merged compact panel ═══ */}
              {hasRiskData && (() => {
                const rc = traderRiskConfig;
                const suggestions = riskSuggestions;
                if (!rc || !suggestions) return null;

                const RISK_FIELDS: { key: keyof TraderRiskConfig; label: string; labelEs: string; prefix: string; icon: string }[] = [
                  { key: 'max_drawdown', label: 'Max Drawdown', labelEs: 'Max Drawdown', prefix: '$', icon: getDef('max_drawdown').icon },
                  { key: 'daily_loss', label: 'Daily Loss', labelEs: 'Pérd. Diaria', prefix: '$', icon: getDef('daily_loss').icon },
                  { key: 'consecutive_losses', label: 'Consec. Losses', labelEs: 'Consec.', prefix: '', icon: getDef('consecutive_losses').icon },
                  { key: 'stagnation_trades', label: 'Stag. Trades', labelEs: 'Estanc. Trades', prefix: '', icon: getDef('stagnation_trades').icon },
                  { key: 'stagnation_days', label: 'Stag. Days', labelEs: 'Estanc. Días', prefix: '', icon: getDef('stagnation_days').icon },
                ];

                return (
                  <div id="risk-panel-container" className="w-full mt-4 bg-gradient-to-br from-surface-secondary to-surface-primary border border-risk-green/20 rounded-2xl p-5 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="absolute -top-16 -right-16 w-40 h-40 bg-risk-green/5 blur-[80px] rounded-full pointer-events-none" />
                    
                    {/* Header row: title + EV badge */}
                    <div className="flex flex-col gap-3 mb-5 relative z-10">
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-risk-green" />
                            <h3 className="text-base font-bold text-iron-100">
                              {locale === 'es' ? 'Tus Límites Inviolables' : 'Your Unbreakable Limits'}
                            </h3>
                            <span className="text-[10px] text-iron-600 hidden sm:inline">— {locale === 'es' ? 'Proyección estadística de tu perfil de riesgo' : 'Statistical projection of your risk profile'}</span>
                          </div>
                          <p className="text-[11px] text-iron-400 pl-7">
                            {activeTab === 'csv'
                              ? (locale === 'es' ? 'Establece tus límites inviolables. Haz click sobre los valores para ajustarlos a lo que realmente estás dispuesto a tolerar. Deja el check (✅) activado en las métricas que deseas auditar. Desmarca únicamente las métricas donde asumes el riesgo de navegar a ciegas.' : 'Set your unbreakable limits. Click on the values to adjust them to what you are truly willing to tolerate. Leave the check (✅) enabled on the metrics you want to audit. Uncheck only the metrics where you assume the risk of flying blind.')
                              : (locale === 'es' ? 'Establece tus límites inviolables. Haz click sobre los valores máximos proyectados para ajustarlos. Deja el check (✅) activado en las métricas que deseas auditar. Desmarca únicamente aquellas donde asumes el riesgo de navegar a ciegas.' : 'Set your unbreakable limits. Click on the projected maximum values to adjust them. Leave the check (✅) enabled on the metrics you want to audit. Uncheck only those where you assume the risk of flying blind.')}
                          </p>
                        </div>
                        {suggestions.ev_per_trade !== 0 && (
                          <div className="flex items-center gap-2 bg-surface-primary/50 px-3 py-1.5 rounded-lg border border-iron-800/30 shrink-0">
                            <span className="text-[10px] text-iron-500 uppercase tracking-wider">EV/trade</span>
                            <span className={`font-mono font-bold text-sm ${suggestions.ev_per_trade >= 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                              ${suggestions.ev_per_trade.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Compact 5-column risk grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 relative z-10">
                      {RISK_FIELDS.map(({ key, label, labelEs, prefix, icon }) => {
                        const isMandatory = key === 'max_drawdown';
                        const enabled = isMandatory ? true : (rc[key]?.enabled ?? true);
                        return (
                        <div key={key} className={`flex flex-col items-center p-3 rounded-xl border bg-surface-primary/50 shadow-sm transition-opacity ${enabled ? 'border-risk-green/40 opacity-100' : 'border-iron-800/50 opacity-40'}`}>
                          <div className="flex items-center gap-2 mb-2 w-full justify-center">
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={isMandatory}
                              onChange={(e) => { e.stopPropagation(); useOnboardingStore.getState().updateRiskParam(key, 'enabled', e.target.checked); }}
                              className={`w-3.5 h-3.5 rounded border-iron-600 bg-surface-tertiary text-risk-green focus:ring-risk-green/30 focus:ring-offset-0 accent-risk-green ${isMandatory ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                              title={isMandatory ? (locale === 'es' ? 'El Max DD es el pilar del cálculo Bayesiano y no puede desactivarse.' : 'Max DD is mandatory for Bayesian calculations.') : undefined}
                            />
                            <span className="text-[10px] text-iron-400 font-bold uppercase tracking-wider truncate">
                              <MetricTooltip metricKey={key} variant="card">
                                {icon} {locale === 'es' ? labelEs : label}
                              </MetricTooltip>
                            </span>
                          </div>
                          <div className={`flex items-baseline gap-0.5 w-full justify-center ${!enabled ? 'pointer-events-none' : ''}`}>
                            {editingRiskKey === key ? (
                              <>
                                <input
                                  autoFocus
                                  type="number"
                                  step="any"
                                  value={rc[key].limit}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => useOnboardingStore.getState().updateRiskParam(key, 'limit', Number(e.target.value))}
                                  onBlur={() => setEditingRiskKey(null)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingRiskKey(null); }}
                                  className="w-full bg-transparent text-center text-base font-mono text-iron-100 font-semibold focus:outline-none border-b border-risk-green/50 transition-colors"
                                />
                                {prefix && <span className="text-[9px] text-iron-600">{prefix}</span>}
                              </>
                            ) : (
                              <span 
                                onClick={(e) => { e.stopPropagation(); setEditingRiskKey(key); }}
                                className="w-full text-center text-base font-mono text-iron-100 font-semibold border-b border-transparent hover:border-iron-600/50 cursor-text transition-colors"
                                title={enabled ? "Click to edit" : undefined}
                              >
                                {metricFormatter.format(key, rc[key].limit)}
                              </span>
                            )}
                          </div>
                        </div>
                      )})}
                    </div>

                    {/* Integrated CTA or Casino Gate */}
                    {(() => {
                      const pPositive = result?.decomposition?.p_positive ?? 1;
                      const pPositivePct = (pPositive * 100).toFixed(1) + '%';
                      const blindRiskVal = calcBlindRisk(pPositive);
                      const blindRiskPct = blindRiskVal.toFixed(1) + '%';
                      const zone = getBlindRiskZone(blindRiskVal);
                      const evPerTrade = result?.decomposition?.ev_mean ?? riskSuggestions?.ev_per_trade ?? 0;
                      
                      if (zone === 'critical') {
                        return (
                          <div className="mt-4 pt-4 border-t border-red-500/20 relative z-10">
                            <div className="p-5 bg-red-500/5 border-2 border-red-500/30 rounded-xl flex items-start gap-4">
                              <span className="text-3xl">🎰</span>
                              <div className="flex-1">
                                <h4 className="text-sm font-bold text-red-400">{t('casinoGateTitle')}</h4>
                                <p className="text-xs text-iron-400 mt-2 leading-relaxed">{t('casinoGateDesc')}</p>
                                <p className="text-[10px] text-iron-600 mt-3 italic">{t('casinoGateAdvice')}</p>
                                <button
                                  onClick={() => { setResult(null); useSimulatorStore.getState().reset(); }}
                                  className="mt-4 text-xs text-iron-400 hover:text-iron-200 transition-colors underline underline-offset-2"
                                >
                                  {t('casinoGateRetry')}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="mt-4 pt-4 border-t border-iron-800/30 relative z-10">
                          {/* Dynamic headline with user's numbers */}
                          <div className="flex flex-col gap-3 mb-4">
                            <h4 className="text-base font-bold text-iron-100 tracking-tight">
                              {t('ctaLock', { pPositive: pPositivePct })}
                            </h4>
                            
                            {/* Mini stat summary — user's own numbers */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="flex flex-col items-center p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                                <span className="text-lg font-bold font-mono text-risk-green tracking-tight">{pPositivePct}</span>
                                <span className="text-[9px] text-iron-500 uppercase tracking-wider mt-0.5">{t('ctaSurvival')}</span>
                              </div>
                              <div className="flex flex-col items-center p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                                <span className="text-lg font-bold font-mono text-amber-400 tracking-tight">{blindRiskPct}</span>
                                <span className="text-[9px] text-iron-500 uppercase tracking-wider mt-0.5">{t('ctaBlindRisk')}</span>
                              </div>
                              <div className="flex flex-col items-center p-2.5 bg-surface-primary/50 border border-iron-800/30 rounded-lg">
                                <span className={`text-lg font-bold font-mono tracking-tight ${evPerTrade >= 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                                  ${evPerTrade.toFixed(2)}
                                </span>
                                <span className="text-[9px] text-iron-500 uppercase tracking-wider mt-0.5">{t('ctaEvTrade')}</span>
                              </div>
                            </div>

                            <p className="text-[11px] text-iron-400 leading-relaxed">
                              {t('ctaDesc', { blindRisk: blindRiskPct })}
                            </p>
                          </div>
                          
                          <button
                            onClick={() => setShowOnboarding(true)}
                            className="w-full bg-risk-green text-surface-primary font-bold px-6 py-3.5 rounded-xl hover:brightness-110 hover:scale-[1.01] transition-all shadow-[0_0_25px_rgba(0,230,118,0.25)] text-sm tracking-wide"
                          >
                            {t('btnCreateWorkspace')}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
              
              {/* Fallback CTA if no risk panel (shouldn't happen, but safe) */}
              {!hasRiskData && (result?.decomposition?.p_positive ?? 1) >= 0.50 && (() => {
                const pPos = result?.decomposition?.p_positive ?? 1;
                const pPosPct = (pPos * 100).toFixed(1) + '%';
                const blindPct = ((1 - pPos) * 100).toFixed(1) + '%';
                return (
                <div className="w-full mt-4 p-6 bg-gradient-to-r from-surface-secondary to-surface-primary border border-iron-800/50 rounded-2xl flex flex-col gap-4 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-risk-green/5 blur-[100px] rounded-full pointer-events-none" />
                  <div className="flex flex-col gap-1 z-10 w-full">
                    <h3 className="text-xl font-bold text-iron-100 tracking-tight">
                      {t('ctaLock', { pPositive: pPosPct })}
                    </h3>
                    <p className="text-iron-400 text-sm max-w-lg">
                      {t('ctaDesc', { blindRisk: blindPct })}
                    </p>
                  </div>
                  <div className="z-10 w-full">
                    <button 
                      onClick={() => setShowOnboarding(true)}
                      className="w-full text-center bg-risk-green text-surface-primary font-bold px-8 py-4 rounded-xl hover:brightness-110 hover:scale-[1.01] transition-all shadow-[0_0_25px_rgba(0,230,118,0.25)]"
                    >
                      {t('btnCreateWorkspace')}
                    </button>
                  </div>
                </div>
                );
              })()}

              {/* Casino gate fallback (no risk panel + bad survival) */}
              {!hasRiskData && (result?.decomposition?.p_positive ?? 1) < 0.50 && (
                <div className="w-full mt-4 p-6 bg-red-500/5 border-2 border-red-500/30 rounded-2xl">
                  <div className="flex items-start gap-4">
                    <span className="text-4xl">🎰</span>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-red-400">{t('casinoGateTitle')}</h3>
                      <p className="text-sm text-iron-400 mt-2">{t('casinoGateDesc')}</p>
                      <p className="text-xs text-iron-600 mt-3 italic">{t('casinoGateAdvice')}</p>
                      <button
                        onClick={() => { setResult(null); useSimulatorStore.getState().reset(); }}
                        className="mt-4 text-xs text-iron-400 hover:text-iron-200 transition-colors underline underline-offset-2"
                      >
                        {t('casinoGateRetry')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        )}

      </div>

      {/* ═══ ONBOARDING MODAL ═══ */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setShowOnboarding(false)}
          />
          
          {/* Modal Card */}
          <div className="relative w-full max-w-lg bg-surface-secondary border border-iron-800/60 rounded-2xl shadow-2xl p-8 flex flex-col gap-6 animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-500">
            
            {/* Close button */}
            <button 
              onClick={() => setShowOnboarding(false)}
              className="absolute top-4 right-4 text-iron-500 hover:text-iron-200 transition-colors text-xl leading-none"
              aria-label="Close"
            >
              ✕
            </button>

            {/* Decorative glow */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-risk-green/10 blur-[80px] rounded-full pointer-events-none" />

            {/* Tab Switcher */}
            <div className="flex gap-0 rounded-xl overflow-hidden border border-iron-800/50 w-full">
              <button
                type="button"
                onClick={() => { setModalMode('register'); setError(null); }}
                className={`flex-1 py-2.5 text-sm font-bold transition-all ${
                  modalMode === 'register'
                    ? 'bg-risk-green/15 text-risk-green border-b-2 border-risk-green'
                    : 'bg-surface-primary text-iron-500 hover:text-iron-300'
                }`}
              >
                {t('inlineOnboarding.tabRegister')}
              </button>
              <button
                type="button"
                onClick={() => { setModalMode('login'); setError(null); }}
                className={`flex-1 py-2.5 text-sm font-bold transition-all ${
                  modalMode === 'login'
                    ? 'bg-risk-green/15 text-risk-green border-b-2 border-risk-green'
                    : 'bg-surface-primary text-iron-500 hover:text-iron-300'
                }`}
              >
                {t('inlineOnboarding.tabLogin')}
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <h3 className="text-xl font-bold tracking-tight text-iron-100 pr-8">
                {modalMode === 'register' ? t('inlineOnboarding.title') : t('inlineOnboarding.loginTitle')}
              </h3>
              <p className="text-iron-400 text-sm">
                {modalMode === 'register' ? t('inlineOnboarding.desc') : t('inlineOnboarding.loginDesc')}
              </p>
            </div>
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm font-medium px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Waitlist + Telegram CTA when invalid beta code */}
            {error && (error.toLowerCase().includes('invalid beta') || error.toLowerCase().includes('invalid_invite') || error.toLowerCase().includes('incorrecto') || error.toLowerCase().includes('caducado')) && !simWaitlistSubmitted && onboardData.email.trim() && (
              <div className="bg-risk-green/5 border border-risk-green/20 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-500">
                <p className="text-sm text-iron-300 mb-3">
                  {locale === 'en'
                    ? "No code yet? Get one instantly via Telegram or join the waitlist."
                    : "¿Aún no tienes código? Consíguelo al instante por Telegram o apúntate a la lista."}
                </p>

                {/* Primary: Telegram direct — QR + link */}
                <button
                  type="button"
                  onClick={() => setShowTelegramQR(!showTelegramQR)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#29B6F6]/15 border border-[#29B6F6]/30 text-[#29B6F6] text-sm font-semibold rounded-lg hover:bg-[#29B6F6]/25 hover:border-[#29B6F6]/50 transition-all duration-300 mb-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                  {locale === 'es' ? 'Pedir código por Telegram' : 'Request code via Telegram'}
                </button>

                {/* QR Code reveal */}
                {showTelegramQR && (
                  <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-xl mb-2 animate-in fade-in zoom-in-95 duration-300">
                    <QRCodeSVG
                      value={`https://t.me/${adminTelegramHandle.replace('@', '')}`}
                      size={160}
                      bgColor="#ffffff"
                      fgColor="#0a0a0a"
                      level="M"
                      includeMargin={false}
                    />
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs font-bold text-neutral-800">{adminTelegramHandle}</span>
                      <span className="text-[10px] text-neutral-500">
                        {locale === 'es' ? 'Escanea con tu móvil para abrir Telegram' : 'Scan with your phone to open Telegram'}
                      </span>
                    </div>
                    <a
                      href={`https://t.me/${adminTelegramHandle.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[#29B6F6] underline underline-offset-2"
                    >
                      {locale === 'es' ? 'O abre directo desde aquí →' : 'Or open directly from here →'}
                    </a>
                  </div>
                )}

                {/* Divider */}
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-iron-800/50" />
                  <span className="text-[10px] text-iron-600 uppercase">{locale === 'es' ? 'o bien' : 'or'}</span>
                  <div className="flex-1 h-px bg-iron-800/50" />
                </div>

                {/* Secondary: waitlist email */}
                <textarea
                  value={simMotivation}
                  onChange={(e) => setSimMotivation(e.target.value)}
                  placeholder={locale === 'en' ? "What brought you to IronRisk? (optional)" : "¿Qué te ha traído a IronRisk? (opcional)"}
                  rows={2}
                  className="w-full bg-surface-primary border border-iron-700 rounded-lg px-3 py-2 text-sm text-iron-200 placeholder:text-iron-600 focus:outline-none focus:border-risk-green/40 resize-none mb-2 transition-colors"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setSimWaitlistLoading(true);
                    try {
                      const res = await waitlistAPI.submit(onboardData.email, 'simulator_onboard', locale, simMotivation);
                      setSimWaitlistSubmitted(true);
                      setSimWaitlistAlready(res.data?.already_registered || false);
                    } catch {
                      setSimWaitlistSubmitted(true);
                    } finally {
                      setSimWaitlistLoading(false);
                    }
                  }}
                  disabled={simWaitlistLoading}
                  className="w-full py-2 px-4 bg-surface-primary border border-iron-700 text-iron-400 text-xs font-medium rounded-lg hover:bg-surface-secondary hover:text-iron-200 transition-all duration-300 disabled:opacity-50"
                >
                  {simWaitlistLoading
                    ? '...'
                    : locale === 'en'
                      ? `📩 Or just notify me at ${onboardData.email}`
                      : `📩 O simplemente avisarme a ${onboardData.email}`}
                </button>
              </div>
            )}

            {simWaitlistSubmitted && (
              <div className="bg-risk-green/10 border border-risk-green/30 rounded-xl p-4 text-center animate-in fade-in duration-500">
                <p className="text-risk-green font-semibold text-sm">
                  {simWaitlistAlready
                    ? (locale === 'en' ? '👋 You\'re already on the list!' : '👋 ¡Ya estás en la lista!')
                    : (locale === 'en' ? '🎉 You\'re on the list!' : '🎉 ¡Estás en la lista!')}
                </p>
                <p className="text-iron-400 text-xs mt-1">
                  {locale === 'en'
                    ? "We'll email you when new spots open. Check your inbox!"
                    : "Te avisaremos por email cuando haya plazas. ¡Revisa tu bandeja!"}
                </p>
              </div>
            )}

            <form onSubmit={handleOnboardSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-iron-400">{t('email')}</label>
                  <input 
                    type="email" required autoFocus
                    value={onboardData.email} onChange={e => setOnboardData(p => ({...p, email: e.target.value}))}
                    className="bg-surface-primary border border-iron-800/50 rounded-lg px-4 py-2.5 text-iron-200 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5 relative">
                  <label className="text-sm font-medium text-iron-400">{t('password')}</label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} required
                      value={onboardData.password} onChange={e => setOnboardData(p => ({...p, password: e.target.value}))}
                      className="bg-surface-primary border border-iron-800/50 rounded-lg pl-4 pr-10 py-2.5 text-iron-200 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-all w-full"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-iron-500 hover:text-iron-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {modalMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowOnboarding(false);
                        router.push(`/${locale}/login`);
                      }}
                      className="text-xs text-iron-500 hover:text-risk-green transition-colors mt-1"
                    >
                      {t('forgotPassword')}
                    </button>
                  )}
                </div>
              </div>
              
              {modalMode === 'register' && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-amber-400">
                      {t('betaCodeLabel')} <span className="text-risk-red">*</span>
                    </label>
                    <input 
                      type="text" required placeholder={t('betaCodePlaceholder')}
                      value={onboardData.inviteCode} onChange={e => setOnboardData(p => ({...p, inviteCode: e.target.value.toUpperCase()}))}
                      className="bg-surface-primary border-2 border-amber-500/30 rounded-lg px-4 py-3 text-amber-300 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 transition-all font-mono font-bold tracking-wider uppercase"
                    />
                    <span className="text-[10px] text-iron-500">{t('betaCodeHint')}{' '}
                      <button 
                        type="button"
                        onClick={() => setShowTelegramQR(!showTelegramQR)}
                        className="text-[#29B6F6] hover:text-[#4FC3F7] font-semibold underline underline-offset-2 transition-colors"
                      >
                        {locale === 'es' ? '💬 Pedir código por Telegram' : '💬 Request code via Telegram'}
                      </button>
                    </span>
                    {showTelegramQR && (
                      <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-xl mt-2 animate-in fade-in zoom-in-95 duration-300">
                        <QRCodeSVG
                          value={`https://t.me/${adminTelegramHandle.replace('@', '')}`}
                          size={140}
                          bgColor="#ffffff"
                          fgColor="#0a0a0a"
                          level="M"
                          includeMargin={false}
                        />
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs font-bold text-neutral-800">{adminTelegramHandle}</span>
                          <span className="text-[10px] text-neutral-500">
                            {locale === 'es' ? 'Escanea con tu móvil para abrir Telegram' : 'Scan with your phone to open Telegram'}
                          </span>
                        </div>
                        <a
                          href={`https://t.me/${adminTelegramHandle.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[#29B6F6] underline underline-offset-2"
                        >
                          {locale === 'es' ? 'O abre directo desde aquí →' : 'Or open directly from here →'}
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-iron-400">{t('inlineOnboarding.workspaceLabel')} <span className="text-risk-red">*</span></label>
                    <input 
                      type="text" required placeholder={t('inlineOnboarding.workspacePlaceholder')}
                      value={onboardData.workspace} onChange={e => setOnboardData(p => ({...p, workspace: e.target.value}))}
                      className="bg-surface-primary border-2 border-iron-800/50 rounded-lg px-4 py-3 text-iron-200 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-all font-medium"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-iron-400">{t('mtAccountLabel')} <span className="text-risk-red">*</span></label>
                      <input 
                        type="text" required placeholder={t('mtAccountPlaceholder')}
                        value={onboardData.accountNumber} onChange={e => setOnboardData(p => ({...p, accountNumber: e.target.value}))}
                        className="bg-surface-primary border border-iron-800/50 rounded-lg px-3 py-2 text-iron-200 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-all text-sm font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-iron-400" title={t('magicHint')}>{t('magicLabel')} <span className="text-risk-red">*</span></label>
                      <input 
                        type="text" required placeholder={t('magicPlaceholder')}
                        value={onboardData.magicNumber} onChange={e => setOnboardData(p => ({...p, magicNumber: e.target.value}))}
                        className="bg-surface-primary border border-iron-800/50 rounded-lg px-3 py-2 text-iron-200 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-all text-sm font-mono"
                      />
                      <span className="text-[10px] text-iron-600">{t('magicHint')}</span>
                    </div>
                  </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-iron-400">{t('brokerLabel')}</label>
                      <input 
                        type="text" placeholder={t('brokerPlaceholder')}
                        value={onboardData.broker} onChange={e => setOnboardData(p => ({...p, broker: e.target.value}))}
                        className="bg-surface-primary border border-iron-800/50 rounded-lg px-3 py-2 text-iron-200 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-all text-sm"
                      />
                    </div>
                  <p className="text-xs text-iron-500 bg-iron-900/50 p-2 rounded-md border border-iron-800/30">
                    <span className="text-risk-yellow">⚠</span> {t('bindWarning')}
                  </p>
                </div>
              )}

              <button 
                type="submit" disabled={onboardingLoading}
                className="mt-2 w-full bg-risk-green text-surface-primary font-bold py-4 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 text-lg shadow-[0_0_25px_rgba(0,230,118,0.25)]"
              >
                {onboardingLoading
                  ? (onboardPhase || t('inlineOnboarding.creating'))
                  : modalMode === 'register'
                    ? t('inlineOnboarding.btnSubmit')
                    : t('inlineOnboarding.btnLogin')
                }
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
