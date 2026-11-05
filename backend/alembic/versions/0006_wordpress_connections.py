"""wordpress connections and publish idempotency

Revision ID: 0006_wp
Revises: 0005_blogs
Create Date: 2026-10-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_wp"
down_revision: Union[str, Sequence[str], None] = "0005_blogs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "website_connections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("website_id", sa.Integer(), nullable=False),
        sa.Column("connector_type", sa.String(length=50), nullable=False),
        sa.Column("site_url", sa.String(length=500), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=False),
        sa.Column("secret_encrypted", sa.Text(), nullable=False),
        sa.Column("capabilities_json", sa.Text(), nullable=True),
        sa.Column("connection_status", sa.String(length=50), nullable=False),
        sa.Column("auto_publish", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["website_id"], ["websites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("website_id"),
    )
    op.create_index(op.f("ix_website_connections_website_id"), "website_connections", ["website_id"], unique=True)

    op.add_column("blog_posts", sa.Column("publish_idempotency_key", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_blog_posts_publish_idempotency_key"), "blog_posts", ["publish_idempotency_key"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_blog_posts_publish_idempotency_key"), table_name="blog_posts")
    op.drop_column("blog_posts", "publish_idempotency_key")
    op.drop_index(op.f("ix_website_connections_website_id"), table_name="website_connections")
    op.drop_table("website_connections")
