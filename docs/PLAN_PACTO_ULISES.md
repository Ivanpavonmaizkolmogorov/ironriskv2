# ⚖️ Plan del Pacto de Ulises — Guía de Implementación UX/Marketing

> **Fecha de creación:** 8 de Abril de 2026
> **Última actualización:** 8 de Abril de 2026
> **Estado:** Implementación Completada (Pasos 1-5) ✅
> **Autor del diseño:** Conversación `46420265` (análisis UX experto)

---

## Contexto del Proyecto

IronRisk es una plataforma de control de riesgo probabilístico para traders algorítmicos. El **Pacto de Ulises** es el concepto central del producto: el trader define sus límites de riesgo "en frío" (sin presión emocional), y el sistema los vigila en tiempo real con un doble mecanismo:

1. **Motor Bayesiano (automático):** Alerta en 🟡 P≥85 y 🔴 P≥95 según la distribución del backtest
2. **Muro Físico (manual):** Si el valor real cruza el límite que el *trader* definió → 🚫 PACTO ROTO

### El Problema Actual

La narrativa emocional de la landing ("Átate al mástil") se **evapora** cuando el usuario llega al simulador. A partir de ahí solo ve números sin alma. El concepto que debería ser el corazón del producto queda reducido a un tooltip de 10px que nadie lee.

### La Solución: "Rampa de Consciencia"

```
Landing:     100% Emoción → 0% Técnica    (ENGANCHAR)
Simulador:    60% Emoción → 40% Técnica   (CONTEXTUALIZAR)
Dashboard:    20% Emoción → 80% Técnica   (OPERAR)
```

Combinar Storytelling + Progressive Disclosure + Autoridad Científica en orden secuencial descendente de emoción y ascendente de rigor técnico.

---

## 🔧 Principio de Ingeniería: Programación Orientada a Objetos (OOP)

> [!IMPORTANT]
> **TODA la implementación de este plan DEBE seguir principios de Programación Orientada a Objetos (OOP).** Esto aplica tanto a los componentes React como a los datos y la lógica.

### Reglas OOP Obligatorias

1. **Registries para configuración extensible:** Si necesitas un listado de campos/variables (ej. las 5 métricas de riesgo), modela cada variable como un objeto con contrato definido (interface/type). Usa un array-registry, nunca switch-case ni if-chains.

2. **Interfaces tipadas para cada componente nuevo:** Todo componente nuevo (`UlyssesMoment`, `PactBanner`, `RiskAccordion`) define su propia interface de props. Cero `any`, cero props implícitas.

3. **Datos como clases/objetos con métodos:** Si un bloque de datos necesita formateo, cálculo o decisión lógica, encapsúlalo. Ejemplo: un `RiskMetricDescriptor` que sabe formatearse, generar su pregunta psicológica y calcular su relación muro-vs-percentil.

4. **Composición sobre repetición:** Si dos componentes comparten lógica de visualización de métricas (ej. el Risk Panel del simulador y el EditStrategyModal), extraer esa lógica a un hook o clase compartida, no copypastear.

5. **Single Responsibility:** Cada componente hace UNA cosa. `UlyssesMoment` = narrativa emocional. `PactBanner` = call-to-action. `RiskAccordion` = educación contextual. No mezclar responsabilidades.

### Ejemplo de patrón OOP a aplicar

```typescript
// Esto es el TIPO de patrón que se espera en toda la implementación.
// Cada métrica es un objeto registrado con todo lo que necesita.

interface RiskMetricDescriptor {
  key: string;
  labelKey: string;           // clave i18n
  icon: string;
  unit: '$' | 'days' | 'trades' | '';
  questionKey: string;        // clave i18n para la pregunta psicológica
  educationKey: string;       // clave i18n para la explicación del accordion
  extractHistoricalMax: (suggestions: RiskSuggestions) => number | undefined;
}

const RISK_METRIC_REGISTRY: RiskMetricDescriptor[] = [
  {
    key: 'max_drawdown',
    labelKey: 'metrics.max_drawdown.label',
    icon: '📉',
    unit: '$',
    questionKey: 'riskQuestions.max_drawdown',
    educationKey: 'pactEducation.max_drawdown_desc',
    extractHistoricalMax: (s) => s?.max_drawdown?.historical_max,
  },
  // ... etc.
];
```

> Los componentes consumen este registry en lugar de hardcodear cada caso. Añadir una nueva métrica mañana = añadir un objeto al array.

---

## Arquitectura de Archivos Relevantes

```
webapp/src/
├── components/features/
│   ├── simulate/
│   │   ├── SimulatorWizard.tsx          ← Pasos 2 y 3 (Momento Ulises + subtexto)
│   │   ├── SimulateCharts.tsx           ← Charts de resultados
│   │   └── UlyssesMoment.tsx            ← [NUEVO] Paso 2
│   ├── EditStrategyModal.tsx            ← Paso 5 (Accordion educativo) + Paso 1 (tooltip)
│   ├── PactBanner.tsx                   ← [NUEVO] Paso 4
│   └── StrategyCard.tsx                 ← Integración del banner
├── store/
│   ├── useSimulatorStore.ts             ← Estado del simulador
│   └── useOnboardingStore.ts            ← "Backpack" con risk_config del simulador
├── utils/
│   ├── VerdictConfig.ts                 ← Colores y labels por percentil
│   └── MetricFormatter.ts              ← Formateo de métricas ($, days, etc.)
└── ...

webapp/messages/
├── es.json                              ← Todas las traducciones nuevas
└── en.json                              ← Ídem en inglés
```

---

## Resumen Ejecutivo de los 5 Pasos

| Paso | Nombre | Dónde | Esfuerzo | Prioridad |
|------|--------|-------|----------|-----------|
| **1** | Tooltip del Pacto (Quick Win) | `EditStrategyModal.tsx` + traducciones | ~15min | ✅ |
| **2** | "El Momento Ulises" Post-Simulación | `SimulatorWizard.tsx` + nuevo componente | ~2h | ✅ |
| **3** | Subtexto Contextual en Risk Panel | `SimulatorWizard.tsx` | ~1h | ✅ |
| **4** | Banner Onboarding en Dashboard | Nuevo `PactBanner.tsx` + page.tsx | ~1.5h | ✅ |
| **5** | Accordion Educativo en Modal | `EditStrategyModal.tsx` | ~2h | ✅ |

**Total estimado: ~7 horas de implementación.**

Para ejecutar, el usuario dirá: **"haz el Paso X"** o **"continúa con el Paso X del Pacto de Ulises"**.

---

## ━━━ PASO 1: Tooltip del Pacto (Quick Win) ━━━

**Prioridad:** P0 — Hacer primero
**Esfuerzo estimado:** ~15min
**Impacto:** Mejora inmediata en comprensión del concepto

### ¿Qué hacer?

Actualizar el texto del tooltip del título "⚖️ PACTO DE ULISES" en `EditStrategyModal.tsx` y convertirlo en un popover clicable más grande.

### Archivos a Modificar

- `webapp/messages/es.json` → clave `pactoUlisesModal.tooltip` (línea 512)
- `webapp/messages/en.json` → clave `pactoUlisesModal.tooltip`
- `webapp/src/components/features/EditStrategyModal.tsx` → líneas 285-290 (tooltip HTML)

### Texto Actual (ES)
```
"Tu yo racional decide ahora, en frío, los muros de riesgo que jamás cruzarás. 
El sistema vigila con doble arbitraje: (1) el Motor Bayesiano alerta 
automáticamente cuando una métrica entra en zona inusual (🟡 P≥85) o anómala 
(🔴 P≥95) según la distribución de tu backtest; (2) si el valor real supera 
tu muro físico, se declara PACTO ROTO (🚫) — una alarma inapelable que 
sobreescribe todo veredicto estadístico."
```

### Nuevo Texto (ES)
```
"El Pacto de Ulises es tu cortafuegos personal contra el tilt. Aquí defines 
el máximo dolor que estás dispuesto a tolerar — basándote en lo que tu 
backtest ya vivió. El sistema trabaja con doble protección:

1️⃣ Bayes vigila automáticamente — si una métrica entra en zona inusual 
(🟡 P≥85) o anómala (🔴 P≥95), te alerta basándose en la estadística de 
tu historial.

2️⃣ Tu muro es inapelable — si el valor real cruza el límite que TÚ pusiste, 
se declara 🚫 PACTO ROTO, sin importar lo que diga la estadística.

Configúralo en frío. Cuando el mercado apriete, agradecerás haberte atado 
al mástil."
```

### Nuevo Texto (EN)
```
"The Ulysses Pact is your personal firewall against tilt. Here you define 
the maximum pain you're willing to tolerate — based on what your backtest 
already lived through. The system works with dual protection:

1️⃣ Bayes watches automatically — if a metric enters unusual territory 
(🟡 P≥85) or anomaly (🔴 P≥95), it alerts you based on your historical 
distribution.

2️⃣ Your wall is absolute — if the real value crosses the limit YOU set, 
🚫 PACT BROKEN is declared, regardless of what the statistics say.

Configure it cold. When the market squeezes, you'll be glad you tied 
yourself to the mast."
```

### Cambio en el Componente

El tooltip actual es un `div` hover de `w-64` a `text-[10px]`. Es demasiado pequeño para este texto mejorado.

**Implementación OOP:** Crear un componente reutilizable `InfoPopover` que encapsule la lógica de click-to-toggle. Recibirá:
```typescript
interface InfoPopoverProps {
  contentKey: string;   // clave i18n
  width?: string;       // default 'w-80'
  position?: 'top' | 'bottom';
}
```

**Opción recomendada:** Convertir de tooltip hover a **popover clicable** con un ancho de `w-80` (320px) y padding generoso. El ℹ️ pasa de hover a click.

### Criterios de Aceptación
- [ ] Texto actualizado en `es.json` y `en.json`
- [ ] Tooltip convertido a popover clicable (componente OOP reutilizable)
- [ ] El texto nuevo es legible y no se corta
- [ ] El popover se cierra al hacer click fuera

---

## ━━━ PASO 2: "El Momento Ulises" — Post-Simulación ━━━

**Prioridad:** P0 — CRÍTICO
**Esfuerzo estimado:** ~2h
**Impacto:** El puente narrativo que falta entre la landing y la mecánica

### ¿Qué hacer?

Insertar un componente educativo-emocional en `SimulatorWizard.tsx` **DESPUÉS** de ver los charts (`<SimulateCharts />` línea ~510) y **ANTES** del Risk Panel (`id="risk-panel-container"` línea ~527).

### Diseño del Componente

```
┌─────────────────────────────────────────────────────────────┐
│  ⚖️  Ahora estás decidiendo en frío.                       │
│                                                             │
│  Tu backtest acaba de revelarte el peor escenario que tu    │
│  sistema ha vivido. Lo que vas a hacer ahora es lo que      │
│  Ulises hizo antes de navegar junto a las sirenas:          │
│                                                             │
│  Definir tus límites ANTES de que el mercado te ponga       │
│  bajo presión. Estos números serán tu mástil.               │
│                                                             │
│  📉 Tu peor DD fue $12,237 → ¿Cuánto toleras realmente?   │
│  📅 Tu peor día fue -$2,102 → ¿Cuánto aguantas sin tilt?  │
│  🔴 10 losses seguidas → ¿Cuántas antes de dudar?          │
│                                                             │
│  ❄️ Este es tu momento de lucidez. Úsalo bien.             │
│                                                             │
│  ─── ▼ Configura tus muros abajo ▼ ──────────────────────  │
└─────────────────────────────────────────────────────────────┘
```

### Implementación Técnica (OOP)

1. **Crear componente** `UlyssesMoment.tsx` en `components/features/simulate/`
   - Clase/interface para las props:
     ```typescript
     interface UlyssesMomentProps {
       riskSuggestions: RiskSuggestions;
       locale: string;
     }
     ```
   - Internamente usa el `RISK_METRIC_REGISTRY` (patrón OOP descrito arriba) para iterar las métricas y generar las preguntas dinámicamente
   - NO hardcodea qué métricas mostrar. Si mañana se añade una 6ª métrica al registry, aparece automáticamente

2. **Datos dinámicos — cada métrica sabe extraer su dato:**
   ```typescript
   // El registry contiene un método extractHistoricalMax por métrica
   RISK_METRIC_REGISTRY.forEach(metric => {
     const value = metric.extractHistoricalMax(riskSuggestions);
     if (value && value > 0) {
       // renderizar línea: `${metric.icon} Tu peor ${t(metric.questionKey, { value })}`
     }
   });
   ```
   - Si algún valor es 0 o undefined, omitir esa línea (datos manuales no tienen DD)

3. **Insertar en SimulatorWizard.tsx:**
   - Ubicación: entre `<SimulateCharts data={result} />` (línea 510) y el risk panel `{hasRiskData && ...}` (línea 513)
   - Condición de visibilidad: solo cuando `hasRiskData === true`

4. **Traducciones:**
   - Añadir claves en `es.json` y `en.json` bajo namespace `ulyssesMoment`
   - Claves: `title`, `desc`, `ddQuestion`, `dailyQuestion`, `consecQuestion`, `stagDaysQuestion`, `stagTradesQuestion`, `coldMoment`, `configBelow`

5. **Estilo:**
   - Borde amber/dorado: `border border-amber-500/30 bg-amber-500/5`
   - Animación de entrada suave: `animate-in fade-in slide-in-from-bottom-4 duration-500`
   - Icono ⚖️ como header visual

### Criterios de Aceptación
- [ ] El bloque aparece solo después de que existen resultados + risk data
- [ ] Muestra datos REALES del usuario (no hardcoded), usando el registry OOP
- [ ] Si una métrica no tiene valor (datos manuales), la línea se omite
- [ ] Traducciones en ES y EN
- [ ] Animación de entrada coherente con el resto del simulador
- [ ] Responsive: se adapta a móvil sin overflow

---

## ━━━ PASO 3: Subtexto Contextual en el Risk Panel ━━━

**Prioridad:** P1
**Esfuerzo estimado:** ~1h
**Impacto:** Convierte números fríos en preguntas personales

### ¿Qué hacer?

En el Risk Panel del simulador (`SimulatorWizard.tsx`, el grid de 5 columnas, líneas ~559-595), añadir debajo de cada valor editable un subtexto que traduzca el número a una pregunta psicológica.

### Diseño

Debajo de cada `<span>` con el valor formateado, añadir:
```
📉 Max DD:  $12,237.28
   └── "Tu sistema sobrevivió a esto. ¿Estás dispuesto a ver más?"
   
📅 Daily Loss:  $2,102.22
   └── "El peor día. ¿Puedes con eso sin tocar nada?"
   
🔴 Consec.:  10
   └── "10 rojas seguidas. ¿Tu psicología aguanta sin intervenir?"

⏸️ Stag.T:  64
   └── "64 trades sin nuevo máximo. ¿Paciencia o pánico?"

📆 Stag.D:  573
   └── "573 días estancado. ¿Puedes esperar tanto?"
```

### Implementación Técnica (OOP)

1. **Extender el RISK_METRIC_REGISTRY** (o el `RISK_FIELDS` existente en SimulatorWizard):
   - Añadir `questionKey: string` a cada field del registry
   - El componente itera el registry y renderiza `t(field.questionKey, { value })` debajo de cada valor

2. **NO crear subtextos hardcoded.** El subtexto sale de la traducción interpolada:
   ```json
   "riskQuestions": {
     "max_drawdown": "Tu sistema sobrevivió a ${value}. ¿Estás dispuesto a ver más?",
     "daily_loss": "El peor día fue ${value}. ¿Puedes con eso sin tocar nada?"
   }
   ```

3. **Estilo:** `text-[9px] text-iron-500 italic text-center mt-1`

### Criterios de Aceptación
- [ ] Cada métrica tiene un subtexto contextual, generado desde el registry OOP
- [ ] El subtexto es dinámico (referencia el valor real formateado)
- [ ] No rompe el layout del grid en 5 columnas
- [ ] Traducciones ES y EN

---

## ━━━ PASO 4: Banner Onboarding en el Dashboard ━━━

**Prioridad:** P1
**Esfuerzo estimado:** ~1.5h
**Impacto:** Guía al usuario a configurar el Pacto tras el onboarding

### ¿Qué hacer?

Cuando el usuario tiene una estrategia con `risk_config` vacío o con todos los `enabled: false`, mostrar un banner persistente en la vista del dashboard que le incite a configurar su Pacto.

### Diseño

```
┌─────────────────────────────────────────────────────────────┐
│  ⚖️ Tu estrategia opera sin escudo.                        │
│                                                             │
│  El Motor Bayesiano está calculando tu riesgo en tiempo     │
│  real, pero no has definido tus muros personales.           │
│  Sin Pacto de Ulises, el sistema avisa pero no tiene        │
│  contra qué comparar TU tolerancia.                         │
│                                                             │
│  [Configurar mi Pacto ⚖️]         [Lo haré después]        │
└─────────────────────────────────────────────────────────────┘
```

### Implementación Técnica (OOP)

1. **Crear componente** `PactBanner.tsx` en `components/features/`
   ```typescript
   interface PactBannerProps {
     strategyId: string;
     strategyName: string;
     onConfigurePact: () => void;  // abre EditStrategyModal
   }
   ```
   - Encapsula TODA la lógica de visibilidad internamente (no la delega al padre)
   - Método estático o helper `PactBanner.shouldShow(riskConfig)` que evalúa si mostrar:
     - `risk_config` es null, vacío, o todos `enabled: false`
   - Internamente consulta y escribe `localStorage`

2. **Lógica de visibilidad:**
   - dismiss → `localStorage.setItem(`pact_banner_dismissed_${strategyId}`, 'true')`
   - Reaparece si: (a) se borra localStorage, o (b) el usuario desactiva TODAS las variables manualmente

3. **Integrar en la página del dashboard:**
   - Archivo: `webapp/src/app/[locale]/dashboard/account/[id]/page.tsx`
   - Ubicación: justo antes del listado de StrategyCards
   - Solo para la PRIMERA estrategia sin risk_config (no spammear banners)

4. **Traducciones:** Namespace `pactBanner`
   - Claves: `title`, `desc`, `btnConfigure`, `btnLater`

### Criterios de Aceptación
- [ ] Componente autónomo OOP (toda lógica encapsulada, incluido localStorage)
- [ ] Banner aparece solo cuando risk_config está vacío / todo disabled
- [ ] Botón "Configurar" abre EditStrategyModal directamente
- [ ] Botón "Después" guarda dismiss en localStorage
- [ ] No reaparece tras dismiss (hasta que se cumplan condiciones de re-aparición)
- [ ] Traducciones ES y EN

---

## ━━━ PASO 5: Accordion Educativo en EditStrategyModal ━━━

**Prioridad:** P2
**Esfuerzo estimado:** ~2h
**Impacto:** Hace comprensible el mecanismo del doble arbitraje sin documentación

### ¿Qué hacer?

En cada card de variable de riesgo dentro del `EditStrategyModal.tsx`, añadir un accordion/expandible "¿Qué es esto?" que explica:
- Qué mide la variable
- Qué significa el valor del backtest
- Cómo interactúa el muro del usuario con Bayes (P85/P95)

### Diseño por Variable

```
┌─ Max Drawdown ──────────────────────────────────────────┐
│ ☑ Activado                       P73  |  73% | $8,900  │
│                                                          │
│ ▼ ¿Qué es esto?                                        │
│ ┌──────────────────────────────────────────────────────┐│
│ │ El Drawdown es cuánto cae tu capital desde el pico  ││
│ │ más alto. Tu peor caso histórico fue $12,237.        ││
│ │                                                      ││
│ │ Si pones el muro al 73% ($8,900):                   ││
│ │ → Bayes avisará 🟡 al llegar a ~P85 del historial   ││
│ │ → Bayes avisará 🔴 al llegar a ~P95 del historial   ││
│ │ → Tu muro se rompe a $8,900 → 🚫 PACTO ROTO        ││
│ │                                                      ││
│ │ ⚡ El muro está ANTES de la anomalía → tu Pacto     ││
│ │ actúa como red de seguridad ADICIONAL.               ││
│ └──────────────────────────────────────────────────────┘│
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ (slider)                   │
│ Máx Histórico: $12,237.28                               │
└──────────────────────────────────────────────────────────┘
```

### Implementación Técnica (OOP)

1. **Crear componente** `RiskAccordion.tsx` en `components/features/` (o `components/ui/`)
   ```typescript
   interface RiskAccordionProps {
     metricKey: string;
     rawValue: number;
     refValue: number;
     empiricalPercentiles?: number[];
     isExpanded: boolean;
     onToggle: () => void;
   }
   ```
   - Encapsula TODA la lógica de cálculo de relación muro-vs-percentil
   - Tiene un método interno `computeWallPosition()` que decide:
     - Si `rawValue < P95_value`: "Tu muro actúa como red de seguridad adicional ✅"
     - Si `rawValue > P95_value`: "Tu muro es más tolerante que la anomalía — Bayes avisará primero ⚠️"
   - Calcula P85 y P95 desde `empiricalPercentiles[85]` y `empiricalPercentiles[95]`

2. **Integrar en EditStrategyModal.tsx:**
   - Añadir estado `expandedHelp: string | null` para saber qué card tiene el accordion abierto
   - En cada card del map de `RISK_VARIABLES` (líneas 293-431), insertar `<RiskAccordion />` 
   - Solo un accordion abierto a la vez (al abrir uno se cierra el anterior)

3. **Traducciones:** Namespace `pactEducation`
   - Claves por métrica: `max_drawdown_desc`, `daily_loss_desc`, `consecutive_losses_desc`, `stagnation_days_desc`, `stagnation_trades_desc`
   - Claves genéricas: `whatIsThis`, `wallBefore`, `wallAfter`

4. **Estilo:**
   - Accordion con `transition-all duration-300 overflow-hidden`
   - max-height trick para animación suave
   - Fondo: `bg-iron-900/50`
   - Tipografía: `text-[11px] text-iron-300 leading-relaxed`

### Criterios de Aceptación
- [ ] Componente `RiskAccordion` autónomo y reutilizable (OOP)
- [ ] Cada variable tiene un toggle "¿Qué es esto?"
- [ ] Solo un accordion abierto a la vez
- [ ] Contenido dinámico (valores reales del usuario, no genéricos)
- [ ] Muestra relación muro vs P85/P95 correctamente
- [ ] Animación suave de apertura/cierre
- [ ] No rompe el layout de 2 columnas del grid
- [ ] Traducciones ES y EN

---

## Notas para Sesiones Futuras

> **Para retomar este plan:** Lee este archivo (`docs/PLAN_PACTO_ULISES.md`). El usuario dirá **"haz el Paso X del Pacto de Ulises"** y podrás empezar directamente con la sección correspondiente.

> **Principio rector ("Rampa de Consciencia"):** La emoción se dosifica gradualmente. Landing = 100% emoción. Simulador = 60/40. Dashboard = 20/80. Nunca desaparece del todo.

> **Principio de ingeniería: OOP obligatorio.** Todo componente nuevo es un módulo autónomo con interface tipada. La lógica se encapsula donde corresponde. Los registries permiten extensibilidad sin modificar código existente.

> **Decisiones ya tomadas:**
> - Accordion inline en modal (NO wizard paso a paso)
> - Textos iterables (se ajustarán tras probar en producción)
> - Banner dismissable con localStorage (no con backend)
> - Datos siempre DINÁMICOS del usuario, nunca hardcoded
> - OOP con registries extensibles para métricas de riesgo

> **Stack técnico:** Next.js 14 + next-intl + TypeScript + CSS variables (tema custom). Traducciones en `webapp/messages/{locale}.json`.
