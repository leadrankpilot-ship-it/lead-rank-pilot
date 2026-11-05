from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class BlogTopic(Base):
    __tablename__ = "blog_topics"
    __table_args__ = (
        UniqueConstraint("website_id", "normalized_topic", name="uq_blog_topics_site_topic"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    website_id: Mapped[int] = mapped_column(ForeignKey("websites.id", ondelete="CASCADE"), index=True)
    topic: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_topic: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="suggested", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    website = relationship("Website", back_populates="topics")
    posts = relationship("BlogPost", back_populates="topic")
