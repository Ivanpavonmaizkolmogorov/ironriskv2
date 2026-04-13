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
import { EA_DOWNLOAD_PATH } from "@/config/ea";

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
    if (!newName.trim() || !newAccountNumber.trim()) return;
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
        <a href={EA_DOWNLOAD_PATH} download>
          <button className="
        bg-transparent text-iron-400 hover:text-iron-200 hover:bg-surface-elevated px-3 py-1.5 text-xs
        rounded-lg font-medium transition-all duration-200
        disabled:opacity-40 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-risk-green/30
        text-risk-green border border-risk-green/30
      ">
            ⬇️ {t("downloadEA")}
          </button>
        </a>
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
            <div className="flex flex-col gap-4 border-l-2 border-iron-800/50 pl-6">
              <div className="flex items-center gap-2 text-risk-green font-bold text-xs uppercase tracking-widest">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-risk-green/20 text-risk-green">1</span>
                {t("guidedStep1")}
              </div>
              <Input
                placeholder={t("guidedWorkspacePlaceholder")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                placeholder={t("guidedBrokerPlaceholder")}
                value={newBroker}
                onChange={(e) => setNewBroker(e.target.value)}
              />
            </div>
            
            <div className="flex flex-col gap-4 border-l-2 border-iron-800/50 pl-6">
              <div className="flex items-center gap-2 text-risk-yellow font-bold text-xs uppercase tracking-widest">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-risk-yellow/20 text-risk-yellow">2</span>
                {t("guidedStep2")}
              </div>
              <p className="text-xs text-iron-500 -mt-2">
                {t("guidedStep2Desc")}
              </p>
              <Input
                placeholder={t("guidedMtPlaceholder")}
                value={newAccountNumber}
                onChange={(e) => setNewAccountNumber(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex justify-end mt-4 relative z-10">
            <Button 
              onClick={createAccount} 
              isLoading={isCreating} 
              disabled={!newName.trim() || !newAccountNumber.trim()} 
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              placeholder={t("placeholderName")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              placeholder={t("guidedMtPlaceholder")}
              value={newAccountNumber}
              onChange={(e) => setNewAccountNumber(e.target.value)}
            />
            <Input
              placeholder={t("placeholderBroker")}
              value={newBroker}
              onChange={(e) => setNewBroker(e.target.value)}
            />
          </div>
          <p className="text-xs text-risk-yellow/80 bg-risk-yellow/5 border border-risk-yellow/10 px-3 py-2 rounded-lg">
            {t("guidedBindWarning")}
          </p>
          <div className="flex justify-end mt-1">
            <Button onClick={createAccount} isLoading={isCreating} disabled={!newName.trim() || !newAccountNumber.trim()} size="md">
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
              flex flex-col p-4 rounded-lg border
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
                      <a href={EA_DOWNLOAD_PATH} download className="no-underline">
                        <button className="flex items-center gap-1.5 bg-risk-yellow/10 border border-risk-yellow/20 px-2.5 py-1 rounded-full text-xs font-semibold text-risk-yellow animate-pulse hover:bg-risk-yellow/20 cursor-pointer transition-colors">
                          <div className="w-1.5 h-1.5 bg-risk-yellow rounded-full"></div>
                          {t("waitingEA")} ⬇
                        </button>
                      </a>
                    ) : (
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        isConnectionAlive(a.last_heartbeat_at)
                          ? "bg-risk-green/10 border-risk-green/20 text-risk-green"
                          : "bg-iron-800/50 border-iron-700/50 text-iron-500"
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          isConnectionAlive(a.last_heartbeat_at)
                            ? "bg-risk-green shadow-[0_0_8px_rgba(0,230,118,0.8)] animate-pulse"
                            : "bg-iron-600"
                        }`}></div>
                        {isConnectionAlive(a.last_heartbeat_at) 
                          ? t("connected") 
                          : "OFFLINE"}
                      </div>
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
                {a.account_number && <span>{t("actNumber")}: <span className="text-iron-300">{a.account_number}</span></span>}
              </div>
              <div
                className="mt-3 flex items-center gap-2 min-w-0 cursor-pointer group/token"
                onClick={() => copyToken(a.api_token)}
                title={copied === a.api_token ? "✅" : t("btnCopy")}
              >
                <span className="text-xs text-iron-400 shrink-0">{t("actToken")}:</span>
                <span className="text-xs font-mono text-risk-green bg-risk-green/10 px-2 py-1 rounded truncate group-hover/token:bg-risk-green/20 transition-colors">
                   {a.api_token}
                </span>
                <span className="text-[10px] text-iron-500 group-hover/token:text-iron-300 transition-colors shrink-0">
                  {copied === a.api_token ? "✅" : "📋"}
                </span>
              </div>
            </div>
            <div className="flex sm:flex-col justify-end gap-2 mt-4 sm:mt-0 sm:ml-4 shrink-0 w-full sm:w-auto">
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
                    className="w-full text-left justify-center sm:justify-start min-w-[110px]"
                    onClick={() => copyToken(a.api_token)}
                  >
                    {copied === a.api_token ? `✅ ${t("btnCopy")}` : t("btnCopy")}
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
