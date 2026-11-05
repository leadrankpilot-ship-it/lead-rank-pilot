from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "LeadRankPilot API"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:3000"

    # Required: Neon/PostgreSQL SQLAlchemy URL (postgresql+psycopg://...)
    database_url: str

    jwt_secret: str = "dev-change-me-lead-rank-pilot-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7

    # Fernet key (url-safe base64). Derived from JWT secret if empty (set in production).
    encryption_key: str = ""

    log_level: str = "INFO"

    # Website audit / crawl budgets (Phase 3)
    audit_request_timeout_seconds: float = 12.0
    audit_max_response_bytes: int = 1_500_000
    audit_max_pages: int = 3
    audit_max_links_checked: int = 20
    audit_user_agent: str = "LeadRankPilotAuditBot/1.0 (+https://leadrankpilot.local)"

    # Manual website contact scrape (Contact Finder toggle)
    # HTTP-only discovery (~4 pages/site); 50 is OK for background jobs.
    manual_contact_url_max: int = 50
    manual_contact_concurrency: int = 6

    # AI blog generation (Phase 5)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    # auto = Gemini if GEMINI_API_KEY set, else OpenAI if OPENAI_API_KEY set
    blog_ai_provider: str = "auto"  # auto | gemini | openai
    blog_daily_quota: int = 3  # legacy alias → free plan default
    # Product hard cap: no user may connect more sites than this (plan may be lower).
    websites_max_per_user: int = 3
    blog_generation_mode: str = "live"  # live | mock
    wordpress_mode: str = "live"  # live | mock

    # Plans / billing (Phase 8)
    billing_mode: str = "mock"  # mock | live
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_starter: str = ""
    stripe_price_pro: str = ""
    frontend_base_url: str = "http://localhost:3000"
    blog_daily_quota_free: int = 3
    blog_daily_quota_starter: int = 10
    blog_daily_quota_pro: int = 40
    plan_starter_variable_cost_usd: float = 8.0
    plan_pro_variable_cost_usd: float = 22.0
    min_paid_plan_margin_usd: float = 15.0
    min_paid_plan_margin_ratio: float = 0.45

    # Dummy admin panel login (local / early ops). Change in production.
    admin_email: str = "admin@leadrankpilot.com"
    admin_password: str = "Admin123!"

    # SMTP (Gmail App Password) for password reset emails
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_from_name: str = "LeadRankPilot"
    password_reset_expire_minutes: int = 60

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        url = value.strip()
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://") :]
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://") :]
        if "sqlite" in url.lower():
            raise ValueError("SQLite is disabled; use PostgreSQL (Neon) via DATABASE_URL")
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
