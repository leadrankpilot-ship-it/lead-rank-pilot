from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    admin,
    audits,
    auth,
    billing,
    blogs,
    connections,
    health,
    jobs,
    leads,
    reference_custom,
    saved_searches,
    searches,
    websites,
)
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import SessionLocal
from app.services.admin_seed import ensure_admin_user
from app.services.image_upload import uploads_root
from app.services.plans import ensure_plan_catalog

setup_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Schema is managed by Alembic migrations (see backend/alembic)
    uploads_root()
    db = SessionLocal()
    try:
        ensure_admin_user(db)
        ensure_plan_catalog(db)
    except Exception:
        # Don't block API boot if seed fails (e.g. DB briefly unavailable).
        pass
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(admin.router, prefix=settings.api_prefix)
app.include_router(websites.router, prefix=settings.api_prefix)
app.include_router(jobs.router, prefix=settings.api_prefix)
app.include_router(searches.router, prefix=settings.api_prefix)
app.include_router(leads.router, prefix=settings.api_prefix)
app.include_router(audits.router, prefix=settings.api_prefix)
app.include_router(saved_searches.router, prefix=settings.api_prefix)
app.include_router(blogs.router, prefix=settings.api_prefix)
app.include_router(connections.router, prefix=settings.api_prefix)
app.include_router(billing.router, prefix=settings.api_prefix)
app.include_router(reference_custom.router, prefix=settings.api_prefix)
app.mount("/media", StaticFiles(directory=str(uploads_root())), name="media")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "LeadRankPilot API", "docs": "/docs"}
