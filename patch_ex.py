import json

for lang in ["es", "en"]:
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    try:
        # Step 4 title
        data["bayesMath"]["step4"]["title"] = "Paso 4 — Expectancy (Método Delta)"
        # Step 5 title
        data["bayesMath"]["step5"]["title"] = "Paso 5 — P(Expectancy > 0)"
        
        if lang == "es":
            data["bayesMath"]["step5"]["sbsDesc"] = "Del paso 4 sabemos que el Expectancy se distribuye como una Normal con:"
            # Replace E(X) inside cltDesc2
            data["bayesMath"]["step5"]["cltDesc2"] = data["bayesMath"]["step5"]["cltDesc2"].replace("el E(X) es", "el Expectancy es")
        else:
            data["bayesMath"]["step5"]["sbsDesc"] = "From step 4 we know that Expectancy is distributed as a Normal with:"
            data["bayesMath"]["step5"]["cltDesc2"] = data["bayesMath"]["step5"]["cltDesc2"].replace("E(X) is", "Expectancy is")
            
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Updated {lang}.json")
    except KeyError as e:
        print(f"KeyError in {lang}.json: {e}")

