/** Trading Account Manager — generate, view, and revoke Trading Accounts. */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { tradingAccountAPI } from "@/services/api";
import type { TradingAccount } from "@/types/tradingAccount";
import { useTranslations } from "next-intl";
import { useThemeStore } from "@/store/useThemeStore";
import ThemeSelector from "./ThemeSelector";
import { Pencil } from "lucide-react";
import { isConnectionAlive, getConnectionMonitor } from "@/services/ConnectionMonitor";

export default function TradingAccountManager() {
  const router = useRouter();
  const { themes, globalThemeId } = useThemeStore();
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [newName, setNewName] = useState("");
  const [newBroker, setNewBroker] = useState("");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [isEntering, setIsEntering] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [installerDownloaded, setInstallerDownloaded] = useState<string | null>(null);
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);
  const t = useTranslations("workspaceManager");

  useEffect(() => {
    loadAccounts();
    // Poll every 3 seconds to check if the EA connected
    const interval = setInterval(loadAccounts, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadAccounts = async () => {
    try {
      const res = await tradingAccountAPI.list();
      
      // Sync master clock with Hetzner server to bypass hardware clock skewed futures
      if (res.headers && res.headers['date']) {
         const serverMs = new Date(res.headers['date']).getTime();
         setServerTimeOffset(serverMs - Date.now());
      }
      
      const sorted = [...res.data].sort(
        (a: TradingAccount, b: TradingAccount) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setAccounts(sorted);
      
      const activeAccounts = res.data.filter((a: any) => a.last_heartbeat_at);
      if (activeAccounts.length > 0) {
        const latest = activeAccounts.reduce((latestStr: string | null, acc: any) => {
          if (!acc.last_heartbeat_at) return latestStr;
          if (!latestStr) return acc.last_heartbeat_at;
          return new Date(acc.last_heartbeat_at) > new Date(latestStr) ? acc.last_heartbeat_at : latestStr;
        }, null);
        if (latest) {
          getConnectionMonitor().setManualHeartbeat(new Date(latest));
        }
      }
    } catch {
      /* handled by interceptor */
    }
  };

  const createAccount = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      await tradingAccountAPI.create({
        name: newName,
        broker: newBroker,
        account_number: newAccountNumber,
      });
      await loadAccounts();
      setNewName("");
      setNewBroker("");
      setNewAccountNumber("");
    } catch (err: any) {
      if (err?.response?.status === 409) {
        alert(err.response.data?.detail || t("duplicateAccount"));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const revokeAccount = async (id: string) => {
    await tradingAccountAPI.revoke(id);
    await loadAccounts();
  };

  const updateAccountTheme = async (id: string, themeId: string) => {
    // Optimistic update
    setAccounts((prev: TradingAccount[]) => prev.map(a => a.id === id ? { ...a, theme: themeId } : a));
    try {
      await tradingAccountAPI.updateSettings(id, { theme: themeId });
    } catch {
      await loadAccounts(); // Revert on failure
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadInstaller = (token: string) => {
    const lines = [
      '@echo off',
      'title IronRisk Auto-Installer',
      'setlocal enabledelayedexpansion',
      'mode con: cols=85 lines=25',
      'color 0A',
      '',
      `set "TOKEN=${token}"`,
      `set "SERVER=${window.location.origin}/downloads"`,
      '',
      ':: Create temporary script',
      'set "PS1_FILE=%TEMP%\\Install-IronRisk.ps1"',
      `curl -sL -o "%PS1_FILE%" "%SERVER%/Install-IronRisk.ps1?v=${Date.now()}"`,
      '',
      'if exist "%PS1_FILE%" (',
      '    powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1_FILE%" -Token "%TOKEN%" -Server "%SERVER%"',
      '    del "%PS1_FILE%"',
      ') else (',
      '    color 0C',
      '    echo [X] Error: Could not download the installer from %SERVER%',
      '    pause',
      ')',
      'exit'
    ];
    const bat = lines.join('\r\n');
    const blob = new Blob([bat], { type: "application/x-bat" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Install-IronRisk.bat`;
    a.click();
    URL.revokeObjectURL(url);
    setInstallerDownloaded(token);
    setTimeout(() => setInstallerDownloaded(null), 4000);
  };

  const renameAccount = async (id: string) => {
    if (!editingName.trim()) { setEditingId(null); return; }
    setAccounts((prev: TradingAccount[]) => prev.map(a => a.id === id ? { ...a, name: editingName.trim() } : a));
    setEditingId(null);
    try {
      await tradingAccountAPI.updateSettings(id, { name: editingName.trim() });
    } catch {
      await loadAccounts();
    }
  };

  // Dynamically compute CSS properties to scope to the card div
  const getCardThemeStyles = (themeId: string | null | undefined): React.CSSProperties => {
    const effectiveId = themeId || globalThemeId;
    const themeData = themes[effectiveId];
    if (!themeData) return {};
    
    const styles: Record<string, string> = {};
    Object.entries(themeData.colors).forEach(([k, v]) => {
      styles[`--${k}`] = v;
    });
    return styles as React.CSSProperties;
  };

  return (
    <>
      {/* Full screen loading overlay */}
      {isEntering && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-surface-primary/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-16 h-16 border-4 border-iron-800 border-t-risk-green rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(0,230,118,0.5)]"></div>
          <h2 className="text-2xl font-bold text-iron-100 mb-2">{t("btnEntering")}</h2>
          <p className="text-sm text-risk-green font-mono">Establishing connection to Real-Time Risk Engine</p>
        </div>
      )}

      <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-iron-100">🏦 {t("title")}</h3>
      </div>
      <p className="text-sm text-iron-500 mb-6">
        {t("description")}
      </p>

      {/* Guided Empty State vs Minimal Create Box */}
      {accounts.length === 0 ? (
        <div className="flex flex-col gap-6 mb-8 mt-2 bg-gradient-to-br from-surface-secondary to-surface-primary border border-risk-green/20 p-8 rounded-2xl shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-risk-green/10 blur-[80px] rounded-full pointer-events-none" />
          <div className="flex flex-col gap-2 relative z-10">
            <h3 className="text-2xl font-bold text-iron-100">{t("guidedWelcome")}</h3>
            <p className="text-iron-400 text-sm max-w-xl">
              {t("guidedDesc")}
            </p>
          </div>
          
          <div className="flex flex-col gap-6 relative z-10 max-w-xl">
            <Input
              placeholder={t("guidedWorkspacePlaceholder")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-lg py-6 shadow-inner"
            />
          </div>
          
          <div className="flex justify-end mt-4 relative z-10">
            <Button 
              onClick={createAccount} 
              isLoading={isCreating} 
              disabled={!newName.trim()} 
              size="lg"
              className="w-full sm:w-auto px-10 shadow-[0_0_15px_rgba(0,230,118,0.2)]"
            >
              {t("guidedBtnCreate")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-6 bg-surface-secondary border border-iron-800 p-4 rounded-xl">
          <h4 className="text-sm font-medium text-iron-200">➕ {t("addWorkspace")}</h4>
          <div className="flex items-center gap-3 mt-1 pb-1">
            <div className="flex-1 max-w-sm">
              <Input
                placeholder={t("placeholderName")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button onClick={createAccount} isLoading={isCreating} disabled={!newName.trim()} size="md" className="shrink-0">
              {t("btnCreate")}
            </Button>
          </div>
        </div>
      )}

      {/* Accounts list */}
      <div className="space-y-3">
        {accounts.map((a) => (
          <div
            key={a.id}
            style={getCardThemeStyles(a.theme)}
            className={`
              flex flex-col p-3 sm:p-4 rounded-lg border
              ${a.is_active
                ? "bg-surface-tertiary border-iron-700 text-iron-100"
                : "bg-surface-primary border-iron-800 opacity-50 text-iron-100"
              }
            `}
          >
            {/* Top Row: Account Details & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between">
              <div className="flex-1 min-w-0 mb-3 sm:mb-0">
                <div className="flex items-center gap-3">
                {editingId === a.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => renameAccount(a.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') renameAccount(a.id); if (e.key === 'Escape') setEditingId(null); }}
                    className="text-base text-iron-200 font-semibold bg-transparent border-b border-risk-green/50 focus:outline-none focus:border-risk-green px-0 py-0 w-40"
                  />
                ) : (
                  <div className="group flex items-center gap-1.5">
                    <p className="text-base text-iron-200 font-semibold">
                      {a.name}
                    </p>
                    <button
                      onClick={() => { setEditingId(a.id); setEditingName(a.name); }}
                      className="opacity-0 group-hover:opacity-100 text-iron-500 hover:text-risk-green transition-all p-0.5 rounded"
                      title={t('dblClickRename')}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {a.is_active && (
                  <>
                    {!a.has_connected ? (
                      <button
                        onClick={() => downloadInstaller(a.api_token)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all duration-300 ${
                          installerDownloaded === a.api_token
                            ? "bg-risk-green/20 border border-risk-green/40 text-risk-green"
                            : "bg-risk-yellow/10 border border-risk-yellow/20 text-risk-yellow animate-pulse hover:bg-risk-yellow/20"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${installerDownloaded === a.api_token ? "bg-risk-green" : "bg-risk-yellow"}`}></div>
                        {installerDownloaded === a.api_token ? `✅ ${t("installerReady")}` : `⚡ ${t("downloadInstaller")} ⬇`}
                      </button>
                    ) : (
                      (() => {
                        const isAlive = isConnectionAlive(a.last_heartbeat_at, 300000, serverTimeOffset);
                        const isService = a.default_dashboard_layout?.last_heartbeat_source === "service";
                        
                        let bgColor = "bg-iron-800/50 border-iron-700/50 text-iron-500";
                        let dotColor = "bg-iron-600";
                        let text = "OFFLINE";
                        let pulse = "";
                        
                        // Calculate exact elapsed time for absolute transparency
                        let timeString = "";
                        if (a.last_heartbeat_at) {
                          const syncedNow = Date.now() + serverTimeOffset;
                          const secondsPassed = Math.floor((syncedNow - new Date(a.last_heartbeat_at).getTime()) / 1000);
                          
                          if (secondsPassed <= 0) timeString = ` (sincronizando...)`;
                          else if (secondsPassed < 60) timeString = ` (hace ${secondsPassed}s)`;
                          else if (secondsPassed < 300) timeString = ` (hace ${Math.floor(secondsPassed/60)}m ${secondsPassed%60}s)`;
                        }
                        
                        if (isAlive) {
                           if (isService || !a.default_dashboard_layout?.last_heartbeat_source) {
                              bgColor = "bg-risk-green/10 border-risk-green/20 text-risk-green";
                              dotColor = "bg-risk-green";
                              text = t("connected") + timeString;
                              pulse = "shadow-[0_0_8px_rgba(0,230,118,0.8)] animate-pulse";
                           } else {
                              bgColor = "bg-risk-yellow/10 border-risk-yellow/20 text-risk-yellow";
                              dotColor = "bg-risk-yellow";
                              text = "LEGACY EA" + timeString;
                              pulse = "shadow-[0_0_8px_rgba(255,171,0,0.8)] animate-pulse";
                           }
                        }

                        return (
                          <div title={isAlive ? `El servidor expira la conexión a los 5 minutos. Si has desinstalado, verás cómo este contador sube hasta apagarse.` : "Desconectado permanentemente."} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${bgColor}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${pulse}`}></div>
                            {text}
                          </div>
                        );
                      })()
                    )}
                    <div className="scale-90 opacity-80 hover:opacity-100 transition-opacity ml-2">
                      <ThemeSelector 
                        mode="inline" 
                        activeThemeOverride={a.theme} 
                        onThemeSelect={(t) => updateAccountTheme(a.id, t)} 
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-4 mt-1 text-xs text-iron-500">
                {a.broker && <span>{t("actBroker")}: <span className="text-iron-300">{a.broker}</span></span>}
                {a.account_number ? (
                  <span>{t("actNumber")}: <span className="text-iron-300">{a.account_number}</span></span>
                ) : a.is_active && !a.has_connected ? (
                  <span className="text-risk-yellow/70 italic">{t("actNumber")}: ⏳ {t("autoDetectPending")}</span>
                ) : null}
                {a.hostname && <span>🖥️ VPS: <span className="text-iron-300">{a.hostname}</span></span>}
              </div>
            </div>
            <div className="flex flex-wrap sm:flex-col justify-end gap-2 mt-3 sm:mt-0 sm:ml-4 shrink-0">
              {a.is_active && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full text-left justify-center sm:justify-start mb-2"
                    disabled={!a.has_connected}
                    title={!a.has_connected ? t("lockedTooltip") : ""}
                    onClick={() => {
                      setIsEntering(a.id);
                      router.push(`/dashboard/account/${a.id}`);
                    }}
                  >
                    {a.has_connected ? `→ ${t("btnEnter")}` : `🔒 ${t("btnEnter")}`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`w-full text-left justify-center sm:justify-start min-w-[110px] ${
                      installerDownloaded === a.api_token ? "text-risk-green" : "text-risk-green"
                    }`}
                    onClick={() => downloadInstaller(a.api_token)}
                  >
                    {installerDownloaded === a.api_token ? `✅ ${t("installerReady")}` : `⚡ ${t("downloadInstaller")}`}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="w-full text-left justify-center sm:justify-start"
                    onClick={() => {
                      if (confirm(t("confirmDeleteDesc"))) {
                        revokeAccount(a.id);
                      }
                    }}
                  >
                    {t("btnDelete")}
                  </Button>
                </>
              )}
              {!a.is_active && (
                <span className="text-xs text-iron-600 self-end">{t("archived")}</span>
              )}
            </div>
            </div>

            {/* Inline Onboarding Tutorial for Disconnected Accounts */}
            {a.is_active && !a.has_connected && (
              <div className="mt-5 pt-5 border-t border-iron-800/60 animate-in fade-in slide-in-from-top-2 duration-500">
                <h5 className="text-xs font-bold text-iron-300 mb-4 uppercase tracking-wider flex items-center gap-3">
                  <span className="w-5 h-5 flex items-center justify-center bg-risk-yellow/20 text-risk-yellow rounded-full text-xs animate-pulse">!</span>
                  <span>{t("tutorialTitle")}</span>
                  <div className="h-px bg-iron-800/50 flex-1"></div>
                </h5>
                <div className="flex flex-col gap-4 pl-2">
                   <div className="flex gap-4 items-start">
                     <div className="flex flex-col items-center shrink-0">
                       <span className="w-7 h-7 bg-risk-green/20 text-risk-green rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-surface-tertiary shadow-lg">1</span>
                       <div className="w-px flex-1 min-h-[16px] bg-risk-green/20 mt-1" />
                     </div>
                     <div className="bg-surface-secondary border border-iron-800 rounded-lg p-4 text-sm text-iron-400 flex-1 shadow-inner" dangerouslySetInnerHTML={{ __html: t.raw("tutorialStep1") }} />
                   </div>
                   <div className="flex gap-4 items-start">
                     <div className="flex flex-col items-center shrink-0">
                       <span className="w-7 h-7 bg-risk-yellow/20 text-risk-yellow rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-surface-tertiary shadow-lg">2</span>
                       <div className="w-px flex-1 min-h-[16px] bg-risk-yellow/20 mt-1" />
                     </div>
                     <div className="bg-surface-secondary border border-iron-800 rounded-lg p-4 text-sm text-iron-400 flex-1 shadow-inner" dangerouslySetInnerHTML={{ __html: t.raw("tutorialStep2") }} />
                   </div>
                   <div className="flex gap-4 items-start">
                     <div className="flex flex-col items-center shrink-0">
                       <span className="w-7 h-7 bg-iron-400/20 text-iron-300 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-surface-tertiary shadow-lg">3</span>
                     </div>
                     <div className="bg-surface-secondary border border-iron-800 rounded-lg p-4 text-sm text-iron-400 flex-1 shadow-inner">
                       <span dangerouslySetInnerHTML={{ __html: t.raw("tutorialStep3") }} /> (<span className="text-iron-200">{a.account_number}</span>).
                     </div>
                   </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
    </>
  );
}
