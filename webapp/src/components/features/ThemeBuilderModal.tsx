"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useThemeStore } from "@/store/useThemeStore";
import type { Theme } from "@/store/useThemeStore";
import { useTranslations } from "next-intl";

const COLOR_GROUPS = [
  {
    titleKey: "groupSurfaces",
    keys: ["surface-primary", "surface-secondary", "surface-tertiary", "surface-elevated"]
  },
  {
    titleKey: "groupAccents",
    keys: ["accent", "accent-hover", "accent-muted", "selection-bg", "selection-fg"]
  },
  {
    titleKey: "groupRisk",
    keys: ["risk-green", "risk-yellow", "risk-red"]
  },
  {
    titleKey: "groupTypography",
    keys: ["iron-50", "iron-100", "iron-200", "iron-300", "iron-400", "iron-500", "iron-600", "iron-700", "iron-800", "iron-900", "iron-950"]
  },
  {
    titleKey: "groupUiElements",
    keys: ["scrollbar-track", "scrollbar-thumb", "scrollbar-thumb-hover"]
  }
];

export default function ThemeBuilderModal({ 
  isOpen, 
  onClose,
  editingThemeId 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  editingThemeId?: string | null;
}) {
  const t = useTranslations("themeBuilder");
  const { themes, createCustomTheme, updateCustomTheme } = useThemeStore();
  const builtInThemes = Object.entries(themes).filter(([id, th]) => !(th as any).is_custom);
  
  const [baseThemeId, setBaseThemeId] = useState("iron_dark");
  const [label, setLabel] = useState("");
  const [colors, setColors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState("dark");
  const [mounted, setMounted] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (editingThemeId && themes[editingThemeId]) {
        const editBase = themes[editingThemeId];
        setColors({ ...editBase.colors });
        setMode(editBase.mode);
        setLabel(editBase.label.replace(/^Custom: /, ''));
        setBaseThemeId('');
      } else {
        const base = themes[baseThemeId] || themes['iron_dark'];
        setColors({ ...base.colors });
        setMode(base.mode);
        if (!editingThemeId) setLabel("");
      }
    }
  }, [isOpen, baseThemeId, themes, editingThemeId]);

  if (!isOpen || !mounted) return null;

  const handleColorChange = (key: string, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
  };

  const handleFocus = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setActiveKey(key);
    const el = document.getElementById(`color-input-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleSave = async () => {
    if (!label.trim()) return;
    try {
      setIsSaving(true);
      if (editingThemeId) {
        await updateCustomTheme(editingThemeId, label, mode, colors);
      } else {
        await createCustomTheme(label, mode, colors);
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert(t("failedSave"));
    } finally {
      setIsSaving(false);
    }
  };

  // Convert colors to react inline style variables
  const previewStyles = Object.entries(colors).reduce((acc, [k, v]) => {
    (acc as any)[`--${k}`] = v;
    return acc;
  }, {} as React.CSSProperties);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-8 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-surface-primary border border-iron-800 rounded-xl shadow-2xl w-full max-w-6xl h-full max-h-[850px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-iron-800 bg-surface-secondary">
          <div>
            <h2 className="text-xl font-bold text-iron-100">{t("title")}</h2>
            <p className="text-sm text-iron-400 mt-1">{t("subtitle")}</p>
          </div>
          <button onClick={onClose} className="p-2 text-iron-500 hover:text-iron-200 hover:bg-surface-tertiary rounded-lg transition-colors">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          
          {/* Editor Sidebar */}
          <div className="w-full lg:w-1/3 border-r border-iron-800 bg-surface-secondary flex flex-col overflow-y-auto">
            <div className="p-6 space-y-6">
              
              <div className="space-y-3">
                <label className="text-sm font-medium text-iron-300">{t("themeName")}</label>
                <Input 
                  placeholder={t("themeNamePlaceholder")} 
                  value={label} 
                  onChange={e => setLabel(e.target.value)} 
                />
              </div>

              {!editingThemeId && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-iron-300">{t("cloneFrom")}</label>
                  <select 
                    className="w-full bg-surface-tertiary border border-iron-800 rounded-lg px-3 py-2 text-sm text-iron-200 outline-none focus:border-risk-green/50 transition-colors"
                    value={baseThemeId}
                    onChange={e => setBaseThemeId(e.target.value)}
                  >
                    {builtInThemes.map(([id, th]) => (
                      <option key={id} value={id}>{th.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="w-full h-px bg-iron-800 my-4" />

              {/* Color Groups */}
              <div className="space-y-6">
                {COLOR_GROUPS.map((group, idx) => (
                  <div key={idx} className="space-y-3">
                    <h4 className="text-xs font-semibold text-iron-400 uppercase tracking-wider">{t(group.titleKey as any)}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {group.keys.map(key => (
                        <div 
                          key={key} 
                          id={`color-input-${key}`}
                          className={`flex flex-col gap-1 p-2 -mx-2 rounded-lg transition-all duration-300 ${activeKey === key ? 'bg-accent/10 shadow-[inset_0_0_0_1px_var(--accent)]' : 'hover:bg-surface-elevated/50'}`}
                        >
                          <label className="text-[10px] text-iron-500 font-mono truncate cursor-default" title={key}>{key}</label>
                          <div className={`flex items-center gap-2 bg-surface-tertiary border transition-colors p-1 rounded-md ${activeKey === key ? 'border-accent/50' : 'border-iron-800'}`}>
                            <input 
                              type="color" 
                              value={colors[key] && colors[key].startsWith('#') ? colors[key].substring(0, 7) : '#000000'}
                              onChange={(e) => handleColorChange(key, e.target.value)}
                              className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0"
                            />
                            <input 
                              type="text" 
                              value={colors[key] || ''} 
                              onChange={(e) => handleColorChange(key, e.target.value)}
                              className="w-full text-xs bg-transparent text-iron-200 outline-none font-mono"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>

          {/* Preview Area */}
          <div className="w-full lg:w-2/3 bg-[#0a0a0a] relative overflow-hidden flex flex-col">
            <div className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur border border-white/10 px-3 py-1.5 rounded-full text-xs font-semibold text-white/70 shadow-xl">
              {t("livePreview")}
            </div>
            
            <div className="flex-1 w-full h-full p-8 overflow-y-auto flex justify-center items-start">
              
              {/* Preview Container Wrapper that overrides CSS variables */}
              <div 
                className="w-full max-w-2xl bg-surface-primary text-iron-100 rounded-xl shadow-2xl overflow-hidden border border-iron-800 animate-in slide-in-from-bottom-4 duration-500 ease-out cursor-pointer hover:shadow-[0_0_0_2px_var(--accent)] transition-shadow"
                style={previewStyles}
                onClick={(e) => handleFocus(e, 'surface-primary')}
                title="Edit Background (surface-primary)"
              >
                {/* Mock Navbar */}
                <div 
                  className="h-14 bg-surface-secondary border-b border-iron-800 flex items-center justify-between px-6 cursor-pointer hover:bg-surface-tertiary transition-colors"
                  onClick={(e) => handleFocus(e, 'surface-secondary')}
                  title="Edit Navbar (surface-secondary)"
                >
                  <span 
                    className="font-bold cursor-pointer hover:text-iron-300 transition-colors" 
                    onClick={(e) => handleFocus(e, 'iron-100')}
                    title="Edit Text (iron-100)"
                  >
                    IRON<span 
                      className="text-risk-green cursor-pointer hover:opacity-80 transition-opacity" 
                      onClick={(e) => handleFocus(e, 'risk-green')}
                      title="Edit Brand Color (risk-green)"
                    >RISK</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-6 h-6 rounded-full bg-surface-tertiary flex items-center justify-center border border-iron-700 cursor-pointer hover:border-accent transition-colors"
                      onClick={(e) => handleFocus(e, 'surface-tertiary')}
                      title="Edit Circle Button (surface-tertiary)"
                    >
                       <div 
                         className="w-3 h-3 rounded-full bg-accent cursor-pointer hover:scale-110 transition-transform" 
                         onClick={(e) => handleFocus(e, 'accent')}
                         title="Edit Indicator (accent)"
                       />
                    </div>
                    <div onClick={(e) => handleFocus(e, 'accent')} title="Edit Button (accent)">
                      <Button variant="primary" size="sm" onClick={(e)=>{}}>{t("connectEa")}</Button>
                    </div>
                  </div>
                </div>

                {/* Mock Body */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Left Column */}
                  <div className="space-y-4">
                    {/* Mock Equity Chart */}
                    <div 
                      className="bg-surface-secondary border border-iron-800 rounded-xl p-4 cursor-pointer hover:border-accent transition-colors shadow-sm"
                      onClick={(e) => handleFocus(e, 'surface-secondary')}
                      title="Edit Chart Card (surface-secondary)"
                    >
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-iron-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                          </svg>
                          <span 
                            className="text-sm font-semibold text-iron-100 cursor-pointer hover:text-white transition-colors"
                            onClick={(e) => handleFocus(e, 'iron-100')}
                          >Backtest Curve</span>
                        </div>
                        <span 
                          className="text-[9px] font-mono text-iron-400 bg-surface-tertiary px-1.5 py-0.5 rounded cursor-pointer hover:bg-surface-elevated transition-colors"
                          onClick={(e) => handleFocus(e, 'surface-tertiary')}
                          title="Edit Badge (surface-tertiary)"
                        >LIVE DESC: 5:00</span>
                      </div>
                      <div 
                        className="w-full h-28 border-l border-b border-iron-700 relative flex items-end cursor-pointer hover:border-iron-500 transition-colors group/axis"
                        onClick={(e) => handleFocus(e, 'iron-700')}
                        title="Edit Grid Lines (iron-700)"
                      >
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex space-x-1/3 w-full opacity-30 pointer-events-none">
                          <div className="w-1/3 border-r border-dashed border-iron-700" />
                          <div className="w-1/3 border-r border-dashed border-iron-700" />
                        </div>
                        <div className="absolute inset-0 flex flex-col space-y-1/2 h-full opacity-30 pointer-events-none">
                          <div className="h-1/2 border-b border-dashed border-iron-700" />
                        </div>

                        {/* Chart Line */}
                        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                          <path 
                            d="M0,100 L0,70 Q10,50 30,60 T60,30 Q80,40 100,10 L100,100 Z" 
                            fill="var(--risk-green)" 
                            opacity="0.15" 
                            className="transition-opacity cursor-pointer hover:opacity-30"
                            onClick={(e) => handleFocus(e, 'risk-green')}
                          />
                          <path 
                            d="M0,70 Q10,50 30,60 T60,30 Q80,40 100,10" 
                            fill="none" 
                            stroke="var(--risk-green)" 
                            strokeWidth="2" 
                            className="transition-all cursor-pointer hover:stroke-[3px]"
                            onClick={(e) => handleFocus(e, 'risk-green')}
                          />
                          <circle cx="100" cy="10" r="3" fill="var(--risk-green)" className="pointer-events-none" />
                        </svg>
                      </div>
                    </div>

                    {/* Mock Risk Metrics Grid */}
                    <div 
                      className="bg-surface-secondary border border-iron-800 rounded-xl p-4 cursor-pointer hover:border-accent transition-colors shadow-sm"
                      onClick={(e) => handleFocus(e, 'surface-secondary')}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-semibold text-iron-200" onClick={(e) => handleFocus(e, 'iron-200')}>Risk Metrics</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Metric 1 */}
                        <div 
                          className="bg-surface-tertiary border border-iron-800 rounded py-2 text-center cursor-pointer hover:border-risk-red/50 transition-colors"
                          onClick={(e) => handleFocus(e, 'surface-tertiary')}
                        >
                          <p className="text-[9px] text-iron-500 font-mono tracking-wider mb-1" onClick={(e) => handleFocus(e, 'iron-500')}>DRAWDOWN</p>
                          <p 
                            className="text-sm font-bold text-risk-red cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={(e) => handleFocus(e, 'risk-red')}
                            title="Edit Alert Red (risk-red)"
                          >-$379.35</p>
                        </div>
                        {/* Metric 2 */}
                        <div 
                          className="bg-surface-tertiary border border-iron-800 rounded py-2 text-center cursor-pointer hover:border-iron-500 transition-colors"
                          onClick={(e) => handleFocus(e, 'surface-tertiary')}
                        >
                          <p className="text-[9px] text-iron-500 font-mono tracking-wider mb-1">STAG. DAYS</p>
                          <p 
                            className="text-sm font-bold text-iron-100 cursor-pointer hover:text-white transition-opacity"
                            onClick={(e) => handleFocus(e, 'iron-100')}
                          >14</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    {/* Mock Distribution Chart */}
                    <div 
                      className="bg-surface-secondary border border-iron-800 rounded-xl p-4 cursor-pointer hover:border-accent transition-colors shadow-sm h-[13.5rem] flex flex-col"
                      onClick={(e) => handleFocus(e, 'surface-secondary')}
                    >
                      <div className="flex justify-between items-center mb-4">
                        <span 
                          className="text-sm font-semibold text-iron-200"
                          onClick={(e) => handleFocus(e, 'iron-200')}
                        >Distribution</span>
                      </div>
                      <div className="w-full flex-1 border-b border-l border-iron-700 relative flex items-end justify-between px-1 gap-[2px]">
                        {/* Histogram Bars */}
                        {[15, 30, 75, 95, 65, 40, 20, 10, 5].map((h, i) => (
                           <div 
                             key={i} 
                             className="flex-1 bg-accent opacity-80 rounded-t-sm cursor-pointer hover:opacity-100 transition-opacity z-10" 
                             style={{ height: `${h}%` }} 
                             onClick={(e) => handleFocus(e, 'accent')}
                             title="Edit Bars (accent)"
                           />
                        ))}
                        {/* Bell Curve Overlay */}
                        <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
                          <path 
                            d="M-5,95 Q25,10 40,5 T90,95 L105,95" 
                            fill="none" 
                            stroke="var(--risk-yellow)" 
                            strokeWidth="2.5" 
                            className="transition-all cursor-pointer hover:stroke-[4px]"
                            style={{ pointerEvents: 'auto' }}
                            strokeLinecap="round"
                            onClick={(e) => handleFocus(e, 'risk-yellow')}
                          />
                          <line 
                            x1="65" y1="0" x2="65" y2="100" 
                            stroke="var(--risk-red)" 
                            strokeWidth="1.5" 
                            strokeDasharray="4"
                            className="transition-all cursor-pointer hover:stroke-[3px]"
                            style={{ pointerEvents: 'auto' }}
                            onClick={(e) => handleFocus(e, 'risk-red')}
                          />
                        </svg>
                      </div>
                    </div>

                    {/* Mock Data Table */}
                    <div 
                      className="bg-surface-primary border border-iron-800 rounded-xl overflow-hidden shadow-sm flex flex-col cursor-pointer hover:shadow-[0_0_0_1px_var(--iron-600)] transition-shadow"
                      onClick={(e) => handleFocus(e, 'surface-primary')}
                      title="Edit Table Container (surface-primary)"
                    >
                      {/* Search Bar Mock */}
                      <div 
                        className="p-2 border-b border-iron-800 bg-surface-secondary flex items-center gap-2 cursor-pointer hover:bg-surface-tertiary transition-colors" 
                        onClick={(e) => handleFocus(e, 'surface-secondary')}
                      >
                        <svg className="w-3 h-3 text-iron-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span className="text-[10px] text-iron-500" onClick={(e) => handleFocus(e, 'iron-500')}>Search strategies...</span>
                      </div>
                      
                      {/* Table Header */}
                      <div 
                        className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 bg-surface-tertiary border-b border-iron-800 items-center cursor-pointer hover:bg-surface-elevated transition-colors" 
                        onClick={(e) => handleFocus(e, 'surface-tertiary')}
                      >
                        <div className="w-2.5 h-2.5 rounded-[2px] border border-iron-600 cursor-pointer" onClick={(e) => handleFocus(e, 'iron-600')} />
                        <span className="text-[8px] font-semibold text-iron-400 tracking-wider" onClick={(e) => handleFocus(e, 'iron-400')}>NAME</span>
                        <span className="text-[8px] font-semibold text-iron-400 tracking-wider" onClick={(e) => handleFocus(e, 'iron-400')}>TRADES</span>
                        <span className="text-[8px] font-semibold text-accent tracking-wider cursor-pointer" onClick={(e) => handleFocus(e, 'accent')}>EXPECTANCY ▼</span>
                      </div>

                      {/* Table Rows */}
                      {[1, 2].map((i) => (
                        <div 
                          key={i} 
                          className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 border-b border-iron-800/50 bg-surface-primary items-center cursor-pointer hover:bg-surface-secondary transition-colors"
                          onClick={(e) => handleFocus(e, 'surface-primary')}
                        >
                          <div className="w-2.5 h-2.5 rounded-[2px] border border-iron-700 bg-surface-secondary cursor-pointer hover:border-accent transition-colors" onClick={(e) => handleFocus(e, 'iron-700')} />
                          <span className="text-[9px] text-iron-200 truncate cursor-pointer hover:text-white" onClick={(e) => handleFocus(e, 'iron-200')}>XauUsdjpy.Darw.V4...</span>
                          <span className="text-[9px] text-iron-300 tabular-nums" onClick={(e) => handleFocus(e, 'iron-300')}>{806 + i * 20}</span>
                          <span 
                            className="text-[9px] font-bold text-accent tabular-nums cursor-pointer hover:opacity-80" 
                            onClick={(e) => handleFocus(e, 'accent')}
                          >${(50.54 - i*5).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>
              
            </div>
            
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-iron-800 bg-surface-secondary flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>{t("cancel")}</Button>
          <Button variant="primary" onClick={handleSave} isLoading={isSaving} disabled={!label.trim() || Object.keys(colors).length === 0}>
            {t("saveCustom")}
          </Button>
        </div>

      </div>
    </div>,
    document.body
  );
}
