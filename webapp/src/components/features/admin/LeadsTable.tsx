"use client";

import React, { useEffect, useState } from "react";
import { waitlistAPI } from "@/services/api";
import { Trash2, Mail, CheckCircle2, Clock } from "lucide-react";

interface Lead {
  id: string;
  email: string;
  source: string;
  locale: string;
  notes: string | null;
  approved_at: string | null;
  created_at: string;
}

export default function LeadsTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  const fetchLeads = async () => {
    try {
      const res = await waitlistAPI.list();
      setLeads(res.data);
      // Pre-populate already approved
      const alreadyApproved = new Set<string>(
        res.data.filter((l: Lead) => l.approved_at).map((l: Lead) => l.id)
      );
      setApprovedIds(alreadyApproved);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleApprove = async (id: string, email: string) => {
    if (!confirm(`Aprobar y enviar acceso a ${email}?`)) return;
    setApproving(id);
    try {
      await waitlistAPI.approve(id);
      setApprovedIds((prev) => new Set([...prev, id]));
    } catch (err: any) {
      alert(`Error: ${err?.response?.data?.detail || "Error al aprobar"}`);
    } finally {
      setApproving(null);
    }
  };

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

  const pending = leads.filter((l) => !approvedIds.has(l.id));
  const approved = leads.filter((l) => approvedIds.has(l.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-iron-100 flex items-center gap-2">
          <Mail className="w-5 h-5 text-risk-green" />
          Waitlist Leads
          <span className="text-sm font-normal text-iron-500 ml-2">
            ({pending.length} pendientes · {approved.length} aprobados)
          </span>
        </h2>
      </div>

      {leads.length === 0 ? (
        <div className="text-iron-500 text-sm py-8 text-center border border-iron-700 rounded-xl bg-surface-card">
          No leads yet. They&apos;ll appear here when someone registers.
        </div>
      ) : (
        <div className="overflow-x-auto border border-iron-700 rounded-xl bg-surface-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-iron-700 text-iron-400">
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Locale</th>
                <th className="text-left px-4 py-3 font-medium">Motivación</th>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const isApproved = approvedIds.has(lead.id);
                const isApproving = approving === lead.id;
                return (
                  <tr
                    key={lead.id}
                    className={`border-b border-iron-800 last:border-0 transition-colors ${
                      isApproved ? "opacity-50 bg-risk-green/5" : "hover:bg-iron-800/30"
                    }`}
                  >
                    <td className="px-4 py-3 text-iron-200 font-mono text-xs">
                      {lead.email}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-risk-blue/15 text-risk-blue border border-risk-blue/30">
                        {lead.locale || "es"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-iron-300 text-xs max-w-xs">
                      {lead.notes ? (
                        <span className="italic" title={lead.notes}>
                          &ldquo;{lead.notes.length > 80 ? lead.notes.slice(0, 80) + "..." : lead.notes}&rdquo;
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {isApproved ? (
                          <span className="flex items-center gap-1 text-xs text-risk-green font-semibold px-2">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Enviado
                          </span>
                        ) : (
                          <button
                            onClick={() => handleApprove(lead.id, lead.email)}
                            disabled={isApproving}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-risk-green/15 border border-risk-green/30 text-risk-green text-xs font-semibold hover:bg-risk-green/25 transition-all disabled:opacity-50"
                            title="Aprobar y enviar magic link"
                          >
                            {isApproving ? (
                              <>
                                <Clock className="w-3.5 h-3.5 animate-spin" />
                                Enviando...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Aprobar
                              </>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="p-1.5 rounded-lg text-iron-500 hover:text-risk-red hover:bg-risk-red/10 transition-all flex items-center justify-center"
                          title="Delete lead"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
