"""SimulationService — Handles Freemium Funnel logic."""

from typing import Dict, Any, List, Tuple
import numpy as np
from scipy import stats as sp_stats

from services.stats.bayes_engine import BayesEngine, EVDecomposition
from schemas.simulate import SimulateRequest, DensityPoint


class SimulationService:
    """Service class for public Bayesian simulation logic."""

    @classmethod
    def from_manual_params(cls, req: SimulateRequest) -> Tuple[EVDecomposition, Dict[str, Any]]:
        """Run decomposition from manual user statistics directly."""
        engine = BayesEngine()
        
        # We assume defaults for std if missing or zero: std = 50% of the mean as a loose prior
        std_win = req.std_win if req.std_win and req.std_win > 0 else (req.avg_win or 0) * 0.5
        std_loss = req.std_loss if req.std_loss and req.std_loss > 0 else (req.avg_loss or 0) * 0.5
        
        decomp = engine.decompose_ev_from_stats(
            win_rate=req.win_rate or 0.,
            avg_win=req.avg_win or 0.,
            avg_loss=req.avg_loss or 0.,
            std_win=std_win,
            std_loss=std_loss,
            n_trades=req.n_trades or 0,
            max_bt_trades=30,
        )
        return decomp, cls._format_stats(req.win_rate, req.avg_win, req.avg_loss, std_win, std_loss, req.n_trades)

    @classmethod
    def from_csv_pnl(cls, csv_pnl: List[float]) -> Tuple[EVDecomposition, Dict[str, Any]]:
        """Extract statistics from an array of PnL values and run decomposition."""
        pnl = np.array(csv_pnl, dtype=float)
        wins = pnl[pnl > 0]
        losses = np.abs(pnl[pnl < 0])
        
        n_trades = len(wins) + len(losses)
        if n_trades == 0:
            raise ValueError("No valid trades in CSV data")
            
        win_rate = len(wins) / n_trades
        avg_win = float(np.mean(wins)) if len(wins) > 0 else 0.0
        avg_loss = float(np.mean(losses)) if len(losses) > 0 else 0.0
        
        # Use a minimum of 0.001 to avoid division by zero later
        std_win = float(np.std(wins, ddof=1)) if len(wins) > 1 else avg_win * 0.5
        std_loss = float(np.std(losses, ddof=1)) if len(losses) > 1 else avg_loss * 0.5
        if np.isnan(std_win) or std_win <= 0: std_win = avg_win * 0.5 or 0.001
        if np.isnan(std_loss) or std_loss <= 0: std_loss = avg_loss * 0.5 or 0.001
        
        engine = BayesEngine()
        decomp = engine.decompose_ev_from_stats(
            win_rate=win_rate,
            avg_win=avg_win,
            avg_loss=avg_loss,
            std_win=std_win,
            std_loss=std_loss,
            n_trades=n_trades,
            max_bt_trades=30,
            method_name="beta_nig_delta_from_csv"
        )
        return decomp, cls._format_stats(win_rate, avg_win, avg_loss, std_win, std_loss, n_trades)

    @staticmethod
    def _format_stats(win_rate, avg_win, avg_loss, std_win, std_loss, n_trades) -> Dict[str, Any]:
        return {
            "win_rate": round(win_rate, 4) if win_rate else 0,
            "avg_win": round(avg_win, 2) if avg_win else 0,
            "avg_loss": round(avg_loss, 2) if avg_loss else 0,
            "std_win": round(std_win, 2) if std_win else 0,
            "std_loss": round(std_loss, 2) if std_loss else 0,
            "n_trades": n_trades
        }

    @classmethod
    def generate_density_curve(cls, decom: EVDecomposition, points: int = 200) -> List[DensityPoint]:
        """Generate Gaussian PDF curve for the Expected Value."""
        if not decom or decom.ev_std == 0:
            return []
            
        mean = decom.ev_mean
        std = decom.ev_std
        lo = mean - 4 * std
        hi = mean + 4 * std
        
        curve = []
        x_vals = np.linspace(lo, hi, points)
        densities = sp_stats.norm.pdf(x_vals, loc=mean, scale=std)
        
        for x, y in zip(x_vals, densities):
            curve.append(DensityPoint(
                x=float(round(x, 4)),
                density=float(round(y, 6)),
                is_positive=bool(x > 0)
            ))
        return curve

    @classmethod
    def generate_equity_paths(
        cls, decom: EVDecomposition, n_paths: int = 20, trades_per_path: int = 200
    ) -> List[List[float]]:
        """Monte Carlo simulation generating N fan paths of M trades based on the prior stats."""
        if not decom:
            return []
            
        paths = []
        win_rate = decom.theta_mean
        avg_win = decom.avg_win_mean
        avg_loss = decom.avg_loss_mean
        
        # Use variance if positive
        std_win = max(np.sqrt(decom.avg_win_var) if getattr(decom, 'avg_win_var', 0) > 0 else abs(avg_win * 0.5), 0.0001)
        std_loss = max(np.sqrt(decom.avg_loss_var) if getattr(decom, 'avg_loss_var', 0) > 0 else abs(avg_loss * 0.5), 0.0001)


        
        for _ in range(n_paths):
            # 1. Epistemic uncertainty: Draw a specific win rate for this path from the Posterior Beta
            path_win_rate = np.random.beta(decom.theta_alpha, decom.theta_beta)
            
            # 2. Aleatoric uncertainty: Draw win/loss sequence with the path's win rate
            outcomes = np.random.rand(trades_per_path) < path_win_rate
            
            # 3. Normal amounts: Draw from Normal Distribution
            wins = np.random.normal(loc=avg_win, scale=std_win, size=trades_per_path)
            losses = np.random.normal(loc=avg_loss, scale=std_loss, size=trades_per_path)
            
            # Constraints: A win must be positive, a loss must be positive
            wins = np.maximum(wins, 0.01)
            losses = np.maximum(losses, 0.01)
            
            pnl_series = np.where(outcomes, wins, -losses)
            
            # Create cumulative equity curve starting at 0
            equity = np.cumsum(np.concatenate(([0.0], pnl_series)))
            paths.append(equity.tolist())
        
        return paths

    @staticmethod
    def extract_risk_suggestions(
        equity_paths: List[List[float]], stats: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Extract risk parameter suggestions from Monte Carlo simulation paths.
        
        Uses the trader's own simulation data to propose sensible risk limits.
        """
        if not equity_paths or len(equity_paths) == 0:
            return {}

        max_dds = []
        max_consec_losses = []
        max_stag_trades = []
        max_daily_losses = []

        n_trades = stats.get("n_trades", 200)
        # Trades per day assuming 252 trading days a year. E.g., 200 trades ~ 0.8 trades a day -> 1 trade/day block
        trades_per_day = max(int(round(n_trades / 252.0)), 1)

        for path in equity_paths:
            eq = np.array(path)
            diffs = np.diff(eq)
            if len(diffs) == 0:
                continue

            # --- Calculate exact max Daily Loss by blocking trades into days ---
            pad_size = (trades_per_day - len(diffs) % trades_per_day) % trades_per_day
            padded_diffs = np.pad(diffs, (0, pad_size), mode='constant')
            daily_pnls = np.sum(padded_diffs.reshape(-1, trades_per_day), axis=1)
            # Find the worst daily performance (minimum PnL)
            worst_day = float(np.min(daily_pnls))
            max_daily_losses.append(abs(worst_day) if worst_day < 0 else 0.0)

            # Max Drawdown per path
            peak = np.maximum.accumulate(eq)
            dd = peak - eq
            max_dds.append(float(np.max(dd)) if len(dd) > 0 else 0.0)

            # Consecutive losses & stagnation from PnL diffs
            diffs = np.diff(eq)
            if len(diffs) == 0:
                continue

            # Consecutive losses: longest streak of negative diffs
            streak = 0
            best_streak = 0
            for d in diffs:
                if d < 0:
                    streak += 1
                    best_streak = max(best_streak, streak)
                else:
                    streak = 0
            max_consec_losses.append(best_streak)

            # Stagnation trades: longest streak without new high
            stag = 0
            best_stag = 0
            running_peak = eq[0]
            for val in eq[1:]:
                if val > running_peak:
                    running_peak = val
                    stag = 0
                else:
                    stag += 1
                    best_stag = max(best_stag, stag)
            max_stag_trades.append(best_stag)

        n_trades = stats.get("n_trades", 200)
        # Estimate stagnation days assuming ~5 trades/day
        trades_per_day = max(n_trades / 30, 1)

        suggested_dd = float(np.median(max_dds)) if max_dds else 0.0
        suggested_consec = int(np.median(max_consec_losses)) if max_consec_losses else 0
        suggested_stag_trades = int(np.median(max_stag_trades)) if max_stag_trades else 0
        suggested_stag_days = int(suggested_stag_trades / trades_per_day) if trades_per_day > 0 else 0
        suggested_daily_loss = float(np.median(max_daily_losses)) if max_daily_losses else 0.0

        # EV from the stats (defined by the trader)
        win_rate = stats.get("win_rate", 0.5)
        avg_win = stats.get("avg_win", 0)
        avg_loss = stats.get("avg_loss", 0)
        ev = win_rate * avg_win - (1 - win_rate) * avg_loss

        return {
            "max_drawdown": round(suggested_dd, 2),
            "daily_loss": round(suggested_daily_loss, 2),
            "consecutive_losses": suggested_consec,
            "stagnation_trades": suggested_stag_trades,
            "stagnation_days": max(suggested_stag_days, 1),
            "ev_per_trade": round(ev, 2),
            "confidence_note": f"Based on {len(equity_paths)} Monte Carlo simulations with your edge profile",
        }
