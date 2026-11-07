"""platform blog category

Revision ID: 0014_platform_blog_category
Revises: 0013_platform_blogs
Create Date: 2026-11-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_platform_blog_category"
down_revision: Union[str, Sequence[str], None] = "0013_platform_blogs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "platform_blogs",
        sa.Column("category", sa.String(length=80), nullable=False, server_default="growth-tips"),
    )
    op.create_index(op.f("ix_platform_blogs_category"), "platform_blogs", ["category"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_platform_blogs_category"), table_name="platform_blogs")
    op.drop_column("platform_blogs", "category")
