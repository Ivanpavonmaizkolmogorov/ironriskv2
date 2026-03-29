import sqlite3
import json
from services.stats.risk_profile import RiskProfile
from models.strategy import Strategy

def run():
    print("=== IronRisk V2: Phase 2 Heartbeat Simulator ===\n")
    
    # Connect to DB and get the strategy with distribution_fit
    conn = sqlite3.connect('ironrisk.db')
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, name, distribution_fit, risk_config 
        FROM strategies 
        WHERE distribution_fit IS NOT NULL AND distribution_fit != "{}" 
        ORDER BY created_at DESC LIMIT 1
    ''')
    row = cursor.fetchone()
    conn.close()

    if not row:
        print("No strategy found with distribution_fit. Please upload a CSV first.")
        return

    sid, name, df_str, rc_str = row
    print(f"Loaded Strategy: {name}")
    
    # Mock a SQLAlchemy model instance for RiskProfile
    class MockStrategy:
        def __init__(self, df, rc):
            self.distribution_fit = json.loads(df) if isinstance(df, str) else df
            self.risk_config = json.loads(rc) if isinstance(rc, str) else rc

    strategy = MockStrategy(df_str, rc_str)
    profile = RiskProfile(strategy)

    print("\n--- Strategy Config ---")
    print("Fits generated from backtest:")
    for m, fit in strategy.distribution_fit.items():
        dist = fit.get("distribution_name", "unknown")
        passed = fit.get("passed", False)
        print(f"  {m:18s} -> {dist:12s} (PASSED: {passed})")
        
    print("\nLimits configured:")
    for m, conf in strategy.risk_config.items():
        print(f"  {m:18s} -> Enabled: {conf.get('enabled')}, Limit: {conf.get('limit')}")

    # Simulated Heartbeats
    scenarios = [
        {
            "name": "Scenario 1: Normal Trading Day",
            "heartbeat": {
                "max_drawdown": 200.0,
                "daily_loss": -50.0,
                "consec_losses": 1,
                "stagnation_trades": 3,
                "stagnation_days": 1
            }
        },
        {
            "name": "Scenario 2: Getting close to limits (Elevated)",
            "heartbeat": {
                "max_drawdown": 850.0,   # High DD
                "daily_loss": -250.0,
                "consec_losses": 4,      # 4 losses
                "stagnation_trades": 15,
                "stagnation_days": 5
            }
        },
        {
            "name": "Scenario 3: Catastrophic (Extreme)",
            "heartbeat": {
                "max_drawdown": 2500.0,  # Huge DD
                "daily_loss": -800.0,
                "consec_losses": 9,      # 9 losses in a row
                "stagnation_trades": 45,
                "stagnation_days": 14
            }
        }
    ]

    for scenario in scenarios:
        print(f"\n\n========================================================")
        print(f"   {scenario['name']}")
        print(f"   Values: {scenario['heartbeat']}")
        print(f"========================================================")
        
        # This is exactly what the backend API will do in Phase 3
        results = profile.evaluate_heartbeat(scenario['heartbeat'])
        
        for metric, ctx in results.items():
            # Pad for alignment
            label = ctx['label']
            color = ctx['color']
            pct = ctx['percentile']
            badge = f"[{color.upper()}]"
            
            # Format output beautifully
            pct_str = f"P{pct:02d}" if pct is not None else "SHIELD"
            print(f"  {metric:18s} | {badge:8s} | {pct_str:6s} | {label}")

if __name__ == "__main__":
    run()
