from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class AdminStatsOut(BaseModel):
    users_total: int
    users_active: int
    users_inactive: int
    plan_free: int
    plan_starter: int
    plan_pro: int
    mrr_usd: float = 0.0


class AdminFilterOptionsOut(BaseModel):
    years: list[int] = Field(default_factory=list)


class AdminUserOut(BaseModel):
    id: int
    email: str
    role: str
    status: str
    plan_id: str
    billing_status: str
    plan_renews_at: datetime | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class AdminUserUpdate(BaseModel):
    plan_id: Literal["free", "starter", "pro"] | None = None
    billing_status: Literal["none", "active", "past_due", "canceled"] | None = None
    status: Literal["active", "inactive"] | None = None
    role: Literal["user", "admin"] | None = None


class AdminPlanOut(BaseModel):
    id: str
    name: str
    price_usd_month: float
    blog_daily_quota: int
    search_daily_quota: int
    websites_max: int
    description: str = ""


class AdminPlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    price_usd_month: float | None = Field(default=None, ge=0)
    blog_daily_quota: int | None = Field(default=None, ge=0)
    search_daily_quota: int | None = Field(default=None, ge=0)
    websites_max: int | None = Field(default=None, ge=1)
    description: str | None = Field(default=None, max_length=2000)


class AdminRelatedLink(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    url: str = Field(min_length=1, max_length=2000)
    related_post_id: int | None = None


BlogCategorySlug = Literal[
    "lead-generation",
    "contact-discovery",
    "ai-blogging",
    "wordpress-publishing",
    "growth-tips",
]


class AdminBlogOut(BaseModel):
    id: int
    title: str
    slug: str
    excerpt: str
    body: str
    cover_image_url: str
    category: str = "growth-tips"
    published_on: date | None = None
    read_time: str
    related_links: list[AdminRelatedLink] = Field(default_factory=list)
    status: str
    author_user_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AdminBlogCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    slug: str | None = Field(default=None, max_length=500)
    excerpt: str = Field(default="", max_length=2000)
    body: str = Field(default="")
    cover_image_url: str = Field(default="", max_length=2000)
    category: BlogCategorySlug = "growth-tips"
    published_on: date | None = None
    read_time: str = Field(default="5 min", max_length=50)
    related_links: list[AdminRelatedLink] = Field(default_factory=list)
    status: Literal["draft", "published"] = "draft"


class AdminBlogUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    slug: str | None = Field(default=None, max_length=500)
    excerpt: str | None = Field(default=None, max_length=2000)
    body: str | None = None
    cover_image_url: str | None = Field(default=None, max_length=2000)
    category: BlogCategorySlug | None = None
    published_on: date | None = None
    read_time: str | None = Field(default=None, max_length=50)
    related_links: list[AdminRelatedLink] | None = None
    status: Literal["draft", "published"] | None = None
