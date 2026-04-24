"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

import { useSettingsStore } from "@/store/useSettingsStore";

export default function BetaInviteButton() {
  const [copiedLang, setCopiedLang] = useState<string | null>(null);
  const { adminTelegramHandle } = useSettingsStore();

  const getInvite = (lang: "en" | "es") => {
    const handle = adminTelegramHandle;
    const url = `https://t.me/${handle.replace('@', '')}`;
    
    if (lang === "en") {
      return `🛡️ IronRisk — Closed Beta

🌐 https://www.ironrisk.pro/en/register

📺 Tutorial:
https://youtu.be/IgGUemRjnoc

💬 Direct support: ${handle}
${url}`;
    } else {
      return `🛡️ IronRisk — Beta Privada

🌐 https://www.ironrisk.pro/es/register

📺 Tutorial:
https://youtu.be/rW_rJLNmtTw

💬 Soporte directo: ${handle}
${url}`;
    }
  };


  const handleCopy = async (lang: "en" | "es") => {
    await navigator.clipboard.writeText(getInvite(lang));
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
