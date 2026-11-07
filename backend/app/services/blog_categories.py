"""Fixed platform-blog categories for LeadRankPilot (SEO + public filters)."""

from __future__ import annotations

BLOG_CATEGORIES: tuple[dict[str, str], ...] = (
    {"slug": "lead-generation", "label": "Lead Generation"},
    {"slug": "contact-discovery", "label": "Contact Discovery"},
    {"slug": "ai-blogging", "label": "AI Blogging"},
    {"slug": "wordpress-publishing", "label": "WordPress Publishing"},
    {"slug": "growth-tips", "label": "Growth Tips"},
)

DEFAULT_BLOG_CATEGORY = "growth-tips"
_CATEGORY_SLUGS = {c["slug"] for c in BLOG_CATEGORIES}


def normalize_blog_category(value: str | None) -> str:
    slug = (value or "").strip().lower()
    if slug in _CATEGORY_SLUGS:
        return slug
    return DEFAULT_BLOG_CATEGORY


def blog_category_label(slug: str | None) -> str:
    key = normalize_blog_category(slug)
    for item in BLOG_CATEGORIES:
        if item["slug"] == key:
            return item["label"]
    return "Growth Tips"
