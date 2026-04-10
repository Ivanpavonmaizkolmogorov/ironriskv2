import json

def update_lang(lang):
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if lang == "es":
        data["bayesMath"]["step5"]["cltTitle"] = "¿Por qué asumimos una Normal (Teorema Central del Límite)?"
        data["bayesMath"]["step5"]["cltDesc1"] = "Aunque tus trades individuales NO sigan una distribución Normal (suelen tener distribuciones de 'colas gordas', asimétricas, etc.), el Teorema Central del Límite garantiza que la MEDIA de esos trades sí converge a una campana de Gauss."
        data["bayesMath"]["step5"]["cltDesc2"] = "Como el E(X) es simplemente el producto de medias muestrales (Win Rate, PnL Ganador y PnL Perdedor), la distribución conjunta de la esperanza matemática se vuelve estrictamente Normal por convergencia asintótica. Por eso este cálculo no es una 'aproximación a ojo', es la realidad de tu riesgo a largo plazo."
    else:
        data["bayesMath"]["step5"]["cltTitle"] = "Why do we assume a Normal distribution (Central Limit Theorem)?"
        data["bayesMath"]["step5"]["cltDesc1"] = "Even though your individual trades DO NOT follow a Normal distribution (they usually have 'fat tails', asymmetric distributions, etc.), the Central Limit Theorem guarantees that the MEAN of those trades does converge to a Gaussian bell."
        data["bayesMath"]["step5"]["cltDesc2"] = "Since E(X) is simply the product of sample means (Win Rate, Winning PnL and Losing PnL), the joint distribution of the expected value becomes strictly Normal by asymptotic convergence. That's why this calculation isn't a 'rough estimate', it's the mathematical reality of your long-term risk."
        
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

update_lang("es")
update_lang("en")
print("Done patching CLT")
