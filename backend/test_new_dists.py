import sqlite3, json
from services.stats.analyzer import DistributionAnalyzer
from services.csv_parser import parse_csv

conn = sqlite3.connect('ironrisk.db')
cursor = conn.cursor()
cursor.execute('SELECT id, name, total_trades FROM strategies ORDER BY created_at DESC LIMIT 1')
row = cursor.fetchone()

# Since trades are not stored fully in the DB separately in V2 (they are in the CSV), we might need an actual CSV.
# Oh wait, we don't store trades in the DB. The Strategy model doesn't have a `trades` array.
# Let's just run the test on synthetic data for now to verify it doesn't crash on discrete data.

import numpy as np
np.random.seed(42)

analyzer = DistributionAnalyzer()

# Let's create synthetic trades that will have some consecutive losses and stagnation
trades = []
for i in range(500):
    profit = np.random.normal(-5, 50) if i % 3 == 0 else np.random.normal(15, 30)
    trades.append({
        "profit": float(profit),
        "time": f"2025-01-{(i % 28) + 1:02d}"
    })

results = analyzer.analyze_strategy(trades)

print("\n=== Synthetic Results for New Dists ===")
for metric_name, fit_dict in results.items():
    status = "PASSED" if fit_dict["passed"] else "empirical"
    dist = fit_dict["distribution_name"]
    pval = fit_dict["p_value"]
    print(f"  {metric_name:25s} -> {dist:15s} p={pval:.4f}  {status}")

