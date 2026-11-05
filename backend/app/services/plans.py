"""Plan catalog and margin helpers (Phase 8)."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.plan_catalog import PlanCatalog


@dataclass(frozen=True)
class Plan:
    id: str
    name: str
    price_usd_month: float
    blog_daily_quota: int
    search_daily_quota: int
    audit_daily_quota: int
    websites_max: int
    estimated_variable_cost_usd: float
    stripe_price_id: str = ""
    description: str = ""


_cache: dict[str, Plan] | None = None


def _default_catalog() -> dict[str, Plan]:
    return {
        "free": Plan(
            id="free",
            name="Free",
            price_usd_month=0.0,
            blog_daily_quota=settings.blog_daily_quota_free,
            search_daily_quota=3,
            audit_daily_quota=5,
            websites_max=3,
            estimated_variable_cost_usd=0.5,
            description="Try lead search, audits, and limited AI drafts.",
        ),
        "starter": Plan(
            id="starter",
            name="Starter",
            price_usd_month=29.0,
            blog_daily_quota=settings.blog_daily_quota_starter,
            search_daily_quota=20,
            audit_daily_quota=30,
            websites_max=5,
            estimated_variable_cost_usd=settings.plan_starter_variable_cost_usd,
            stripe_price_id=settings.stripe_price_starter,
            description="For solo operators publishing weekly.",
        ),
        "pro": Plan(
            id="pro",
            name="Pro",
            price_usd_month=79.0,
            blog_daily_quota=settings.blog_daily_quota_pro,
            search_daily_quota=100,
            audit_daily_quota=100,
            websites_max=15,
            estimated_variable_cost_usd=settings.plan_pro_variable_cost_usd,
            stripe_price_id=settings.stripe_price_pro,
            description="Agencies and multi-site publishers.",
        ),
    }


def _row_to_plan(row: PlanCatalog) -> Plan:
    return Plan(
        id=row.id,
        name=row.name,
        price_usd_month=float(row.price_usd_month),
        blog_daily_quota=int(row.blog_daily_quota),
        search_daily_quota=int(row.search_daily_quota),
        audit_daily_quota=int(row.audit_daily_quota),
        websites_max=int(row.websites_max),
        estimated_variable_cost_usd=float(row.estimated_variable_cost_usd),
        stripe_price_id=row.stripe_price_id or "",
        description=row.description or "",
    )


def ensure_plan_catalog(db: Session) -> None:
    """Seed missing plan rows from code defaults; refresh in-memory cache."""
    global _cache
    defaults = _default_catalog()
    existing = {r.id: r for r in db.query(PlanCatalog).all()}
    changed = False
    for plan_id, plan in defaults.items():
        if plan_id in existing:
            continue
        db.add(
            PlanCatalog(
                id=plan.id,
                name=plan.name,
                price_usd_month=plan.price_usd_month,
                blog_daily_quota=plan.blog_daily_quota,
                search_daily_quota=plan.search_daily_quota,
                audit_daily_quota=plan.audit_daily_quota,
                websites_max=plan.websites_max,
                estimated_variable_cost_usd=plan.estimated_variable_cost_usd,
                stripe_price_id=plan.stripe_price_id,
                description=plan.description,
            )
        )
        changed = True
    if changed:
        db.commit()
    rows = db.query(PlanCatalog).all()
    _cache = {_row_to_plan(r).id: _row_to_plan(r) for r in rows} if rows else dict(defaults)


def _ensure_cache() -> dict[str, Plan]:
    global _cache
    if _cache is not None:
        return _cache
    db = SessionLocal()
    try:
        ensure_plan_catalog(db)
    except Exception:
        _cache = _default_catalog()
    finally:
        db.close()
    return _cache or _default_catalog()


def list_plans() -> list[Plan]:
    return list(_ensure_cache().values())


def get_plan(plan_id: str | None) -> Plan:
    catalog = _ensure_cache()
    key = (plan_id or "free").strip().lower()
    return catalog.get(key) or catalog.get("free") or _default_catalog()["free"]


def update_plan(
    db: Session,
    plan_id: str,
    *,
    name: str | None = None,
    price_usd_month: float | None = None,
    blog_daily_quota: int | None = None,
    search_daily_quota: int | None = None,
    audit_daily_quota: int | None = None,
    websites_max: int | None = None,
    description: str | None = None,
) -> Plan:
    global _cache
    ensure_plan_catalog(db)
    row = db.query(PlanCatalog).filter(PlanCatalog.id == plan_id).first()
    if row is None:
        raise KeyError(plan_id)
    if name is not None:
        row.name = name.strip() or row.name
    if price_usd_month is not None:
        row.price_usd_month = float(price_usd_month)
    if blog_daily_quota is not None:
        row.blog_daily_quota = int(blog_daily_quota)
    if search_daily_quota is not None:
        row.search_daily_quota = int(search_daily_quota)
    if audit_daily_quota is not None:
        row.audit_daily_quota = int(audit_daily_quota)
    if websites_max is not None:
        row.websites_max = int(websites_max)
    if description is not None:
        row.description = description
    db.add(row)
    db.commit()
    db.refresh(row)
    plan = _row_to_plan(row)
    if _cache is None:
        _cache = {}
    _cache[plan.id] = plan
    return plan


def plan_margin_usd(plan: Plan) -> float:
    return round(plan.price_usd_month - plan.estimated_variable_cost_usd, 2)


def plan_margin_ratio(plan: Plan) -> float | None:
    if plan.price_usd_month <= 0:
        return None
    return plan_margin_usd(plan) / plan.price_usd_month


def validate_plan_economics() -> list[str]:
    """Return list of validation errors (empty = pass)."""
    errors: list[str] = []
    plans = _ensure_cache()
    free, starter, pro = plans.get("free"), plans.get("starter"), plans.get("pro")
    if not free or not starter or not pro:
        return ["plan catalog incomplete"]

    if not (free.blog_daily_quota < starter.blog_daily_quota < pro.blog_daily_quota):
        errors.append("blog quotas must increase free < starter < pro")
    if not (free.search_daily_quota < starter.search_daily_quota < pro.search_daily_quota):
        errors.append("search quotas must increase free < starter < pro")
    if not (free.websites_max < starter.websites_max < pro.websites_max):
        errors.append("website caps must increase free < starter < pro")

    min_margin = settings.min_paid_plan_margin_usd
    min_ratio = settings.min_paid_plan_margin_ratio
    for plan in (starter, pro):
        margin = plan_margin_usd(plan)
        if margin < min_margin:
            errors.append(f"{plan.id}: margin ${margin} < min ${min_margin}")
        ratio = plan_margin_ratio(plan)
        if ratio is not None and ratio < min_ratio:
            errors.append(f"{plan.id}: margin ratio {ratio:.2%} < min {min_ratio:.0%}")

    return errors
