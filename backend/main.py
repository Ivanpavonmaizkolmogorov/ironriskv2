"""IronRisk V2 — FastAPI Backend Entrypoint."""

import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from models.database import Base, engine, get_settings
from api.auth import router as auth_router
from api.strategies import router as strategies_router
from api.live import router as live_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ironrisk")

# Create tables (dev only — use Alembic migrations in production)
Base.metadata.create_all(bind=engine)

settings = get_settings()

app = FastAPI(
    title="IronRisk V2",
    description="Real-time risk management ecosystem for algorithmic traders",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — permissive for development
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler — ensures CORS headers are sent even on 500 errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url}:")
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
    )


# Register routers
app.include_router(auth_router)
app.include_router(strategies_router)
app.include_router(live_router)


@app.get("/")
def root():
    return {
        "name": "IronRisk V2",
        "version": "2.0.0",
        "status": "operational",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}
