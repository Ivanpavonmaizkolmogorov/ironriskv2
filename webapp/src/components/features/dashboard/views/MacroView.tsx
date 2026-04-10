import React from "react";
import Card from "@/components/ui/Card";
import { DashboardContext } from "../dashboardViewConfigs";

export const MacroView: React.FC<{ context: DashboardContext }> = ({ context }) => {

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500">
      <Card className="min-h-[400px] flex flex-col items-center justify-center border-dashed border-iron-700 bg-surface-tertiary/30">
        <div className="w-16 h-16 rounded-full bg-iron-800/80 flex items-center justify-center text-2xl mb-4 border border-iron-700">
          🌍
        </div>
        <h2 className="text-xl font-bold text-iron-200 mb-2">Macro Risk Center</h2>
        <p className="text-iron-500 text-sm max-w-md text-center">
          Esta vista consolidará el riesgo global de todas tus estrategias activas y calculará la probabilidad de ruina completa para esta cuenta.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <span className="px-3 py-1 bg-iron-800 border border-iron-700 rounded-full text-[10px] uppercase font-mono text-iron-400">Status Matrix (Próximamente)</span>
          <span className="px-3 py-1 bg-iron-800 border border-iron-700 rounded-full text-[10px] uppercase font-mono text-iron-400">Global Drawdown Curve (Próximamente)</span>
          <span className="px-3 py-1 bg-iron-800 border border-iron-700 rounded-full text-[10px] uppercase font-mono text-iron-400">Account Risk Engine (Próximamente)</span>
        </div>
      </Card>
    </div>
  );
};
