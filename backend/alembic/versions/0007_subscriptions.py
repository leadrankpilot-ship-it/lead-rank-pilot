"""user subscription fields

Revision ID: 0007_subs
Revises: 0006_wp
Create Date: 2026-10-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_subs"
down_revision: Union[str, Sequence[str], None] = "0006_wp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("plan_id", sa.String(length=50), nullable=False, server_default="free"))
    op.add_column("users", sa.Column("billing_status", sa.String(length=50), nullable=False, server_default="none"))
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("plan_renews_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "plan_renews_at")
    op.drop_column("users", "stripe_subscription_id")
    op.drop_column("users", "stripe_customer_id")
    op.drop_column("users", "billing_status")
    op.drop_column("users", "plan_id")
