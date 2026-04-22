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

## 6. 🧪 MANDATORY: Regression Tests for Bug Fixes

> **THIS IS A HARD RULE. No exceptions. Read carefully.**

When a bug is fixed in this codebase, the fix is meaningless unless it is accompanied by a regression test that **would detect the bug if it reappears**. This is enforced at commit time by the pre-commit hook.

### The Rule
- `tag: "fix"` in `webapp/public/changelog.json` **requires** `"has_regression_test": true` AND a test file in `backend/tests/` that references the fix `id`.
- There is **no `false` option**. If the bug cannot be reproduced by a test (e.g., a pure CSS/layout fix), use `tag: "improvement"` instead of `tag: "fix"`.
- The test file must contain the changelog entry `id` in a comment or assertion so the hook can locate it.

### Workflow for Bug Fixes
1. Reproduce the bug in a test (`backend/tests/test_<area>.py`) — the test **must fail** before the fix.
2. Fix the bug — the test now passes.
3. Add to `webapp/public/changelog.json`:
   ```json
   {
     "id": "my_bug_fix",
     "date": "YYYY-MM-DD",
     "tag": "fix",
     "internal": false,
     "has_regression_test": true
   }
   ```
4. The pre-commit hook verifies `backend/tests/` contains a file referencing `"my_bug_fix"`. If not, the commit is blocked.

### Why This Exists
IronRisk is a risk management tool. A bug that goes undetected twice is a product failure. Regression tests are the only reliable way to guarantee a bug stays fixed across deployments and across AI-assisted development sessions.

**If the pre-commit hook blocks you for a fix without a test, DO NOT change the tag to `improvement` to bypass it. Write the test.**

