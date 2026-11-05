"""plan_catalog for editable admin plans

Revision ID: 0012_plan_catalog
Revises: 0011_input_urls
Create Date: 2026-11-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_plan_catalog"
down_revision: Union[str, Sequence[str], None] = "0011_input_urls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plan_catalog",
        sa.Column("id", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("price_usd_month", sa.Float(), nullable=False),
        sa.Column("blog_daily_quota", sa.Integer(), nullable=False),
        sa.Column("search_daily_quota", sa.Integer(), nullable=False),
        sa.Column("audit_daily_quota", sa.Integer(), nullable=False),
        sa.Column("websites_max", sa.Integer(), nullable=False),
        sa.Column("estimated_variable_cost_usd", sa.Float(), nullable=False),
        sa.Column("stripe_price_id", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_table("plan_catalog")
