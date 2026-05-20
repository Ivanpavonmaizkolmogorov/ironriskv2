"""
Verification script: Confirms that the SQX BayesPriorColumn Java logic
produces the same P(EV>0) as IronRisk's BayesEngine for BT-only data.

We simulate the EXACT same algorithm step-by-step in Python and compare
with the actual BayesEngine output.
"""
import sys
sys.path.insert(0, r"c:\Users\ivanp\Desktop\Symbols\Porfolios\ironriskv2\backend")

import numpy as np
from services.stats.bayes_engine import BayesEngine
import math

def java_normal_cdf(z):
    """Exact replica of the Abramowitz & Stegun CDF in the Java column."""
    if z > 8.0: return 1.0
    if z < -8.0: return 0.0
    
    negate = False
    if z < 0:
        negate = True
        z = -z
    
    p  = 0.2316419
    b1 = 0.319381530
    b2 = -0.356563782
    b3 = 1.781477937
    b4 = -1.821255978
    b5 = 1.330274429
    
    t = 1.0 / (1.0 + p * z)
    pdf = math.exp(-0.5 * z * z) / math.sqrt(2.0 * math.pi)
    poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))))
    cdf = 1.0 - pdf * poly
    
    return (1.0 - cdf) if negate else cdf


def java_replica(pnl_list, max_bt_trades=30):
    """
    Python replica of the Java BayesPriorColumn.compute() algorithm.
    Returns P(EV>0) as percentage (0-100).
    """
    bt_wins = [p for p in pnl_list if p > 0]
    bt_losses = [abs(p) for p in pnl_list if p < 0]
    
    n_bt = len(pnl_list)
    n_bt_wins = len(bt_wins)
    n_bt_losses = len(bt_losses)
    
    if n_bt_wins == 0 or n_bt_losses == 0:
        return 100.0 if n_bt_wins > 0 else 0.0
    
    # Win Rate Beta
    total_eff = float(n_bt)
    if total_eff > max_bt_trades:
        total_eff = max_bt_trades
    
    bt_wr = n_bt_wins / (n_bt_wins + n_bt_losses)
    eff_bt_wins = total_eff * bt_wr
    eff_bt_losses = total_eff * (1.0 - bt_wr)
    
    alpha_post = max(eff_bt_wins, 1.0)
    beta_post = max(eff_bt_losses, 1.0)
    
    theta_mean = alpha_post / (alpha_post + beta_post)
    theta_var = (alpha_post * beta_post) / (
        (alpha_post + beta_post)**2 * (alpha_post + beta_post + 1.0)
    )
    
    # AvgWin NIG (prior-only)
    bt_mean_win = np.mean(bt_wins)
    bt_var_win = np.var(bt_wins, ddof=1) if len(bt_wins) > 1 else 0
    
    eff_n_win = float(n_bt_wins)
    if eff_n_win > eff_bt_wins:
        eff_n_win = eff_bt_wins
    
    kappa_win = eff_n_win
    alpha_win = max(eff_n_win / 2.0, 2.0)
    beta_nig_win = (eff_n_win / 2.0) * bt_var_win
    
    win_mean = bt_mean_win
    win_scale = math.sqrt(beta_nig_win / (alpha_win * kappa_win)) if alpha_win * kappa_win > 0 else 1.0
    win_var = win_scale ** 2
    
    # AvgLoss NIG (prior-only)
    bt_mean_loss = np.mean(bt_losses)
    bt_var_loss = np.var(bt_losses, ddof=1) if len(bt_losses) > 1 else 0
    
    eff_n_loss = float(n_bt_losses)
    if eff_n_loss > eff_bt_losses:
        eff_n_loss = eff_bt_losses
    
    kappa_loss = eff_n_loss
    alpha_loss = max(eff_n_loss / 2.0, 2.0)
    beta_nig_loss = (eff_n_loss / 2.0) * bt_var_loss
    
    loss_mean = bt_mean_loss
    loss_scale = math.sqrt(beta_nig_loss / (alpha_loss * kappa_loss)) if alpha_loss * kappa_loss > 0 else 1.0
    loss_var = loss_scale ** 2
    
    # Delta Method
    W = win_mean
    L = loss_mean
    Vt = theta_var
    Vw = win_var
    Vl = loss_var
    
    ev_mean = theta_mean * W - (1.0 - theta_mean) * L
    ev_var = (W**2)*Vt + (theta_mean**2)*Vw + (L**2)*Vt + ((1.0 - theta_mean)**2)*Vl
    ev_std = math.sqrt(max(ev_var, 0.0))
    
    if ev_std > 0:
        z = ev_mean / ev_std
        p_positive = java_normal_cdf(z)
    else:
        p_positive = 1.0 if ev_mean > 0 else 0.0
    
    return round(p_positive * 100.0, 2)


# ====== TEST CASES ======
print("=" * 70)
print("VERIFICATION: Java BayesPriorColumn vs IronRisk BayesEngine")
print("=" * 70)

test_cases = {
    "Strategy A (60% WR, 100 trades)": [10, -5] * 30 + [-5, 10] * 20,
    "Strategy B (50% WR, 50 trades)": [8, -8] * 25,
    "Strategy C (70% WR, 200 trades)": ([15, 12, 8, -5, -3] * 40),
    "Strategy D (40% WR, 60 trades)": ([20, -10, -8, -5, -12] * 12),
    "Strategy E (55% WR, high variance)": [100, -80, 5, -3, 2, -1, 50, -40, 3, -2] * 10,
}

engine = BayesEngine()
all_pass = True

for name, pnl in test_cases.items():
    # IronRisk result (BT only, no live)
    decomp = engine.decompose_ev(
        bt_pnl=pnl,
        live_pnl=[],
        confidence=0.95,
        min_trades=0,
        max_bt_trades=30,
    )
    ironrisk_p = round(decomp.p_positive * 100.0, 2) if decomp else 0.0
    
    # Java replica result
    java_p = java_replica(pnl, max_bt_trades=30)
    
    # Compare
    diff = abs(ironrisk_p - java_p)
    status = "✅ PASS" if diff < 0.5 else "❌ FAIL"
    if diff >= 0.5:
        all_pass = False
    
    print(f"\n{name}:")
    print(f"  IronRisk P(EV>0): {ironrisk_p}%")
    print(f"  Java Replica:     {java_p}%")
    print(f"  Diff:             {diff:.4f}%  {status}")

print("\n" + "=" * 70)
print(f"RESULT: {'ALL TESTS PASSED ✅' if all_pass else 'SOME TESTS FAILED ❌'}")
print("=" * 70)
