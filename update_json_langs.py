import json, os

bayes_es = {
    "title": "Ver desglose paso a paso del cálculo",
    "glossary": {
        "wr_label": "Win Rate (probabilidad de ganar)",
        "w_label": "Avg Win (ganancia media por trade ganador)",
        "l_label": "Avg Loss (pérdida media por trade perdedor)",
        "ev_label": "Expected Value"
    },
    "step1": {
        "title": "Paso 1 — WR (Win Rate)",
        "model": "Modelo:",
        "modelDesc": "Beta-Bernoulli conjugado. Cada trade es win o loss. La Beta es el prior natural — no requiere test de bondad de ajuste.",
        "inputs": "DATOS DE ENTRADA",
        "confBt": "Confianza BT: {conf}% → cada trade BT vale {eff} trades live",
        "prior": "PRIOR (solo BT descontado)",
        "posterior": "POSTERIOR (BT + Live)",
        "variance": "VARIANZA (se usará en Paso 4)"
    },
    "step2": {
        "title": "Paso 2 — W (Ganancia Media por Trade)",
        "model": "Modelo:",
        "modelDesc": "Normal-Inverse-Gamma conjugado → t-Student posterior. La t-Student NO es asumida — es consecuencia matemática del NIG. La asunción es que la distribución de la MEDIA es Normal, garantizado por el Teorema Central del Límite (TCL) para n > 30.",
        "calcMean": "CÁLCULO DE LA MEDIA POSTERIOR",
        "calcMeanDesc": "La media posterior es una media ponderada entre el BT (descontado) y los datos live:",
        "deltaBtUp": "↑ subió",
        "deltaBtDown": "↓ bajó",
        "varianceTitle": "VARIANZA (se usará en Paso 4)",
        "varianceDesc1": "La varianza de la media se calcula como:",
        "varianceWhere": "donde:",
        "varianceDisp": "← dispersión de los {count} trades ganadores del BT (se usan TODOS, no se descuentan)",
        "varianceEff": "← aquí SÍ se descuenta:",
        "varianceEffLive": " + {n} live",
        "varianceNote": "💡 s² mide cuánto varían los trades entre sí (eso el BT lo mide bien), pero n_eff refleja cuánto confiamos en la media del BT ({n_eff} vs {n_bt} reales).",
        "verify": "Verificación:"
    },
    "step3": {
        "title": "Paso 3 — L (Pérdida Media por Trade)",
        "modelDesc": "Mismo modelo NIG que el paso 2. Las pérdidas se tratan como valores absolutos (positivos) para facilitar la interpretación.",
        "deltaBtUp": "↑ pérdida mayor",
        "deltaBtDown": "↓ pérdida menor",
        "varianceDisp": "← dispersión de los {count} trades perdedores del BT (se usan TODOS, no se descuentan)",
        "varianceEff": "← aquí SÍ se descuenta:",
        "varianceEffLive": " + {n} live"
    },
    "step4": {
        "title": "Paso 4 — E(X) Expected Value (Método Delta)",
        "modelDesc": "Propagación de incertidumbre analítica. Asume independencia entre WR, W y L.",
        "formula": "FÓRMULA",
        "perTrade": "por trade",
        "uncertaintyTitle": "INCERTIDUMBRE (Método Delta)",
        "uncertaintyDesc": "σ se calcula propagando la incertidumbre de cada variable (WR, W, L) usando una aproximación de Taylor de primer orden:",
        "fromStep1": "← del Paso 1 (Beta posterior)",
        "fromStep2": "← del Paso 2 (t-Student / NIG posterior)",
        "fromStep2Desc": "escala² de la t-Student posterior para la media de ganancias",
        "fromStep3": "← del Paso 3 (t-Student / NIG posterior)",
        "fromStep3Desc": "escala² de la t-Student posterior para la media de pérdidas",
        "liveWins": "wins live",
        "liveLosses": "losses live"
    },
    "step5": {
        "title": "Paso 5 — P(E(X) > 0)",
        "modelDesc": "Sale de la misma distribución Normal del paso 4 → nunca contradice al IC.",
        "whatIsPhi": "¿QUÉ ES Φ?",
        "phiDesc1": "Φ es la función de distribución acumulada (CDF) de la Normal.",
        "phiDesc2": "Φ(x) = \"¿qué porcentaje del área de la campana queda a la IZQUIERDA de x?\"",
        "stepByStep": "CÁLCULO PASO A PASO",
        "sbsDesc": "Del paso 4 sabemos que E(X) se distribuye como una Normal con:",
        "meanText": "(la media)",
        "uncertText": "(la incertidumbre)",
        "question": "Pregunta:",
        "questionText": "\"¿Cuánta área de la campana queda por encima de $0?\"",
        "calc1": "1. Normalizamos el 0 a unidades de σ (z-score):",
        "calc1Result": "Esto significa que el $0 queda a {val}σ {dir} de la media.",
        "left": "a la izquierda",
        "right": "a la derecha",
        "calc2": "2. Consultamos la tabla Normal:",
        "calc2Result": "← {pct}% del área está a la izquierda del 0 (zona de pérdida)",
        "calc3": "3. Invertimos para obtener el área positiva:",
        "finalResult": "Hay un {pct}% de probabilidad de que la estrategia tenga edge positivo.",
        "doesNotContradict": "nunca contradice al IC"
    }
}

bayes_en = {
    "title": "View step-by-step mathematical breakdown",
    "glossary": {
        "wr_label": "Win Rate (probability of winning)",
        "w_label": "Avg Win (average gain per winning trade)",
        "l_label": "Avg Loss (average loss per losing trade)",
        "ev_label": "Expected Value"
    },
    "step1": {
        "title": "Step 1 — WR (Win Rate)",
        "model": "Model:",
        "modelDesc": "Conjugate Beta-Bernoulli. Each trade is a win or loss. The Beta is the natural prior — no goodness-of-fit test required.",
        "inputs": "INPUT DATA",
        "confBt": "BT Confidence: {conf}% → each BT trade equals {eff} live trades",
        "prior": "PRIOR (discounted BT only)",
        "posterior": "POSTERIOR (BT + Live)",
        "variance": "VARIANCE (will be used in Step 4)"
    },
    "step2": {
        "title": "Step 2 — W (Average Win per Trade)",
        "model": "Model:",
        "modelDesc": "Conjugate Normal-Inverse-Gamma → posterior t-Student. The t-Student is NOT assumed — it is a mathematical consequence of the NIG. The assumption is that the distribution of the MEAN is Normal, guaranteed by the Central Limit Theorem (CLT) for n > 30.",
        "calcMean": "POSTERIOR MEAN CALCULATION",
        "calcMeanDesc": "The posterior mean is a weighted average between the BT (discounted) and the live data:",
        "deltaBtUp": "↑ increased",
        "deltaBtDown": "↓ decreased",
        "varianceTitle": "VARIANCE (will be used in Step 4)",
        "varianceDesc1": "The variance of the mean is calculated as:",
        "varianceWhere": "where:",
        "varianceDisp": "← dispersion of the {count} winning BT trades (ALL are used, not discounted)",
        "varianceEff": "← discounting applies here:",
        "varianceEffLive": " + {n} live",
        "varianceNote": "💡 s² measures how much the trades vary from each other (BT measures this well), but n_eff reflects how much we trust the BT mean ({n_eff} vs {n_bt} real).",
        "verify": "Verification:"
    },
    "step3": {
        "title": "Step 3 — L (Average Loss per Trade)",
        "modelDesc": "Same NIG model as step 2. Losses are treated as absolute values (positive) for easier interpretation.",
        "deltaBtUp": "↑ greater loss",
        "deltaBtDown": "↓ lesser loss",
        "varianceDisp": "← dispersion of the {count} losing BT trades (ALL are used, not discounted)",
        "varianceEff": "← discounting applies here:",
        "varianceEffLive": " + {n} live"
    },
    "step4": {
        "title": "Step 4 — E(X) Expected Value (Delta Method)",
        "modelDesc": "Analytical uncertainty propagation. Assumes independence between WR, W, and L.",
        "formula": "FORMULA",
        "perTrade": "per trade",
        "uncertaintyTitle": "UNCERTAINTY (Delta Method)",
        "uncertaintyDesc": "σ is calculated by propagating the uncertainty of each variable (WR, W, L) using a first-order Taylor approximation:",
        "fromStep1": "← from Step 1 (posterior Beta)",
        "fromStep2": "← from Step 2 (posterior t-Student / NIG)",
        "fromStep2Desc": "scale² of the posterior t-Student for the average of wins",
        "fromStep3": "← from Step 3 (posterior t-Student / NIG)",
        "fromStep3Desc": "scale² of the posterior t-Student for the average of losses",
        "liveWins": "live wins",
        "liveLosses": "live losses"
    },
    "step5": {
        "title": "Step 5 — P(E(X) > 0)",
        "modelDesc": "Comes from the same Normal distribution as Step 4 → never contradicts the CI.",
        "whatIsPhi": "WHAT IS Φ?",
        "phiDesc1": "Φ is the cumulative distribution function (CDF) of the Normal distribution.",
        "phiDesc2": "Φ(x) = \"what percentage of the bell curve area falls to the LEFT of x?\"",
        "stepByStep": "STEP BY STEP CALCULATION",
        "sbsDesc": "From step 4 we know that E(X) is distributed as a Normal with:",
        "meanText": "(the mean)",
        "uncertText": "(the uncertainty)",
        "question": "Question:",
        "questionText": "\"How much of the bell curve area is above $0?\"",
        "calc1": "1. We normalize 0 to units of σ (z-score):",
        "calc1Result": "This means $0 lies {val}σ to the {dir} of the mean.",
        "left": "left",
        "right": "right",
        "calc2": "2. We query the Normal table:",
        "calc2Result": "← {pct}% of the area is to the left of 0 (loss zone)",
        "calc3": "3. We invert to get the positive area:",
        "finalResult": "There is a {pct}% probability that the strategy has a positive edge.",
        "doesNotContradict": "never contradicts the CI"
    }
}

for lang, data in [("es", bayes_es), ("en", bayes_en)]:
    with open(f"webapp/messages/{lang}.json", "r", encoding="utf-8") as f:
        doc = json.load(f)
    doc["bayesMath"] = data
    with open(f"webapp/messages/{lang}.json", "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
