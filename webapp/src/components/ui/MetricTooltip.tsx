import React, { ReactNode } from "react";
import { useTranslations } from "next-intl";

interface MetricTooltipProps {
  metricKey: string;
  variant?: "table" | "card" | "chart";
  children?: ReactNode;
}

export default function MetricTooltip({ metricKey, variant = "table", children }: MetricTooltipProps) {
  const t = useTranslations("metrics");

  let displayLabel = "";
  let tooltipText = "";
  
  try {
    // Si pasamos children (como un título customizado), no forzamos leer un .label inexistente
    if (!children) {
      displayLabel = variant === "table" ? t(`${metricKey}.tableLabel`) : t(`${metricKey}.label`);
    }
    
    if (variant === "chart") {
      try { tooltipText = t(`${metricKey}.chartGuide`); } 
      catch { tooltipText = t(`${metricKey}.tooltip`); }
    } else {
      tooltipText = t(`${metricKey}.tooltip`);
    }
  } catch (e) {
    return <span className="font-medium inline-block relative z-10">{children || metricKey}</span>;
  }

  const content = children || displayLabel;

  return (
    <span 
      className="border-b border-dashed border-iron-600/60 hover:border-iron-300 cursor-help transition-colors select-none inline-block relative z-10"
      title={tooltipText}
    >
      {content}
    </span>
  );
}
