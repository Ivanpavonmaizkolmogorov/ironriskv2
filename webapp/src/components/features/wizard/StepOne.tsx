/** Wizard Step 1 — Strategy Name, Description, MagicNumber, StartDate. */
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useWizardStore } from "@/store/useWizardStore";
import { tradingAccountAPI, strategyAPI, orphanAPI } from "@/services/api";
import type { TradingAccount } from "@/types/tradingAccount";
import BatchImportModal from "./BatchImportModal";
import { useTranslations } from "next-intl";

export default function StepOne() {
  const router = useRouter();
  const t = useTranslations("wizard");
  const searchParams = useSearchParams();
  const urlAccountId = searchParams.get("accountId");
  const urlMagic = searchParams.get("magic");
  const orphanTrades = searchParams.get("orphanTrades");
  const orphanPnl = searchParams.get("orphanPnl");
  const orphanSince = searchParams.get("orphanSince");

  // Detect if we're in "orphan configure" mode
  const isOrphanMode = !!urlMagic;
  const magicNum = urlMagic ? parseInt(urlMagic) : 0;

  const { stepOneData, updateStepOne, stepThreeData, updateStepThree, setStep } = useWizardStore();
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [showBatch, setShowBatch] = useState(false);
  const [orphanTradesList, setOrphanTradesList] = useState<any[]>([]);
  const [orphanList, setOrphanList] = useState<any[]>([]);
  const [showTrades, setShowTrades] = useState(false);
  const [previewMagic, setPreviewMagic] = useState<number | null>(null);
  const [previewTrades, setPreviewTrades] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
  const [previewSort, setPreviewSort] = useState<SortConfig>(null);
  const [orphanSort, setOrphanSort] = useState<SortConfig>(null);

  const getSortedData = (data: any[], config: SortConfig) => {
    if (!config) return data;
    return [...data].sort((a, b) => {
      let valA = a[config.key];
      let valB = b[config.key];
      if (config.key === 'profit' || config.key === 'volume') {
        valA = Number(valA); valB = Number(valB);
      } else if (config.key === 'close_time') {
        valA = new Date(valA).getTime(); valB = new Date(valB).getTime();
      } else {
        valA = valA ? String(valA).toLowerCase() : '';
        valB = valB ? String(valB).toLowerCase() : '';
      }
      if (valA < valB) return config.direction === 'asc' ? -1 : 1;
      if (valA > valB) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const sortedPreviewTrades = React.useMemo(() => getSortedData(previewTrades, previewSort), [previewTrades, previewSort]);
  const sortedOrphanTrades = React.useMemo(() => getSortedData(orphanTradesList, orphanSort), [orphanTradesList, orphanSort]);

  const SortIcon = ({ col, config }: { col: string, config: SortConfig }) => {
    if (config?.key !== col) return <span className="opacity-30 inline-block ml-1">↕</span>;
    return <span className="inline-block ml-1">{config.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const handleSort = (key: string, setSort: React.Dispatch<React.SetStateAction<SortConfig>>) => {
    setSort(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null; // cycle to unsorted
      }
      return { key, direction: 'desc' }; // Default to desc first for profit/date
    });
  };

  const handlePreview = async (magic: number) => {
    if (previewMagic === magic) {
      setPreviewMagic(null);
      return;
    }
    setPreviewMagic(magic);
    setLoadingPreview(true);
    try {
      const res = await orphanAPI.trades(stepOneData.tradingAccountId, magic);
      setPreviewTrades(res.data);
    } catch {
      setPreviewTrades([]);
    } finally {
      setLoadingPreview(false);
    }
  };

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

  // Pre-fill from orphan context
  useEffect(() => {
    if (isOrphanMode && magicNum) {
      updateStepOne({
        magicNumber: magicNum,
        name: stepOneData.name || `Strategy_${magicNum}`,
      });
    }
  }, [isOrphanMode, magicNum]);

  // Fetch orphans for quick linking chips
  useEffect(() => {
    if (stepOneData.tradingAccountId && !isOrphanMode) {
      orphanAPI.list(stepOneData.tradingAccountId)
        .then(res => setOrphanList(res.data))
        .catch(() => setOrphanList([]));
    }
  }, [stepOneData.tradingAccountId, isOrphanMode]);

  const canProceed = stepOneData.name.trim().length > 0 && stepOneData.tradingAccountId.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-iron-100 mb-1">{t("step1Title")}</h2>
        <p className="text-sm text-iron-500">{t("step1Desc")}</p>
      </div>

      {/* Orphan context banner */}
      {isOrphanMode && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-lg">📊</span>
              <span className="text-sm font-semibold text-amber-400">{t("configOrphan")}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                updateStepOne({ magicNumber: 0, name: '' });
                router.replace(`?accountId=${stepOneData.tradingAccountId}`, { scroll: false });
              }}
              className="text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2 py-1 rounded transition-colors"
            >
              {t("undo")}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-tertiary/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-iron-500 uppercase tracking-wider">Magic</p>
              <p className="text-sm font-mono font-bold text-iron-200">{magicNum}</p>
            </div>
            <div className="bg-surface-tertiary/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-iron-500 uppercase tracking-wider">Trades</p>
              <p className="text-sm font-mono font-bold text-iron-200">{orphanTrades || '—'}</p>
            </div>
            <div className="bg-surface-tertiary/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-iron-500 uppercase tracking-wider">PnL</p>
              <p className={`text-sm font-mono font-bold ${Number(orphanPnl) >= 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                ${orphanPnl || '0.00'}
              </p>
            </div>
          </div>
          {orphanSince && (
            <p className="text-[10px] text-iron-500 font-mono">
              Detectado desde: {new Date(orphanSince).toLocaleString()}
            </p>
          )}

          {/* Recent trades list */}
          <button
            onClick={() => {
              setShowTrades(!showTrades);
              if (!showTrades && orphanTradesList.length === 0 && urlAccountId) {
                orphanAPI.trades(urlAccountId, magicNum)
                  .then(res => setOrphanTradesList(res.data))
                  .catch(() => {});
              }
            }}
            className="text-[10px] text-amber-500/70 hover:text-amber-400 transition-colors font-medium flex items-center gap-1"
          >
            {showTrades ? '▾' : '▸'} {t("recentTrades")}
          </button>
          {showTrades && (
            <div className="max-h-48 overflow-auto rounded-lg border border-iron-800">
              {orphanTradesList.length === 0 ? (
                <p className="text-[10px] text-iron-500 p-3 text-center">{t("loading")}</p>
              ) : (
                <table className="w-full text-[10px] font-mono">
                  <thead className="bg-surface-tertiary/80 sticky top-0">
                    <tr className="text-iron-500 cursor-pointer select-none">
                      <th className="py-1.5 px-2 text-left hover:text-white" onClick={() => handleSort('symbol', setOrphanSort)}>
                        Symbol <SortIcon col="symbol" config={orphanSort} />
                      </th>
                      <th className="py-1.5 px-2 text-left hover:text-white" onClick={() => handleSort('comment', setOrphanSort)}>
                        Comment <SortIcon col="comment" config={orphanSort} />
                      </th>
                      <th className="py-1.5 px-2 text-right hover:text-white" onClick={() => handleSort('volume', setOrphanSort)}>
                        Vol <SortIcon col="volume" config={orphanSort} />
                      </th>
                      <th className="py-1.5 px-2 text-right hover:text-white" onClick={() => handleSort('profit', setOrphanSort)}>
                        Profit <SortIcon col="profit" config={orphanSort} />
                      </th>
                      <th className="py-1.5 px-2 text-right hover:text-white" onClick={() => handleSort('close_time', setOrphanSort)}>
                        Fecha <SortIcon col="close_time" config={orphanSort} />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-iron-800/50">
                    {sortedOrphanTrades.map((t: any, i: number) => (
                      <tr key={i} className="hover:bg-surface-tertiary/30 transition-colors">
                        <td className="py-1 px-2 text-iron-300">{t.symbol}</td>
                        <td className="py-1 px-2 text-iron-500 truncate max-w-[120px]" title={t.comment}>{t.comment || '—'}</td>
                        <td className="py-1 px-2 text-right text-iron-400">{t.volume}</td>
                        <td className={`py-1 px-2 text-right font-semibold ${t.profit >= 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                          ${t.profit.toFixed(2)}
                        </td>
                        <td className="py-1 px-2 text-right text-iron-500">{t.close_time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-iron-200">{t("tradingAccount")} <span className="text-risk-red">*</span></label>
        {accounts.length === 0 ? (
          <p className="text-amber-400 text-sm py-2">{t("noAccounts")}</p>
        ) : urlAccountId ? (
          <div className="w-full bg-surface-tertiary/50 border border-iron-800 rounded-lg px-4 py-2.5 text-iron-400 cursor-not-allowed">
            {accounts.find(a => a.id === urlAccountId)?.name || t("loadingWorkspace")} {t("locked")}
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

      {/* Batch import — only show if NOT in orphan mode (configuring a single bot) */}
      {stepOneData.tradingAccountId && !isOrphanMode && (
        <div className="bg-surface-secondary border border-iron-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-iron-200">{t("multipleStrategies")}</p>
              <p className="text-xs text-iron-500">{t("multipleStrategiesDesc")}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="danger" size="sm"
                onClick={async () => {
                  if (!confirm(t("deleteAllConfirm"))) return;
                  try {
                    const res = await strategyAPI.deleteAll();
                    alert(res.data.detail);
                    window.location.reload();
                  } catch { alert(t("deleteFailed")); }
                }}>
                {t("deleteAll")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowBatch(true)}
                className="text-iron-300 border border-iron-600 hover:text-iron-100">
                {t("batchImport")}
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
        label={t("strategyName")}
        placeholder={isOrphanMode ? `Strategy_${magicNum}` : t("strategyNamePlaceholder")}
        value={stepOneData.name}
        onChange={(e) => updateStepOne({ name: e.target.value })}
      />

      <Input
        label={t("description")}
        placeholder={t("descriptionPlaceholder")}
        value={stepOneData.description}
        onChange={(e) => updateStepOne({ description: e.target.value })}
      />

      <div className="grid grid-cols-2 gap-4">
        {isOrphanMode ? (
          /* Magic Number — locked in orphan mode */
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-iron-200">{t("magicNumber")} 🔒</label>
            <div className="w-full bg-surface-tertiary/50 border border-iron-800 rounded-lg px-4 py-2.5 text-iron-400 font-mono cursor-not-allowed">
              {magicNum}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              label={t("magicNumber")}
              type="number"
              placeholder={t("magicNumberPlaceholder")}
              value={stepOneData.magicNumber || ""}
              onChange={(e) => updateStepOne({ magicNumber: parseInt(e.target.value) || 0 })}
            />
            {!isOrphanMode && orphanList.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-iron-500">{t("detectedOrphans")}</span>
                {orphanList.map(bot => (
                  <div key={bot.magic_number} className="relative flex rounded-md border border-amber-500/30 overflow-visible">
                    <button
                      onClick={() => {
                        updateStepOne({ magicNumber: bot.magic_number });
                        const params = new URLSearchParams(searchParams.toString());
                        params.set("magic", bot.magic_number.toString());
                        params.set("orphanTrades", (bot.trade_count || 0).toString());
                        params.set("orphanPnl", (bot.current_pnl || 0).toFixed(2));
                        if (bot.first_seen) params.set("orphanSince", bot.first_seen);
                        router.replace(`?${params.toString()}`, { scroll: false });
                      }}
                      className="text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-2.5 py-1.5 transition-colors flex items-center gap-1.5 font-mono font-medium rounded-l-md"
                      type="button"
                      title={`${bot.trade_count || 0} trades`}
                    >
                      <span>✨ Magic {bot.magic_number}</span>
                      {(bot.symbols || bot.current_pnl) && (
                        <span className="text-iron-500 border-l border-amber-500/30 pl-1.5">
                          {bot.symbols && <span className="mr-1">{bot.symbols}</span>}
                          <span className={bot.current_pnl >= 0 ? "text-risk-green" : "text-risk-red"}>
                            ${bot.current_pnl?.toFixed(2) || '0.00'}
                          </span>
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => handlePreview(bot.magic_number)}
                      className={`px-2 transition-colors border-l border-amber-500/30 flex items-center justify-center rounded-r-md ${previewMagic === bot.magic_number ? 'bg-amber-500 text-black' : 'bg-amber-500/10 hover:bg-amber-500/30 text-amber-500/70'}`}
                      type="button"
                      title="Ver trades"
                    >
                      👁️
                    </button>

                    {/* Popover Preview Table */}
                    {previewMagic === bot.magic_number && (
                      <div className="absolute top-0 left-full ml-3 w-[450px] max-h-64 overflow-auto rounded-lg border border-iron-700 bg-surface-tertiary shadow-2xl z-[100] animate-in fade-in slide-in-from-left-2">
                        {loadingPreview ? (
                          <p className="text-[10px] text-iron-500 p-4 text-center">Cargando trades...</p>
                        ) : previewTrades.length === 0 ? (
                          <p className="text-[10px] text-iron-500 p-4 text-center">No hay trades recientes.</p>
                        ) : (
                          <table className="w-full text-[10px] font-mono">
                            <thead className="bg-surface-secondary sticky top-0 border-b border-iron-800 cursor-pointer select-none">
                              <tr className="text-iron-400 text-left">
                                <th className="py-2 px-3 font-semibold hover:text-white" onClick={() => handleSort('symbol', setPreviewSort)}>
                                  Symbol <SortIcon col="symbol" config={previewSort} />
                                </th>
                                <th className="py-2 px-3 font-semibold hover:text-white" onClick={() => handleSort('comment', setPreviewSort)}>
                                  Comment <SortIcon col="comment" config={previewSort} />
                                </th>
                                <th className="py-2 px-3 font-semibold text-right hover:text-white" onClick={() => handleSort('profit', setPreviewSort)}>
                                  <SortIcon col="profit" config={previewSort} /> Profit
                                </th>
                                <th className="py-2 px-3 font-semibold text-right hover:text-white" onClick={() => handleSort('close_time', setPreviewSort)}>
                                  <SortIcon col="close_time" config={previewSort} /> Fecha
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-iron-800/50">
                              {sortedPreviewTrades.map((t: any, i: number) => (
                                <tr key={i} className="hover:bg-iron-800/30 transition-colors">
                                  <td className="py-1.5 px-3 text-iron-300">{t.symbol}</td>
                                  <td className="py-1.5 px-3 text-iron-500 truncate max-w-[100px]" title={t.comment}>{t.comment || '—'}</td>
                                  <td className={`py-1.5 px-3 text-right font-semibold ${t.profit >= 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                                    ${t.profit.toFixed(2)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right text-iron-500">{t.close_time}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>



      {/* Factor de Escalado — full width */}
      <div className="bg-surface-tertiary border border-amber-500/20 rounded-lg p-4">
        <div className="flex items-center gap-4">
          <div className="w-44 shrink-0">
            <label className="block text-[10px] text-amber-400 uppercase tracking-wider font-semibold mb-1.5">
              📐 Factor de Escalado
              {stepThreeData.riskMultiplier !== 1 && (
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                  ×{stepThreeData.riskMultiplier}
                </span>
              )}
            </label>
            <Input
              type="number"
              step="any"
              min="0.01"
              placeholder="1.0 (sin escalar)"
              defaultValue={stepThreeData.riskMultiplier === 1 ? "" : stepThreeData.riskMultiplier}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                updateStepThree({ riskMultiplier: v > 0 ? v : 1 });
              }}
            />
          </div>
          <p className="text-[10px] text-iron-500 leading-relaxed flex-1">
            Si tu backtest fue con lotes menores al live, introduce el multiplicador.
            <br/>Ejemplo: BT a <span className="text-iron-300">0.01</span> lotes, live a <span className="text-iron-300">1.0</span> lote → factor = <span className="text-amber-400 font-mono">×100</span>
            <br/>Escala: métricas, distribuciones, Bayes, equity curve y EA limits.
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-iron-800/50 mt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-medium text-iron-500 hover:text-iron-300 transition-colors"
        >
          {t("cancelBack")}
        </button>
        <Button onClick={() => setStep(2)} disabled={!canProceed}>
          {t("next")}
        </Button>
      </div>
    </div>
  );
}
