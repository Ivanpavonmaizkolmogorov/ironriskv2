import { useState, useEffect } from "react";
import { strategyAPI, portfolioAPI } from "@/services/api";

export interface TradeLogEntry {
  ticket: number;
  magic_number: number;
  symbol: string | null;
  volume: number | null;
  profit: number;
  comment: string | null;
  close_time: string;
  open_time: string | null;
  open_price: number | null;
  close_price: number | null;
  sl: number | null;
  tp: number | null;
  deal_type: string | null;
  commission: number | null;
  swap: number | null;
}

interface UseTradeLogParams {
  id: string | null;
  type: "STRATEGY" | "PORTFOLIO";
  limit?: number;
  offset?: number;
}

export function useTradeLog({ id, type, limit = 50, offset = 0 }: UseTradeLogParams) {
  const [data, setData] = useState<TradeLogEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        let res;
        if (type === "STRATEGY") {
          res = await strategyAPI.getTrades(id, limit, offset);
        } else {
          res = await portfolioAPI.getTrades(id, limit, offset);
        }
        
        if (isMounted) {
          setData(res.data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [id, type, limit, offset]);

  return { data, isLoading, error };
}
