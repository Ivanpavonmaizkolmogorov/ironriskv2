import sys
import httpx

r = httpx.get("http://localhost:8000/api/portfolios/0f258ea0-2b82-44b5-84f6-40a80e86853a/bayes")
if r.status_code == 200:
    data = r.json()
    print("PORTFOLIO BAYES GAUGES:")
    for k, v in data.get("risk_gauges", {}).items():
        print(f"  {k}: limit={v.get('limit')} current={v.get('current')}")
else:
    print(r.status_code, r.text)

print("\nNOW LET'S CHECK THE STRATEGIES:")
r2 = httpx.get("http://localhost:8000/api/strategies/")
strats = r2.json()
for s in strats:
    if s.get("magic_number") == 95188:
        print(f"STRATEGY 95188 ID: {s.get('id')}")
        r3 = httpx.get(f"http://localhost:8000/api/strategies/{s.get('id')}/bayes")
        if r3.status_code == 200:
            s_data = r3.json()
            print("STRATEGY BAYES GAUGES:")
            for k, v in s_data.get("risk_gauges", {}).items():
                print(f"  {k}: limit={v.get('limit')} current={v.get('current')}")
