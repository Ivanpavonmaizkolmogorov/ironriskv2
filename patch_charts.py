import json

def update_lang(lang):
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if lang == "es":
        data["bayesMath"]["charts"]["liveTitle"] = "📈 LIVE Equity Real"
        data["bayesMath"]["charts"]["liveDesc"] = "Comportamiento empírico. Si la curva empuja hacia abajo, acabará arrastrando la campana Gaussiana hacia terreno negativo con cada heartbeat."
        data["bayesMath"]["charts"]["waitingLiveTrades"] = "Esperando primer trade en vivo"
    else:
        data["bayesMath"]["charts"]["liveTitle"] = "📈 Real LIVE Equity"
        data["bayesMath"]["charts"]["liveDesc"] = "Empirical behavior. If the curve drags downward, it will pull the Gaussian bell into negative territory with each heartbeat."
        data["bayesMath"]["charts"]["waitingLiveTrades"] = "Waiting for first live trade"
        
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

update_lang("es")
update_lang("en")
print("Done inner UI patch")
