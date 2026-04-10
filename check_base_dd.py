import sqlite3
import json

conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT equity_curve FROM strategies WHERE id='72777afa-4d49-4edc-a9e5-aa5777526120'")
row = c.fetchone()
if row:
    curve = json.loads(row[0])
    
    # Calculate base max dd
    pnls = []
    for i in range(len(curve)):
        if isinstance(curve[i], dict):
            eq = curve[i].get("equity", 0)
        else:
            eq = curve[i]
        if i == 0:
            pnls.append(eq)
        else:
            prev_eq = curve[i-1].get("equity", 0) if isinstance(curve[i-1], dict) else curve[i-1]
            pnls.append(eq - prev_eq)
    
    import numpy as np
    curve_arr = np.cumsum(np.array(pnls, dtype=np.float64))
    run_max = np.maximum.accumulate(curve_arr)
    drawdowns = run_max - curve_arr
    print('ACTUAL EQUITY_CURVE DD:', round(np.max(drawdowns), 2))
