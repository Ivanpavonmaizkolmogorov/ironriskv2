"use client";

import React, { useState, useEffect } from "react";
import { useLocale } from "next-intl";
import Button from "@/components/ui/Button";
import api from "@/services/api";

export default function TelegramLinker() {
  const [status, setStatus] = useState<"idle" | "loading" | "waiting" | "linked">("idle");
  const [link, setLink] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
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
          return; // stop polling
        }
      } catch (e) {
        console.error(e);
      }
      
      if (isActive) {
        setTimeout(poll, 3000);
      }
    };

    poll();

    return () => {
      isActive = false;
    };
  }, [status]);

  const generateLink = async () => {
    setStatus("loading");
    try {
      const res = await api.post("/api/telegram/generate-link", { locale });
      if (res.data.link) {
        setLink(res.data.link);
        setStatus("waiting");
        // Open deep link in new tab or native app
        window.open(res.data.link, "_blank");
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

  if (status === "waiting") {
    return (
      <div className="flex flex-col gap-3 bg-surface-tertiary p-4 rounded-lg border border-risk-blue/30">
        <div className="flex items-center gap-3">
          <span className="text-2xl animate-spin">⏳</span>
          <div>
            <p className="font-semibold text-sm text-risk-blue">Esperando confirmación...</p>
            <p className="text-xs text-iron-400">Se ha abierto Telegram en tu dispositivo. Simplemente pusa el botón <b>INICIAR</b> o envía el mensanje generado, y esta pantalla se actualizará sola.</p>
          </div>
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
