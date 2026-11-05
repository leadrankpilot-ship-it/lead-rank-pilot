"""Ensure a local admin account exists for the admin panel."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User

logger = logging.getLogger(__name__)


def ensure_admin_user(db: Session) -> User:
    email = (settings.admin_email or "").strip().lower()
    password = settings.admin_password or "Admin123!"
    if not email:
        email = "admin@leadrankpilot.com"

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(password),
            role="admin",
            status="active",
            plan_id="pro",
            billing_status="active",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Admin user created: %s", email)
        return user

    changed = False
    if (user.role or "").lower() != "admin":
        user.role = "admin"
        changed = True
    if user.status != "active":
        user.status = "active"
        changed = True
    # Keep password in sync with settings in local/dev so credentials stay predictable.
    user.password_hash = hash_password(password)
    changed = True
    if changed:
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Admin user refreshed: %s", email)
    return user
