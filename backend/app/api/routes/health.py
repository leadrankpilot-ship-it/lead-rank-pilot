from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.blog_generation import resolve_blog_provider

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str | bool]:
    db_ok = False
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "leadrankpilot-api",
        "database": "up" if db_ok else "down",
        "billing_mode": settings.billing_mode,
        "blog_mode": settings.blog_generation_mode,
        "blog_ai_provider": resolve_blog_provider(),
        "wordpress_mode": settings.wordpress_mode,
    }
