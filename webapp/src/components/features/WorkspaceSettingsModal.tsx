"use client";

import React, { useState } from "react";
import Button from "@/components/ui/Button";
import MT5DashboardPreview from "@/components/features/MT5DashboardPreview";
import TelegramLinker from "@/components/features/TelegramLinker";
import { DashboardLayout, MetricCatalog, MT5ColorTheme } from "@/models/DashboardLayout";
import { tradingAccountAPI } from "@/services/api";
import type { TradingAccount } from "@/types/tradingAccount";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── LOCAL SORTABLE SLOT ────────────────────────────────────────────────
// Encapsulates the drag-and-drop animated slide physics via dnd-kit
function SortableSlot({ widget, idx, tMetrics, setLayout, colorNames }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-surface-primary/50 border rounded-lg p-3 relative group transition-opacity duration-200 ${
        isDragging ? 'opacity-40 border-dashed border-iron-500 scale-95 shadow-xl' : 'opacity-100 border-iron-800'
      }`}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="absolute top-2 right-2 text-iron-600 opacity-50 hover:opacity-100 cursor-grab active:cursor-grabbing p-1" 
        title="Drag to reorder"
      >
        ⠿
      </div>
      <label className="block text-xs text-iron-400 mb-1">Slot {idx + 1}</label>
      <div className="w-full bg-surface-tertiary border border-iron-700 text-iron-200 rounded px-2 py-1.5 text-sm mb-2 opacity-80 cursor-not-allowed">
        {tMetrics(`${widget.valueKey}.label`)}
      </div>


      
      <label className="block text-xs text-iron-400 mb-1">Color Accent</label>
      <select
        value={widget.color}
        onChange={(e) => setLayout((prev: any) => prev.changeColor(idx, e.target.value))}
        className="w-full bg-surface-tertiary border border-iron-700 text-iron-200 rounded px-2 py-1.5 text-sm outline-none focus:border-risk-blue appearance-none hover:bg-surface-secondary"
      >
        {colorNames.map((c: string) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}

// ─── OOP WorkspaceSettingsModal ─────────────────────────────────
// This modal manages the "El Padre" (Workspace-level) configuration.
// Currently: Master MT5 Dashboard Template (inalterable for all EAs).

interface WorkspaceSettingsModalProps {
  account: TradingAccount;
  onClose: () => void;
  onSaved: () => void;
}

export default function WorkspaceSettingsModal({
  account,
  onClose,
  onSaved,
}: WorkspaceSettingsModalProps) {
  const tWs = useTranslations("workspaceSettings");
  const tMetrics = useTranslations("metrics");
  const [isSaving, setIsSaving] = useState(false);

  // Setup dnd-kit sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Layout state: OOP DashboardLayout model ──
  const [layout, setLayout] = useState<DashboardLayout>(() =>
    DashboardLayout.fromJSON((account as any).default_dashboard_layout)
  );

  const handleDragEndForm = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = layout.widgets.findIndex((w) => w.id === active.id);
      const newIndex = layout.widgets.findIndex((w) => w.id === over.id);
      setLayout((prev) => prev.reorderWidget(oldIndex, newIndex));
    }
  };

  const metricOptions = MetricCatalog.all();
  const colorNames = MT5ColorTheme.allNames();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await tradingAccountAPI.updateSettings(account.id, {
        default_dashboard_layout: layout.toJSON(),
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save workspace settings", err);
      alert("Error al guardar la configuración del workspace.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-secondary border border-iron-800 rounded-xl p-6 w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-iron-500 hover:text-iron-300"
        >
          ✕
        </button>

        <h3 className="text-xl font-bold text-iron-100 mb-1">⚙️ {tWs("title")}</h3>
        <p className="text-xs text-iron-500 mb-6">
          {tWs("subtitle", { account: account.name })}
        </p>

        {/* Master Risk Toggles Section */}
        <div className="border-t border-iron-700 pt-5 pb-5">
          <p className="text-xs uppercase text-iron-500 tracking-wider font-semibold mb-4">
            🛡️ {tWs("masterRiskTitle")}
          </p>
          <p className="text-xs text-iron-400 mb-4">
            {tWs("masterRiskDesc")}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              "max_drawdown",
              "daily_loss",
              "consecutive_losses",
              "stagnation_days",
              "stagnation_trades",
              "bayes_p_positive"
            ].map((metricKey) => (
              <label key={metricKey} className="flex items-center gap-3 cursor-pointer group" title={tMetrics(`${metricKey}.tooltip`)}>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={layout.masterToggles[metricKey] ?? false}
                    onChange={(e) => setLayout(prev => prev.setMasterToggle(metricKey, e.target.checked))}
                  />
                  <div className="w-10 h-5 bg-iron-800 rounded-full peer peer-checked:bg-risk-blue transition-colors border border-iron-700 peer-checked:border-risk-blue/50"></div>
                  <div className="absolute left-1 top-1 bg-iron-400 w-3 h-3 rounded-full peer-checked:translate-x-5 peer-checked:bg-white transition-all"></div>
                </div>
                <span className="text-sm font-medium text-iron-200 group-hover:text-white transition-colors">
                  {tMetrics(`${metricKey}.label`)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Telegram Notifications Integration */}
        <div className="border-t border-iron-700 pt-5 pb-5">
           <p className="text-xs uppercase text-iron-500 tracking-wider font-semibold mb-4">
            ✈️ Integración de Alertas Remotas
          </p>
          <TelegramLinker />
        </div>

        {/* MT5 Dashboard Layout Section — "El Padre" */}
        <div className="border-t border-iron-700 pt-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase text-iron-500 tracking-wider font-semibold">
              🎨 {tWs("templateTitle")}
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndForm}>
              <SortableContext items={layout.widgets.map(w => w.id)} strategy={rectSortingStrategy}>
                {layout.widgets.map((widget, idx) => (
                  <SortableSlot 
                    key={widget.id} 
                    widget={widget} 
                    idx={idx} 
                    tMetrics={tMetrics} 
                    setLayout={setLayout} 
                    colorNames={colorNames} 
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {/* Live Preview */}
          <MT5DashboardPreview 
            widgets={layout.widgets} 
            setLayout={setLayout} 
          />
          
          <div className="mt-6 pt-4 border-t border-iron-800">
            <p className="text-[10px] uppercase text-iron-500 mb-2 tracking-wider font-semibold">
              📡 Backend-to-MQL5 Payload (What all EAs in this workspace will read)
            </p>
            <pre className="bg-[#1e1e2e] text-[#a6accd] p-3 rounded-lg text-xs font-mono overflow-auto max-h-40 border border-iron-800 shadow-inner">
              {JSON.stringify(layout.toJSON(), null, 2)}
            </pre>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={isSaving} className="bg-risk-blue hover:bg-risk-blue/90 text-white">
            Save Workspace Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
