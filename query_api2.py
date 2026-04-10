import requests

resp = requests.get("http://localhost:8000/api/dashboard/account/8705bcfd-c4a2-453c-bc8d-9a0875b68050")
data = resp.json()
print("Keys:", data.keys())
print("Has account?", "account" in data)
if "account" in data:
    acc = data["account"]
    print("Account keys:", acc.keys())
    for s in acc.get("strategies", []):
        print(s["name"])
        metrics = s.get("metrics_snapshot", {}) or {}
        print("StagDays:", metrics.get("StagnationDaysMetric"))
