"""Quick smoke test for the DistributionAnalyzer pipeline."""

import numpy as np
from services.stats.analyzer import DistributionAnalyzer
from services.stats.distributions import DISTRIBUTION_REGISTRY
from services.stats.metrics import METRIC_REGISTRY

print("=== Registries ===")
dist_counts = {k: len(v) for k, v in DISTRIBUTION_REGISTRY.items()}
print(f"Distributions: {dist_counts}")
print(f"Metrics: {len(METRIC_REGISTRY)} registered")
for m in METRIC_REGISTRY:
    print(f"  - {m.name} ({m.label}) -> variable={m.variable}")

# Generate synthetic trades
np.random.seed(42)
n = 200
profits = np.random.normal(10, 50, n)
trades = [
    {"profit": float(p), "time": f"2025-01-{(i % 28) + 1:02d}"}
    for i, p in enumerate(profits)
]

print(f"\n=== Analyzing {n} synthetic trades ===")
analyzer = DistributionAnalyzer()
results = analyzer.analyze_strategy(trades)

print("\n=== Results ===")
for metric_name, fit_dict in results.items():
    status = "PASSED" if fit_dict["passed"] else "empirical"
    dist = fit_dict["distribution_name"]
    pval = fit_dict["p_value"]
    print(f"  {metric_name:25s} -> {dist:15s} p={pval:.4f}  {status}")

# Test percentile on PnL fit
from services.stats.fit_result import FitResult
pnl_fit = FitResult.from_dict(results["pnl_per_trade"], raw_data=profits)
print(f"\n=== Percentile test (PnL fit: {pnl_fit.distribution_name}) ===")
for val in [-100, -50, 0, 10, 50, 100]:
    pct = pnl_fit.percentile(val)
    print(f"  PnL = ${val:>6} -> percentile {pct}")

print("\nAll OK!")
