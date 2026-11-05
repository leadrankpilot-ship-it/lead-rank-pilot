"""search_runs.max_results for scrape size limit

Revision ID: 0009_max_results
Revises: 0008_results
Create Date: 2026-10-31
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_max_results"
down_revision: Union[str, Sequence[str], None] = "0008_results"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "search_runs",
        sa.Column("max_results", sa.Integer(), nullable=False, server_default="15"),
    )


def downgrade() -> None:
    op.drop_column("search_runs", "max_results")
