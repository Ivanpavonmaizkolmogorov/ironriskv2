"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";

interface SQXToolsDropdownProps {
  apiToken?: string;
  onCopyToken?: () => void;
  copied?: boolean;
}

export default function SQXToolsDropdown({ apiToken, onCopyToken, copied }: SQXToolsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const downloads = [
    {
      name: "IronRisk SQX Uploader",
      desc: locale === "es" ? "Envía backtests de SQX a IronRisk" : "Send SQX backtests to IronRisk",
      file: "/downloads/IronRisk_SQX_Uploader.java",
      icon: "☁️",
    },
    {
      name: "Magic Number Assigner",
      desc: locale === "es" ? "Asigna MagicNumbers auto. a estrategias" : "Auto-assign MagicNumbers to strategies",
      file: "/downloads/IronRisk_SQX_MagicAssigner.java",
      icon: "🔢",
    },
    {
      name: "IronRisk Dashboard EA",
      desc: locale === "es" ? "Expert Advisor para MetaTrader 5" : "Expert Advisor for MetaTrader 5",
      file: "/downloads/IronRisk_Dashboard.mq5",
      icon: "📊",
    },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 bg-iron-800/40 hover:bg-iron-700/60 border border-iron-700/40 hover:border-cyan-500/40 rounded-lg px-2.5 py-1.5 transition-all duration-200 group"
        title={locale === "es" ? "Herramientas SQX" : "SQX Tools"}
      >
        <span className="text-sm opacity-80 group-hover:opacity-100 transition-opacity">🔧</span>
        <span className="text-[11px] font-semibold text-iron-400 group-hover:text-iron-200 hidden sm:inline tracking-wide">
          SQX
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface-secondary border border-iron-700 rounded-xl shadow-2xl z-[60] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-3 pb-2 border-b border-iron-800">
            <h3 className="text-xs font-bold text-iron-200 uppercase tracking-wider">
              {locale === "es" ? "🔧 Herramientas StrategyQuant" : "🔧 StrategyQuant Tools"}
            </h3>
            <p className="text-[10px] text-iron-500 mt-0.5">
              {locale === "es" ? "Snippets para automatización SQX ↔ IronRisk" : "Automation snippets for SQX ↔ IronRisk"}
            </p>
          </div>

          {/* Token Section */}
          {apiToken && (
            <div className="px-4 py-2.5 border-b border-iron-800 bg-iron-900/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-iron-500 uppercase tracking-wider font-semibold shrink-0">⚡ Token:</span>
                  <span className="text-[11px] font-mono text-cyan-400 truncate">{apiToken.substring(0, 16)}...</span>
                </div>
                <button
                  onClick={() => { onCopyToken?.(); }}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded transition-all shrink-0 ${
                    copied
                      ? "bg-risk-green/20 text-risk-green"
                      : "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                  }`}
                >
                  {copied ? "✅ OK" : locale === "es" ? "COPIAR" : "COPY"}
                </button>
              </div>
            </div>
          )}

          {/* Downloads List */}
          <div className="p-2 space-y-1">
            {downloads.map((dl) => (
              <a
                key={dl.file}
                href={dl.file}
                download
                className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-iron-800/60 transition-colors group"
                onClick={() => setIsOpen(false)}
              >
                <span className="text-lg mt-0.5">{dl.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-iron-200 group-hover:text-iron-50 flex items-center gap-2">
                    {dl.name}
                    <span className="text-[9px] text-iron-600 font-mono">.java</span>
                  </div>
                  <p className="text-[10px] text-iron-500 mt-0.5">{dl.desc}</p>
                </div>
                <span className="text-iron-600 group-hover:text-cyan-400 transition-colors ml-auto mt-1 text-xs shrink-0">↓</span>
              </a>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-iron-800 bg-iron-900/30">
            <p className="text-[9px] text-iron-600 text-center">
              {locale === "es"
                ? "Copiar a: {SQX}/user/extend/Snippets/SQ/CustomAnalysis/"
                : "Copy to: {SQX}/user/extend/Snippets/SQ/CustomAnalysis/"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
