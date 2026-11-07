from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.billing import (
    CheckoutOut,
    CheckoutRequest,
    MockActivateRequest,
    PlanOut,
    SubscriptionOut,
)
from app.services.billing import (
    BillingError,
    apply_plan,
    create_checkout_session,
    handle_stripe_webhook,
    verify_mock_token,
)
from app.services.plans import get_plan, list_plans, plan_margin_usd

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=list[PlanOut])
def plans() -> list[PlanOut]:
    out: list[PlanOut] = []
    for p in list_plans():
        margin = plan_margin_usd(p) if p.price_usd_month > 0 else None
        out.append(
            PlanOut(
                id=p.id,
                name=p.name,
                price_usd_month=p.price_usd_month,
                blog_daily_quota=p.blog_daily_quota,
                search_daily_quota=p.search_daily_quota,
                websites_max=p.websites_max,
                description=p.description,
                margin_usd=margin,
            )
        )
    return out


@router.get("/subscription", response_model=SubscriptionOut)
def subscription(current_user: User = Depends(get_current_user)) -> SubscriptionOut:
    plan = get_plan(current_user.plan_id)
    return SubscriptionOut(
        plan_id=plan.id,
        plan_name=plan.name,
        billing_status=current_user.billing_status,
        billing_mode=settings.billing_mode,
        price_usd_month=plan.price_usd_month,
        blog_daily_quota=plan.blog_daily_quota,
        search_daily_quota=plan.search_daily_quota,
        websites_max=plan.websites_max,
        plan_renews_at=current_user.plan_renews_at,
        stripe_customer_id=current_user.stripe_customer_id,
    )


@router.post("/checkout", response_model=CheckoutOut)
def checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
) -> CheckoutOut:
    try:
        data = create_checkout_session(current_user, body.plan_id)
    except BillingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return CheckoutOut(**data)


@router.post("/mock-activate", response_model=SubscriptionOut)
def mock_activate(
    body: MockActivateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubscriptionOut:
    if settings.billing_mode == "live":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Mock activate disabled in live mode")
    if body.plan_id != "free" and not verify_mock_token(current_user.id, body.plan_id, body.token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid mock token")
    apply_plan(
        db,
        current_user,
        body.plan_id,
        billing_status="active" if body.plan_id != "free" else "none",
        stripe_customer_id=current_user.stripe_customer_id or f"cus_mock_{current_user.id}",
        stripe_subscription_id=None if body.plan_id == "free" else f"sub_mock_{current_user.id}_{body.plan_id}",
    )
    return subscription(current_user)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
) -> dict[str, str]:
    payload = await request.body()
    try:
        return handle_stripe_webhook(payload, stripe_signature, db)
    except BillingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
