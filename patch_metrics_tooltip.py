import json

# Define the tooltip payloads
es_guardian = {
    "label": "Guardian Status",
    "tableLabel": "Guardian",
    "tooltip": "Panel de tests estadísticos (P-Values) para WinRate, Racha y PnL de las operaciones reales. Detecta de inmediato si hay una desviación estadísticamente significativa con respecto al Backtest (LEDs en verde/amarillo/rojo).",
    "chartGuide": "Estado consolidado de las pruebas de consistencia en real."
}

en_guardian = {
    "label": "Guardian Status",
    "tableLabel": "Guardian",
    "tooltip": "Statistical test panel (P-Values) for live operations WinRate, Streak and PnL. Detects immediately if there's any statistically significant deviation compared to the Backtest (green/yellow/red LEDs).",
    "chartGuide": "Consolidated status of live consistency tests."
}

es_ev_tooltip = "La Esperanza Matemática (Expectancy) se rige analíticamente bajo la fórmula (WR*W) - (1-WR)*L. Define estrictamente el beneficio neto esperado por cada operación (como pilar base del teorema de Bayes)."
en_ev_tooltip = "Mathematical Expectancy is analytically governed by the formula (WR*W) - (1-WR)*L. strictly defines the expected net profit per trade (as a foundational pillar of Bayes theorem)."

def update_json(lang, guardian_data, ev_tooltip):
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if "metrics" in data:
        # Add guardian
        data["metrics"]["guardian_status"] = guardian_data
        
        # update ev
        if "ev" in data["metrics"]:
            data["metrics"]["ev"]["tooltip"] = ev_tooltip
            
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

try:
    update_json("es", es_guardian, es_ev_tooltip)
    update_json("en", en_guardian, en_ev_tooltip)
    print("Metrics tooltips fixed natively in JSON!")
except Exception as e:
    print("Error:", e)
