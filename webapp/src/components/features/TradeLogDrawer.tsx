import React, { useState } from "react";
import { useTradeLog } from "@/hooks/useTradeLog";
import { useTranslations } from "next-intl";

interface TradeLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string | null;
  targetName: string;
  type: "STRATEGY" | "PORTFOLIO";
}

export default function TradeLogDrawer({ isOpen, onClose, targetId, targetName, type }: TradeLogDrawerProps) {
  const t = useTranslations("dashboard");
  const [limit, setLimit] = useState(100);
  const { data: trades, isLoading, error } = useTradeLog({ id: targetId, type, limit });

  const handleLoadMore = () => setLimit(l => l + 100);
  const handleLoadAll = () => setLimit(0); // 0 = all in our backend

  type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
  const [sortConfig, setSortConfig] = React.useState<SortConfig>({ key: 'close_time', direction: 'desc' });

  const sortedTrades = React.useMemo(() => {
    if (!trades) return [];
    const uniqueTrades = Array.from(new Map(trades.map(t => [t.ticket, t])).values());
    if (!sortConfig) return uniqueTrades;

    return uniqueTrades.sort((a: any, b: any) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      if (sortConfig.key === 'close_time' || sortConfig.key === 'open_time') {
        aVal = aVal ? new Date(aVal as string).getTime() : 0;
        bVal = bVal ? new Date(bVal as string).getTime() : 0;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [trades, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig?.key !== columnKey) return <span className="opacity-0 group-hover:opacity-50 ml-1">↕</span>;
    return <span className="ml-1 text-iron-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  if (!isOpen) return null;

  const formatDate = (ds: string) => {
    try {
      if (!ds) return "-";
      // Format as DD/MM/YY HH:mm
      const d = new Date(ds);
      return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).replace(',', '');
    } catch {
      return ds;
    }
  };

  const formatPrice = (p: number | null | undefined) => {
    if (p === null || p === undefined) return "-";
    return p.toFixed(5);
  };

  const formatProfit = (p: number | null | undefined) => {
    if (p === null || p === undefined) return <span className="text-iron-500 font-mono">-</span>;
    const val = p.toFixed(2);
    const isPositive = p > 0;
    const isZero = p === 0;
    const color = isPositive ? "text-risk-green" : isZero ? "text-iron-400" : "text-risk-red";
    return <span className={`font-mono text-[11px] ${color}`}>{isPositive ? '+' : ''}{val}</span>;
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={`fixed top-0 right-0 z-50 h-full w-[1100px] max-w-[95vw] bg-surface-primary border-l border-iron-800 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-iron-800 bg-surface-secondary">
          <div>
            <h2 className="text-lg font-bold text-iron-100 flex items-center gap-2">
              <span className="text-xl">🔍</span> {targetName}
            </h2>
            <p className="text-xs text-iron-500 uppercase tracking-widest mt-1">
              {type === "STRATEGY" ? "Strategy" : "Portfolio"} Trade Log
            </p>
          </div>
          <button 
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-tertiary hover:bg-risk-red/20 text-iron-400 hover:text-risk-red transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-x-auto overflow-y-auto bg-surface-primary relative">
          {isLoading && !trades ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="opacity-50 animate-pulse text-sm text-iron-400">Loading trades...</div>
            </div>
          ) : error ? (
            <div className="p-6 text-risk-red text-sm">Failed to load trades.</div>
          ) : !trades || trades.length === 0 ? (
            <div className="p-6 text-center text-iron-500 text-sm mt-10">No trades found.</div>
          ) : (
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-surface-secondary text-[10px] uppercase tracking-wider text-iron-500 sticky top-0 z-10 transition-colors">
                <tr>
                  <th onClick={() => handleSort('ticket')} className="px-4 py-3 font-medium border-b border-iron-800 cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">Ticket <SortIcon columnKey="ticket" /></th>
                  <th onClick={() => handleSort('close_time')} className="px-4 py-3 font-medium border-b border-iron-800 cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">Close Time <SortIcon columnKey="close_time" /></th>
                  <th onClick={() => handleSort('symbol')} className="px-4 py-3 font-medium border-b border-iron-800 cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">Symbol <SortIcon columnKey="symbol" /></th>
                  <th onClick={() => handleSort('deal_type')} className="px-4 py-3 font-medium border-b border-iron-800 text-center cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">Dir <SortIcon columnKey="deal_type" /></th>
                  <th onClick={() => handleSort('volume')} className="px-4 py-3 font-medium border-b border-iron-800 text-right cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">Vol <SortIcon columnKey="volume" /></th>
                  <th onClick={() => handleSort('open_price')} className="px-4 py-3 font-medium border-b border-iron-800 text-right hidden lg:table-cell cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">Open <SortIcon columnKey="open_price" /></th>
                  <th onClick={() => handleSort('close_price')} className="px-4 py-3 font-medium border-b border-iron-800 text-right hidden lg:table-cell cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">Close <SortIcon columnKey="close_price" /></th>
                  <th onClick={() => handleSort('sl')} className="px-4 py-3 font-medium border-b border-iron-800 text-right hidden lg:table-cell cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">SL <SortIcon columnKey="sl" /></th>
                  <th onClick={() => handleSort('tp')} className="px-4 py-3 font-medium border-b border-iron-800 text-right hidden lg:table-cell cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">TP <SortIcon columnKey="tp" /></th>
                  <th onClick={() => handleSort('swap')} className="px-4 py-3 font-medium border-b border-iron-800 text-right cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">Swap <SortIcon columnKey="swap" /></th>
                  <th onClick={() => handleSort('commission')} className="px-4 py-3 font-medium border-b border-iron-800 text-right cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">Comm <SortIcon columnKey="commission" /></th>
                  <th onClick={() => handleSort('profit')} className="px-4 py-3 font-medium border-b border-iron-800 text-right cursor-pointer hover:bg-surface-tertiary hover:text-iron-300 group select-none">Net Profit <SortIcon columnKey="profit" /></th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {sortedTrades.map((t, i) => (
                  <tr key={t.ticket || i} className="border-b border-iron-800/30 hover:bg-surface-secondary/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-iron-400">{t.ticket}</td>
                    <td className="px-4 py-2.5 text-iron-300 font-mono text-[11px]">{formatDate(t.close_time)}</td>
                    <td className="px-4 py-2.5 text-iron-200 font-mono font-medium text-[11px]">{t.symbol || "-"}</td>
                    <td className="px-4 py-2.5 text-center">
                      {t.deal_type ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          t.deal_type.toUpperCase() === 'BUY' ? 'bg-risk-green/10 text-risk-green' : 
                          t.deal_type.toUpperCase() === 'SELL' ? 'bg-risk-red/10 text-risk-red' : 'hidden'
                        }`}>
                          {t.deal_type}
                        </span>
                      ) : (
                        <span className="text-iron-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-iron-200">{t.volume?.toFixed(2) || "-"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] text-iron-500 hidden lg:table-cell">{formatPrice(t.open_price)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] text-iron-500 hidden lg:table-cell">{formatPrice(t.close_price)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] text-risk-red/60 hidden lg:table-cell">{formatPrice(t.sl)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] text-risk-green/60 hidden lg:table-cell">{formatPrice(t.tp)}</td>
                    <td className="px-4 py-2.5 text-right bg-white/5">{formatProfit(t.swap)}</td>
                    <td className="px-4 py-2.5 text-right bg-white/5">{formatProfit(t.commission)}</td>
                    <td className="px-4 py-2.5 text-right bg-black/10 text-sm">{formatProfit(t.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer (Pagination) */}
        {trades && trades.length > 0 && limit > 0 && (
          <div className="flex items-center justify-start gap-6 px-6 py-4 border-t border-iron-800 bg-surface-secondary relative z-[60]">
            <div className="text-xs text-iron-500">Showing {trades.length} trades</div>
            <div className="flex gap-2">
              <button 
                onClick={handleLoadMore}
                disabled={isLoading || trades.length < limit}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-surface-tertiary hover:bg-iron-800 text-iron-200 transition-colors disabled:opacity-50"
              >
                Load +100
              </button>
              <button 
                onClick={handleLoadAll}
                disabled={isLoading}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-risk-cyan/10 hover:bg-risk-cyan/20 text-risk-cyan transition-colors"
              >
                Load All
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
