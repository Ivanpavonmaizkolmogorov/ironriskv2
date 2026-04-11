"use client";

import { useAuthStore } from "@/store/useAuthStore";
import { useLocale } from "next-intl";
import { useState } from "react";

/**
 * Floating bug report button — opens the user's email client
 * with a pre-filled template to ironrisk.shield@gmail.com.
 * Only visible when the user is authenticated.
 */
export default function BugReportButton() {
  const { isAuthenticated, user } = useAuthStore();
  const locale = useLocale();
  const [isHovered, setIsHovered] = useState(false);

  if (!isAuthenticated) return null;

  const currentPage = typeof window !== "undefined" ? window.location.pathname : "/";
  const userEmail = user?.email || "unknown";
  const isEn = locale === "en";

  const subject = encodeURIComponent(
    `[Bug] IronRisk — ${currentPage}`
  );

  const body = encodeURIComponent(
    isEn
      ? `Hi IronRisk team,

I found an issue on the page: ${currentPage}
My account: ${userEmail}

Type: [ Bug / Suggestion / Question ]

Description:
(Describe what happened, what you expected, and what you see instead)



Feel free to attach screenshots or screen recordings.
`
      : `Hola equipo IronRisk,

He encontrado un problema en la página: ${currentPage}
Mi cuenta: ${userEmail}

Tipo: [ Bug / Sugerencia / Pregunta ]

Descripción:
(Describe qué ha ocurrido, qué esperabas y qué ves en su lugar)



Puedes adjuntar capturas de pantalla o grabaciones.
`
  );

  const mailto = `mailto:ironrisk.shield@gmail.com?subject=${subject}&body=${body}`;

  return (
    <a
      href={mailto}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed bottom-20 right-6 z-50 flex items-center gap-2 bg-surface-secondary border border-iron-700 hover:border-risk-blue/50 rounded-full shadow-lg hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all duration-300 group"
      title={isEn ? "Report a bug" : "Reportar un problema"}
      style={{ padding: isHovered ? "10px 18px 10px 14px" : "10px" }}
    >
      <span className="text-lg leading-none">🐛</span>
      {isHovered && (
        <span className="text-xs font-medium text-iron-300 whitespace-nowrap animate-in fade-in slide-in-from-right-2 duration-200">
          {isEn ? "Report Bug" : "Reportar Bug"}
        </span>
      )}
    </a>
  );
}
