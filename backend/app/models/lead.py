from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (
        UniqueConstraint("search_run_id", "dedupe_key", name="uq_leads_search_dedupe"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    search_run_id: Mapped[int] = mapped_column(ForeignKey("search_runs.id", ondelete="CASCADE"), index=True)
    source_listing_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    business_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    category: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    website_status: Mapped[str] = mapped_column(
        String(50), default="website_not_found", index=True, nullable=False
    )
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_page_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    contact_fields_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    score_reasons_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(64), nullable=False)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    search_run = relationship("SearchRun", back_populates="leads")
