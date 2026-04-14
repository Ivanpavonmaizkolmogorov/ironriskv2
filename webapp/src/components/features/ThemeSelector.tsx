/** ThemeSelector component — pops up a list of available themes allowing instant switch. */
"use client";

import React, { useEffect, useState, useRef } from "react";
import { useThemeStore } from "@/store/useThemeStore";
import ThemeBuilderModal from "./ThemeBuilderModal";
import { useTranslations } from "next-intl";

export default function ThemeSelector({ 
  mode,
  activeThemeOverride,
  onThemeSelect
}: { 
  mode: "global" | "workspace" | "inline";
  activeThemeOverride?: string | null;
  onThemeSelect?: (themeId: string) => void;
}) {
  const {
    effectiveThemeId,
    globalThemeId,
    themes,
    loadThemesCatalogue,
    setTheme,
    deleteCustomTheme,
    isLoading,
  } = useThemeStore();
  
  const t = useTranslations("themeSelector");
  
  const [isOpen, setIsOpen] = useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadThemesCatalogue();
  }, [loadThemesCatalogue]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelectTheme = (themeId: string) => {
    if (onThemeSelect) {
      onThemeSelect(themeId);
    } else {
      setTheme(themeId, mode as "global" | "workspace", applyToAll);
    }
    setIsOpen(false);
  };

  const getPopoverTitle = () => {
    if (mode === "global") return t("titleGlobal");
    if (mode === "workspace") return t("titleWorkspace");
    return t("titleInline");
  };

  const getPopoverDesc = () => {
    if (mode === "global") return t("descGlobal");
    if (mode === "workspace") return t("descWorkspace");
    return t("descInline");
  };

  const currentDisplayTheme = mode === "inline" ? (activeThemeOverride || globalThemeId) : effectiveThemeId;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(!isOpen); }}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-tertiary border border-iron-800 text-iron-400 hover:text-iron-200 hover:border-iron-600 transition-colors"
        title="Theme Settings"
        disabled={isLoading}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M2.04 12.193a11.961 11.961 0 011.859-4.838A11.97 11.97 0 019.539 2.041a.75.75 0 01.353.078c.038.019.074.041.108.067C12.35 4.318 14.852 6 17.5 6c1.17 0 2.29.356 3.226.985a.75.75 0 01.077 1.144c-1.396 1.488-2.6 3.328-3.419 5.405A11.972 11.972 0 0122 17.5c0 1.17-.356 2.29-.985 3.226a.75.75 0 01-1.144.077C18.3 19.336 16.489 18 14 18c-2.489 0-4.3 1.336-5.871 2.803a.75.75 0 01-1.144-.077c-.939-.819-2.315-1.93-3.075-2.887A11.966 11.966 0 012.04 12.193z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-72 max-w-72 bg-surface-secondary border border-iron-800 rounded-xl shadow-xl overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
          <div className="p-4 border-b border-iron-800">
            <h3 className="text-sm font-semibold text-iron-100">{getPopoverTitle()}</h3>
            <p className="text-xs text-iron-400 mt-1">{getPopoverDesc()}</p>
            {mode === "global" && (
              <label className="flex items-center gap-2 mt-3 text-[11px] text-iron-300 bg-surface-tertiary p-2 rounded-lg border border-iron-800 hover:border-risk-green/50 cursor-pointer transition-colors">
                <input 
                  type="checkbox" 
                  checked={applyToAll} 
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  className="accent-risk-green rounded"
                />
                {t("forceAll")}
              </label>
            )}
          </div>
          <div className="p-3 max-h-[320px] overflow-y-auto space-y-2">
            {Object.entries(themes).map(([themeId, themeData]) => {
              const isActive = currentDisplayTheme === themeId;
              return (
                <div
                  key={themeId}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSelectTheme(themeId); }}
                  role="button"
                  tabIndex={0}
                  className={`w-full text-left cursor-pointer p-3 rounded-lg border transition-all duration-200 flex items-start gap-3
                    ${isActive 
                      ? 'border-risk-green bg-risk-green/5 shadow-[0_0_10px_rgba(0,230,118,0.1)]' 
                      : 'border-iron-800 bg-surface-tertiary hover:border-iron-600 hover:bg-surface-elevated'
                    }`}
                >
                  {/* Theme Preview Circles */}
                  <div className="flex -space-x-1 pt-1 shrink-0">
                    <div 
                      className="w-4 h-4 rounded-full border border-iron-800/50 shadow-sm"
                      style={{ backgroundColor: themeData.colors['surface-primary'] }}
                    />
                    <div 
                      className="w-4 h-4 rounded-full border border-iron-800/50 shadow-sm"
                      style={{ backgroundColor: themeData.colors['accent'] }}
                    />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-iron-100">{themeData.label}</span>
                    <span className="block text-[10px] text-iron-500 truncate mt-0.5">{themeData.description}</span>
                  </div>
                  
                  {isActive && (
                    <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-risk-green/20 text-risk-green">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}

                  {(themeData as any).is_custom && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingThemeId(themeId);
                          setIsBuilderOpen(true);
                          setIsOpen(false);
                        }}
                        className="shrink-0 p-1 rounded hover:bg-surface-elevated text-iron-500 hover:text-iron-200 transition-colors"
                        title={t("editTitle", { defaultMessage: "Editar tema" })}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                          <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const confirmMsg = t("deleteConfirm").replace("{theme}", themeData.label);
                          if (confirm(confirmMsg)) {
                             deleteCustomTheme(themeId);
                          }
                        }}
                        className="shrink-0 p-1 rounded hover:bg-risk-red/20 text-iron-500 hover:text-risk-red transition-colors"
                        title={t("deleteTitle")}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                           <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="p-3 border-t border-iron-800 bg-surface-primary">
             <button
                onClick={(e) => { 
                   e.preventDefault(); 
                   e.stopPropagation(); 
                   setEditingThemeId(null);
                   setIsBuilderOpen(true); 
                   setIsOpen(false); 
                }}
                className="w-full py-2 flex items-center justify-center gap-2 text-xs font-semibold text-risk-green border border-risk-green/30 bg-risk-green/10 rounded-lg hover:bg-risk-green/20 transition-colors"
             >
                {t("createCustom")}
             </button>
          </div>
        </div>
      )}
      <ThemeBuilderModal 
         isOpen={isBuilderOpen} 
         editingThemeId={editingThemeId}
         onClose={() => setIsBuilderOpen(false)} 
      />
    </div>
  );
}
