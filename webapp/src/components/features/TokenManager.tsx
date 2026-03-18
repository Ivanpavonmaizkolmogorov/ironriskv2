/** Token Manager — generate, view, and revoke API tokens. */
"use client";

import React, { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { authAPI } from "@/services/api";
import type { APIToken } from "@/types/auth";

export default function TokenManager() {
  const [tokens, setTokens] = useState<APIToken[]>([]);
  const [newLabel, setNewLabel] = useState("Default");
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    try {
      const res = await authAPI.listTokens();
      setTokens(res.data);
    } catch {
      /* handled by interceptor */
    }
  };

  const createToken = async () => {
    setIsCreating(true);
    try {
      await authAPI.createToken(newLabel);
      await loadTokens();
      setNewLabel("Default");
    } finally {
      setIsCreating(false);
    }
  };

  const revokeToken = async (id: string) => {
    await authAPI.revokeToken(id);
    await loadTokens();
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card>
      <h3 className="text-lg font-semibold text-iron-100 mb-4">🔑 API Tokens</h3>
      <p className="text-sm text-iron-500 mb-6">
        Generate a token and paste it into your MetaTrader EA&apos;s input parameters.
      </p>

      {/* Create new token */}
      <div className="flex gap-3 mb-6">
        <Input
          placeholder="Token label"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <Button onClick={createToken} isLoading={isCreating} size="md">
          Generate
        </Button>
      </div>

      {/* Token list */}
      <div className="space-y-3">
        {tokens.map((t) => (
          <div
            key={t.id}
            className={`
              flex items-center justify-between p-3 rounded-lg border
              ${t.is_active
                ? "bg-surface-tertiary border-iron-700"
                : "bg-surface-primary border-iron-800 opacity-50"
              }
            `}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-iron-300 font-medium">{t.label}</p>
              <p className="text-xs font-mono text-iron-500 truncate">{t.token}</p>
            </div>
            <div className="flex gap-2 ml-3">
              {t.is_active && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToken(t.token)}
                  >
                    {copied === t.token ? "✓ Copied" : "Copy"}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => revokeToken(t.id)}
                  >
                    Revoke
                  </Button>
                </>
              )}
              {!t.is_active && (
                <span className="text-xs text-iron-600">Revoked</span>
              )}
            </div>
          </div>
        ))}
        {tokens.length === 0 && (
          <p className="text-sm text-iron-600 text-center py-4">
            No tokens yet. Generate one to connect your EA.
          </p>
        )}
      </div>
    </Card>
  );
}
