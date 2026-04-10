import sqlite3, json, pandas as pd
from datetime import datetime

conn = sqlite3.connect('ironrisk.db')
strategies = pd.read_sql("SELECT name, equity_curve FROM strategies WHERE name LIKE '%18%BuyStop%' LIMIT 1", conn)

curve_json = strategies.iloc[0]['equity_curve']
curve = json.loads(curve_json)

# Convert curve to "trades" format expected by stagnation.py
# curve format: {'trade': 1, 'equity': -100.74, 'date': ...}
# stagnation expects: {'time': ..., 'profit': ...}
trades = []
last_equity = 0
for t in curve:
    profit = t['equity'] - last_equity
    last_equity = t['equity']
    trades.append({
        'time': t.get('date'),
        'profit': profit
    })

print(f"Built {len(trades)} trades")

equity = 0.0
peak = 0.0
lengths = []
peak_date = None

for t in trades:
    profit = t.get("profit", 0)
    
    try:
        time_str = str(t.get("time", "")).replace(".", "-")[:10]
        current_date = datetime.strptime(time_str, "%Y-%m-%d")
    except ValueError:
        continue
        
    equity += profit
    
    # Use exact same float comparison
    # BUT wait! floating point errors?
    if equity > peak:
        if peak_date is not None:
            days_since = (current_date - peak_date).days
            if days_since > 0:
                lengths.append(days_since)
        peak = equity
        peak_date = current_date

lengths.sort()
print(f"Calculated lengths manually: {lengths[-10:]}")
print(f"Max length: {max(lengths) if lengths else 0}")
