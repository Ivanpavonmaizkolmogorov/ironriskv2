import json

for lang in ["es", "en"]:
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if "evDistribution" in data.get("bayesSandbox", {}):
        data["bayesSandbox"]["evDistribution"] = "Distribución de la Expectancy" if lang == "es" else "Expectancy Distribution"
        
    if "ev_label" in data.get("bayesSandbox", {}):
        data["bayesSandbox"]["ev_label"] = "Expectancy"
        
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

print("Sandbox Expectancy nomenclature updated")
