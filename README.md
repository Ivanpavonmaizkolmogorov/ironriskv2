# IronRisk V2 — Real-Time Risk Management Ecosystem

> *"No es falta de disciplina. Es ceguera probabilística."*

## Architecture

```
┌──────────────┐     CSV Upload      ┌──────────────┐
│   WebApp     │ ──────────────────→ │   Backend    │
│  (Next.js)   │ ←── Metrics JSON ── │  (FastAPI)   │
│  Port 3000   │                     │  Port 8000   │
└──────────────┘                     └──────┬───────┘
                                           │
                                    Heartbeat API
                                    (API Token auth)
                                           │
                                    ┌──────┴───────┐
                                    │   MT4/MT5    │
                                    │  IronRisk EA │
                                    │  (MQL5)      │
                                    └──────────────┘
```

**Closed Circuit:**
1. Trader uploads CSV backtest → Python computes statistical distribution
2. Backend persists metrics snapshot + hard stops in PostgreSQL
3. EA sends live PnL heartbeat → Backend compares against distribution → Returns risk zone
4. EA draws Thermometer/Radar in subwindow — **never touches trades**

## Quick Start

### Backend (Python)
```bash
cd backend
python -m venv venv
venv\Scripts\activate       # Windows
pip install -r requirements.txt
cp .env.example .env        # Edit DB credentials
uvicorn main:app --reload --port 8000
```

### WebApp (Next.js)
```bash
cd webapp
npm install
cp .env.local.example .env.local
npm run dev                  # http://localhost:3000
```

### MetaTrader EA
1. Copy `mql/Include/IronRisk/` to your MT5 `Include/` folder
2. Copy `mql/Experts/IronRisk_EA.mq5` to your MT5 `Experts/` folder
3. Compile in MetaEditor
4. Add `http://localhost:8000` to MT5 → Tools → Options → Expert Advisors → Allow WebRequest
5. Attach EA to any chart, paste your API Token from the WebApp

## Tech Stack

| Layer     | Stack                                          |
|-----------|------------------------------------------------|
| Backend   | Python 3.11+, FastAPI, SQLAlchemy, PostgreSQL  |
| WebApp    | Next.js 15, React 19, TypeScript, TailwindCSS, Zustand, Recharts |
| EA        | MQL5 (MetaTrader 5)                            |

## Folder Structure

```
ironriskv2/
├── backend/          # FastAPI server
│   ├── api/          # Route handlers
│   ├── core/         # RiskEngine + metrics (Strategy Pattern)
│   ├── models/       # SQLAlchemy ORM
│   ├── schemas/      # Pydantic DTOs
│   ├── services/     # Business logic
│   └── tests/        # Unit tests
├── webapp/           # Next.js app
│   └── src/
│       ├── app/          # Pages (App Router)
│       ├── components/   # UI + feature components
│       ├── store/        # Zustand stores
│       ├── services/     # API client
│       └── types/        # TypeScript types
└── mql/              # MetaTrader
    ├── Experts/      # Main EA
    └── Include/IronRisk/
        ├── API/      # HttpClient + JsonParser
        ├── GUI/      # Button bar + event handler
        └── Visuals/  # Thermometer + Radar
```
