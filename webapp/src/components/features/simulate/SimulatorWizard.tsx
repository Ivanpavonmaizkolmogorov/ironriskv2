"use client";

import React, { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import api, { strategyAPI } from '@/services/api';
import SimulateCharts from './SimulateCharts';
import UlyssesMoment from './UlyssesMoment';
import { UploadCloud, CheckCircle2, Eye, EyeOff, Shield, ChevronDown, ChevronUp } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { useAuthStore } from '@/store/useAuthStore';
import { useSimulatorStore } from '@/store/useSimulatorStore';
import { useOnboardingStore, type TraderRiskConfig } from '@/store/useOnboardingStore';
import MetricTooltip from '@/components/ui/MetricTooltip';
import { metricFormatter } from '@/utils/MetricFormatter';
import CsvColumnMapper, { autoDetectMapping } from '@/components/ui/CsvColumnMapper';
import { useSearchParams } from 'next/navigation';
import { useMetrics } from '@/contexts/MetricsContext';

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
  const [onboardPhase, setOnboardPhase] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'register' | 'login'>('register');
  const [isEntering, setIsEntering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isProfitMapped, setIsProfitMapped] = useState(false);
  const [editingRiskKey, setEditingRiskKey] = useState<string | null>(null);

  // Fork is only used from workspace dropdown — public simulator goes straight to tabs
  const searchParams = useSearchParams();
  const urlMode = searchParams.get('mode'); // 'manual' | 'csv' | null
  const [forkDone] = useState(true); // Always skip fork on public simulator

  // bt_discount: real account (1) vs backtest (20)


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
          setError(err.response?.data?.detail || err.message || "Error extracting columns from file");
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
      setError(err.response?.data?.detail || err.message || "Error analyzing edge");
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
      setError(err.response?.data?.detail || err.message || "Error analyzing CSV");
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
      setError("Todos los campos obligatorios (*) deben ser rellenados.");
      return;
    }
    
    setOnboardingLoading(true);
    setOnboardPhase(null);
    setError(null);
    try {
      if (modalMode === 'register') {
        // Phase 1: Register User
        setOnboardPhase(locale === 'en' ? 'Creating your account...' : 'Creando tu cuenta...');
        await register(onboardData.email, onboardData.password, onboardData.inviteCode);
        const authError = useAuthStore.getState().error;
        if (authError) {
          throw new Error(authError);
        }
        
        // Phase 2: Create Workspace
        setOnboardPhase(locale === 'en' ? 'Building encrypted workspace...' : 'Construyendo workspace encriptado...');
        const accRes = await api.post('/api/trading-accounts/', {
          name: onboardData.workspace,
          account_number: onboardData.accountNumber,
          broker: onboardData.broker
        });
        const accountId = accRes.data.id;

        // Phase 3: Create strategy from simulation data (backpack)
        const onboarding = useOnboardingStore.getState();
        if (onboarding.hasData && onboarding.traderRiskConfig) {
          setOnboardPhase(locale === 'en' ? 'Configuring risk profile...' : 'Configurando perfil de riesgo...');
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
          setOnboardPhase(locale === 'en' ? 'Importing strategy data...' : 'Importando datos de estrategia...');
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
      setOnboardPhase(locale === 'en' ? 'Entering your control tower...' : 'Entrando en tu torre de control...');
      const user = useAuthStore.getState().user;
      setIsEntering(true);
      setShowOnboarding(false);
      
      setTimeout(() => {
        useSimulatorStore.getState().reset();
        router.push(user?.is_admin ? '/admin/users' : '/dashboard');
      }, 800);

    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "Failed");
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
          <h2 className="text-2xl font-bold text-iron-100 mb-2">{locale === 'en' ? 'Authenticating...' : 'Autenticando...'}</h2>
          <p className="text-sm text-risk-green font-mono">{locale === 'en' ? 'Establishing Secure Session' : 'Estableciendo sesión segura'}</p>
          <p className="text-xs text-risk-yellow mt-4 bg-risk-yellow/10 border border-risk-yellow/20 px-4 py-2 rounded-lg animate-in fade-in duration-700 delay-500">
            📧 {locale === 'en'
              ? 'We sent you a welcome email — check your spam/junk folder if you don\'t see it!'
              : 'Te hemos enviado un correo de bienvenida — ¡revisa tu carpeta de spam/no deseado si no lo ves!'
            }
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
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-iron-400">
                      <span className="border-b border-dashed border-iron-600/60 hover:border-iron-300 cursor-help transition-colors select-none" title={t(`${key}Tooltip`)}>
                        {labelMap[key]}
                      </span>
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
                    Select File
                  </button>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-12 h-12 text-risk-green mb-2" />
                  <p className="text-sm text-iron-200 mb-2">
                    Ready to parse: <span className="font-mono text-iron-400">{csvFile.name}</span>
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
                    Remove File
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
            <span className="text-iron-500 font-mono tracking-widest uppercase">Calculating Edge Matrix...</span>
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
                ← {locale === 'en' ? 'Edit Parameters' : 'Volver a Editar'}
              </button>

              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-iron-500">
                {(() => {
                  const stats = result?.extracted_stats;
                  const isCsv = activeTab === 'csv';
                  if (stats) {
                    return (
                      <>
                        {activeTab === 'csv' && <span className="bg-risk-blue/10 px-2.5 py-1.5 rounded-lg border border-risk-blue/20 shadow-sm text-risk-blue font-semibold">📄 {csvFile ? csvFile.name : "Historial"}</span>}
                        <span className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">WR: <span className="text-iron-300">{(stats.win_rate * (stats.win_rate < 1.01 ? 100 : 1)).toFixed(1)}%</span></span>
                        <span className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">Win: <span className="text-risk-green">${stats.avg_win.toFixed(2)}</span></span>
                        <span className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">Loss: <span className="text-risk-red">${stats.avg_loss.toFixed(2)}</span></span>
                        {stats.std_win > 0 && <span className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">σW: <span className="text-iron-300">{Number(stats.std_win).toFixed(1)}</span></span>}
                        {stats.std_loss > 0 && <span className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">σL: <span className="text-iron-300">{Number(stats.std_loss).toFixed(1)}</span></span>}
                        <span className="bg-surface-primary px-2.5 py-1.5 rounded-lg border border-iron-800/50 shadow-sm">N: <span className="text-iron-300">{stats.n_trades}</span></span>
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
                              ? (locale === 'es' ? 'Establece tus límites inviolables. Haz click sobre los valores para ajustarlos a lo que realmente estás dispuesto a tolerar. Deja el check (✅) activado en las métricas que deseas auditar. Desmarca únicamente los vectores donde asumes el riesgo de navegar a ciegas.' : 'Set your unbreakable limits. Click on the values to adjust them to what you are truly willing to tolerate. Leave the check (✅) enabled on the metrics you want to audit. Uncheck only the vectors where you assume the risk of flying blind.')
                              : (locale === 'es' ? 'Establece tus límites teóricos. Haz click sobre los valores máximos proyectados para definirlos. Deja el check (✅) activado en los parámetros que deseas proteger. Desmarca únicamente aquellos donde prefieres no limitar el riesgo.' : 'Set your theoretical limits. Click on the projected maximum values to define them. Leave the check (✅) enabled on the parameters you want to protect. Uncheck only those where you prefer not to limit the risk.')}
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
                      if (pPositive < 0.50) {
                        return (
                          <div className="mt-4 pt-4 border-t border-red-500/20 relative z-10">
                            <div className="p-5 bg-red-500/5 border-2 border-red-500/30 rounded-xl flex items-start gap-4">
                              <span className="text-3xl">🎰</span>
                              <div>
                                <h4 className="text-sm font-bold text-red-400">{t('casinoGateTitle')}</h4>
                                <p className="text-xs text-iron-400 mt-2 leading-relaxed">{t('casinoGateDesc')}</p>
                                <p className="text-[10px] text-iron-600 mt-3 italic">{t('casinoGateAdvice')}</p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-col md:flex-row md:items-center justify-between mt-4 pt-4 border-t border-iron-800/30 relative z-10 gap-4">
                          <div className="flex flex-col gap-1 pr-4">
                            <h4 className="text-sm font-bold text-iron-200">{t('ctaLock')}</h4>
                            <p className="text-[11px] text-iron-500">{t('ctaDesc')}</p>
                          </div>
                          <button 
                            onClick={() => setShowOnboarding(true)}
                            className="shrink-0 whitespace-nowrap bg-risk-green text-surface-primary font-bold px-6 py-3 rounded-xl hover:brightness-110 hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(0,230,118,0.2)] text-sm"
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
              {!hasRiskData && (result?.decomposition?.p_positive ?? 1) >= 0.50 && (
                <div className="w-full mt-4 p-6 bg-gradient-to-r from-surface-secondary to-surface-primary border border-iron-800/50 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-risk-green/5 blur-[100px] rounded-full pointer-events-none" />
                  <div className="flex flex-col gap-1 z-10 w-full">
                    <h3 className="text-xl font-bold text-iron-100 tracking-tight">{t('ctaLock')}</h3>
                    <p className="text-iron-400 text-sm max-w-lg">{t('ctaDesc')}</p>
                  </div>
                  <div className="z-10 w-full md:w-auto">
                    <button 
                      onClick={() => setShowOnboarding(true)}
                      className="block w-full text-center whitespace-nowrap bg-iron-200 text-surface-primary font-bold px-8 py-4 rounded-xl hover:bg-white hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                    >
                      {t('btnCreateWorkspace')}
                    </button>
                  </div>
                </div>
              )}

              {/* Casino gate fallback (no risk panel + bad survival) */}
              {!hasRiskData && (result?.decomposition?.p_positive ?? 1) < 0.50 && (
                <div className="w-full mt-4 p-6 bg-red-500/5 border-2 border-red-500/30 rounded-2xl">
                  <div className="flex items-start gap-4">
                    <span className="text-4xl">🎰</span>
                    <div>
                      <h3 className="text-lg font-bold text-red-400">{t('casinoGateTitle')}</h3>
                      <p className="text-sm text-iron-400 mt-2">{t('casinoGateDesc')}</p>
                      <p className="text-xs text-iron-600 mt-3 italic">{t('casinoGateAdvice')}</p>
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
                      {locale === 'en' ? 'Forgot your password?' : '¿Olvidaste la contraseña?'}
                    </button>
                  )}
                </div>
              </div>
              
              {modalMode === 'register' && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-amber-400">
                      🔑 {locale === 'es' ? 'Código de Acceso Beta' : 'Beta Access Code'} <span className="text-risk-red">*</span>
                    </label>
                    <input 
                      type="text" required placeholder={locale === 'es' ? 'Introduce tu código' : 'Enter your code'}
                      value={onboardData.inviteCode} onChange={e => setOnboardData(p => ({...p, inviteCode: e.target.value.toUpperCase()}))}
                      className="bg-surface-primary border-2 border-amber-500/30 rounded-lg px-4 py-3 text-amber-300 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 transition-all font-mono font-bold tracking-wider uppercase"
                    />
                    <span className="text-[10px] text-iron-500">{locale === 'es' ? 'IronRisk está en fase beta privada. Introduce el código que recibiste.' : 'IronRisk is in private beta. Enter the code you received.'}</span>
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
                      <label className="text-xs font-medium text-iron-400">Número terminal MT4/MT5 <span className="text-risk-red">*</span></label>
                      <input 
                        type="text" required placeholder="Ej: 102456"
                        value={onboardData.accountNumber} onChange={e => setOnboardData(p => ({...p, accountNumber: e.target.value}))}
                        className="bg-surface-primary border border-iron-800/50 rounded-lg px-3 py-2 text-iron-200 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-all text-sm font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-iron-400" title="Vital para que el EA diferencie las operaciones de esta estrategia.">Magic Number <span className="text-risk-red">*</span></label>
                      <input 
                        type="text" required placeholder="Ej: 999111"
                        value={onboardData.magicNumber} onChange={e => setOnboardData(p => ({...p, magicNumber: e.target.value}))}
                        className="bg-surface-primary border border-iron-800/50 rounded-lg px-3 py-2 text-iron-200 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-all text-sm font-mono"
                      />
                      <span className="text-[10px] text-iron-600">Deja 0 si no usas Robots o desconoces tu EA.</span>
                    </div>
                  </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-iron-400">Broker (Opcional)</label>
                      <input 
                        type="text" placeholder="Ej: FTMO"
                        value={onboardData.broker} onChange={e => setOnboardData(p => ({...p, broker: e.target.value}))}
                        className="bg-surface-primary border border-iron-800/50 rounded-lg px-3 py-2 text-iron-200 focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20 transition-all text-sm"
                      />
                    </div>
                  <p className="text-xs text-iron-500 bg-iron-900/50 p-2 rounded-md border border-iron-800/30">
                    <span className="text-risk-yellow">⚠</span> Enlazaremos estrictamente tu token a este número de cuenta para proteger la validez de tus datos de riesgo.
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
