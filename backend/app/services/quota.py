from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.usage_ledger import UsageLedger
from app.models.user import User
from app.models.website import Website
from app.services.plans import get_plan


def blogs_generated_today(db: Session, user_id: int) -> int:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    total = (
        db.query(func.coalesce(func.sum(UsageLedger.quantity), 0))
        .filter(
            UsageLedger.user_id == user_id,
            UsageLedger.action == "blog_generate",
            UsageLedger.status == "completed",
            UsageLedger.created_at >= start,
            UsageLedger.created_at < end,
        )
        .scalar()
    )
    return int(total or 0)


def blog_quota_for_user(user: User) -> int:
    return get_plan(user.plan_id).blog_daily_quota


def assert_blog_quota(db: Session, user_id: int) -> dict:
    user = db.get(User, user_id)
    limit = blog_quota_for_user(user) if user else get_plan("free").blog_daily_quota
    used = blogs_generated_today(db, user_id)
    if used >= limit:
        raise PermissionError(f"Daily blog quota reached ({used}/{limit})")
    return {"used": used, "limit": limit, "remaining": limit - used}


def website_limit_for_user(user: User | None) -> int:
    plan_cap = get_plan(user.plan_id if user else "free").websites_max
    hard_cap = max(1, int(settings.websites_max_per_user or 3))
    return min(plan_cap, hard_cap)


def websites_owned(db: Session, user_id: int) -> int:
    return int(db.query(func.count(Website.id)).filter(Website.user_id == user_id).scalar() or 0)


def assert_website_quota(db: Session, user_id: int) -> dict:
    user = db.get(User, user_id)
    limit = website_limit_for_user(user)
    used = websites_owned(db, user_id)
    if used >= limit:
        raise PermissionError(f"Website limit reached ({used}/{limit}). You can add up to {limit} sites.")
    return {"used": used, "limit": limit, "remaining": limit - used}
