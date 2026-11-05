from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin import (
    AdminFilterOptionsOut,
    AdminPlanOut,
    AdminPlanUpdate,
    AdminStatsOut,
    AdminUserOut,
    AdminUserUpdate,
)
from app.services.billing import apply_plan
from app.services.plans import ensure_plan_catalog, get_plan, list_plans, update_plan

router = APIRouter(prefix="/admin", tags=["admin"])

_WEEKDAY_TO_PG_DOW = {
    "sunday": 0,
    "monday": 1,
    "tuesday": 2,
    "wednesday": 3,
    "thursday": 4,
    "friday": 5,
    "saturday": 6,
}


def _apply_user_time_filters(
    query: SAQuery,
    *,
    year: int | None,
    month: int | None,
    on_date: date_cls | None,
    weekday: str | None,
) -> SAQuery:
    """All provided filters apply together (AND) on users.created_at."""
    if year is not None:
        query = query.filter(func.extract("year", User.created_at) == year)
    if month is not None:
        query = query.filter(func.extract("month", User.created_at) == month)
    if on_date is not None:
        query = query.filter(func.date(User.created_at) == on_date)
    if weekday:
        key = weekday.strip().lower()
        if key in _WEEKDAY_TO_PG_DOW:
            query = query.filter(func.extract("dow", User.created_at) == _WEEKDAY_TO_PG_DOW[key])
    return query


@router.get("/filter-options", response_model=AdminFilterOptionsOut)
def admin_filter_options(
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> AdminFilterOptionsOut:
    rows = (
        db.query(func.extract("year", User.created_at).label("y"))
        .filter(User.created_at.isnot(None))
        .distinct()
        .order_by(func.extract("year", User.created_at).desc())
        .all()
    )
    years = sorted({int(r.y) for r in rows if r.y is not None}, reverse=True)
    return AdminFilterOptionsOut(years=years)


@router.get("/stats", response_model=AdminStatsOut)
def admin_stats(
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    date: date_cls | None = Query(default=None, alias="date"),
    weekday: str | None = Query(
        default=None,
        description="sunday|monday|tuesday|wednesday|thursday|friday|saturday",
    ),
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> AdminStatsOut:
    if weekday and weekday.strip().lower() not in _WEEKDAY_TO_PG_DOW:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="weekday must be sunday…saturday",
        )

    total = (
        _apply_user_time_filters(
            db.query(func.count(User.id)),
            year=year,
            month=month,
            on_date=date,
            weekday=weekday,
        ).scalar()
        or 0
    )
    active = (
        _apply_user_time_filters(
            db.query(func.count(User.id)).filter(User.status == "active"),
            year=year,
            month=month,
            on_date=date,
            weekday=weekday,
        ).scalar()
        or 0
    )
    inactive = (
        _apply_user_time_filters(
            db.query(func.count(User.id)).filter(User.status != "active"),
            year=year,
            month=month,
            on_date=date,
            weekday=weekday,
        ).scalar()
        or 0
    )
    free = (
        _apply_user_time_filters(
            db.query(func.count(User.id)).filter(User.plan_id == "free"),
            year=year,
            month=month,
            on_date=date,
            weekday=weekday,
        ).scalar()
        or 0
    )
    starter = (
        _apply_user_time_filters(
            db.query(func.count(User.id)).filter(User.plan_id == "starter"),
            year=year,
            month=month,
            on_date=date,
            weekday=weekday,
        ).scalar()
        or 0
    )
    pro = (
        _apply_user_time_filters(
            db.query(func.count(User.id)).filter(User.plan_id == "pro"),
            year=year,
            month=month,
            on_date=date,
            weekday=weekday,
        ).scalar()
        or 0
    )
    starter_n, pro_n = int(starter), int(pro)
    mrr = round(
        starter_n * get_plan("starter").price_usd_month + pro_n * get_plan("pro").price_usd_month,
        2,
    )
    return AdminStatsOut(
        users_total=int(total),
        users_active=int(active),
        users_inactive=int(inactive),
        plan_free=int(free),
        plan_starter=starter_n,
        plan_pro=pro_n,
        mrr_usd=mrr,
    )


def _plan_out(p) -> AdminPlanOut:
    return AdminPlanOut(
        id=p.id,
        name=p.name,
        price_usd_month=p.price_usd_month,
        blog_daily_quota=p.blog_daily_quota,
        search_daily_quota=p.search_daily_quota,
        audit_daily_quota=p.audit_daily_quota,
        websites_max=p.websites_max,
        description=p.description,
    )


@router.get("/plans", response_model=list[AdminPlanOut])
def admin_plans(
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> list[AdminPlanOut]:
    ensure_plan_catalog(db)
    return [_plan_out(p) for p in list_plans()]


@router.patch("/plans/{plan_id}", response_model=AdminPlanOut)
def admin_update_plan(
    plan_id: str,
    body: AdminPlanUpdate,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> AdminPlanOut:
    key = (plan_id or "").strip().lower()
    if key not in {"free", "starter", "pro"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    try:
        plan = update_plan(
            db,
            key,
            name=body.name,
            price_usd_month=body.price_usd_month,
            blog_daily_quota=body.blog_daily_quota,
            search_daily_quota=body.search_daily_quota,
            audit_daily_quota=body.audit_daily_quota,
            websites_max=body.websites_max,
            description=body.description,
        )
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found") from None
    return _plan_out(plan)


@router.get("/users", response_model=list[AdminUserOut])
def admin_list_users(
    q: str | None = Query(default=None, max_length=255),
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> list[User]:
    query = db.query(User)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        query = query.filter(func.lower(User.email).like(like))
    return query.order_by(User.id.desc()).limit(200).all()


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def admin_update_user(
    user_id: int,
    body: AdminUserUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.role is not None:
        if user.id == admin.id and body.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove your own admin role",
            )
        user.role = body.role

    if body.status is not None:
        if user.id == admin.id and body.status != "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate your own account",
            )
        user.status = body.status

    if body.plan_id is not None:
        billing = body.billing_status
        if billing is None:
            billing = "none" if body.plan_id == "free" else "active"
        apply_plan(db, user, body.plan_id, billing_status=billing)
        user = db.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        dirty = False
        if body.role is not None and user.role != body.role:
            user.role = body.role
            dirty = True
        if body.status is not None and user.status != body.status:
            user.status = body.status
            dirty = True
        if dirty:
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    if body.billing_status is not None:
        user.billing_status = "none" if get_plan(user.plan_id).id == "free" else body.billing_status

    db.add(user)
    db.commit()
    db.refresh(user)
    return user
