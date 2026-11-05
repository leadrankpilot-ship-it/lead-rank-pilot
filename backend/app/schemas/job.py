from datetime import datetime

from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    job_type: str = Field(min_length=2, max_length=100)
    idempotency_key: str = Field(min_length=8, max_length=255)


class JobOut(BaseModel):
    id: int
    job_type: str
    idempotency_key: str
    status: str
    attempts: int
    error_summary: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime | None

    model_config = {"from_attributes": True}
