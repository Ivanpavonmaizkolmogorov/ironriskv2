"""
RiskInfoEngine — Synthesizes all risk signals into informative messages.
NOT prescriptive: never says "stop" or "continue". Only describes what's happening.
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class InfoSignal:
    """A single piece of information for the trader."""
    category: str        # "consistency", "bayesian", "risk", "conflict"
    severity: str        # "info", "notable", "warning"  (NOT red/amber/green — those are for gauges)
    title: str           # Short headline
    detail: str          # 1-2 sentence explanation (fallback if no i18n)
    metric_value: Optional[float] = None
    i18n_key: Optional[str] = None    # e.g. "consistencyWarning", "bayesPositive"
    i18n_params: Optional[dict] = None  # e.g. {"label": "Win Rate", "observed": "37%", ...}


# Phase thresholds — configurable
MIN_TRADES_FOR_ACTIVE = 10  # Below this, consistency tests lack statistical power


@dataclass
class RiskInfoReport:
    """The full informative report for a strategy."""
    signals: list[InfoSignal] = field(default_factory=list)
    headline: str = ""        # Top-level summary sentence
    conflict_detected: bool = False
    phase: str = "active"     # "waiting" | "calibrating" | "active"

    def to_dict(self) -> dict:
        return {
            "headline": self.headline,
            "conflict_detected": self.conflict_detected,
            "phase": self.phase,
            "signals": [
                {
                    "category": s.category,
                    "severity": s.severity,
                    "title": s.title,
                    "detail": s.detail,
                    "metric_value": s.metric_value,
                    "i18n_key": s.i18n_key,
                    "i18n_params": s.i18n_params,
                }
                for s in self.signals
            ],
        }


class RiskInfoEngine:
    """
    Aggregates all signals and produces informative (never prescriptive) messages.
    
    Usage:
        engine = RiskInfoEngine()
        report = engine.analyze(
            p_positive=0.675,
            consistency_tests={...},
            dd_percentile=88,
            live_trades=9,
        )
        # report.to_dict() → send to frontend
    """

    def __init__(self, config: dict | None = None):
        """
        config keys (all optional, with defaults):
            - consistency_red_threshold: float (default 0.02)
            - consistency_amber_threshold: float (default 0.10)
            - p_positive_low: float (default 0.40)
            - p_positive_high: float (default 0.60)
            - dd_warning_percentile: float (default 80)
        """
        cfg = config or {}
        self.consistency_red = cfg.get("consistency_red_threshold", 0.02)
        self.consistency_amber = cfg.get("consistency_amber_threshold", 0.10)
        self.p_positive_low = cfg.get("p_positive_low", 0.40)
        self.p_positive_high = cfg.get("p_positive_high", 0.60)
        self.dd_warning_pct = cfg.get("dd_warning_percentile", 80)

    def analyze(
        self,
        p_positive: float | None = None,
        consistency_tests: dict | None = None,
        dd_percentile: float | None = None,
        live_trades: int = 0,
    ) -> RiskInfoReport:
        report = RiskInfoReport()

        # --- Phase determination ---
        if live_trades == 0:
            report.phase = "waiting"
        elif live_trades < MIN_TRADES_FOR_ACTIVE:
            report.phase = "calibrating"
        else:
            report.phase = "active"

        # --- 1. Consistency signals ---
        n_red = 0
        n_tests = 0
        if consistency_tests:
            for key, test in consistency_tests.items():
                n_tests += 1
                p_val = test.get("p_value", 1.0)
                label = test.get("label", key)
                label_key = test.get("label_key", key)
                observed = test.get("observed", "?")
                expected = test.get("expected", "?")
                i18n_params = {"label": label, "labelKey": label_key, "observed": observed, "expected": expected, "pval": f"{p_val*100:.1f}"}
                if p_val < self.consistency_red:
                    n_red += 1
                    report.signals.append(InfoSignal(
                        category="consistency",
                        severity="warning",
                        title=f"{label}: inconsistente con el BT",
                        detail=f"{label}: observado {observed} vs esperado {expected} (p = {p_val*100:.1f}%). Esto es inusual.",
                        metric_value=p_val,
                        i18n_key="consistencyWarning",
                        i18n_params=i18n_params,
                    ))
                elif p_val < self.consistency_amber:
                    report.signals.append(InfoSignal(
                        category="consistency",
                        severity="notable",
                        title=f"{label}: resultado inusual",
                        detail=f"{label}: observado {observed} vs esperado {expected} (p = {p_val*100:.1f}%).",
                        metric_value=p_val,
                        i18n_key="consistencyNotable",
                        i18n_params=i18n_params,
                    ))

        # --- 2. Bayesian signal (Blind Risk = 1 - P) ---
        if p_positive is not None:
            from services.stats.bayes_engine import BayesEngine
            blind_risk_val = BayesEngine.blind_risk_from_p_positive(p_positive)
            blind_pct = f"{blind_risk_val:.1f}"
            if blind_risk_val >= BayesEngine.BLIND_RISK_CRITICAL * 100.0:
                report.signals.append(InfoSignal(
                    category="bayesian",
                    severity="warning",
                    title="Riesgo Ciego elevado",
                    detail=f"Blind Risk = {blind_pct}%. High probability your edge does not exist.",
                    metric_value=blind_risk_val,
                    i18n_key="bayesBlindRiskHigh",
                    i18n_params={"pct": blind_pct},
                ))
            elif blind_risk_val >= BayesEngine.BLIND_RISK_MODERATE * 100.0:
                report.signals.append(InfoSignal(
                    category="bayesian",
                    severity="notable",
                    title="Riesgo Ciego moderado",
                    detail=f"Blind Risk = {blind_pct}%. Moderate probability your edge may not exist.",
                    metric_value=blind_risk_val,
                    i18n_key="bayesBlindRiskModerate",
                    i18n_params={"pct": blind_pct},
                ))

        # --- 3. Drawdown signal ---
        if dd_percentile is not None and dd_percentile >= self.dd_warning_pct:
            report.signals.append(InfoSignal(
                category="risk",
                severity="notable",
                title=f"Drawdown en percentil {dd_percentile:.0f}",
                detail=f"El drawdown actual está en el percentil {dd_percentile:.0f} del histórico del BT.",
                metric_value=dd_percentile,
                i18n_key="ddWarning",
                i18n_params={"pct": f"{dd_percentile:.0f}"},
            ))

        # --- 4. Conflict detection ---
        if p_positive is not None and p_positive >= self.p_positive_high and n_red >= 2:
            report.conflict_detected = True
            from services.stats.bayes_engine import BayesEngine
            blind_risk_pct = f"{BayesEngine.blind_risk_from_p_positive(p_positive):.1f}"
            report.signals.append(InfoSignal(
                category="conflict",
                severity="notable",
                title="Señales divergentes",
                detail=(
                    f"Blind Risk = {blind_risk_pct}%, "
                    f"but {n_red} of {n_tests} consistency tests indicate live results "
                    f"do not match the BT. With few trades ({live_trades}), this divergence is informative, not definitive."
                ),
                metric_value=None,
                i18n_key="conflictDetail",
                i18n_params={"pct": blind_risk_pct, "nRed": str(n_red), "nTests": str(n_tests), "nLive": str(live_trades)},
            ))

        # --- 5. Headline ---
        report.headline = self._make_headline(report, live_trades)

        return report

    def _make_headline(self, report: RiskInfoReport, live_trades: int) -> str:
        """Generate a factual, non-prescriptive headline."""
        # Early-phase headlines take priority
        if report.phase == "waiting":
            return "Sin datos live. Solo se muestra la proyección del backtest."
        elif report.phase == "calibrating":
            return f"Calibrando — {live_trades} trades live. Los indicadores aún no tienen potencia estadística."

        warnings = [s for s in report.signals if s.severity == "warning"]
        notables = [s for s in report.signals if s.severity == "notable"]

        if report.conflict_detected:
            return f"Señales divergentes: confianza bayesiana vs. consistencia live ({live_trades} trades)"
        elif len(warnings) >= 2:
            return f"Múltiples indicadores fuera de rango esperado ({live_trades} trades)"
        elif len(warnings) == 1:
            return f"{warnings[0].title} ({live_trades} trades)"
        elif len(notables) >= 1:
            return f"Algunos indicadores a vigilar ({live_trades} trades)"
        else:
            return f"Sin alertas informativas ({live_trades} trades)"
