"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { orphanAPI, strategyAPI } from "@/services/api";

interface OrphanMagic {
  id: number;
  account_id: string;
  magic_number: number;
  first_seen: string;
  last_seen: string;
  current_pnl: number;
  trade_count?: number;
  symbols?: string;
}

interface StrategyOption {
  id: string;
  name: string;
  magic_number: number;
}

export default function OrphanInbox({ accountId, onLinked }: { accountId: string; onLinked?: () => void }) {
  const [orphans, setOrphans] = useState<OrphanMagic[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [linkingMagic, setLinkingMagic] = useState<number | null>(null);
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);
  const [previewMagic, setPreviewMagic] = useState<number | null>(null);
  const [previewTrades, setPreviewTrades] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
  const [previewSort, setPreviewSort] = useState<SortConfig>(null);
  const ref = useRef<HTMLDivElement>(null);

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

  const handleSort = (key: string) => {
    setPreviewSort(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'desc') return { key, direction: 'asc' };
        return null;
      }
      return { key, direction: 'desc' };
    });
  };

  const sortedPreviewTrades = useMemo(() => getSortedData(previewTrades, previewSort), [previewTrades, previewSort]);

  const SortIcon = ({ col }: { col: string }) => {
    if (previewSort?.key !== col) return <span className="opacity-30 inline-block ml-0.5">↕</span>;
    return <span className="inline-block ml-0.5 text-amber-400">{previewSort.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  // Poll for orphans every 10 seconds
  useEffect(() => {
    if (!accountId) return;
    const fetchOrphans = async () => {
      try {
        const res = await orphanAPI.list(accountId);
        setOrphans(res.data);
      } catch (err) { /* silent */ }
    };
    fetchOrphans();
    const interval = setInterval(fetchOrphans, 10000);
    return () => clearInterval(interval);
  }, [accountId]);

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setLinkingMagic(null);
        setPreviewMagic(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Load linkable strategies when popover opens
  const togglePopover = async () => {
    const next = !isOpen;
    setIsOpen(next);
    setLinkingMagic(null);
    setPreviewMagic(null);
    if (next) {
      try {
        const res = await strategyAPI.list(accountId);
        setStrategies(
          (res.data.strategies || res.data || [])
            .filter((s: StrategyOption) => s.magic_number !== 0)
            .map((s: StrategyOption) => ({ id: s.id, name: s.name, magic_number: s.magic_number }))
        );
      } catch { setStrategies([]); }
    }
  };

  const startLinking = (magic: number) => {
    setLinkingMagic(linkingMagic === magic ? null : magic);
    setPreviewMagic(null);
  };

  const handlePreview = async (magic: number) => {
    if (previewMagic === magic) {
      setPreviewMagic(null);
      return;
    }
    setPreviewMagic(magic);
    setLinkingMagic(null);
    setLoadingPreview(true);
    try {
      const res = await orphanAPI.trades(accountId, magic);
      setPreviewTrades(res.data);
    } catch {
      setPreviewTrades([]);
    } finally {
      setLoadingPreview(false);
    }
  };

  const doLink = async (magic: number, strategyId: string) => {
    try {
      await orphanAPI.link(accountId, magic, strategyId);
      setLinkingMagic(null);
      // Re-fetch orphans (the linked one should disappear)
      const res = await orphanAPI.list(accountId);
      setOrphans(res.data);
      // Notify parent to refresh live chart
      onLinked?.();
    } catch { /* silent */ }
  };

  if (orphans.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      {/* Badge Button */}
      <button
        onClick={togglePopover}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
        title={`${orphans.length} unconfigured bot(s) detected`}
      >
        <span className="text-amber-500 text-sm">📡</span>
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[10px] font-bold text-black flex items-center justify-center">
          {orphans.length}
        </span>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-10 right-0 w-96 bg-surface-tertiary border border-iron-700 shadow-2xl rounded-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          <div className="p-3 bg-surface-secondary border-b border-iron-800">
            <span className="text-xs text-iron-400 font-medium uppercase tracking-wider">
              Bots detectados sin configurar
            </span>
          </div>

          <div className="divide-y divide-iron-800 max-h-[450px] overflow-auto">
            {orphans.map((o) => (
              <div key={o.id} className="p-3 hover:bg-surface-secondary/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col min-w-0">
                    <span className="font-mono text-sm text-iron-200 font-semibold flex items-center gap-2">
                      Magic {o.magic_number}
                      <span className={`text-xs ${o.current_pnl > 0 ? "text-risk-green" : o.current_pnl < 0 ? "text-risk-red" : "text-iron-400"}`}>
                        ${o.current_pnl.toFixed(2)}
                      </span>
                    </span>
                    <span className="text-[10px] text-iron-500 mt-0.5">
                      {o.symbols && <span className="text-iron-400">{o.symbols}</span>}
                      {o.symbols && o.trade_count ? ' · ' : ''}
                      {o.trade_count ? `${o.trade_count} trades` : ""}
                      {o.first_seen && o.last_seen
                        ? ` · ${new Date(o.first_seen).toLocaleDateString()} → ${new Date(o.last_seen).toLocaleDateString()}`
                        : o.last_seen ? ` · ${new Date(o.last_seen).toLocaleDateString()}` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {/* Preview trades */}
                    <button
                      onClick={() => handlePreview(o.magic_number)}
                      className={`text-[10px] px-2 py-1 rounded font-medium transition-colors flex items-center gap-0.5 ${
                        previewMagic === o.magic_number
                          ? "bg-amber-500 text-black"
                          : "bg-amber-500/10 hover:bg-amber-500/30 text-amber-500/70 border border-amber-500/30"
                      }`}
                      title="Ver trades"
                    >
                      👁️
                    </button>
                    {/* Link to existing strategy — only if linkable targets exist */}
                    {strategies.length > 0 && (
                      <button
                        onClick={() => startLinking(o.magic_number)}
                        className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                          linkingMagic === o.magic_number
                            ? "bg-amber-600 text-white"
                            : "bg-iron-800 hover:bg-iron-700 text-iron-400 hover:text-amber-400"
                        }`}
                        title="Vincular a estrategia existente"
                      >
                        🔗 Vincular
                      </button>
                    )}
                    {/* Create new strategy */}
                    <Link
                      href={`/dashboard/wizard?accountId=${accountId}&magic=${o.magic_number}&orphanTrades=${o.trade_count || 0}&orphanPnl=${o.current_pnl.toFixed(2)}&orphanSince=${encodeURIComponent(o.first_seen || '')}`}
                      className="text-[10px] px-2 py-1 rounded bg-dodger hover:bg-dodger-light text-white font-medium transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      + Nueva
                    </Link>
                  </div>
                </div>

                {/* Trade preview (shown when eye is active) */}
                {previewMagic === o.magic_number && (
                  <div className="mt-2 rounded-lg border border-iron-700 bg-iron-900/50 overflow-hidden animate-in fade-in slide-in-from-top-1">
                    {loadingPreview ? (
                      <p className="text-[10px] text-iron-500 p-3 text-center">Cargando trades...</p>
                    ) : previewTrades.length === 0 ? (
                      <p className="text-[10px] text-iron-500 p-3 text-center">No hay trades recientes.</p>
                    ) : (
                      <div className="max-h-48 overflow-auto">
                        <table className="w-full text-[10px] font-mono">
                          <thead className="bg-surface-secondary sticky top-0 border-b border-iron-800">
                            <tr className="text-iron-400 text-left cursor-pointer select-none">
                              <th className="py-1.5 px-2 font-semibold hover:text-white transition-colors" onClick={() => handleSort('symbol')}>
                                Symbol<SortIcon col="symbol" />
                              </th>
                              <th className="py-1.5 px-2 font-semibold hover:text-white transition-colors" onClick={() => handleSort('comment')}>
                                Comment<SortIcon col="comment" />
                              </th>
                              <th className="py-1.5 px-2 font-semibold text-right hover:text-white transition-colors" onClick={() => handleSort('volume')}>
                                Vol<SortIcon col="volume" />
                              </th>
                              <th className="py-1.5 px-2 font-semibold text-right hover:text-white transition-colors" onClick={() => handleSort('profit')}>
                                Profit<SortIcon col="profit" />
                              </th>
                              <th className="py-1.5 px-2 font-semibold text-right hover:text-white transition-colors" onClick={() => handleSort('close_time')}>
                                Fecha<SortIcon col="close_time" />
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-iron-800/50">
                            {sortedPreviewTrades.map((t: any, i: number) => (
                              <tr key={i} className="hover:bg-iron-800/30 transition-colors">
                                <td className="py-1 px-2 text-iron-300">{t.symbol}</td>
                                <td className="py-1 px-2 text-iron-500 truncate max-w-[80px]" title={t.comment}>{t.comment || '—'}</td>
                                <td className="py-1 px-2 text-right text-iron-400">{t.volume}</td>
                                <td className={`py-1 px-2 text-right font-semibold ${t.profit >= 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                                  ${t.profit.toFixed(2)}
                                </td>
                                <td className="py-1 px-2 text-right text-iron-500">{t.close_time}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Strategy picker (shown when linking) */}
                {linkingMagic === o.magic_number && (
                  <div className="mt-2 p-2 bg-iron-900/50 rounded border border-iron-700/50">
                    <p className="text-[10px] text-iron-500 mb-1.5">Vincular a:</p>
                    {strategies.length === 0 ? (
                      <p className="text-[10px] text-iron-600 italic">No hay estrategias configuradas</p>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-24 overflow-auto">
                        {strategies.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => doLink(o.magic_number, s.id)}
                            className="text-left text-[10px] px-2 py-1 rounded bg-iron-800/60 hover:bg-dodger/20 
                              hover:text-dodger text-iron-300 transition-colors flex items-center justify-between"
                          >
                            <span className="truncate">{s.name}</span>
                            <span className="text-iron-600 font-mono ml-2 shrink-0">#{s.magic_number}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
