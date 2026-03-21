/** Trading Account Manager — generate, view, and revoke Trading Accounts. */
"use client";

import React, { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { tradingAccountAPI } from "@/services/api";
import type { TradingAccount } from "@/types/tradingAccount";

export default function TradingAccountManager() {
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [newName, setNewName] = useState("");
  const [newBroker, setNewBroker] = useState("");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-iron-100">🏦 Trading Accounts</h3>
        <a href="/downloads/IronRisk_Dashboard_v27.mq5" download>
          <Button variant="ghost" size="sm" className="text-risk-green border border-risk-green/30">
            ⬇️ Download Dashboard EA (v27)
          </Button>
        </a>
      </div>
      <p className="text-sm text-iron-500 mb-6">
        Create a virtual container for each of your MetaTrader terminals (e.g., "FTMO 100k").
        Each account gets its own unique connection API token.
      </p>

      {/* Create new account */}
      <div className="flex flex-col gap-3 mb-6 bg-surface-secondary border border-iron-800 p-4 rounded-xl">
        <h4 className="text-sm font-medium text-iron-200">New Account</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            placeholder="Account Name (e.g. My FTMO)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            placeholder="Broker (optional)"
            value={newBroker}
            onChange={(e) => setNewBroker(e.target.value)}
          />
          <Input
            placeholder="MT5 Account Number (optional)"
            value={newAccountNumber}
            onChange={(e) => setNewAccountNumber(e.target.value)}
          />
        </div>
        <div className="flex justify-end mt-2">
          <Button onClick={createAccount} isLoading={isCreating} disabled={!newName.trim()} size="md">
            Create Account
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
                {a.broker && <span>Broker: <span className="text-iron-300">{a.broker}</span></span>}
                {a.account_number && <span>Act No: <span className="text-iron-300">{a.account_number}</span></span>}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-iron-400">Connection Token:</span>
                <span className="text-xs font-mono text-risk-green bg-risk-green/10 px-2 py-1 rounded">
                   {a.api_token}
                </span>
              </div>
            </div>
            <div className="flex sm:flex-col justify-end gap-2 ml-3">
              {a.is_active && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-left justify-center sm:justify-start"
                    onClick={() => copyToken(a.api_token)}
                  >
                    {copied === a.api_token ? "✓ Token Copied" : "Copy Token"}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="w-full text-left justify-center sm:justify-start"
                    onClick={() => revokeAccount(a.id)}
                  >
                    Delete Account
                  </Button>
                </>
              )}
              {!a.is_active && (
                <span className="text-xs text-iron-600 self-end">Archived</span>
              )}
            </div>
          </div>
        ))}
        {accounts.length === 0 && (
          <p className="text-sm text-iron-600 text-center py-8">
            No active trading accounts. Create one to get started.
          </p>
        )}
      </div>
    </Card>
  );
}
