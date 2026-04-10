import json

es_ev_tooltip = "La Esperanza Matemática (Expectancy) se rige analíticamente bajo la fórmula (WR*W) - (1-WR)*L. Conceptualmente: multiplica tus aciertos esperados por tu ganancia media, y réstale el daño de tus fallos esperados por tu pérdida media. Define estrictamente el beneficio neto por operación (el pilar base del motor Bayesiano)."

en_ev_tooltip = "Mathematical Expectancy is analytically governed by the formula (WR*W) - (1-WR)*L. Conceptually: multiply your expected wins by your average profit, and subtract the damage of your expected losses by your average loss. It strictly defines the expected net profit per trade (the foundational pillar of the Bayesian engine)."

def update_ev(lang, tooltip):
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if "metrics" in data and "ev" in data["metrics"]:
        data["metrics"]["ev"]["tooltip"] = tooltip
            
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

update_ev("es", es_ev_tooltip)
update_ev("en", en_ev_tooltip)
print("Expectancy tooltip expanded with conceptual explanation!")
