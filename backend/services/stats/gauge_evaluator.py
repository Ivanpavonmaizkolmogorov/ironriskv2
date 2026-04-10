from typing import Dict, Any, Optional

class RiskGaugeEvaluator:
    """
    Evaluates individual risk gauges using a dual-arbitrator system:
    1. The Bayesian Arbitrator: Checks likelihood percentiles against p_amber and p_red.
    2. The Physical Arbitrator (Ulysses Pact): Checks absolute values against physical limits.
       If broken, it overwrites the statistical status to 'fatal'.
    """
    def __init__(self, bayes_engine, risk_config: Dict[str, Any]):
        self.bayes_engine = bayes_engine
        self.risk_config = risk_config or {}

    def evaluate(self, metric_name: str, current_value: float, fit_dict: Optional[dict], is_simulated: bool = False) -> Dict[str, Any]:
        """
        Returns a dictionary representing the gauge state.
        """
        cfg = self.risk_config.get(metric_name, {})
        
        # 1. Statistical (Bayesian) Evaluation
        percentile = 0.0
        gauge_status = "green"
        
        if fit_dict:
            from .fit_result import FitResult
            fit = FitResult.from_dict(fit_dict)
            likelihood = self.bayes_engine.compute_likelihood(fit, current_value)
            percentile = round((1.0 - likelihood) * 100, 1)
            
            p_red = cfg.get("p_red", 95)
            p_amber = cfg.get("p_amber", 85)
            
            if percentile >= p_red:
                gauge_status = "red"
            elif percentile >= p_amber:
                gauge_status = "amber"

        # 2. Physical Wall Evaluation (Ulysses Pact)
        is_enabled = cfg.get("enabled", False)
        physical_limit = cfg.get("limit", 0)
        
        if is_enabled and current_value >= physical_limit and physical_limit > 0:
            gauge_status = "fatal"
            
        return {
            "current": float(current_value),
            "percentile": float(percentile),
            "status": gauge_status,
            "simulated": is_simulated,
            "limit_breached": gauge_status == "fatal",
            "limit": float(physical_limit)
        }
