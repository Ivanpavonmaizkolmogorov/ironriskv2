import json

def update_lang(lang):
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    if "ui" not in data["bayesMath"]:
        data["bayesMath"]["ui"] = {}
        
    if lang == "es":
        data["bayesMath"]["ui"] = {
            "title": "Motor Bayesiano",
            "subtitle": "Inferencia Estadística de Probabilidad de Supervivencia",
            "analyzing": "Analizando datos para:",
            "calculating": "Calculando...",
            "probEdgePositive": "Probabilidad de que el edge sea positivo",
            "edgeDead": "0% — Edge muerto",
            "edgeConfirmed": "100% — Edge confirmado",
            "guardianTitle": "🛡️ Guardián BT ↔ Live",
            "guardianDesc": "¿Tus resultados live son consistentes con lo que el BT prometía?",
            "consistent": "Consistente",
            "watch": "Vigilar",
            "inconsistent": "Inconsistente"
        }
    else:
        data["bayesMath"]["ui"] = {
            "title": "Bayesian Engine",
            "subtitle": "Statistical Inference of Survival Probability",
            "analyzing": "Analyzing data for:",
            "calculating": "Calculating...",
            "probEdgePositive": "Probability of a positive edge",
            "edgeDead": "0% — Edge dead",
            "edgeConfirmed": "100% — Edge confirmed",
            "guardianTitle": "🛡️ BT ↔ Live Guardian",
            "guardianDesc": "Are your live results consistent with what the BT promised?",
            "consistent": "Consistent",
            "watch": "Monitor",
            "inconsistent": "Inconsistent"
        }
        
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

update_lang("es")
update_lang("en")
print("Done")
