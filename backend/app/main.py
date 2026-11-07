import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    admin,
    admin_blogs,
    auth,
    billing,
    blogs,
    connections,
    health,
    jobs,
    leads,
    platform_blogs,
    reference_custom,
    searches,
    websites,
)
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import SessionLocal
from app.db.session import engine
from app.models.platform_blog import PlatformBlog
from app.services.admin_seed import ensure_admin_user
from app.services.db_maintenance import sync_id_sequences
from app.services.image_upload import uploads_root
from app.services.plans import ensure_plan_catalog
from app.services.run_recovery import fail_orphaned_runs

setup_logging()
logger = logging.getLogger(__name__)
logger.info("main module loaded; cors=%s", settings.cors_origin_list)


def _run_startup_jobs() -> None:
    """Seed + sequence repair + clear scrapes killed by the previous process."""
    try:
        # Safe if alembic hasn't run yet on a fresh deploy.
        PlatformBlog.__table__.create(bind=engine, checkfirst=True)
    except Exception:
        logger.exception("platform_blogs table ensure skipped/failed")
    db = SessionLocal()
    try:
        sync_id_sequences(db)
        fail_orphaned_runs(
            db,
            reason="Server restarted during this scrape. Please run the search again.",
        )
        ensure_admin_user(db)
        ensure_plan_catalog(db)
        logger.info("admin/plan seed OK")
    except Exception:
        logger.exception("startup seed skipped/failed")
    finally:
        db.close()


def _run_shutdown_jobs() -> None:
    """Best-effort: mark in-flight scrapes failed before the process exits."""
    db = SessionLocal()
    try:
        fail_orphaned_runs(
            db,
            reason="Server is restarting. Please run the search again.",
        )
    except Exception:
        logger.exception("shutdown recovery skipped/failed")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    uploads_root()
    # Bind/listen first; seed/recovery in background.
    asyncio.create_task(asyncio.to_thread(_run_startup_jobs))
    try:
        yield
    finally:
        # Railway sends SIGTERM on deploy — clear stuck UI states for users.
        await asyncio.to_thread(_run_shutdown_jobs)


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
app.include_router(admin_blogs.router, prefix=settings.api_prefix)
app.include_router(websites.router, prefix=settings.api_prefix)
app.include_router(jobs.router, prefix=settings.api_prefix)
app.include_router(searches.router, prefix=settings.api_prefix)
app.include_router(leads.router, prefix=settings.api_prefix)
app.include_router(blogs.router, prefix=settings.api_prefix)
app.include_router(connections.router, prefix=settings.api_prefix)
app.include_router(billing.router, prefix=settings.api_prefix)
app.include_router(platform_blogs.router, prefix=settings.api_prefix)
app.include_router(reference_custom.router, prefix=settings.api_prefix)
app.mount("/media", StaticFiles(directory=str(uploads_root())), name="media")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "LeadRankPilot API", "docs": "/docs"}
