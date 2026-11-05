from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Website(Base):
    __tablename__ = "websites"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_domain: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    business_profile_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    ownership_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    profile_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="websites")
    topics = relationship("BlogTopic", back_populates="website", cascade="all, delete-orphan")
    posts = relationship("BlogPost", back_populates="website", cascade="all, delete-orphan")
    connection = relationship(
        "WebsiteConnection",
        back_populates="website",
        uselist=False,
        cascade="all, delete-orphan",
    )
