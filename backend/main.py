"""IronRisk V2 — FastAPI Backend Entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.database import Base, engine, get_settings
from api.auth import router as auth_router
from api.strategies import router as strategies_router
from api.live import router as live_router

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
