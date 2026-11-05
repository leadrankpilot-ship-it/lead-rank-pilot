"""ephemeral search results_json (no durable lead rows)

Revision ID: 0008_results
Revises: 0007_subs
Create Date: 2026-10-31
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_results"
down_revision: Union[str, Sequence[str], None] = "0007_subs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("search_runs", sa.Column("results_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("search_runs", "results_json")
