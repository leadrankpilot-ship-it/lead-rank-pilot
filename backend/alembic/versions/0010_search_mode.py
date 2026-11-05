"""search_runs.mode for leads vs contacts scrapes

Revision ID: 0010_search_mode
Revises: 0009_max_results
Create Date: 2026-11-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_search_mode"
down_revision: Union[str, Sequence[str], None] = "0009_max_results"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "search_runs",
        sa.Column("mode", sa.String(length=32), nullable=False, server_default="leads"),
    )


def downgrade() -> None:
    op.drop_column("search_runs", "mode")
