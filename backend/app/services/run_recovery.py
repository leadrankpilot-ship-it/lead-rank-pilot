"""Recover scrapes left hanging when the API process restarts/deploys."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.job import Job
from app.models.search_run import SearchRun
from app.services import jobs as job_service

logger = logging.getLogger(__name__)

_DEFAULT_MSG = "Server restarted during this scrape. Please run the search again."


def fail_orphaned_runs(db: Session, *, reason: str = _DEFAULT_MSG) -> int:
    """Mark queued/running search runs (and their jobs) as failed.

    In-memory scrape threads die with the process; without this, the UI stays
    stuck at 1% forever after a Railway deploy/restart.
    """
    now = datetime.now(UTC)
    stuck = (
        db.query(SearchRun)
        .filter(SearchRun.status.in_(("queued", "running")))
        .all()
    )
    if not stuck:
        return 0

    count = 0
    for search in stuck:
        search.status = "failed"
        search.error_summary = reason[:2000]
        search.progress_message = "Interrupted — please retry"
        search.completed_at = now
        count += 1

        if not search.job_id:
            continue
        job = db.get(Job, search.job_id)
        if job is None or job.status not in {"queued", "running"}:
            continue
        try:
            if job.status == "queued":
                job_service.advance_job(db, job, to_status="running")
                job = db.get(Job, search.job_id)
            if job and job.status == "running":
                job_service.advance_job(db, job, to_status="failed", error_summary=reason[:2000])
        except Exception:
            logger.exception("Failed to close job %s for search %s", search.job_id, search.id)

    db.commit()
    logger.warning("Marked %s orphaned search run(s) as failed (%s)", count, reason[:80])
    return count
