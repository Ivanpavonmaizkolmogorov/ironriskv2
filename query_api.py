import requests

resp = requests.get("http://localhost:8000/api/dashboard/account/8705bcfd-c4a2-453c-bc8d-9a0875b68050")
data = resp.json()

for strat in data.get('strategies', []):
    print(strat['name'])
    metrics = strat.get('metrics_snapshot', {}) or {}
    print(metrics.get('StagnationDaysMetric', {}))
    print(metrics.get('ConsecutiveLossesMetric', {}))
