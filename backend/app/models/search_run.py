import json
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SearchRun(Base):
    __tablename__ = "search_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True)
    input_name: Mapped[str] = mapped_column(String(255), nullable=False)
    input_location: Mapped[str] = mapped_column(String(255), nullable=False)
    max_results: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    # "leads" | "contacts" | "manual_contacts"
    mode: Mapped[str] = mapped_column(String(32), default="leads", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="queued", nullable=False)
    progress_pct: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Manual scrape: submitted website URL list (JSON array).
    input_urls_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Ephemeral scrape payload — cleared after the client claims into browser cache.
    results_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="search_runs")
    leads = relationship("Lead", back_populates="search_run", cascade="all, delete-orphan")

    @property
    def input_url_count(self) -> int:
        if not self.input_urls_json:
            return 0
        try:
            data = json.loads(self.input_urls_json)
            return len(data) if isinstance(data, list) else 0
        except Exception:
            return 0
