"""Phase 8 gate: plan caps ladder + paid-plan margins + mock billing activate."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import User
from app.services.billing import apply_plan, create_checkout_session, verify_mock_token
from app.services.plans import get_plan, list_plans, plan_margin_usd, validate_plan_economics
from app.services.quota import blog_quota_for_user


def _ensure_user(db: Session) -> User:
    email = "phase8-gate@leadrankpilot.test"
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(email=email, password_hash=hash_password("gate-test-password-9"))
        db.add(user)
        db.commit()
        db.refresh(user)
    apply_plan(db, user, "free")
    return user


def main() -> None:
    errors = validate_plan_economics()
    if errors:
        raise SystemExit("subscription-gate-fail margins: " + "; ".join(errors))

    plans = {p.id: p for p in list_plans()}
    assert plans["free"].price_usd_month == 0
    assert plan_margin_usd(plans["starter"]) >= settings.min_paid_plan_margin_usd
    assert plan_margin_usd(plans["pro"]) >= settings.min_paid_plan_margin_usd

    db = SessionLocal()
    try:
        user = _ensure_user(db)
        assert blog_quota_for_user(user) == get_plan("free").blog_daily_quota

        checkout = create_checkout_session(user, "starter")
        assert checkout["mode"] == settings.billing_mode or checkout["mode"] == "mock"
        assert "checkout_url" in checkout
        token = checkout["checkout_url"].split("token=")[-1]
        assert verify_mock_token(user.id, "starter", token)

        apply_plan(db, user, "starter", billing_status="active", stripe_subscription_id="sub_gate_test")
        db.refresh(user)
        assert user.plan_id == "starter"
        assert blog_quota_for_user(user) == get_plan("starter").blog_daily_quota
        assert blog_quota_for_user(user) > get_plan("free").blog_daily_quota

        apply_plan(db, user, "pro", billing_status="active")
        db.refresh(user)
        assert blog_quota_for_user(user) == get_plan("pro").blog_daily_quota

        apply_plan(db, user, "free")
        db.refresh(user)
        assert user.billing_status == "none"
        assert user.stripe_subscription_id is None
    finally:
        db.close()

    print(
        "subscription-gate-ok",
        f"starter_margin={plan_margin_usd(plans['starter'])}",
        f"pro_margin={plan_margin_usd(plans['pro'])}",
        f"caps={get_plan('free').blog_daily_quota}<{get_plan('starter').blog_daily_quota}<{get_plan('pro').blog_daily_quota}",
    )


if __name__ == "__main__":
    main()
