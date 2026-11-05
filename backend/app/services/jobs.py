from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.job import Job

ALLOWED_TRANSITIONS = {
    "queued": {"running", "failed"},
    "running": {"succeeded", "failed"},
}


def create_job(db: Session, *, user_id: int, job_type: str, idempotency_key: str) -> Job:
    existing = db.query(Job).filter(Job.idempotency_key == idempotency_key).first()
    if existing:
        if existing.user_id != user_id:
            raise PermissionError("Idempotency key belongs to another user")
        return existing

    job = Job(
        user_id=user_id,
        job_type=job_type,
        idempotency_key=idempotency_key,
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def advance_job(db: Session, job: Job, *, to_status: str, error_summary: str | None = None) -> Job:
    allowed = ALLOWED_TRANSITIONS.get(job.status, set())
    if to_status not in allowed:
        raise ValueError(f"Cannot move job from {job.status} to {to_status}")

    now = datetime.now(UTC)
    job.status = to_status
    if to_status == "running":
        job.started_at = now
        job.attempts += 1
    if to_status in {"succeeded", "failed"}:
        job.finished_at = now
        job.error_summary = error_summary
    db.commit()
    db.refresh(job)
    return job
