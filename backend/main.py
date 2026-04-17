"""IronRisk V2 — FastAPI Backend Entrypoint."""
# Triggering Uvicorn reload to load .env variables...
import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import asyncio
from datetime import datetime, timezone
from sqlalchemy import select

from models.database import Base, engine, get_settings, SessionLocal
from models.trading_account import TradingAccount
from api.live import dispatch_alerts_background
from api.auth import router as auth_router
from api.strategies import router as strategies_router
from api.live import router as live_router
from api.trading_accounts import router as trading_accounts_router
from api.portfolios import router as portfolios_router
from api.orphans import router as orphans_router
from api.preferences import router as preferences_router
from api.simulate import router as simulate_router
from api.admin import router as admin_router
from api.telegram import router as telegram_router
from api.settings import router as settings_router
from api.vs_mode import router as vs_mode_router
from services.settings_service import init_default_settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ironrisk")

# Create tables (dev only — use Alembic migrations in production)
Base.metadata.create_all(bind=engine)

# ── Auto-migrations (idempotent) ──
from sqlalchemy import inspect as sa_inspect, text as sa_text
_inspector = sa_inspect(engine)
_user_cols = [c["name"] for c in _inspector.get_columns("users")]
if "email_verified" not in _user_cols:
    with engine.connect() as _conn:
        _dialect = engine.dialect.name
        if _dialect == "sqlite":
            _conn.execute(sa_text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 1 NOT NULL"))
        else:
            _conn.execute(sa_text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT TRUE NOT NULL"))
            _conn.execute(sa_text("ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE"))
        _conn.commit()
    logger.info("Migration: added email_verified column to users")

settings = get_settings()

app = FastAPI(
    title="IronRisk V2",
    description="Real-time risk management ecosystem for algorithmic traders",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=False,
)

# CORS — dynamic based on FRONTEND_URL
_cors_origins = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:3001", "http://127.0.0.1:3001",
    "http://localhost:3002", "http://127.0.0.1:3002",
    "https://www.ironrisk.pro", "https://ironrisk.pro",
]
if hasattr(settings, "FRONTEND_URL") and settings.FRONTEND_URL:
    _cors_origins.append(settings.FRONTEND_URL)
if hasattr(settings, "CORS_ORIGINS") and settings.CORS_ORIGINS:
    _cors_origins.extend([o.strip() for o in settings.CORS_ORIGINS.split(",")])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler — ensures CORS headers are sent even on 500 errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    logger.error(f"Unhandled exception on {request.method} {request.url}:")
    logger.error(tb)
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in _cors_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}", "traceback": tb},
        headers=headers,
    )


# Register routers
app.include_router(auth_router)
app.include_router(strategies_router)
app.include_router(live_router)
app.include_router(trading_accounts_router)
app.include_router(portfolios_router)
app.include_router(orphans_router, prefix="/api/orphans", tags=["Orphan Magics"])
app.include_router(preferences_router)
app.include_router(simulate_router)
app.include_router(admin_router)
app.include_router(telegram_router)
app.include_router(settings_router, prefix="/api/settings", tags=["System Settings"])
app.include_router(vs_mode_router)

from api import alerts, metrics_schema, waitlist, installer_telemetry
app.include_router(alerts.router)
app.include_router(metrics_schema.router)
app.include_router(waitlist.router)
app.include_router(installer_telemetry.router)

import os
from datetime import datetime, timezone

_deploy_time = datetime.now(timezone.utc).strftime("%d-%b %H:%M UTC")
_deploy_id = os.environ.get("DEPLOY_ID", "local")
_build_version = f"Build {_deploy_time}"


@app.get("/")
def root():
    return {
        "name": "IronRisk",
        "version": _build_version,
        "deploy": _deploy_id,
        "status": "operational",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "healthy", "version": _build_version}

async def ea_connectivity_watchdog():
    """Periodically checks if any MT5 EA has disconnected (heartbeat staled)."""
    while True:
        await asyncio.sleep(60.0) # Check every 60 seconds
        try:
            with SessionLocal() as db:
                now = datetime.now(timezone.utc)
                # Ensure we only track active accounts
                accounts = db.query(TradingAccount).filter(TradingAccount.is_active == True).all()
                for acc in accounts:
                    if acc.last_heartbeat_at:
                        # SQLite might return a naive datetime depending on driver configurations
                        last_hb = acc.last_heartbeat_at
                        if last_hb.tzinfo is None:
                            last_hb = last_hb.replace(tzinfo=timezone.utc)
                            
                        elapsed_seconds = (now - last_hb).total_seconds()
                        elapsed_minutes = elapsed_seconds / 60.0
                        if elapsed_minutes >= 1: # We dispatch it if it has been away for at least 1 min
                            # The AlertEngine handles cooldowns, so this won't spam!
                            dispatch_alerts_background(
                                user_id=acc.user_id,
                                target_type="account",
                                target_id=acc.id,
                                metrics={"ea_disconnect_minutes": elapsed_minutes}
                            )
        except Exception as e:
            logger.error(f"Heartbeat Watchdog Error: {e}")

from services.telegram_bot import telegram_bot_poller, daily_status_broadcaster

@app.on_event("startup")
async def startup_event():
    with SessionLocal() as db:
        init_default_settings(db)
        
    loop = asyncio.get_running_loop()
    loop.create_task(ea_connectivity_watchdog())
    if settings.ENABLE_TELEGRAM_POLLER:
        loop.create_task(telegram_bot_poller())
        loop.create_task(daily_status_broadcaster())
