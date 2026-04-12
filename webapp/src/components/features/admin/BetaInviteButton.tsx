"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

const BETA_INVITE_TEXT = `🛡️ IronRisk — Closed Beta

🌐 https://www.ironrisk.pro/en/register

Your access code:
🔑 IRONRISK-VIP-2026

📺 Tutorials:
1. https://youtu.be/H65NyD795bI
2. https://youtu.be/yiCZE9IYgsA

💬 Direct support: @IronRisk_Ivan
https://t.me/IronRisk_Ivan`;

export default function BetaInviteButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(BETA_INVITE_TEXT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <button
      onClick={handleCopy}
      className={`
        mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono
        transition-all duration-300 w-fit
        ${copied
          ? "bg-risk-green/20 text-risk-green border border-risk-green/50"
          : "bg-amber-900/20 text-amber-400 border border-amber-700/50 hover:bg-amber-800/30 hover:text-amber-300"
        }
      `}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "✅ Copiado al portapapeles" : "📋 Copiar Invitación Beta (código + vídeos + Telegram)"}
    </button>
  );
}
