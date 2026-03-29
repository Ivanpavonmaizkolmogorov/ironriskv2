# 🧠 Plan de Bayes — Fase 6 del Motor Estadístico de IronRisk

> **Fecha de creación:** 29 de Marzo de 2026  
> **Estado:** Borrador Arquitectónico Aprobado — Pendiente de Implementación  
> **Contexto:** Este documento es el plan maestro para la evolución cuantitativa de IronRisk hacia un sistema de evaluación Bayesiana dinámica del ciclo de vida de los EAs.

---

## Eje 1: Teoría de Valores Extremos y Trazado Visual (Modo Híbrido)

El análisis matemático creará un modelo *Splice* (Cuerpo + Cola), con **obligación de renderizado visual**.

### Backend (Estricto OOP)
- Implementación de la clase universal `HybridDistributionCandidate`.
- En lugar de cruzar dos fórmulas a fuego, la clase **iterará todas las combinaciones con sentido matemático** (ej. Cuerpo de Lognormal/Weibull/Exponencial × Cola de Pareto/Gamma/Exponencial) en tiempo de subida de CSV. El motor se quedará con el *Frankenstein* que devuelva el mejor P-Value global.
- Absolutamente todos los cálculos de Drawdown y Daily Loss se mantendrán en **unidades monetarias puras**, nada de porcentajes estáticos.
- El umbral de activación del modelo Híbrido será configurable (ej. `N ≥ 500` trades). Por debajo de ese umbral, se usa el modelo clásico de distribución simple para evitar overfitting.

### Frontend e Interfaz
- El panel interactivo mostrará en la leyenda el texto del cruce campeón, ej: `🟢 Ajuste Híbrido (Lognormal + Gamma)`.
- La curva dibujada en pantalla estará fusionada, demostrando la deformación de la cola en tiempo real.

---

## Eje 2: El Motor Bayesiano Expandido ("Intervalos de Vida del Edge")

El semáforo vital del sistema dejará la estática atrás para predecir si el bot sobrevivirá mediante cálculo de probabilidades dinámicas.

### Los Actores Matemáticos
- **$A$ (La Hipótesis):** El *Edge* sigue vivo. El robot mantiene una Esperanza Matemática real ($EV > 0$).
- **$B, C, D...$ (Las Evidencias):** El Drawdown monetario actual ($B$), los días de estancamiento ($C$), la racha de pérdidas consecutivas ($D$), etc.

### Preparación para Múltiples Evidencias: $P(A|B, C, ...)$
El código OOP no se cerrará a evaluar sólo el Miedo al Drawdown $P(A|B)$. Se dejará la puerta abierta para el **Naive Bayes Multifactorial**:
> *"¿Cuál es la probabilidad de que el Edge $A$ esté vivo sabiendo que estoy en un Drawdown de \$1,200 ($B$) **Y** que llevo estancado 45 días ($C$) **Y** que vengo de una racha de 8 pérdidas consecutivas ($D$)?"*

### La Verosimilitud: $P(B|A)$
Es exactamente el **Área de Frecuencia Acumulada a la derecha del valor actual** en el gráfico interactivo de distribución. Es la integral de la cola: la probabilidad de sufrir un daño *C* o peor, dado que el bot está sano (Backtest).

### Ciclo Vital de Operaciones (Las 3 Fases del EA)
- **Fase A (Trades de Backtest):** Construyen la verosimilitud de nacimiento ($P(x|A)$). Son los "padres" de la curva y por tanto del $P(B|A)$.
- **Fase B (Live en Drawdown — "Modo Trinchera"):** Operaciones reales que suceden mientras el Equity está por debajo del último *High Water Mark (HWM)*. Generan la Evidencia ($B, C...$) que erosiona o sostiene el *Prior*.
- **Fase C (Live Post-HWM — "Modo Gloria"):** El trade exacto que saca al EA del pozo y crea un nuevo récord histórico. Cierra el ciclo, justifica que el Edge sigue vivo, y **dispara la actualización del Prior** ($P(A) \uparrow$).

### Sistema de Reputación (Aprendizaje del Software)
- Día 1: $P(A) = 0.5$ (Confianza Neutral — "No te conozco").
- Tras 1er DD recuperado: $P(A) = 0.55$.
- Tras 2º DD recuperado: $P(A) = 0.61$.
- Con un $P(A)$ más alto, el radar **es más permisivo** ante baches idénticos. Un bot veterano que ya salió de 20 pozos se ha ganado el derecho a que la alarma no pite tan rápido como un novato en su primera tormenta.

$$P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$$

### La Joya de la Corona: Intervalos de Credibilidad Bayesiana
El fin último no es dar un dolor en %, sino la evaluación del $EV$ (Expected Value).
- IronRisk generará el **Intervalo de Credibilidad al 95%** para la Esperanza Matemática actual del EA, actualizado con la nueva Evidencia de Fase B.
- **El Sentenciador:** Si tras la actualización la banda de confianza se dictamina como `[-0.10, +0.65]`, el valor `0` ha caído dentro del intervalo posible.
- En ese instante la máquina detona la alarma global: *"El Edge es estadísticamente indistinguible del puro azar. El EA ha muerto."*

---

## Eje 3: El "Bayes Sandbox" (Centro de Control Master)

Un Panel de Pruebas secreto exclusivo para el rol Administrador.

### Características del Probador
- **Inputs Manuales al vuelo:** Cajas de texto para trucar en caliente el $P(B, C)$, el Prior $P(A)$, o inyectar un Drawdown Monetario falso para ver cómo reacciona la aguja de $P(A|B)$ en tiempo real.
- **Toggle del Modelo Híbrido (A/B Testing):** Un interruptor para activar/desactivar la Teoría de Valores Extremos. La pantalla dividirá en dos el análisis: Distribución Simple vs Híbrida (Body+Tail), mostrando cómo cambia radicalmente el P-Value y la lectura de Supervivencia.
- **Configuración del Umbral N:** Un slider para decidir a partir de cuántos trades el Motor activa automáticamente el modelo Híbrido.
- **Visualización cruda de los Intervalos de Credibilidad** y su solapamiento crítico con el Cero Absoluto.
- **Separación visual de las 3 Fases:** Que el Sandbox enseñe transparentemente qué datos son de Backtest (A), cuáles son operaciones live en trinchera (B) y cuáles son post-HWM (C).

---

## Inventario de Distribuciones Disponibles (Estado Actual Pre-Fase 6)

### Drawdown y Daily Loss (`drawdown_abs`) — Continuas, $[0, \infty)$
| Distribución | SciPy ID | Firma del EA |
|:---|:---|:---|
| Lognormal | `lognorm` | Estrategias estándar con correcciones asimétricas |
| Weibull | `weibull_min` | Fatiga/Fallo del sistema |
| Gamma | `gamma` | Desangrados lentos o caídas bruscas |
| Pareto (Lomax) | `lomax` | Cisne Negro: latigazos extremos en Scalpers/Grids |
| Half-Normal | `halfnorm` | Pérdidas concentradas cerca del 0 (Scalping conservador) |
| Exponential | `expon` | Pérdidas memoryless (cada dólar adicional igualmente probable) |

### Estancamientos (`stagnation`) — Continuas, $[0, \infty)$
| Distribución | SciPy ID | Firma del EA |
|:---|:---|:---|
| Exponential | `expon` | Espera simple sin memoria |
| Gamma | `gamma` | Esperas con agrupación |
| Weibull | `weibull_min` | Fatiga: cuanto más estancado, más probable el break |
| Wald (Inv-Gaussian) | `invgauss` | Primer paso del Browniano: ¿cuándo llegará al nuevo máximo? |

### Rachas Perdedoras (`consecutive_losses`) — Discretas, $[0, 1, 2...]$
| Distribución | SciPy ID | Firma del EA |
|:---|:---|:---|
| Poisson | `poisson` | Pérdidas raras constantes |
| Binomial Negativa | `nbinom` | Efecto contagio / sobre-dispersión |
| Geométrica | `geom` | Moneda al aire independiente |

---

> **Nota Final:** Este documento debe ser preservado y consultado antes de iniciar cualquier trabajo de la Fase 6. Toda implementación debe respetar OOP estricto y garantizar trazabilidad visual en pantalla de cada cálculo ejecutado.
