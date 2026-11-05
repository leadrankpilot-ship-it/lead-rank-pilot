from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class BlogGenerateRequest(BaseModel):
    website_id: int
    topic: str | None = Field(default=None, max_length=300)
    topic_or_keyword: str | None = Field(default=None, max_length=300)
    category: str = Field(min_length=1, max_length=120)
    nlp_keywords: list[str] = Field(default_factory=list)
    lsi_keywords: list[str] = Field(default_factory=list)
    target_words: int | None = Field(default=None, ge=400, le=2500)

    @model_validator(mode="after")
    def resolve_topic(self) -> "BlogGenerateRequest":
        text = (self.topic_or_keyword or self.topic or "").strip()
        if len(text) < 3:
            raise ValueError("Focus keyword must be at least 3 characters")
        self.topic = text
        self.category = self.category.strip()
        return self
    # Ignored. Format, FAQ, and tables are chosen by the writer.
    related_keywords: list[str] = Field(default_factory=list)
    article_type: str | None = None
    tables: int = Field(default=0, ge=0, le=2)
    include_faq: bool = True
    include_steps: bool = False
    include_code: bool = False


class BlogUpdateRequest(BaseModel):
    title: str | None = None
    slug: str | None = None
    body: str | None = None
    meta_description: str | None = None
    meta_title: str | None = None
    focus_keyword: str | None = None
    featured_image_url: str | None = None


class BlogPostOut(BaseModel):
    id: int
    website_id: int
    topic_id: int | None
    title: str
    slug: str
    body: str
    metadata: dict[str, Any] | None = None
    status: str
    generated_at: datetime | None
    approved_at: datetime | None
    published_at: datetime | None = None
    remote_post_id: str | None = None
    remote_url: str | None = None
    created_at: datetime | None
    error_code: str | None = None

    model_config = {"from_attributes": True}


class PublishRequest(BaseModel):
    status: str = Field(default="draft", pattern="^(draft|publish)$")


class BlogTopicOut(BaseModel):
    id: int
    website_id: int
    topic: str
    normalized_topic: str
    status: str
    created_at: datetime | None

    model_config = {"from_attributes": True}


class QuotaOut(BaseModel):
    used: int
    limit: int
    remaining: int
