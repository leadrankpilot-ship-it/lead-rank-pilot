from datetime import datetime
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
    audit_daily_quota: int
    websites_max: int
    description: str = ""


class AdminPlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    price_usd_month: float | None = Field(default=None, ge=0)
    blog_daily_quota: int | None = Field(default=None, ge=0)
    search_daily_quota: int | None = Field(default=None, ge=0)
    audit_daily_quota: int | None = Field(default=None, ge=0)
    websites_max: int | None = Field(default=None, ge=1)
    description: str | None = Field(default=None, max_length=2000)
