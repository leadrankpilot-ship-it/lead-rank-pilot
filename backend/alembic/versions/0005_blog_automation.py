"""blog topics posts usage and profile confirmation

Revision ID: 0005_blogs
Revises: 0004_qualify
Create Date: 2026-10-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_blogs"
down_revision: Union[str, Sequence[str], None] = "0004_qualify"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("websites", sa.Column("profile_confirmed_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "blog_topics",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("website_id", sa.Integer(), nullable=False),
        sa.Column("topic", sa.String(length=500), nullable=False),
        sa.Column("normalized_topic", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["website_id"], ["websites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("website_id", "normalized_topic", name="uq_blog_topics_site_topic"),
    )
    op.create_index(op.f("ix_blog_topics_website_id"), "blog_topics", ["website_id"], unique=False)

    op.create_table(
        "blog_posts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("website_id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("slug", sa.String(length=500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("remote_post_id", sa.String(length=100), nullable=True),
        sa.Column("remote_url", sa.String(length=1000), nullable=True),
        sa.Column("error_code", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["topic_id"], ["blog_topics.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["website_id"], ["websites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_blog_posts_status"), "blog_posts", ["status"], unique=False)
    op.create_index(op.f("ix_blog_posts_website_id"), "blog_posts", ["website_id"], unique=False)

    op.create_table(
        "usage_ledger",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("website_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("provider_usage_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["website_id"], ["websites.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_usage_ledger_created_at"), "usage_ledger", ["created_at"], unique=False)
    op.create_index(op.f("ix_usage_ledger_user_id"), "usage_ledger", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_usage_ledger_user_id"), table_name="usage_ledger")
    op.drop_index(op.f("ix_usage_ledger_created_at"), table_name="usage_ledger")
    op.drop_table("usage_ledger")
    op.drop_index(op.f("ix_blog_posts_website_id"), table_name="blog_posts")
    op.drop_index(op.f("ix_blog_posts_status"), table_name="blog_posts")
    op.drop_table("blog_posts")
    op.drop_index(op.f("ix_blog_topics_website_id"), table_name="blog_topics")
    op.drop_table("blog_topics")
    op.drop_column("websites", "profile_confirmed_at")
