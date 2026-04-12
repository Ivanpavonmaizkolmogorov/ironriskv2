"use client";

import React, { useState, useEffect } from "react";
import { useLocale } from "next-intl";
import Button from "@/components/ui/Button";
import api from "@/services/api";

export default function TelegramLinker() {
  const [status, setStatus] = useState<"idle" | "loading" | "waiting" | "linked">("idle");
  const [link, setLink] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const locale = useLocale();

  // Initial check
  useEffect(() => {
    api.get("/api/telegram/status")
      .then(res => {
        if (res.data.is_linked) {
          setStatus("linked");
          setChatId(res.data.chat_id);
        }
      })
      .catch(console.error);
  }, []);

  // Polling when waiting
  useEffect(() => {
    if (status !== "waiting") return;
    let isActive = true;

    const poll = async () => {
      if (!isActive) return;
      try {
        const res = await api.post("/api/telegram/verify-link");
        if (res.data.status === "linked") {
          setStatus("linked");
          setChatId(res.data.chat_id);
          return;
        }
      } catch (e) {
        console.error(e);
      }
      
      if (isActive) {
        setTimeout(poll, 3000);
      }
    };

    poll();
    return () => { isActive = false; };
  }, [status]);

  const generateLink = async () => {
    setStatus("loading");
    try {
      const res = await api.post("/api/telegram/generate-link", { locale });
      if (res.data.link) {
        setLink(res.data.link);
        setStatus("waiting");
      }
    } catch (e) {
      console.error(e);
      setStatus("idle");
    }
  };

  if (status === "linked") {
    return (
      <div className="flex items-center gap-3 bg-surface-tertiary p-4 rounded-lg border border-emerald-500/30 text-emerald-400">
        <span className="text-2xl">🛡️</span>
        <div>
          <p className="font-semibold text-sm">Escudo Telegram Activado</p>
          <p className="text-xs text-iron-400">Tu cuenta está vinculada (ID: {chatId}). Recibirás las Alertas de Ulises al instante.</p>
        </div>
      </div>
    );
  }

  if (status === "waiting" && link) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(link)}&size=200x200&bgcolor=111827&color=34d399&format=png`;
    const token = link.split("start=")[1] || "";
    const manualCmd = `/start ${token}`;

    const copyCmd = () => {
      navigator.clipboard.writeText(manualCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="flex flex-col gap-4 bg-surface-tertiary p-5 rounded-lg border border-risk-blue/30">
        {/* Main: QR scan */}
        <div className="flex items-start gap-5">
          <div className="flex-shrink-0 bg-iron-900 rounded-lg p-2 border border-iron-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="QR Telegram"
              width={140}
              height={140}
              className="rounded"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-risk-blue mb-1">📱 Escanea con tu móvil</p>
            <p className="text-xs text-iron-400 leading-relaxed">
              Abre la cámara o la app de Telegram en tu móvil y escanea el QR. 
              Se abrirá directamente el bot — pulsa <b>Iniciar</b> y listo.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="animate-pulse text-risk-blue">●</span>
              <span className="text-xs text-iron-500">Esperando confirmación automática...</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-iron-700" />
          <span className="text-xs text-iron-600 uppercase tracking-wider">o desde este navegador</span>
          <div className="flex-1 h-px bg-iron-700" />
        </div>

        {/* Fallback: direct link + manual command */}
        <div className="flex flex-col gap-2">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-[#0088cc] hover:bg-[#0077b3] text-white text-sm font-medium transition-colors"
          >
            ✈️ Abrir en Telegram Web
          </a>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-iron-900 text-emerald-400 px-3 py-1.5 rounded text-xs font-mono select-all truncate">{manualCmd}</code>
            <button
              onClick={copyCmd}
              className="px-3 py-1.5 rounded bg-iron-700 hover:bg-iron-600 text-iron-200 text-xs transition-colors whitespace-nowrap"
            >
              {copied ? "✅" : "📋"}
            </button>
          </div>
          <p className="text-[10px] text-iron-600 text-center">Si el bot no arranca, pega el comando en el chat de @IronRiskShield_bot</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between bg-surface-tertiary p-4 rounded-lg border border-iron-700">
      <div>
        <p className="font-semibold text-sm text-iron-200">Alertas por Telegram</p>
        <p className="text-xs text-iron-500">Recibe notificaciones en tiempo real cuando tus EA superen los umbrales de riesgo permitidos.</p>
      </div>
      <Button onClick={generateLink} isLoading={status === "loading"} className="bg-[#0088cc] hover:bg-[#0077b3] text-white flex gap-2 items-center">
        <span>✈️</span> Conectar
      </Button>
    </div>
  );
}
