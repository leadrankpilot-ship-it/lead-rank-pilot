"""DB maintenance helpers (sequence repair after data migrations)."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Tables with integer SERIAL/identity primary keys that we copy with explicit ids.
_SERIAL_TABLES = (
    "users",
    "websites",
    "website_connections",
    "jobs",
    "search_runs",
    "leads",
    "audit_reports",
    "saved_searches",
    "blog_topics",
    "blog_posts",
    "usage_ledger",
)


def sync_id_sequences(db: Session) -> None:
    """Set each table's id sequence to MAX(id) so new inserts don't collide."""
    for table in _SERIAL_TABLES:
        db.execute(
            text(
                f"""
                SELECT setval(
                  pg_get_serial_sequence('public.{table}', 'id'),
                  GREATEST(COALESCE((SELECT MAX(id) FROM {table}), 1), 1)
                )
                """
            )
        )
    db.commit()
    logger.info("id sequences synced for %s tables", len(_SERIAL_TABLES))
