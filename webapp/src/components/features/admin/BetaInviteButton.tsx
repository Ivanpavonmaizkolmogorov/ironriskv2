"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

const INVITE_EN = `🛡️ IronRisk — Closed Beta

🌐 https://www.ironrisk.pro/en/register

Your access code:
🔑 IRONRISK-VIP-2026

📺 Tutorials:
1. https://youtu.be/H65NyD795bI
2. https://youtu.be/yiCZE9IYgsA

💬 Direct support: @IronRisk_Ivan
https://t.me/IronRisk_Ivan`;

const INVITE_ES = `🛡️ IronRisk — Beta Privada

🌐 https://www.ironrisk.pro/es/register

Tu código de acceso:
🔑 IRONRISK-VIP-2026

📺 Tutoriales:
1. https://youtu.be/H65NyD795bI
2. https://youtu.be/yiCZE9IYgsA

💬 Soporte directo: @IronRisk_Ivan
https://t.me/IronRisk_Ivan`;

export default function BetaInviteButton() {
  const [copiedLang, setCopiedLang] = useState<string | null>(null);

  const handleCopy = async (lang: "en" | "es") => {
    await navigator.clipboard.writeText(lang === "en" ? INVITE_EN : INVITE_ES);
    setCopiedLang(lang);
    setTimeout(() => setCopiedLang(null), 2500);
  };

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <button
        onClick={() => handleCopy("en")}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono
          transition-all duration-300
          ${copiedLang === "en"
            ? "bg-risk-green/20 text-risk-green border border-risk-green/50"
            : "bg-amber-900/20 text-amber-400 border border-amber-700/50 hover:bg-amber-800/30 hover:text-amber-300"
          }
        `}
      >
        {copiedLang === "en" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copiedLang === "en" ? "✅ Copied" : "🇬🇧 Copy Invite (EN)"}
      </button>
      <button
        onClick={() => handleCopy("es")}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono
          transition-all duration-300
          ${copiedLang === "es"
            ? "bg-risk-green/20 text-risk-green border border-risk-green/50"
            : "bg-amber-900/20 text-amber-400 border border-amber-700/50 hover:bg-amber-800/30 hover:text-amber-300"
          }
        `}
      >
        {copiedLang === "es" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copiedLang === "es" ? "✅ Copiado" : "🇪🇸 Copiar Invitación (ES)"}
      </button>
    </div>
  );
}
