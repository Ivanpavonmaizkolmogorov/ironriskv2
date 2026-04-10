"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import api from "@/services/api";
import { MetricDef, METRICS_REGISTRY_FALLBACK, ALERT_METRIC_KEYS, RISK_METRIC_KEYS } from "@/config/metricsRegistry";

interface MetricsContextType {
  schema: Record<string, MetricDef>;
  loading: boolean;
  getDef: (key: string) => MetricDef;
  ALERT_KEYS: string[];
  RISK_KEYS: string[];
}

const MetricsContext = createContext<MetricsContextType | undefined>(undefined);

export function MetricsProvider({ children }: { children: React.ReactNode }) {
  const [schema, setSchema] = useState<Record<string, MetricDef>>(METRICS_REGISTRY_FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadSchema() {
      try {
        const res = await api.get("/api/metrics/schema");
        if (mounted && res.data) {
          setSchema(res.data);
        }
      } catch (err) {
        console.error("Failed to load metrics schema", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadSchema();
    return () => { mounted = false; };
  }, []);

  const getDef = (key: string): MetricDef => {
    return schema[key] || {
      key,
      icon: "🔹",
      label: key.replace(/_/g, " "),
      labelEs: key.replace(/_/g, " "),
      unit: "",
      snapKey: "",
      tableLabel: key,
      tooltip: "",
      tooltipEs: "",
      chartGuide: "",
      chartGuideEs: "",
      defaultCooldown: 0,
      defaultOperator: ">="
    };
  };

  return (
    <MetricsContext.Provider value={{ 
      schema, 
      loading, 
      getDef, 
      ALERT_KEYS: [...ALERT_METRIC_KEYS], 
      RISK_KEYS: [...RISK_METRIC_KEYS] 
    }}>
      {children}
    </MetricsContext.Provider>
  );
}

export function useMetrics() {
  const ctx = useContext(MetricsContext);
  if (!ctx) throw new Error("useMetrics must be used within MetricsProvider");
  return ctx;
}
