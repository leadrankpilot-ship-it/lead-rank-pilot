from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.job import Job
from app.models.user import User
from app.schemas.job import JobCreate, JobOut
from app.services import jobs as job_service

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobAdvanceRequest(BaseModel):
    to_status: str = Field(pattern="^(running|succeeded|failed)$")
    error_summary: str | None = None


@router.get("", response_model=list[JobOut])
def list_jobs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Job]:
    return db.query(Job).filter(Job.user_id == current_user.id).order_by(Job.id.desc()).all()


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    body: JobCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Job:
    try:
        return job_service.create_job(
            db,
            user_id=current_user.id,
            job_type=body.job_type,
            idempotency_key=body.idempotency_key,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Job:
    job = db.get(Job, job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.post("/{job_id}/advance", response_model=JobOut)
def advance_job(
    job_id: int,
    body: JobAdvanceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Job:
    job = db.get(Job, job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    try:
        return job_service.advance_job(db, job, to_status=body.to_status, error_summary=body.error_summary)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
