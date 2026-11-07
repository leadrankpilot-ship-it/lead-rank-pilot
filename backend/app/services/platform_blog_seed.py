"""Seed a few published demo blogs so the public /blog page isn't empty."""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.platform_blog import PlatformBlog

logger = logging.getLogger(__name__)

_DEMO_SLUGS = (
    "find-local-leads-with-maps-search",
    "from-leads-to-contacts-that-convert",
    "publish-ai-blogs-to-wordpress-faster",
)

_DEMO_POSTS = (
    {
        "slug": "find-local-leads-with-maps-search",
        "title": "How to find local leads with Maps search",
        "excerpt": "A practical playbook for operators who need qualified local businesses—without spending hours on manual Google hunting.",
        "read_time": "6 min",
        "cover_image_url": "https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?auto=format&fit=crop&w=1400&q=80",
        "body": """Local lead gen still starts with one question: who nearby actually needs what you sell?

With LeadRankPilot, you run a Maps search by category and location, then get a ranked list of businesses—names, locations, websites, and signals that help you prioritize outreach.

What to do first
1. Pick a sharp category (e.g. “HVAC”, “dental clinic”, “gym”).
2. Target a city or neighborhood you can serve well.
3. Cap results so you can review quality before scaling.

Why this beats spreadsheets
Manual copy-paste from Maps is slow and inconsistent. A structured scrape keeps status, website presence, and scores in one place so your team works the best opportunities first.

Next step
Once your list looks right, move straight into contact discovery to pull emails and phones for outreach.""",
    },
    {
        "slug": "from-leads-to-contacts-that-convert",
        "title": "From leads to contacts that convert",
        "excerpt": "Finding businesses is only half the job. Here’s how Contact Finder turns listings into outreach-ready emails and phones.",
        "read_time": "5 min",
        "cover_image_url": "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=80",
        "body": """A lead without a way to reach them is just a name on a list.

LeadRankPilot’s Contact Finder walks website pages (and Maps-backed flows) to surface emails, phone numbers, and contact pages—so your sales or agency team can start conversations faster.

Two modes that fit real workflows
• Maps finder: search by niche + city, then enrich results.
• Manual URLs: paste or upload a CSV of sites you already care about.

Quality tips
• Prefer businesses with live sites—contact pages yield better data.
• Export sessions you want to keep; don’t mix unfinished runs with saved lists.
• Review WhatsApp/phone flags when calling is part of your funnel.

Bottom line
Lead search finds who to talk to. Contact discovery makes the conversation possible.""",
    },
    {
        "slug": "publish-ai-blogs-to-wordpress-faster",
        "title": "Publish AI blog drafts to WordPress without the chaos",
        "excerpt": "Connect a site, generate drafts that match your brand, then approve and publish—without bouncing between five tools.",
        "read_time": "7 min",
        "cover_image_url": "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=1400&q=80",
        "body": """Content ops break when drafting, editing, and publishing live in different places.

LeadRankPilot keeps AI blog generation inside the same workspace as lead gen: connect WordPress (or a custom endpoint), generate a draft from your site profile, edit, approve, then publish.

A clean weekly loop
1. Confirm the site profile so tone and niche stay consistent.
2. Generate a draft around a real keyword or topic.
3. Edit for accuracy and brand voice.
4. Publish to WordPress—or hand off via your custom API.

Guardrails that matter
Daily quotas protect cost and quality. Treat AI as a first draft, not a finished piece. The win is speed with control—not autopilot spam.

If you already run lead campaigns, pairing outreach with fresh site content compounds trust: you’re visible when prospects Google you after the first email.""",
    },
)


def ensure_demo_platform_blogs(db: Session) -> None:
    """Insert missing demo posts; refresh cover URLs on existing demo slugs."""
    created = 0
    updated = 0
    today = date.today()
    for i, post in enumerate(_DEMO_POSTS):
        exists = db.query(PlatformBlog).filter(PlatformBlog.slug == post["slug"]).first()
        if exists is not None:
            if (exists.cover_image_url or "") != post["cover_image_url"]:
                exists.cover_image_url = post["cover_image_url"]
                db.add(exists)
                updated += 1
            continue
        db.add(
            PlatformBlog(
                title=post["title"],
                slug=post["slug"],
                excerpt=post["excerpt"],
                body=post["body"],
                cover_image_url=post["cover_image_url"],
                published_on=today - timedelta(days=i * 3),
                read_time=post["read_time"],
                related_links_json=json.dumps([]),
                status="published",
            )
        )
        created += 1
    if created or updated:
        db.commit()
        logger.info("demo platform blogs created=%s updated_covers=%s", created, updated)
