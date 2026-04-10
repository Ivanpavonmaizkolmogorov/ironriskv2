import json

def update_tabs(lang):
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if lang == "es":
        data["workspaceManager"]["tabInspector"] = "🕵️‍♂️ Inspector Micro"
        data["workspaceManager"]["tabBayes"] = "🧠 Motor Bayesiano"
        data["workspaceManager"]["tabMacro"] = "🌍 Riesgo Macro"
    else:
        data["workspaceManager"]["tabInspector"] = "🕵️‍♂️ Micro Inspector"
        data["workspaceManager"]["tabBayes"] = "🧠 Bayesian Engine"
        data["workspaceManager"]["tabMacro"] = "🌍 Macro Risk"
        
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

update_tabs("es")
update_tabs("en")
print("Done tabs")
