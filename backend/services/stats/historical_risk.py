from typing import List, Dict, Optional
import datetime
from scipy.stats import binom, norm
from .fit_result import FitResult

class HistoricalRiskAnalyzer:
    def __init__(self, fits: Dict[str, dict], bt_wr: float, bt_avg_pnl: float, bt_std_pnl: float, limit_config: dict):
        self.fits = {}
        for name, f in fits.items():
            if f and (f.get("passed") or f.get("distribution_name") == "empirical"):
                self.fits[name] = FitResult.from_dict(f)
        
        self.bt_wr = bt_wr if bt_wr > 0 else 0.5
        self.bt_avg_pnl = bt_avg_pnl
        self.bt_std_pnl = bt_std_pnl
        self.limit_config = limit_config
        
        # Thresholds
        self.thresh_red_dd = 95
        self.thresh_amber_dd = 85
        self.thresh_red_stag_d = 101 # By default off for RED
        self.thresh_amber_stag_d = 85
        self.thresh_red_stag_t = 101 # By default off for RED
        self.thresh_amber_stag_t = 85
        
        self.thresh_red_bayes = 50
        self.thresh_amber_bayes = 80
        self.thresh_red_consist = 0.02
        self.thresh_amber_consist = 0.10

    def set_thresholds(self, 
                       red_dd=95, amber_dd=85, 
                       red_stag_d=101, amber_stag_d=85,
                       red_stag_t=101, amber_stag_t=85,
                       red_bayes=50, amber_bayes=80, 
                       red_consist=0.02, amber_consist=0.10):
        self.thresh_red_dd = red_dd
        self.thresh_amber_dd = amber_dd
        self.thresh_red_stag_d = red_stag_d
        self.thresh_amber_stag_d = amber_stag_d
        self.thresh_red_stag_t = red_stag_t
        self.thresh_amber_stag_t = amber_stag_t
        self.thresh_red_bayes = red_bayes
        self.thresh_amber_bayes = amber_bayes
        self.thresh_red_consist = red_consist
        self.thresh_amber_consist = amber_consist

    def _get_percentile(self, metric: str, value: float) -> int:
        fit = self.fits.get(metric)
        if fit:
            return fit.percentile(value)
        return 0

    def analyze_live_trades(self, live_trades: List[float], live_times: List[datetime.datetime], p_positive_curve: List[float]) -> List[dict]:
        results = []
        equity = 0.0
        peak = 0.0
        
        stagnation_trades = 0
        
        live_wins = 0
        live_losses = 0
        
        current_streak = 0
        max_streak = 0
        
        last_peak_time = live_times[0] if live_times else None

        for i, (profit, t_time) in enumerate(zip(live_trades, live_times)):
            equity += profit
            
            if profit > 0:
                live_wins += 1
                current_streak = 0
            else:
                live_losses += 1
                current_streak += 1
                max_streak = max(max_streak, current_streak)
                
            if equity > peak:
                peak = equity
                stagnation_trades = 0
                last_peak_time = t_time
            else:
                stagnation_trades += 1
                
            current_dd = peak - equity
            
            stagnation_days = 0
            if last_peak_time:
                eval_time = t_time
                # Si es el último trade, evaluamos el estancamiento hasta HOY para igualarlo al Gauge
                if i == len(live_trades) - 1:
                    eval_time = datetime.datetime.now()
                stagnation_days = (eval_time - last_peak_time).days

            # 1. Empiricos
            dd_p = self._get_percentile("max_drawdown", current_dd)
            stag_t_p = self._get_percentile("stagnation_trades", stagnation_trades)
            stag_d_p = self._get_percentile("stagnation_days", stagnation_days)
            
            # 2. Consistencia
            n_live = i + 1
            # Win Rate
            p_wr = float(binom.cdf(live_wins, n_live, self.bt_wr))
            # Racha
            p_raw = (1 - self.bt_wr) ** max_streak
            windows = max(1, n_live - max_streak + 1)
            p_streak = min(1.0, windows * p_raw)
            # Pnl Medio
            pnl_medio = equity / n_live
            if self.bt_std_pnl > 0 and n_live > 0:
                z = (pnl_medio - self.bt_avg_pnl) / (self.bt_std_pnl / (n_live ** 0.5))
                p_pnl = float(norm.cdf(z))
            else:
                p_pnl = 0.5
                
            # 3. Bayes
            bayes_p = p_positive_curve[i] if p_positive_curve and i < len(p_positive_curve) else None
            
            # Traffic Light Logic
            has_red = False
            has_amber = False
            reasons = []
            
            # Bayes
            if bayes_p is not None:
                if bayes_p < self.thresh_red_bayes:
                    has_red = True
                    reasons.append(f"🔴 Bayes P(EV>0)={bayes_p}%")
                elif bayes_p < self.thresh_amber_bayes:
                    has_amber = True
                    reasons.append(f"🟡 Bayes P(EV>0)={bayes_p}%")

            # Drawdown
            if dd_p >= self.thresh_red_dd:
                has_red = True
                reasons.append(f"🔴 Drawdown P{dd_p}")
            elif dd_p >= self.thresh_amber_dd:
                has_amber = True
                reasons.append(f"🟡 Drawdown P{dd_p}")

            # Stag Dias
            if stag_d_p >= self.thresh_red_stag_d:
                has_red = True
                reasons.append(f"🔴 Stag Días P{stag_d_p}")
            elif stag_d_p >= self.thresh_amber_stag_d:
                has_amber = True
                reasons.append(f"🟡 Stag Días P{stag_d_p}")

            # Stag Trades
            if stag_t_p >= self.thresh_red_stag_t:
                has_red = True
                reasons.append(f"🔴 Stag Trades P{stag_t_p}")
            elif stag_t_p >= self.thresh_amber_stag_t:
                has_amber = True
                reasons.append(f"🟡 Stag Trades P{stag_t_p}")

            # Consistency
            # Win Rate
            if p_wr < self.thresh_red_consist:
                has_red = True
                reasons.append(f"🔴 Inconsistencia: Win Rate (p={p_wr*100:.1f}%)")
            elif p_wr < self.thresh_amber_consist:
                has_amber = True
                reasons.append(f"🟡 Inconsistencia: Win Rate (p={p_wr*100:.1f}%)")
            
            # Racha Pérdidas
            if p_streak < self.thresh_red_consist:
                has_red = True
                reasons.append(f"🔴 Inconsistencia: Racha Pérdidas (p={p_streak*100:.1f}%)")
            elif p_streak < self.thresh_amber_consist:
                has_amber = True
                reasons.append(f"🟡 Inconsistencia: Racha Pérdidas (p={p_streak*100:.1f}%)")

            # PnL Medio
            if p_pnl < self.thresh_red_consist:
                has_red = True
                reasons.append(f"🔴 Inconsistencia: PnL Medio (p={p_pnl*100:.1f}%)")
            elif p_pnl < self.thresh_amber_consist:
                has_amber = True
                reasons.append(f"🟡 Inconsistencia: PnL Medio (p={p_pnl*100:.1f}%)")

            if has_red:
                status = "red"
            elif has_amber:
                status = "amber"
            else:
                status = "green"
                reasons.append("Todo Normal")

            results.append({
                "index": i,
                "status": status,
                "reasons": reasons,
                "bayes": bayes_p,
                "consistency": {
                    "win_rate_p": round(p_wr * 100, 1),
                    "streak_p": round(p_streak * 100, 1),
                    "pnl_p": round(p_pnl * 100, 1)
                },
                "empirical": {
                    "dd": round(current_dd, 2),
                    "dd_p": dd_p,
                    "stag_days": stagnation_days,
                    "stag_days_p": stag_d_p,
                    "stag_trades": stagnation_trades,
                    "stag_trades_p": stag_t_p
                }
            })
            
        return results
