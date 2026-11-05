"""Phase 5 gate: factuality filter, topic normalize, quota math helpers."""

from app.services.blog_generation import generate_blog_draft, normalize_topic, validate_draft_against_profile
from app.core.config import settings

assert normalize_topic("Hello, World!!") == "hello world"

profile = {
    "business_name": "Acme Plumbing",
    "products_services": ["drain cleaning", "pipe repair"],
}
bad = {
    "title": "Tips",
    "slug": "tips",
    "body": "<p>Guaranteed ranking and $999 special today</p>",
    "meta_description": "x",
    "topic": "plumbing tips",
    "category": "Guides",
}
fixed = validate_draft_against_profile(dict(bad), profile)
assert "unverified claim removed" in fixed["body"]

# Force mock path
settings.blog_generation_mode = "mock"
draft = generate_blog_draft("winter pipe care", profile, ["old topic"])
assert draft["title"]
assert draft["body"]
assert draft["slug"]
print("blog-gate-ok", draft["slug"], settings.blog_daily_quota)
