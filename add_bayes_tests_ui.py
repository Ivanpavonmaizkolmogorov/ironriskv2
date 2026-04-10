import json

def update_lang(lang):
    file_path = f"webapp/messages/{lang}.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if "tests" not in data["bayesMath"]:
        data["bayesMath"]["tests"] = {}
    if "charts" not in data["bayesMath"]:
        data["bayesMath"]["charts"] = {}
        
    if lang == "es":
        data["bayesMath"]["tests"] = {
            "emptyState": {
                "winRate": "Win Rate",
                "lossStreak": "Racha Pérdidas",
                "avgPnl": "PnL Medio",
                "desc": "Esperando trades reales del EA para empezar a vigilar."
            },
            "howItWorks": "▶ ¿Cómo se calcula cada test?",
            "winRate": {
                "title": "1. Win Rate — Test Binomial",
                "q": "Pregunta: \"Si el BT dice WR = p, ¿qué probabilidad hay de ver ≤ {k} wins en {n} trades?\"",
                "red": "Si p < 2% → 🔴 el WR live es anormalmente bajo respecto al BT.",
                "yellow": "Si p < 10% → 🟡 sospechoso, vigilar.",
                "green": "Si p > 10% → 🟢 normal."
            },
            "streak": {
                "title": "2. Racha Pérdidas — Probabilidad geométrica",
                "q": "Pregunta: \"Si el BT dice que gano el {pct} de las veces, ¿es normal ver tantas pérdidas seguidas?\"",
                "logic": "Lógica paso a paso:",
                "logic1": "Si tu WR real fuese el del BT, cada trade tiene un {pct} de ser pérdida.",
                "logic2": "Para que se encadenen {k} pérdidas seguidas, esa probabilidad se multiplica {k} veces:",
                "observed": "Racha observada:",
                "lossesInRow": "pérdidas seguidas",
                "prob1": "Prob. de perder 1 vez:",
                "prob2": "Prob. de 2 seguidas:",
                "probK": "Prob. de {k} seguidas:",
                "pureProb": "(prob. pura)",
                "windows": "Ventanas donde podía empezar:",
                "red": "Si p < 2% → 🔴 racha extremadamente rara, el BT probablemente no refleja la realidad.",
                "yellow": "Si p < 10% → 🟡 racha inusual, vigilar.",
                "green": "Si p > 10% → 🟢 racha dentro de lo esperable.",
                "label": "Racha"
            },
            "pnl": {
                "title": "3. PnL Medio — z-test Normal",
                "q": "Pregunta: \"¿El PnL medio live es consistente con el PnL medio del BT?\"",
                "compare": "Compara la media live contra la media BT ajustando por el tamaño muestral.",
                "zscore": "Un z-score muy negativo → evidencia de que el rendimiento live es peor que el BT.",
                "label": "PnL Medio"
            },
            "interpretation": {
                "title": "Interpretación del p-value:",
                "desc": "Es la probabilidad de ver resultados así de malos o peores si el BT fuera real. Un p = 2% significa que solo hay un 2% de probabilidad de que estos resultados ocurran si la estrategia realmente funciona como en el BT."
            }
        }
        data["bayesMath"]["charts"] = {
            "evTitle": "📊 Intervalo de Credibilidad del EV",
            "evDesc": "Rango donde se encuentra el valor esperado por trade con un {pct}% de probabilidad. Si el intervalo incluye el 0, no podemos confirmar que la estrategia sea rentable.",
            "liveTitle": "📈 LIVE Equity Real",
            "liveDesc": "Comportamiento empírico. Si la curva empuja hacia abajo, acabará arrastrando la media Bayesiana y penalizando tu P(EV>0)."
        }
    else:
        data["bayesMath"]["tests"] = {
            "emptyState": {
                "winRate": "Win Rate",
                "lossStreak": "Loss Streak",
                "avgPnl": "Avg PnL",
                "desc": "Waiting for live EA trades to start monitoring."
            },
            "howItWorks": "▶ How is each test calculated?",
            "winRate": {
                "title": "1. Win Rate — Binomial Test",
                "q": "Question: \"If the BT says WR = p, what is the probability of seeing ≤ {k} wins in {n} trades?\"",
                "red": "If p < 2% → 🔴 live WR is abnormally low compared to BT.",
                "yellow": "If p < 10% → 🟡 suspicious, monitor closely.",
                "green": "If p > 10% → 🟢 normal."
            },
            "streak": {
                "title": "2. Loss Streak — Geometric Probability",
                "q": "Question: \"If the BT says I win {pct} of the time, is it normal to see this many consecutive losses?\"",
                "logic": "Step by step logic:",
                "logic1": "If your real WR was the BT's WR, each trade has a {pct} chance of being a loss.",
                "logic2": "For {k} consecutive losses to happen, that probability is multiplied {k} times:",
                "observed": "Observed streak:",
                "lossesInRow": "consecutive losses",
                "prob1": "Prob. of 1 loss:",
                "prob2": "Prob. of 2 in a row:",
                "probK": "Prob. of {k} in a row:",
                "pureProb": "(raw prob.)",
                "windows": "Windows where it could start:",
                "red": "If p < 2% → 🔴 extremely rare streak, BT likely misrepresents reality.",
                "yellow": "If p < 10% → 🟡 unusual streak, monitor closely.",
                "green": "If p > 10% → 🟢 streak within expected variance.",
                "label": "Streak"
            },
            "pnl": {
                "title": "3. Avg PnL — Normal z-test",
                "q": "Question: \"Is the live average PnL consistent with the BT average PnL?\"",
                "compare": "Compares the live mean against the BT mean, adjusted by sample size.",
                "zscore": "A highly negative z-score → evidence that live performance is worse than BT.",
                "label": "Avg PnL"
            },
            "interpretation": {
                "title": "p-value Interpretation:",
                "desc": "It's the probability of seeing results this bad or worse if the BT were true. A p = 2% means there is only a 2% chance these results would happen if the strategy truly works like the BT."
            }
        }
        data["bayesMath"]["charts"] = {
            "evTitle": "📊 EV Credible Interval",
            "evDesc": "Range where the expected value per trade is located with a {pct}% probability. If the interval includes 0, we cannot confirm the strategy is profitable.",
            "liveTitle": "📈 Real LIVE Equity",
            "liveDesc": "Empirical behavior. If the curve drags downward, it will pull the Bayesian mean and penalize your P(EV>0)."
        }
        
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

update_lang("es")
update_lang("en")
print("Done inner UI")
