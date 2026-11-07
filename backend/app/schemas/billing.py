from datetime import datetime

from pydantic import BaseModel, Field


class PlanOut(BaseModel):
    id: str
    name: str
    price_usd_month: float
    blog_daily_quota: int
    search_daily_quota: int
    websites_max: int
    description: str
    margin_usd: float | None = None


class CheckoutRequest(BaseModel):
    plan_id: str = Field(pattern="^(starter|pro)$")


class CheckoutOut(BaseModel):
    mode: str
    checkout_url: str
    session_id: str
    plan_id: str


class MockActivateRequest(BaseModel):
    plan_id: str = Field(pattern="^(free|starter|pro)$")
    token: str = ""


class SubscriptionOut(BaseModel):
    plan_id: str
    plan_name: str
    billing_status: str
    billing_mode: str
    price_usd_month: float
    blog_daily_quota: int
    search_daily_quota: int
    websites_max: int
    plan_renews_at: datetime | None = None
    stripe_customer_id: str | None = None
