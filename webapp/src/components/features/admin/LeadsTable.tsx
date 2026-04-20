"use client";

import React, { useEffect, useState } from "react";
import { waitlistAPI } from "@/services/api";
import { Trash2, Mail, Send } from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";

interface Lead {
  id: string;
  email: string;
  source: string;
  notes: string | null;
  created_at: string;
}

export default function LeadsTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const { adminTelegramHandle } = useSettingsStore();

  const getInviteBody = () => {
    const handle = adminTelegramHandle || "@OswIronRisk";
    const url = `https://t.me/${handle.replace('@', '')}`;
    return `🛡️ IronRisk — Beta Privada

🌐 https://www.ironrisk.pro/es/register

Tu código de acceso:
🔑 IRONRISK-VIP-2026

📺 Tutoriales:
1. https://youtu.be/H65NyD795bI
2. https://youtu.be/yiCZE9IYgsA

💬 Soporte directo: ${handle}
${url}`;
  };

  const fetchLeads = async () => {
    try {
      const res = await waitlistAPI.list();
      setLeads(res.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this lead?")) return;
    await waitlistAPI.remove(id);
    setLeads((prev) => prev.filter((l) => l.id !== id));
  };

  if (loading) {
    return (
      <div className="text-iron-500 text-sm py-8 text-center animate-pulse">
        Loading leads...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-iron-100 flex items-center gap-2">
          <Mail className="w-5 h-5 text-risk-green" />
          Waitlist Leads
          <span className="text-sm font-normal text-iron-500 ml-2">
            ({leads.length} total)
          </span>
        </h2>
      </div>

      {leads.length === 0 ? (
        <div className="text-iron-500 text-sm py-8 text-center border border-iron-700 rounded-xl bg-surface-card">
          No leads yet. They&apos;ll appear here when someone tries to register without a VIP code.
        </div>
      ) : (
        <div className="overflow-x-auto border border-iron-700 rounded-xl bg-surface-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-iron-700 text-iron-400">
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-left px-4 py-3 font-medium">Motivation</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-iron-800 last:border-0 hover:bg-iron-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-iron-200 font-mono text-xs">
                    {lead.email}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-risk-blue/15 text-risk-blue border border-risk-blue/30">
                      {lead.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-iron-300 text-xs max-w-xs">
                    {lead.notes ? (
                      <span className="italic" title={lead.notes}>
                        “{lead.notes.length > 80 ? lead.notes.slice(0, 80) + '...' : lead.notes}”
                      </span>
                    ) : (
                      <span className="text-iron-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-iron-400 text-xs">
                    {new Date(lead.created_at).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right flex justify-end gap-1">
                    <a
                      href={`mailto:${lead.email}?subject=${encodeURIComponent("IronRisk - Acceso a Beta Privada")}&body=${encodeURIComponent(getInviteBody())}`}
                      className="p-1.5 rounded-lg text-risk-green hover:text-white hover:bg-risk-green/20 transition-all flex items-center justify-center"
                      title="Enviar Código (Email)"
                    >
                      <Send className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDelete(lead.id)}
                      className="p-1.5 rounded-lg text-iron-500 hover:text-risk-red hover:bg-risk-red/10 transition-all flex items-center justify-center"
                      title="Delete lead"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
