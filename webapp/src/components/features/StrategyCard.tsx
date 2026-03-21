/** Strategy Card — dashboard card showing strategy status. */
"use client";

import React from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { Strategy } from "@/types/strategy";

interface StrategyCardProps {
  strategy: Strategy;
  isSelected: boolean;
  isChecked?: boolean;
  showCheckbox?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCheck?: (checked: boolean) => void;
}

export default function StrategyCard({
  strategy, isSelected, isChecked = false, showCheckbox = false,
  onSelect, onEdit, onDelete, onCheck,
}: StrategyCardProps) {
  const isProfit = strategy.net_profit >= 0;

  return (
    <Card
      hover
      className={`cursor-pointer ${isSelected ? "border-risk-green/50 shadow-[0_0_15px_rgba(0,230,118,0.1)]" : ""}`}
    >
      <div className="flex gap-3">
        {/* Checkbox */}
        {showCheckbox && (
          <div className="flex items-start pt-0.5 shrink-0">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => { e.stopPropagation(); onCheck?.(e.target.checked); }}
              className="w-4 h-4 rounded border-iron-600 bg-surface-tertiary text-risk-green
                focus:ring-risk-green/30 focus:ring-offset-0 cursor-pointer accent-emerald-500"
            />
          </div>
        )}

        {/* Card content */}
        <div className="flex-1 min-w-0" onClick={onSelect}>
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
                ${(
                  (strategy.metrics_snapshot?.DrawdownMetric as Record<string, number> | undefined)?.max_drawdown
                  ?? strategy.max_drawdown_limit
                ).toFixed(0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-iron-800">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          Edit
        </Button>
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
