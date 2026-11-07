"""Ensure platform_blogs columns exist even if Alembic hasn't run on Railway yet."""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text

from app.db.session import engine

logger = logging.getLogger(__name__)


def ensure_platform_blog_columns() -> None:
    insp = inspect(engine)
    if "platform_blogs" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("platform_blogs")}
    if "category" in cols:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE platform_blogs "
                "ADD COLUMN category VARCHAR(80) NOT NULL DEFAULT 'growth-tips'"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_platform_blogs_category "
                "ON platform_blogs (category)"
            )
        )
    logger.info("platform_blogs.category column added")
