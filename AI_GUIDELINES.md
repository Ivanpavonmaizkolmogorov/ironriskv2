# IronRisk V2 - AI Development Guidelines

> **CONTEXT FOR AI AGENTS:** Read these rules carefully before suggesting or writing any code for the IronRisk V2 project. These guidelines ensure architectural consistency across all future chats and developments.

## 1. Frontend Architecture (Next.js 15 App Router)
- **Stack**: Next.js 15, React 19, Tailwind CSS.
- **Routing**: The application uses Next.js App Router inside `webapp/src/app/[locale]/`. 

## 2. 🌍 Internationalization (Strict i18n Rule)
IronRisk is a multi-language application powered by `next-intl`.
- **CRITICAL**: **Never hardcode user-facing strings** (English or Spanish) directly into React components.
- **Workflow**: When adding new text, buttons, titles, or tooltips:
  1. Add the text to `webapp/messages/en.json` and `webapp/messages/es.json`.
  2. In Server Components, fetch with `getMessages()` if necessary, but prefer passing data.
  3. In Client Components, use the hook: `const t = useTranslations('yourNameSpace');` and render `{t('yourKey')}`.

## 3. UI/UX & Styling Guidelines
- **Color Palette**: IronRisk uses a custom dark-mode palette tailormade for financial and "quant" software. Use `bg-surface-primary`, `bg-surface-secondary`, `text-iron-100` to `text-iron-800`.
- **Semantic Colors**: Always use `risk-green` (profits/positive) and `risk-red` (losses/drawdown). 
- **Tooltips & Glossaries**: Risk metrics must always be self-documenting. Use `MetricTooltip` wrappers and central dictionaries for any new metric introduced.

## 4. Backend (FastAPI + Python Data Science)
- **Stack**: Python, FastAPI.
- **Math Engine**: The backend relies heavily on `pandas`, `numpy`, and `scipy.stats` to calculate probability distributions (like Weibull fits for Drawdown). 
- **Performance**: Return JSON payloads efficiently. Only return heavy calculation datasets (like equity curves) when expressly requested by the frontend to not lock the UI.

## 5. Development Philosophy
- **Strict Object-Oriented Design (OOP)**: Favor centralized registries and dictionaries over duplicated hardcoded values. If five components need a "Max Drawdown" definition, they should read it from a single central source.
- **Strict OOP Rules**: 
  - All business logic must reside within classes (`class`). 
  - In Frontend: Use service classes for complex logic, not standalone/anonymous functions. 
  - In Backend: Maintain the existing OOP service pattern. 
  - **Rule**: If a calculation spans more than 10 lines, encapsulate it within a class method.
  - **Rule**: Never use standalone functions for domain logic — always use instantiable or static classes.
- **Non-Intrusive UX**: Tooltips should behave beautifully with dotted underlines instead of giant annoying floating `(i)` icons. 
