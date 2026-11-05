from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, HttpUrl, model_validator


class AuditCreate(BaseModel):
    url: HttpUrl | None = None
    website_id: int | None = None
    lead_id: int | None = None

    @model_validator(mode="after")
    def require_one_target(self) -> "AuditCreate":
        if not self.url and not self.website_id and not self.lead_id:
            raise ValueError("Provide url, website_id, or lead_id")
        return self


class AuditReportOut(BaseModel):
    id: int
    website_id: int | None
    lead_id: int | None
    target_url: str
    status_category: str
    checks: dict[str, Any]
    score: dict[str, Any] | None
    limitations: list[str] | None
    checked_at: datetime | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class SavedSearchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    business_type: str = Field(min_length=1, max_length=255)
    location: str = Field(min_length=1, max_length=255)
    schedule: str = Field(default="manual", max_length=100)
    enabled: bool = True


class SavedSearchOut(BaseModel):
    id: int
    name: str
    filters_json: str
    schedule: str
    enabled: bool
    last_run_at: datetime | None
    created_at: datetime | None

    model_config = {"from_attributes": True}
