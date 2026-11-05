from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, HttpUrl, field_validator


def normalize_website_url(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        raise ValueError("Website URL is required")
    if "://" not in raw:
        raw = f"https://{raw}"
    return raw.rstrip("/")


class WebsiteCreate(BaseModel):
    base_url: HttpUrl
    ownership_confirmed: bool = False

    @field_validator("base_url", mode="before")
    @classmethod
    def accept_bare_domain(cls, value: Any) -> Any:
        if isinstance(value, str):
            return normalize_website_url(value)
        return value


class WebsiteOut(BaseModel):
    id: int
    base_url: str
    normalized_domain: str
    ownership_confirmed_at: datetime | None
    profile_confirmed_at: datetime | None = None
    business_profile: dict[str, Any] | None = None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class SiteCategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=240)


class WebsiteProfileUpdate(BaseModel):
    """Full site profile used to engineer the AI blog-writer prompt."""

    # Identity
    business_name: str | None = None
    tagline: str | None = None
    niche: str | None = None
    about_summary: str | None = None
    products_services: list[str] = Field(default_factory=list)
    service_areas: list[str] = Field(default_factory=list)
    audience: str | None = None

    # Brand voice / writing craft
    brand_voice: str | None = None
    tone: str | None = None
    writing_style: str | None = None
    author_persona: str | None = None
    language: str | None = "en"

    # SEO / content strategy
    content_mode: str | None = Field(
        default="niche_blog",
        description="niche_blog | journal",
    )
    publish_category: str | None = Field(
        default=None,
        description="Legacy single destination. Prefer site_categories.",
        max_length=120,
    )
    categories: list[str] = Field(default_factory=list)
    site_categories: list[SiteCategoryIn] = Field(default_factory=list)
    content_pillars: list[str] = Field(default_factory=list)
    primary_keywords: list[str] = Field(default_factory=list)
    secondary_keywords: list[str] = Field(default_factory=list)
    preferred_terms: list[str] = Field(default_factory=list)
    words_to_avoid: list[str] = Field(default_factory=list)
    banned_claims: list[str] = Field(default_factory=list)

    # Conversion
    unique_selling_points: list[str] = Field(default_factory=list)
    cta_style: str | None = None
    preferred_cta: str | None = None

    # History / differentiation
    existing_blog_titles: list[str] = Field(default_factory=list)
    competitors_note: str | None = None

    # Optional freeform overrides
    extra_guidelines: str | None = None

    confirm: bool = True


class WriterPromptOut(BaseModel):
    website_id: int
    system_prompt: str
    profile_confirmed: bool
    profile: dict[str, Any] | None = None
