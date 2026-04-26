"""BayesEngine — Bayesian Edge Survival via EV Decomposition.

Architecture:
  EV = theta * AvgWin - (1 - theta) * AvgLoss

  Where:
    theta   ~ Beta(alpha, beta)         — Win rate posterior
    AvgWin  ~ t-Student (NIG posterior)  — Mean win size posterior
    AvgLoss ~ t-Student (NIG posterior)  — Mean loss size posterior

  BT trades define the PRIOR (discounted by factor D).
  Live trades are the DATA that update the prior.

  Combined EV uncertainty via Delta Method (analytical propagation).

  Justification for t-Student on means:
    The t-Student is NOT an assumed model — it is a mathematical
    consequence of the Normal-Inverse-Gamma conjugate prior.
    The only assumption is that the MEAN is approximately Normal,
    which is guaranteed by the Central Limit Theorem for n > 30.
    We do NOT assume individual PnLs are Normal.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Optional

import numpy as np
from scipy import stats as sp_stats

from .fit_result import FitResult

logger = logging.getLogger(__name__)

# Minimum trades required to compute a meaningful credibility interval
MIN_TRADES_FOR_CI = 30


@dataclass
class EVDecomposition:
    """Full Bayesian decomposition of Expected Value."""

    # Win Rate (Beta posterior)
    theta_mean: float           # E[theta] — posterior win rate
    theta_var: float            # Var[theta]
    theta_lower: float          # HDI lower bound
    theta_upper: float          # HDI upper bound
    theta_alpha: float          # Beta alpha parameter
    theta_beta: float           # Beta beta parameter
    bt_win_rate: float          # Raw BT win rate (for comparison)
    live_win_rate: float | None # Raw live win rate (for comparison)

    # AvgWin (NIG posterior)
    avg_win_mean: float         # E[AvgWin] — posterior mean win
    avg_win_var: float          # Var[AvgWin]
    avg_win_lower: float        # HDI lower bound
    avg_win_upper: float        # HDI upper bound
    avg_win_bt: float           # Raw BT average win
    avg_win_live: float | None  # Raw live average win
    avg_win_n: int              # Number of wins used

    # AvgLoss (NIG posterior)
    avg_loss_mean: float        # E[AvgLoss] — posterior mean loss (positive value)
    avg_loss_var: float         # Var[AvgLoss]
    avg_loss_lower: float       # HDI lower bound
    avg_loss_upper: float       # HDI upper bound
    avg_loss_bt: float          # Raw BT average loss
    avg_loss_live: float | None # Raw live average loss
    avg_loss_n: int             # Number of losses used

    # Combined EV (Delta Method)
    ev_mean: float              # E[EV] — posterior expected value per trade
    ev_std: float               # sqrt(Var[EV]) — uncertainty
    ev_lower: float             # HDI lower bound
    ev_upper: float             # HDI upper bound
    ev_includes_zero: bool      # Does the HDI include 0?
    p_positive: float           # P(EV > 0) — probability edge is alive
    bt_p_positive: float | None # P(EV > 0) of the BT alone (prior)

    # Metadata
    confidence: float
    n_live: int
    n_bt: int
    method: str

    # Raw counts for transparency
    n_bt_wins: int
    n_bt_losses: int
    n_live_wins: int
    n_live_losses: int
    eff_bt_wins: float      # effective wins after cap
    eff_bt_losses: float    # effective losses after cap
    def to_dict(self) -> dict:
        """Serialize to dict, sanitizing numpy types."""
        def _clean(v):
            if isinstance(v, (np.integer,)):
                return int(v)
            if isinstance(v, (np.floating, np.float64)):
                return float(v)
            if isinstance(v, np.bool_):
                return bool(v)
            return v

        d = {k: _clean(v) for k, v in self.__dict__.items()}
        # Inject the derived property so endpoints can access it without calling the property getter
        d["blind_risk"] = self.blind_risk
        return d
    
    @property
    def blind_risk(self) -> float:
        """Blind Risk = 1 - P(EV > 0), as percentage."""
        return round((1.0 - self.p_positive) * 100.0, 2)


class BayesEngine:
    """Stateless Bayesian evaluator for EA edge survival.

    Usage:
        engine = BayesEngine()
        result = engine.decompose_ev(
            bt_pnl=[10, -5, 20, -3, ...],
            live_pnl=[15, -8, 12, ...],
            confidence=0.95,
        )
    """

    # ── Blind Risk thresholds (Single Source of Truth) ──
    BLIND_RISK_MODERATE = 0.20   # >= 20% → moderate zone 
    BLIND_RISK_CRITICAL = 0.50   # >= 50% → critical zone

    @staticmethod
    def blind_risk_from_p_positive(p_positive: float) -> float:
        """Derive Blind Risk percentage from P(EV > 0).
        If the model changes, update this formula here."""
        return round((1.0 - p_positive) * 100.0, 2)

    @staticmethod
    def blind_risk_zone(blind_risk_pct: float) -> str:
        """Classify: 'critical', 'moderate', or 'low'."""
        if blind_risk_pct >= BayesEngine.BLIND_RISK_CRITICAL * 100.0:
            return "critical"
        if blind_risk_pct >= BayesEngine.BLIND_RISK_MODERATE * 100.0:
            return "moderate"
        return "low"

    @staticmethod
    def blind_risk_from_snapshot(metrics_snapshot: dict | None) -> float:
        """Extract p_positive from a persisted snapshot → blind risk %.
        This is the ONLY place that knows how to read the cache for blind risk."""
        if not metrics_snapshot:
            return 100.0
        bayes_cache = metrics_snapshot.get("bayes_cache", {})
        decomp = bayes_cache.get("decomposition", {})
        if decomp and "p_positive" in decomp:
            return BayesEngine.blind_risk_from_p_positive(decomp["p_positive"])
        # Fallback to older format or 0 if missing
        p_pos = bayes_cache.get("p_positive", 0.0)
        return BayesEngine.blind_risk_from_p_positive(p_pos)

    def _nig_posterior(
        self,
        live_data: np.ndarray,
        bt_data: np.ndarray | None,
        confidence: float,
        prior_stats: dict | None = None,
        max_eff_n: float | None = None,
    ) -> dict:
        """Compute NIG posterior for the mean of a data subset (wins or losses).

        Prior from BT (discounted), data from live.

        Justification: the t-Student posterior for the mean does NOT require
        individual observations to be Normal. By the Central Limit Theorem,
        the sampling distribution of the mean converges to Normal for n > 30.
        The t-Student is a mathematical consequence of the NIG conjugate,
        not an assumption to be tested.
        """
        n = len(live_data)
        x_bar = float(np.mean(live_data)) if n > 0 else 0.0

        if prior_stats is not None and prior_stats.get("n", 0) > 1:
            bt_n = prior_stats["n"]
            bt_mean = prior_stats["mean"]
            bt_var = prior_stats["var"]

            effective_n = float(bt_n)
            if max_eff_n is not None and effective_n > max_eff_n:
                effective_n = max_eff_n
            mu_0 = bt_mean
            kappa_0 = effective_n
            alpha_0 = max(effective_n / 2.0, 2.0)
            beta_0 = (effective_n / 2.0) * bt_var
        elif bt_data is not None and len(bt_data) > 1:
            bt_n = len(bt_data)
            bt_mean = float(np.mean(bt_data))
            bt_var = float(np.var(bt_data, ddof=1))

            effective_n = float(bt_n)
            if max_eff_n is not None and effective_n > max_eff_n:
                effective_n = max_eff_n
            mu_0 = bt_mean
            kappa_0 = effective_n
            alpha_0 = max(effective_n / 2.0, 2.0)
            beta_0 = (effective_n / 2.0) * bt_var
        else:
            mu_0 = x_bar  # No BT: use live mean as weak prior
            kappa_0 = 1.0
            alpha_0 = 2.0
            beta_0 = 1.0

        if n == 0:
            # No live data: return prior-only estimates
            df = 2.0 * alpha_0
            scale = float(np.sqrt(beta_0 / (alpha_0 * kappa_0))) if alpha_0 * kappa_0 > 0 else 1.0
            alpha_tail = (1.0 - confidence) / 2.0
            t_crit = float(sp_stats.t.ppf(1.0 - alpha_tail, df=df))
            return {
                "mean": mu_0,
                "var": scale ** 2,
                "lower": mu_0 - t_crit * scale,
                "upper": mu_0 + t_crit * scale,
            }

        # Posterior update
        kappa_n = kappa_0 + n
        mu_n = (kappa_0 * mu_0 + n * x_bar) / kappa_n
        alpha_n = alpha_0 + n / 2.0
        ss = float(np.sum((live_data - x_bar) ** 2))
        beta_n = beta_0 + 0.5 * ss + (kappa_0 * n * (x_bar - mu_0) ** 2) / (2.0 * kappa_n)

        df = 2.0 * alpha_n
        posterior_scale = float(np.sqrt(beta_n / (alpha_n * kappa_n)))

        alpha_tail = (1.0 - confidence) / 2.0
        t_crit = float(sp_stats.t.ppf(1.0 - alpha_tail, df=df))

        return {
            "mean": mu_n,
            "var": posterior_scale ** 2,
            "lower": mu_n - t_crit * posterior_scale,
            "upper": mu_n + t_crit * posterior_scale,
        }

    def decompose_ev_from_stats(
        self,
        win_rate: float,
        avg_win: float,
        avg_loss: float,
        std_win: float,
        std_loss: float,
        n_trades: int,
        confidence: float = 0.95,
        max_bt_trades: int | None = 30,
        method_name: str = "beta_nig_delta_from_stats"
    ) -> EVDecomposition | None:
        """Full Bayesian EV decomposition directly from aggregated prior statistics.
        
        The user-provided statistics define the strong prior. Since there are no live
        trades in this context, the returned parameters represent the posterior equals the prior.
        """
        if n_trades <= 0:
            return None

        # Effective trades (1:1 with BT)
        eff_bt_wins = float(n_trades * win_rate)
        eff_bt_losses = float(n_trades * (1 - win_rate))

        # Apply max_bt_trades cap (universal default: 30)
        total_eff = eff_bt_wins + eff_bt_losses
        if max_bt_trades is not None and max_bt_trades > 0 and total_eff > max_bt_trades:
            scale = max_bt_trades / total_eff
            eff_bt_wins *= scale
            eff_bt_losses *= scale

        # 1. Win Rate (Beta posterior) — Prior values floor at 1
        alpha_post = max(eff_bt_wins, 1.0)
        beta_post = max(eff_bt_losses, 1.0)
        theta_mean = alpha_post / (alpha_post + beta_post)
        theta_var = (alpha_post * beta_post) / (
            (alpha_post + beta_post) ** 2 * (alpha_post + beta_post + 1)
        )
        
        alpha_tail = (1.0 - confidence) / 2.0
        theta_lower = float(sp_stats.beta.ppf(alpha_tail, alpha_post, beta_post))
        theta_upper = float(sp_stats.beta.ppf(1.0 - alpha_tail, alpha_post, beta_post))

        # 2. Avg Win (NIG posterior)
        effective_n_win = eff_bt_wins
        win_mean = avg_win
        win_scale = float(np.sqrt((avg_win * 0.5) ** 2)) # very loose default if std=0
        if std_win > 0:
            win_scale = std_win / np.sqrt(max(effective_n_win, 1.0))
            
        win_var = win_scale ** 2
        df_win = 2.0 * max(effective_n_win / 2.0, 2.0)
        t_crit_win = float(sp_stats.t.ppf(1.0 - alpha_tail, df=df_win))

        # 3. Avg Loss (NIG posterior)
        effective_n_loss = eff_bt_losses
        loss_mean = abs(avg_loss)
        loss_scale = float(np.sqrt((loss_mean * 0.5) ** 2))
        if std_loss > 0:
            loss_scale = std_loss / np.sqrt(max(effective_n_loss, 1.0))

        loss_var = loss_scale ** 2
        df_loss = 2.0 * max(effective_n_loss / 2.0, 2.0)
        t_crit_loss = float(sp_stats.t.ppf(1.0 - alpha_tail, df=df_loss))

        # 4. Combined EV (Delta Method)
        ev_mean = theta_mean * win_mean - (1.0 - theta_mean) * loss_mean

        ev_var = (win_mean ** 2) * theta_var + (theta_mean ** 2) * win_var \
               + (loss_mean ** 2) * theta_var + ((1.0 - theta_mean) ** 2) * loss_var
        ev_std = float(np.sqrt(max(ev_var, 0.0)))

        z_crit = float(sp_stats.norm.ppf(1.0 - alpha_tail))
        ev_lower = ev_mean - z_crit * ev_std
        ev_upper = ev_mean + z_crit * ev_std

        if ev_std > 0:
            p_positive = float(1.0 - sp_stats.norm.cdf(0, loc=ev_mean, scale=ev_std))
        else:
            p_positive = 1.0 if ev_mean > 0 else 0.0

        ev_includes_zero = bool(ev_lower <= 0 <= ev_upper)

        return EVDecomposition(
            theta_mean=round(theta_mean, 6),
            theta_var=round(theta_var, 8),
            theta_lower=round(theta_lower, 4),
            theta_upper=round(theta_upper, 4),
            theta_alpha=round(alpha_post, 2),
            theta_beta=round(beta_post, 2),
            bt_win_rate=round(win_rate, 4),
            live_win_rate=None,
            
            avg_win_mean=round(win_mean, 4),
            avg_win_var=round(win_var, 6),
            avg_win_lower=round(win_mean - t_crit_win * win_scale, 4),
            avg_win_upper=round(win_mean + t_crit_win * win_scale, 4),
            avg_win_bt=round(avg_win, 4),
            avg_win_live=None,
            avg_win_n=0,
            
            avg_loss_mean=round(loss_mean, 4),
            avg_loss_var=round(loss_var, 6),
            avg_loss_lower=round(loss_mean - t_crit_loss * loss_scale, 4),
            avg_loss_upper=round(loss_mean + t_crit_loss * loss_scale, 4),
            avg_loss_bt=round(loss_mean, 4),
            avg_loss_live=None,
            avg_loss_n=0,
            
            ev_mean=round(ev_mean, 4),
            ev_std=round(ev_std, 4),
            ev_lower=round(ev_lower, 4),
            ev_upper=round(ev_upper, 4),
            ev_includes_zero=ev_includes_zero,
            p_positive=round(p_positive, 6),
            bt_p_positive=round(p_positive, 6),  # Without live, posterior == prior
            
            confidence=confidence,
            n_live=0,
            n_bt=n_trades,
            method=method_name,
            
            n_bt_wins=int(n_trades * win_rate),
            n_bt_losses=int(n_trades * (1 - win_rate)),
            n_live_wins=0,
            n_live_losses=0,
            eff_bt_wins=round(eff_bt_wins, 2),
            eff_bt_losses=round(eff_bt_losses, 2),
        )

    def decompose_ev(
        self,
        bt_pnl: list[float] | None = None,
        live_pnl: list[float] | None = None,
        confidence: float = 0.95,
        min_trades: int = MIN_TRADES_FOR_CI,
        prior_stats_override: dict | None = None,
        max_bt_trades: int | None = 30,
    ) -> EVDecomposition | None:
        """Full Bayesian EV decomposition: Beta(WinRate) + NIG(AvgWin) + NIG(AvgLoss) + Delta.

        BT trades define the PRIOR.
        Live trades are the evidence.
        max_bt_trades puts a hard cap on the total effective trades of the BT prior.

        Returns None if insufficient data.
        """
        bt = np.array(bt_pnl or [], dtype=float)
        live = np.array(live_pnl or [], dtype=float)

        n_bt = len(bt) if not prior_stats_override else prior_stats_override.get("n_trades", 0)
        n_live = len(live)

        if n_live < min_trades and n_bt < min_trades:
            return None  # Not enough data
            
        # Calculate bt_p_positive by recursing with no live data
        bt_p_positive = None
        if n_bt > 0 and n_live > 0:
            bt_only = self.decompose_ev(
                bt_pnl=bt_pnl,
                live_pnl=[],
                confidence=confidence,
                min_trades=min_trades,
                prior_stats_override=prior_stats_override,
                max_bt_trades=max_bt_trades,
            )
            if bt_only:
                bt_p_positive = bt_only.p_positive
        elif n_live == 0 and n_bt >= min_trades:
            # We are already the BT only pass
            pass

        # --- Separate wins and losses ---
        bt_wins = bt[bt > 0] if n_bt > 0 else np.array([])
        bt_losses = np.abs(bt[bt < 0]) if n_bt > 0 else np.array([])
        live_wins = live[live > 0] if n_live > 0 else np.array([])
        live_losses = np.abs(live[live < 0]) if n_live > 0 else np.array([])

        # Break-even trades (PnL = 0) are excluded from both pools
        if prior_stats_override:
            ps = prior_stats_override
            n_bt = ps.get("n_trades", 0)
            n_bt_wins = int(n_bt * ps.get("win_rate", 0))
            n_bt_losses = n_bt - n_bt_wins
        else:
            n_bt_wins = len(bt_wins)
            n_bt_losses = len(bt_losses)

        n_live_wins = len(live_wins)
        n_live_losses = len(live_losses)

        # ============================================================
        # 1. WIN RATE: Beta posterior
        # ============================================================
        total_eff = float(n_bt)
        if max_bt_trades is not None and max_bt_trades > 0 and total_eff > max_bt_trades:
            total_eff = max_bt_trades
            
        bt_wr = n_bt_wins / max(n_bt_wins + n_bt_losses, 1)
        eff_bt_wins = total_eff * bt_wr
        eff_bt_losses = total_eff * (1.0 - bt_wr)

        # Floor at 1 to avoid degenerate Beta(0, 0)
        alpha_post = max(eff_bt_wins + n_live_wins, 1.0)
        beta_post = max(eff_bt_losses + n_live_losses, 1.0)

        theta_mean = alpha_post / (alpha_post + beta_post)
        theta_var = (alpha_post * beta_post) / (
            (alpha_post + beta_post) ** 2 * (alpha_post + beta_post + 1)
        )

        alpha_tail = (1.0 - confidence) / 2.0
        theta_lower = float(sp_stats.beta.ppf(alpha_tail, alpha_post, beta_post))
        theta_upper = float(sp_stats.beta.ppf(1.0 - alpha_tail, alpha_post, beta_post))

        bt_wr = n_bt_wins / max(n_bt_wins + n_bt_losses, 1)
        live_wr = n_live_wins / (n_live_wins + n_live_losses) if (n_live_wins + n_live_losses) > 0 else None

        # ============================================================
        # 2. AVG WIN: NIG posterior (t-Student)
        #    The t-Student is a mathematical consequence of the NIG
        #    conjugate — not an assumption. By CLT, the mean of wins
        #    converges to Normal for n > 30.
        # ============================================================
        if prior_stats_override:
            ps = prior_stats_override
            
            win_prior_n = total_eff * bt_wr * n_bt / total_eff if (max_bt_trades and max_bt_trades > 0 and n_bt > max_bt_trades) else n_bt_wins
            
            win_prior = {"n": win_prior_n, "mean": ps["avg_win"], "var": ps.get("std_win", 0)**2}
            bt_avg_win = ps["avg_win"]
        else:
            win_prior = None
            bt_avg_win = float(np.mean(bt_wins)) if n_bt_wins > 0 else 0.0

        win_discount_n = float(n_bt)
        if max_bt_trades is not None and max_bt_trades > 0 and n_bt > max_bt_trades:
             win_discount_n = float(max_bt_trades)

        # For NIG, pass bt_data scaled to effective count via prior_stats
        win_post = self._nig_posterior(
            live_wins, bt_wins if n_bt_wins > 0 and not prior_stats_override else None, confidence,
            prior_stats=win_prior,
            max_eff_n=eff_bt_wins,
        )

        live_avg_win = float(np.mean(live_wins)) if n_live_wins > 0 else None

        # ============================================================
        # 3. AVG LOSS: NIG posterior (t-Student)
        #    Same justification as AvgWin. Losses are stored as
        #    positive values (absolute magnitude).
        # ============================================================
        if prior_stats_override:
            ps = prior_stats_override
            
            loss_prior_n = total_eff * (1.0 - bt_wr) * n_bt / total_eff if (max_bt_trades and max_bt_trades > 0 and n_bt > max_bt_trades) else n_bt_losses
            
            loss_prior = {"n": loss_prior_n, "mean": abs(ps["avg_loss"]), "var": ps.get("std_loss", 0)**2}
            bt_avg_loss = abs(ps["avg_loss"])
        else:
            loss_prior = None
            bt_avg_loss = float(np.mean(bt_losses)) if n_bt_losses > 0 else 0.0

        loss_discount_n = float(n_bt)
        if max_bt_trades is not None and max_bt_trades > 0 and n_bt > max_bt_trades:
             loss_discount_n = float(max_bt_trades)

        loss_post = self._nig_posterior(
            live_losses, bt_losses if n_bt_losses > 0 and not prior_stats_override else None, confidence,
            prior_stats=loss_prior,
            max_eff_n=eff_bt_losses,
        )


        live_avg_loss = float(np.mean(live_losses)) if n_live_losses > 0 else None

        # ============================================================
        # 4. COMBINED EV: Delta Method (analytical uncertainty propagation)
        #    EV = theta * W - (1 - theta) * L
        #
        #    Var[EV] = W^2 * Var[theta] + theta^2 * Var[W]
        #            + L^2 * Var[theta] + (1-theta)^2 * Var[L]
        #
        #    This is a first-order Taylor approximation. Valid for n > 30.
        # ============================================================
        W = win_post["mean"]
        L = loss_post["mean"]
        Vt = theta_var
        Vw = win_post["var"]
        Vl = loss_post["var"]

        ev_mean = theta_mean * W - (1.0 - theta_mean) * L

        # Delta method variance (assumes independence of theta, W, L)
        ev_var = (W ** 2) * Vt + (theta_mean ** 2) * Vw \
               + (L ** 2) * Vt + ((1.0 - theta_mean) ** 2) * Vl

        ev_std = float(np.sqrt(max(ev_var, 0.0)))

        # Use Normal approximation for the combined EV (justified by Delta method)
        z_crit = float(sp_stats.norm.ppf(1.0 - alpha_tail))
        ev_lower = ev_mean - z_crit * ev_std
        ev_upper = ev_mean + z_crit * ev_std

        # P(EV > 0) from the Normal approximation
        if ev_std > 0:
            p_positive = float(1.0 - sp_stats.norm.cdf(0, loc=ev_mean, scale=ev_std))
        else:
            p_positive = 1.0 if ev_mean > 0 else 0.0

        ev_includes_zero = bool(ev_lower <= 0 <= ev_upper)

        return EVDecomposition(
            # Win Rate
            theta_mean=round(theta_mean, 6),
            theta_var=round(theta_var, 8),
            theta_lower=round(theta_lower, 4),
            theta_upper=round(theta_upper, 4),
            theta_alpha=round(alpha_post, 2),
            theta_beta=round(beta_post, 2),
            bt_win_rate=round(bt_wr, 4),
            live_win_rate=round(live_wr, 4) if live_wr is not None else None,
            # AvgWin
            avg_win_mean=round(win_post["mean"], 4),
            avg_win_var=round(win_post["var"], 6),
            avg_win_lower=round(win_post["lower"], 4),
            avg_win_upper=round(win_post["upper"], 4),
            avg_win_bt=round(bt_avg_win, 4),
            avg_win_live=round(live_avg_win, 4) if live_avg_win is not None else None,
            avg_win_n=n_live_wins,
            # AvgLoss
            avg_loss_mean=round(loss_post["mean"], 4),
            avg_loss_var=round(loss_post["var"], 6),
            avg_loss_lower=round(loss_post["lower"], 4),
            avg_loss_upper=round(loss_post["upper"], 4),
            avg_loss_bt=round(bt_avg_loss, 4),
            avg_loss_live=round(live_avg_loss, 4) if live_avg_loss is not None else None,
            avg_loss_n=n_live_losses,
            # Combined EV
            ev_mean=round(ev_mean, 4),
            ev_std=round(ev_std, 4),
            ev_lower=round(ev_lower, 4),
            ev_upper=round(ev_upper, 4),
            ev_includes_zero=ev_includes_zero,
            p_positive=round(p_positive, 6),
            bt_p_positive=round(bt_p_positive, 6) if bt_p_positive is not None else round(p_positive, 6),
            # Metadata
            confidence=confidence,
            n_live=n_live,
            n_bt=n_bt,
            method="beta_nig_delta",
            # Raw counts
            n_bt_wins=int(n_bt_wins),
            n_bt_losses=int(n_bt_losses),
            n_live_wins=int(n_live_wins),
            n_live_losses=int(n_live_losses),
            eff_bt_wins=round(eff_bt_wins, 2),
            eff_bt_losses=round(eff_bt_losses, 2),
        )

    # === Legacy methods kept for distribution chart tooltips ===

    def compute_likelihood(self, fit: FitResult, current_value: float) -> float:
        """Compute P(B|A): probability of seeing this evidence IF the edge is alive.

        This is the survival function (1 - CDF) evaluated at current_value.
        Used for interactive distribution chart tooltips — NOT for the main
        edge probability, which now comes from P(EV > 0).
        """
        if not fit.passed or fit.distribution_name in ("empirical", "none"):
            if fit.empirical_percentiles:
                idx = np.searchsorted(fit.empirical_percentiles, current_value)
                pct = min(idx, 100)
                return max(1.0 - pct / 100.0, 0.001)
            return 0.5

        if fit.is_hybrid and fit.hybrid_data:
            from .distributions.hybrid import HybridFit
            hf = HybridFit.from_dict(fit.hybrid_data)
            cdf_val = float(hf.cdf(np.array([current_value]))[0])
            return max(1.0 - cdf_val, 0.001)

        dist = getattr(sp_stats, fit.distribution_name)
        cdf_val = float(dist.cdf(current_value, *fit.params))
        return max(1.0 - cdf_val, 0.001)
