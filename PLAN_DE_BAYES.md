# 🧠 Plan de Bayes — Motor Estadístico de IronRisk

> **Fecha de creación:** 29 de Marzo de 2026  
> **Última actualización:** 30 de Marzo de 2026  
> **Estado:** Implementado — Motor Beta + NIG + Delta

---

## Arquitectura: Descomposición Bayesiana del Expected Value

El sistema descompone el EV en tres componentes independientes, cada uno con su propio modelo bayesiano:

$$EV = \theta \times \overline{W} - (1 - \theta) \times \overline{L}$$

| Componente | Modelo | Prior (BT) | Data (Live) |
|:---|:---|:---|:---|
| $\theta$ (Win Rate) | Beta(α, β) | Wins/Losses del BT | Wins/Losses del live |
| $\overline{W}$ (Ganancia Media) | NIG → t-Student | PnL de wins del BT | PnL de wins del live |
| $\overline{L}$ (Pérdida Media) | NIG → t-Student | PnL de losses del BT | PnL de losses del live |
| **EV combinado** | **Método Delta** | — | Propagación de incertidumbre |

---

## Componente 1: Win Rate θ — Beta Posterior

Cada trade es un ensayo de Bernoulli: win ($PnL > 0$) o loss ($PnL < 0$).

**No requiere test de bondad de ajuste.** La distribución Beta es el conjugado exacto de la distribución Bernoulli. Es matemática, no un modelo que se elige.

### Fórmulas

$$\alpha_{post} = \frac{wins_{BT}}{D} + wins_{live}$$
$$\beta_{post} = \frac{losses_{BT}}{D} + losses_{live}$$

$$E[\theta] = \frac{\alpha_{post}}{\alpha_{post} + \beta_{post}}$$

$$HDI_{95\%} = \left[ Beta^{-1}(0.025), \; Beta^{-1}(0.975) \right]$$

Donde $D$ es el factor de escepticismo del BT (default = 10).

### Ejemplo
> BT: 400 wins, 292 losses. D = 10 → α₀ = 40, β₀ = 29.2  
> Live: 3 wins, 1 loss → α = 43, β = 30.2  
> Posterior: θ = 58.7%, HDI = [47.3%, 69.7%]

---

## Componente 2 y 3: AvgWin y AvgLoss — NIG Posterior

Para las magnitudes de ganancia y pérdida se usa el conjugado Normal-Inverse-Gamma.

### Justificación de la t-Student (por qué NO necesita test)

La t-Student posterior para la media **no es un modelo elegido** — es una consecuencia matemática del conjugado NIG. La única asunción es que la **media muestral** es aproximadamente Normal.

**Teorema Central del Límite (TCL):** la media de $n$ observaciones converge a distribución Normal independientemente de la distribución original, para $n > 30$. No asumimos que los PnL individuales sean Normales — solo que su MEDIA lo es, lo cual está garantizado por el TCL.

### Fórmulas

**Prior del BT (descontado):**
$$\mu_0 = \overline{x}_{BT}, \quad \kappa_0 = \frac{n_{BT}}{D}, \quad \alpha_0 = \frac{n_{BT}}{2D}, \quad \beta_0 = \frac{n_{BT}}{2D} \cdot s^2_{BT}$$

**Posterior con datos live:**
$$\kappa_n = \kappa_0 + n_{live}$$
$$\mu_n = \frac{\kappa_0 \cdot \mu_0 + n_{live} \cdot \overline{x}_{live}}{\kappa_n}$$
$$\alpha_n = \alpha_0 + \frac{n_{live}}{2}$$
$$\beta_n = \beta_0 + \frac{1}{2}\sum(x_i - \overline{x}_{live})^2 + \frac{\kappa_0 \cdot n_{live} \cdot (\overline{x}_{live} - \mu_0)^2}{2\kappa_n}$$

**Distribución posterior:**
$$\mu \mid data \sim t\left(2\alpha_n, \;\; \mu_n, \;\; \sqrt{\frac{\beta_n}{\alpha_n \cdot \kappa_n}}\right)$$

---

## Componente 4: EV Combinado — Método Delta

El Método Delta propaga la incertidumbre de los tres componentes al EV final.

### Fórmulas

$$E[EV] = E[\theta] \times E[W] - (1 - E[\theta]) \times E[L]$$

$$Var[EV] \approx \overline{W}^2 \cdot Var[\theta] + E[\theta]^2 \cdot Var[W] + \overline{L}^2 \cdot Var[\theta] + (1 - E[\theta])^2 \cdot Var[L]$$

$$HDI_{95\%} = E[EV] \pm 1.96 \times \sqrt{Var[EV]}$$

$$P(EV > 0) = 1 - \Phi\left(\frac{0 - E[EV]}{\sqrt{Var[EV]}}\right)$$

### P(EV > 0) — La métrica principal

Es la probabilidad de que el edge sea positivo. Sale de la misma distribución que el HDI, por lo que **nunca se contradicen** por construcción.

| Si el HDI... | Entonces P(EV>0)... | Coherente? |
|:---|:---|:---|
| Está todo por encima de 0 | > 97.5% | ✅ Siempre |
| Incluye el 0 pero μ > 0 | 50-97.5% | ✅ Siempre |
| Centrado en 0 | ~50% | ✅ Siempre |
| Todo negativo | < 2.5% | ✅ Siempre |

---

## Factor de Escepticismo del BT ($D$)

El factor $D$ controla cuánto confiamos en el backtest:

| D | Significado | Efecto |
|:---|:---|:---|
| 1 | Confío 100% en el BT | Cada trade BT = 1 trade live |
| **10** | **Escepticismo prudente (default)** | **Cada trade BT = 0.1 trades live** |
| 50 | Muy escéptico | Cada trade BT = 0.02 trades live |

Se aplica a los 3 componentes: Win Rate, AvgWin, AvgLoss.

---

## Gauges de Riesgo (Información Visual Secundaria)

Los KPIs de riesgo (Drawdown, Stagnation, Consecutive Losses) **no alimentan ninguna probabilidad**. Se muestran como información visual en los gráficos interactivos de distribución.

El trader ve:
- "Tu DD actual ($450) está en el percentil 73 del BT" → ⚠️
- "Tu estancamiento (12 días) está en el percentil 45 del BT" → ✅

Pero la **alarma real** la da el IC del EV: si incluye el 0, el edge es estadísticamente indistinguible del azar.

---

## Inventario de Distribuciones (para gráficos interactivos)

### Drawdown y Daily Loss — Continuas, $[0, \infty)$
| Distribución | SciPy ID | Firma del EA |
|:---|:---|:---|
| Lognormal | `lognorm` | Correcciones asimétricas |
| Weibull | `weibull_min` | Fatiga/Fallo |
| Gamma | `gamma` | Desangrados o caídas |
| Pareto (Lomax) | `lomax` | Cisne Negro |
| Half-Normal | `halfnorm` | Scalping conservador |
| Exponential | `expon` | Memoryless |

### Estancamientos — Continuas, $[0, \infty)$
| Distribución | SciPy ID | Firma del EA |
|:---|:---|:---|
| Exponential | `expon` | Sin memoria |
| Gamma | `gamma` | Agrupación |
| Weibull | `weibull_min` | Fatiga |
| Wald | `invgauss` | Browniano |

### Rachas Perdedoras — Discretas
| Distribución | SciPy ID | Firma del EA |
|:---|:---|:---|
| Poisson | `poisson` | Raras constantes |
| Binomial Negativa | `nbinom` | Sobre-dispersión |
| Geométrica | `geom` | Independiente |

---

> **Nota:** Este documento es la referencia del sistema estadístico. Toda implementación respeta OOP estricto y garantiza trazabilidad de cada cálculo.
