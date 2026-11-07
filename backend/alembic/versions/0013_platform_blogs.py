"""platform blogs for admin CMS

Revision ID: 0013_platform_blogs
Revises: 0012_plan_catalog
Create Date: 2026-11-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_platform_blogs"
down_revision: Union[str, Sequence[str], None] = "0012_plan_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_blogs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("slug", sa.String(length=500), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=False, server_default=""),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("cover_image_url", sa.String(length=2000), nullable=False, server_default=""),
        sa.Column("published_on", sa.Date(), nullable=True),
        sa.Column("read_time", sa.String(length=50), nullable=False, server_default="5 min"),
        sa.Column("related_links_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="draft"),
        sa.Column("author_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index(op.f("ix_platform_blogs_slug"), "platform_blogs", ["slug"], unique=False)
    op.create_index(op.f("ix_platform_blogs_status"), "platform_blogs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_platform_blogs_status"), table_name="platform_blogs")
    op.drop_index(op.f("ix_platform_blogs_slug"), table_name="platform_blogs")
    op.drop_table("platform_blogs")
