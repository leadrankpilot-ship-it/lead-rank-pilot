from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.config import settings


ALLOWED_MAX_RESULTS = (5, 10, 15, 20, 25, 30)
SearchMode = Literal["leads", "contacts", "manual_contacts"]


def _normalize_website_list(raw: list[str], *, max_urls: int) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        text = (item or "").strip()
        if not text:
            continue
        # Allow bare domains
        if not text.startswith(("http://", "https://")):
            text = "https://" + text
        try:
            parsed = urlparse(text)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                continue
            host = parsed.netloc.lower().rstrip(".")
            if " " in host or not ("." in host or host == "localhost"):
                continue
            path = parsed.path or "/"
            key = f"{parsed.scheme}://{host}{path}".rstrip("/").lower()
        except Exception:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(f"{parsed.scheme}://{host}{path if path != '/' else ''}".rstrip("/") or f"{parsed.scheme}://{host}")
        if len(out) >= max_urls:
            break
    return out


class SearchCreate(BaseModel):
    business_type: str = Field(default="", max_length=255)
    location: str = Field(default="", max_length=255)
    max_results: int = Field(default=15)
    mode: SearchMode = "leads"
    websites: list[str] = Field(default_factory=list)
    # Already-seen Maps URLs / phones (saved or prior scrapes) — skip duplicates.
    exclude_urls: list[str] = Field(default_factory=list)
    exclude_phones: list[str] = Field(default_factory=list)

    @field_validator("websites", mode="before")
    @classmethod
    def _coerce_websites(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [line.strip() for line in value.replace(",", "\n").splitlines() if line.strip()]
        if isinstance(value, list):
            return [str(v) for v in value]
        return []

    def normalized_max_results(self) -> int:
        if self.mode == "manual_contacts":
            # For manual jobs, max_results tracks submitted URL count (capped by config).
            return min(len(self.normalized_websites()), settings.manual_contact_url_max)
        if self.max_results in ALLOWED_MAX_RESULTS:
            return self.max_results
        return min(ALLOWED_MAX_RESULTS, key=lambda n: abs(n - self.max_results))

    def normalized_mode(self) -> SearchMode:
        if self.mode == "manual_contacts":
            return "manual_contacts"
        if self.mode == "contacts":
            return "contacts"
        return "leads"

    def normalized_websites(self) -> list[str]:
        return _normalize_website_list(self.websites, max_urls=settings.manual_contact_url_max)

    @model_validator(mode="after")
    def _validate_by_mode(self) -> "SearchCreate":
        mode = self.normalized_mode()
        if mode == "manual_contacts":
            urls = self.normalized_websites()
            if not urls:
                raise ValueError("At least one valid website URL is required")
            if len(self.websites) > settings.manual_contact_url_max:
                # Soft: we truncate, but reject absurd payloads early
                if len(self.websites) > settings.manual_contact_url_max * 2:
                    raise ValueError(
                        f"Too many websites (max {settings.manual_contact_url_max} per job)"
                    )
            return self
        if not (self.business_type or "").strip():
            raise ValueError("business_type is required")
        if not (self.location or "").strip():
            raise ValueError("location is required")
        return self


class SearchRunOut(BaseModel):
    id: int
    input_name: str
    input_location: str
    max_results: int = 15
    mode: str = "leads"
    status: str
    progress_pct: int
    progress_message: str | None
    error_summary: str | None
    result_count: int
    input_url_count: int = 0
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class LeadOut(BaseModel):
    id: int
    search_run_id: int | None = None
    source_listing_url: str
    business_name: str | None
    location: str | None
    category: str | None
    website_url: str | None
    website_status: str
    phone: str | None
    has_whatsapp: bool = False
    email: str | None = None
    contact_page_url: str | None = None
    review_count: int | None = None
    rating: float | None = None
    rank: int | None = None
    score: int | None = None
    score_reasons: dict[str, Any] | None = None
    dedupe_key: str
    last_checked_at: datetime | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class QualifyRequest(BaseModel):
    discover_contacts: bool = True


class ManualLimitsOut(BaseModel):
    max_urls: int
    concurrency: int
