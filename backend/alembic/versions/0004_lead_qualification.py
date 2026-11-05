"""lead qualification fields

Revision ID: 0004_qualify
Revises: 0003_audits
Create Date: 2026-10-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_qualify"
down_revision: Union[str, Sequence[str], None] = "0003_audits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("leads", sa.Column("contact_page_url", sa.String(length=1000), nullable=True))
    op.add_column("leads", sa.Column("score", sa.Integer(), nullable=True))
    op.add_column("leads", sa.Column("score_reasons_json", sa.Text(), nullable=True))
    op.create_index(op.f("ix_leads_score"), "leads", ["score"], unique=False)
    op.create_index(op.f("ix_leads_website_status"), "leads", ["website_status"], unique=False)
    op.create_index(op.f("ix_leads_category"), "leads", ["category"], unique=False)
    op.create_index(op.f("ix_leads_location"), "leads", ["location"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_leads_location"), table_name="leads")
    op.drop_index(op.f("ix_leads_category"), table_name="leads")
    op.drop_index(op.f("ix_leads_website_status"), table_name="leads")
    op.drop_index(op.f("ix_leads_score"), table_name="leads")
    op.drop_column("leads", "score_reasons_json")
    op.drop_column("leads", "score")
    op.drop_column("leads", "contact_page_url")
    op.drop_column("leads", "email")
