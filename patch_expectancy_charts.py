import json

for lang in ["es", "en"]:
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if lang == "es":
        data["bayesMath"]["charts"]["evTitle"] = "📊 Intervalo de Credibilidad de la Expectancy"
        data["bayesMath"]["charts"]["evDesc"] = "Rango donde se encuentra el valor esperado (Expectancy) por trade con un {pct}% de probabilidad. Si el intervalo incluye el 0, no podemos confirmar que la estrategia sea rentable."
    else:
        data["bayesMath"]["charts"]["evTitle"] = "📊 Expectancy Credibility Interval"
        data["bayesMath"]["charts"]["evDesc"] = "Range where the expected value (Expectancy) per trade is located with a {pct}% probability. If the interval includes 0, we cannot confirm the strategy is profitable."
        
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

print("Expectancy in charts nomenclature updated")
