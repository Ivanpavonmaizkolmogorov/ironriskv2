/** Strategy Card — dashboard card showing strategy status. */
"use client";

import React from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { Strategy } from "@/types/strategy";

interface StrategyCardProps {
  strategy: Strategy;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export default function StrategyCard({ strategy, isSelected, onSelect, onDelete }: StrategyCardProps) {
  const isProfit = strategy.net_profit >= 0;

  return (
    <Card
      hover
      className={`cursor-pointer ${isSelected ? "border-risk-green/50 shadow-[0_0_15px_rgba(0,230,118,0.1)]" : ""}`}
    >
      <div onClick={onSelect}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-iron-100 truncate">{strategy.name}</h4>
          {strategy.magic_number > 0 && (
            <span className="text-xs font-mono bg-surface-tertiary text-iron-400 px-2 py-0.5 rounded">
              #{strategy.magic_number}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-iron-500 uppercase">Trades</p>
            <p className="text-sm font-mono text-iron-200">{strategy.total_trades}</p>
          </div>
          <div>
            <p className="text-xs text-iron-500 uppercase">Net P&L</p>
            <p className={`text-sm font-mono ${isProfit ? "text-risk-green" : "text-risk-red"}`}>
              ${strategy.net_profit.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-iron-500 uppercase">Max DD</p>
            <p className="text-sm font-mono text-risk-yellow">
              ${strategy.max_drawdown_limit.toFixed(0)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-4 pt-3 border-t border-iron-800">
        <Button
          variant="danger"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}
