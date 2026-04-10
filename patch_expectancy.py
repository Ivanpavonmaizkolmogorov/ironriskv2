import json

for lang in ["es", "en"]:
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    # Standardize nomenclature: EV -> Expectancy
    if lang == "es":
        data["bayesMath"]["step4"]["title"] = "Paso 4 — Expectancy E(X) (Método Delta)"
        data["bayesMath"]["ui"]["ev"] = "Expectancy"
    else:
        data["bayesMath"]["step4"]["title"] = "Step 4 — Expectancy E(X) (Delta Method)"
        data["bayesMath"]["ui"]["ev"] = "Expectancy"
        
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

print("Expectancy nomenclature updated")
