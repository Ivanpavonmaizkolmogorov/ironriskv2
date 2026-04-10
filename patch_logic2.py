import json

for lang in ["es", "en"]:
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if lang == "es":
        data["bayesMath"]["tests"]["streak"]["logic2"] = "Para que se encadenen <k>k</k> pérdidas seguidas, esa probabilidad se multiplica <k>k</k> veces:"
    else:
        # Check english version equivalent if needed, probably similar logic
        data["bayesMath"]["tests"]["streak"]["logic2"] = "For <k>k</k> consecutive losses to occur, that probability is multiplied <k>k</k> times:"
        
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

print("Streaks logic2 fixed with rich tags")
