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

export default function TradingAccountManager() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [newName, setNewName] = useState("");
  const [newBroker, setNewBroker] = useState("");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [isEntering, setIsEntering] = useState<string | null>(null);
  const t = useTranslations("workspaceManager");

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const res = await tradingAccountAPI.list();
      setAccounts(res.data);
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
    } finally {
      setIsCreating(false);
    }
  };

  const revokeAccount = async (id: string) => {
    await tradingAccountAPI.revoke(id);
    await loadAccounts();
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
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
        <a href="/downloads/IronRisk_Dashboard_v55.mq5" download>
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

      {/* Create new account */}
      <div className="flex flex-col gap-3 mb-6 bg-surface-secondary border border-iron-800 p-4 rounded-xl">
        <h4 className="text-sm font-medium text-iron-200">{t("newAccount")}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            placeholder={t("placeholderName")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            placeholder={t("placeholderBroker")}
            value={newBroker}
            onChange={(e) => setNewBroker(e.target.value)}
          />
          <Input
            placeholder={t("placeholderActNo")}
            value={newAccountNumber}
            onChange={(e) => setNewAccountNumber(e.target.value)}
          />
        </div>
        <div className="flex justify-end mt-2">
          <Button onClick={createAccount} isLoading={isCreating} disabled={!newName.trim()} size="md">
            {t("btnCreate")}
          </Button>
        </div>
      </div>

      {/* Accounts list */}
      <div className="space-y-3">
        {accounts.map((a) => (
          <div
            key={a.id}
            className={`
              flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border
              ${a.is_active
                ? "bg-surface-tertiary border-iron-700"
                : "bg-surface-primary border-iron-800 opacity-50"
              }
            `}
          >
            <div className="flex-1 min-w-0 mb-3 sm:mb-0">
              <p className="text-base text-iron-200 font-semibold">{a.name}</p>
              <div className="flex gap-4 mt-1 text-xs text-iron-500">
                {a.broker && <span>{t("actBroker")}: <span className="text-iron-300">{a.broker}</span></span>}
                {a.account_number && <span>{t("actNumber")}: <span className="text-iron-300">{a.account_number}</span></span>}
              </div>
              <div className="mt-3 flex items-center gap-2 min-w-0">
                <span className="text-xs text-iron-400 shrink-0">{t("actToken")}:</span>
                <span className="text-xs font-mono text-risk-green bg-risk-green/10 px-2 py-1 rounded truncate">
                   {a.api_token}
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
                    onClick={() => {
                      setIsEntering(a.id);
                      router.push(`/dashboard/account/${a.id}`);
                    }}
                  >
                    → {t("btnEnter")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-left justify-center sm:justify-start"
                    onClick={() => copyToken(a.api_token)}
                  >
                    {copied === a.api_token ? t("copied") : t("btnCopy")}
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
        ))}
        {accounts.length === 0 && (
          <p className="text-sm text-iron-600 text-center py-8">
            {t("emptyState")}
          </p>
        )}
      </div>
    </Card>
    </>
  );
}
