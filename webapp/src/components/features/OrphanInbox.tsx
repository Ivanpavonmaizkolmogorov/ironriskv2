"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { orphanAPI } from "@/services/api";

interface OrphanMagic {
  id: number;
  account_id: string;
  magic_number: number;
  first_seen: string;
  last_seen: string;
  current_pnl: number;
  trade_count?: number;
}

export default function OrphanInbox({ accountId }: { accountId: string }) {
  const [orphans, setOrphans] = useState<OrphanMagic[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  // Load dismissed list from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`ironrisk_dismissed_orphans_${accountId}`);
    if (stored) setDismissed(new Set(JSON.parse(stored)));
  }, [accountId]);

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
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const dismissMagic = (magic: number) => {
    const next = new Set([...dismissed, magic]);
    setDismissed(next);
    localStorage.setItem(`ironrisk_dismissed_orphans_${accountId}`, JSON.stringify([...next]));
  };

  const visibleOrphans = orphans.filter((o) => !dismissed.has(o.magic_number));
  if (visibleOrphans.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      {/* Badge Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
        title={`${visibleOrphans.length} estrategia(s) sin configurar detectada(s)`}
      >
        <span className="text-amber-500 text-sm">🔔</span>
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[10px] font-bold text-black flex items-center justify-center">
          {visibleOrphans.length}
        </span>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-10 right-0 w-80 bg-surface-tertiary border border-iron-700 shadow-2xl rounded-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          <div className="p-3 bg-surface-secondary border-b border-iron-800">
            <span className="text-xs text-iron-400 font-medium uppercase tracking-wider">
              Bots detectados sin configurar
            </span>
          </div>

          <div className="divide-y divide-iron-800 max-h-64 overflow-auto">
            {visibleOrphans.map((o) => (
              <div key={o.id} className="p-3 flex items-center justify-between hover:bg-surface-secondary/50 transition-colors">
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-sm text-iron-200 font-semibold flex items-center gap-2">
                    Magic {o.magic_number}
                    <span className={`text-xs ${o.current_pnl > 0 ? "text-risk-green" : o.current_pnl < 0 ? "text-risk-red" : "text-iron-400"}`}>
                      ${o.current_pnl.toFixed(2)}
                    </span>
                  </span>
                  <span className="text-[10px] text-iron-500 mt-0.5">
                    {o.trade_count ? `${o.trade_count} trades` : ""}
                    {o.last_seen ? ` · ${new Date(o.last_seen).toLocaleDateString()}` : ""}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    onClick={() => dismissMagic(o.magic_number)}
                    className="text-[10px] px-2 py-1 rounded bg-iron-800 hover:bg-iron-700 text-iron-400 transition-colors"
                    title="No volver a mostrar este magic number"
                  >
                    ✕
                  </button>
                  <Link
                    href={`/dashboard/wizard?accountId=${accountId}&magic=${o.magic_number}`}
                    className="text-[10px] px-2 py-1 rounded bg-dodger hover:bg-dodger-light text-white font-medium transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    Configurar
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="p-2 border-t border-iron-800 bg-surface-secondary">
            <button
              onClick={() => {
                visibleOrphans.forEach((o) => dismissMagic(o.magic_number));
                setIsOpen(false);
              }}
              className="text-[10px] text-iron-500 hover:text-iron-300 transition-colors w-full text-center"
            >
              Ignorar todos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
