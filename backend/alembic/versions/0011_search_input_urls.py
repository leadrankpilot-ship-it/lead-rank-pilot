"""search_runs.input_urls_json for manual website scrapes

Revision ID: 0011_input_urls
Revises: 0010_search_mode
Create Date: 2026-11-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_input_urls"
down_revision: Union[str, Sequence[str], None] = "0010_search_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("search_runs", sa.Column("input_urls_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("search_runs", "input_urls_json")
