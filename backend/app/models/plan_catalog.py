from sqlalchemy import Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlanCatalog(Base):
    __tablename__ = "plan_catalog"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price_usd_month: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    blog_daily_quota: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    search_daily_quota: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    audit_daily_quota: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    websites_max: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    estimated_variable_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    stripe_price_id: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
