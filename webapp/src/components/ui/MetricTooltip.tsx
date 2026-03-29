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
    displayLabel = variant === "table" ? t(`${metricKey}.tableLabel`) : t(`${metricKey}.label`);
    tooltipText = t(`${metricKey}.tooltip`);
  } catch (e) {
    // Fallback if key is missing in json
    return <span className="font-medium inline-block">{children || metricKey}</span>;
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
