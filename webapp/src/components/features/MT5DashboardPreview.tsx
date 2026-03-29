/**
 * MT5DashboardPreview — Live visual simulation of the MT5 dashboard.
 * Reads DashboardWidget[] from the OOP model layer and renders a preview.
 */
import React from "react";
import { DashboardWidget } from "@/models/DashboardLayout";

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

interface MT5DashboardPreviewProps {
  widgets: DashboardWidget[];
  setLayout?: any;
}

/** Decorative candlestick bar heights for the background. */
const CANDLE_HEIGHTS = [18, 12, 22, 8, 15, 24, 10, 20, 14, 26, 11, 19, 16, 22, 9, 17, 23, 13, 21, 15];

function SortablePreviewItem({ w, idx }: { w: DashboardWidget, idx: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  };

  const isMoney = w.exampleValue.includes("$");
  const valNum = parseFloat(w.exampleValue.replace(/[^0-9.]/g, "")) || 0;
  const mockLimit = valNum * 2.5;
  const mockLimitStr = isMoney ? mockLimit.toFixed(2) : Math.round(mockLimit).toString();
  const suffix = isMoney ? "$" : "";

  if (w.style === "progress_bar") {
    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={`flex-1 min-w-[140px] max-w-[200px] shadow-sm rounded-sm overflow-hidden transition-opacity duration-200 cursor-grab active:cursor-grabbing ${isDragging ? "opacity-40 scale-[0.98] shadow-2xl" : "opacity-100"}`}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          ...style
        }}
      >
        <div className="h-[3px]" style={{ background: w.accentHex }} />
        <div className="px-2 py-1.5 flex flex-col justify-between h-full">
          <p className="text-[11px] text-[#A0A0A0] mb-0.5 truncate leading-tight">
            {w.title || "Metric"}
          </p>
          <div className="flex items-baseline gap-1.5 mb-0.5 truncate">
            <p className="text-[13px] text-iron-100 font-mono whitespace-nowrap">
              {valNum} / {mockLimitStr}
            </p>
            <p className="text-[12px] font-mono text-[#A0A0A0] ml-1 whitespace-nowrap">
              {suffix} <span className="ml-[2px] font-mono">40%</span>
            </p>
          </div>
          <p className="text-[10px] text-[#22c55e] mb-1 truncate leading-tight">
            Basic Rule: 40% usage
          </p>
          <div className="w-full h-1 bg-[#333333] border border-[#555] mt-auto">
            <div className="h-full bg-[#22c55e] w-[40%]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex-1 min-w-[100px] max-w-[140px] rounded-sm overflow-hidden transition-opacity duration-200 cursor-grab active:cursor-grabbing ${isDragging ? "opacity-40 scale-[0.98] shadow-2xl" : "opacity-100"}`}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        ...style
      }}
    >
      <div className="h-[3px]" style={{ background: w.accentHex }} />
      <div className="px-3 py-2.5">
        <p
          className="text-[9px] uppercase tracking-widest font-semibold mb-1 truncate"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {w.title || "Metric"}
        </p>
        <p
          className="text-base font-mono font-bold tracking-tight"
          style={{ color: w.accentHex }}
        >
          {w.exampleValue}
        </p>
      </div>
    </div>
  );
}

export default function MT5DashboardPreview({ widgets, setLayout }: MT5DashboardPreviewProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEndPreview = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && setLayout) {
      const oldIndex = widgets.findIndex((w) => w.id === active.id);
      const newIndex = widgets.findIndex((w) => w.id === over.id);
      setLayout((prev: any) => prev.reorderWidget(oldIndex, newIndex));
    }
  };

  return (
    <div className="mt-4 rounded-lg overflow-hidden border border-iron-700/60 shadow-xl">
      {/* MT5-style title bar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5"
        style={{ background: "#1e1e2e" }}
      >
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500/70" />
          <span className="w-2 h-2 rounded-full bg-yellow-500/70" />
          <span className="w-2 h-2 rounded-full bg-green-500/70" />
        </div>
        <span className="text-[10px] font-mono text-iron-500 tracking-wide ml-1">
          IronRisk Dashboard — MT5 Preview
        </span>
      </div>

      {/* Chart area simulation */}
      <div
        className="relative px-4 py-5"
        style={{
          background: "linear-gradient(180deg, #0d0d1a 0%, #141422 100%)",
          minHeight: 130,
        }}
      >
        {/* Subtle grid lines */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #888 1px, transparent 1px), linear-gradient(to bottom, #888 1px, transparent 1px)",
            backgroundSize: "48px 28px",
          }}
        />

        <div className="relative flex flex-wrap gap-3 justify-center">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndPreview}>
            <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
              {widgets.map((w, idx) => (
                <SortablePreviewItem key={w.id || idx} w={w} idx={idx} />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Simulated candlestick decoration */}
        <div className="flex items-end justify-center gap-[3px] mt-4 h-[30px] opacity-20">
          {CANDLE_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className="w-[6px] rounded-sm"
              style={{
                height: h,
                background: i % 3 === 0 ? "#ef4444" : "#22c55e",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
