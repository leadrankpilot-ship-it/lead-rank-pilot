"""Stripe billing with mock mode (Phase 8)."""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.services.plans import get_plan


class BillingError(Exception):
    pass


def apply_plan(
    db: Session,
    user: User,
    plan_id: str,
    *,
    billing_status: str = "active",
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
    renews_days: int = 30,
) -> User:
    plan = get_plan(plan_id)
    user.plan_id = plan.id
    user.billing_status = billing_status if plan.id != "free" else "none"
    if stripe_customer_id:
        user.stripe_customer_id = stripe_customer_id
    if stripe_subscription_id is not None:
        user.stripe_subscription_id = stripe_subscription_id
    if plan.id == "free":
        user.stripe_subscription_id = None
        user.plan_renews_at = None
        user.billing_status = "none"
    else:
        user.plan_renews_at = datetime.now(UTC) + timedelta(days=renews_days)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_checkout_session(user: User, plan_id: str) -> dict[str, Any]:
    plan = get_plan(plan_id)
    if plan.id == "free":
        raise BillingError("Free plan does not require checkout")

    success = f"{settings.frontend_base_url.rstrip('/')}/billing?checkout=success"
    cancel = f"{settings.frontend_base_url.rstrip('/')}/billing?checkout=cancel"

    if settings.billing_mode != "live":
        qs = urlencode({"plan": plan.id, "uid": user.id, "token": _mock_token(user.id, plan.id)})
        return {
            "mode": "mock",
            "checkout_url": f"{settings.frontend_base_url.rstrip('/')}/billing/mock-confirm?{qs}",
            "session_id": f"mock_cs_{user.id}_{plan.id}",
            "plan_id": plan.id,
        }

    if not settings.stripe_secret_key:
        raise BillingError("STRIPE_SECRET_KEY required when BILLING_MODE=live")
    price = plan.stripe_price_id
    if not price:
        raise BillingError(f"No Stripe price configured for plan {plan.id}")

    data = {
        "mode": "subscription",
        "success_url": success + "&session_id={CHECKOUT_SESSION_ID}",
        "cancel_url": cancel,
        "line_items[0][price]": price,
        "line_items[0][quantity]": "1",
        "client_reference_id": str(user.id),
        "customer_email": user.email,
        "metadata[user_id]": str(user.id),
        "metadata[plan_id]": plan.id,
    }
    with httpx.Client(timeout=30.0) as client:
        res = client.post(
            "https://api.stripe.com/v1/checkout/sessions",
            data=data,
            auth=(settings.stripe_secret_key, ""),
        )
    if res.status_code >= 400:
        raise BillingError(f"Stripe checkout failed: {res.text[:300]}")
    payload = res.json()
    return {
        "mode": "live",
        "checkout_url": payload["url"],
        "session_id": payload["id"],
        "plan_id": plan.id,
    }


def _mock_token(user_id: int, plan_id: str) -> str:
    raw = f"{user_id}:{plan_id}:{settings.jwt_secret}".encode()
    return hashlib.sha256(raw).hexdigest()[:32]


def verify_mock_token(user_id: int, plan_id: str, token: str) -> bool:
    return hmac.compare_digest(_mock_token(user_id, plan_id), token or "")


def handle_stripe_webhook(payload: bytes, signature_header: str | None, db: Session) -> dict[str, str]:
    if settings.billing_mode != "live":
        raise BillingError("Webhooks only accepted when BILLING_MODE=live")
    if not settings.stripe_webhook_secret:
        raise BillingError("STRIPE_WEBHOOK_SECRET required")

    # Lightweight HMAC check (Stripe signed payload). Full Stripe SDK optional later.
    if not signature_header or "t=" not in signature_header or "v1=" not in signature_header:
        raise BillingError("Missing Stripe-Signature")
    parts = dict(p.split("=", 1) for p in signature_header.split(",") if "=" in p)
    timestamp = parts.get("t", "")
    expected = parts.get("v1", "")
    signed = f"{timestamp}.".encode() + payload
    digest = hmac.new(settings.stripe_webhook_secret.encode(), signed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(digest, expected):
        raise BillingError("Invalid webhook signature")

    event = json.loads(payload.decode("utf-8"))
    etype = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}

    if etype == "checkout.session.completed":
        user_id = int(obj.get("client_reference_id") or (obj.get("metadata") or {}).get("user_id") or 0)
        plan_id = (obj.get("metadata") or {}).get("plan_id") or "starter"
        user = db.get(User, user_id)
        if user is None:
            raise BillingError("User not found for checkout session")
        apply_plan(
            db,
            user,
            plan_id,
            billing_status="active",
            stripe_customer_id=obj.get("customer"),
            stripe_subscription_id=obj.get("subscription"),
        )
        return {"handled": etype, "plan_id": plan_id}

    if etype in {"customer.subscription.deleted", "invoice.payment_failed"}:
        sub_id = obj.get("id") if etype.startswith("customer") else obj.get("subscription")
        user = db.query(User).filter(User.stripe_subscription_id == sub_id).first()
        if user:
            apply_plan(db, user, "free", billing_status="canceled" if "deleted" in etype else "past_due")
        return {"handled": etype, "plan_id": "free"}

    return {"handled": "ignored", "type": etype or "unknown"}
