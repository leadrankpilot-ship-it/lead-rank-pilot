"""One-shot: login/register, ensure confirmed site, generate a Gemini blog draft."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

import httpx

BASE = "http://127.0.0.1:8000"
EMAIL = "writer-demo@example.com"
PASSWORD = "password123"
TOPIC = "How to choose the right service for your needs"


def main() -> int:
    with httpx.Client(base_url=BASE, timeout=180.0) as c:
        health = c.get("/api/health").json()
        print("health:", json.dumps(health))
        if health.get("blog_ai_provider") != "gemini":
            print("ERROR: blog_ai_provider is not gemini — check GEMINI_API_KEY", file=sys.stderr)
            return 1

        login = c.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        if login.status_code == 200:
            token = login.json()["access_token"]
        else:
            reg = c.post("/api/auth/register", json={"email": EMAIL, "password": PASSWORD})
            if reg.status_code not in {200, 201}:
                print("auth failed", login.status_code, login.text, reg.status_code, reg.text, file=sys.stderr)
                return 1
            token = reg.json()["access_token"]

        headers = {"Authorization": f"Bearer {token}"}
        sites = c.get("/api/websites", headers=headers).json()
        confirmed = [s for s in sites if s.get("profile_confirmed_at")]

        if not confirmed:
            created = c.post(
                "/api/websites",
                headers=headers,
                json={"base_url": "https://example-plumbing.demo", "ownership_confirmed": True},
            )
            if created.status_code not in {200, 201}:
                # domain may already exist for this user
                if sites:
                    site = sites[0]
                else:
                    print("create website failed", created.status_code, created.text, file=sys.stderr)
                    return 2
            else:
                site = created.json()

            profile_body = {
                "business_name": "Bright Home Services",
                "niche": "home services",
                "about_summary": (
                    "Bright Home Services helps homeowners with plumbing, electrical, "
                    "and HVAC maintenance across the metro area."
                ),
                "audience": "homeowners looking for reliable local service",
                "brand_voice": "clear, helpful, trustworthy",
                "tone": "professional yet friendly",
                "language": "en",
                "content_mode": "niche_blog",
                "publish_category": "Guides",
                "preferred_cta": "Contact Bright Home Services for a free estimate.",
                "products_services": ["plumbing", "electrical", "HVAC"],
                "service_areas": ["metro area"],
                "categories": ["Guides", "Tips"],
                "confirm": True,
            }
            upd = c.put(f"/api/websites/{site['id']}/profile", headers=headers, json=profile_body)
            if upd.status_code >= 400:
                print("profile confirm failed", upd.status_code, upd.text, file=sys.stderr)
                return 2
            site = upd.json()
        else:
            site = confirmed[0]

        website_id = site["id"]
        print(f"using website_id={website_id} domain={site.get('normalized_domain')}")

        topic = f"{TOPIC} ({datetime.now(timezone.utc).strftime('%H%M%S')})"
        payload = {
            "website_id": website_id,
            "topic": topic,
            "category": ((site.get("business_profile") or {}).get("publish_category") or "Guides"),
            "nlp_keywords": ["options", "criteria"],
            "lsi_keywords": ["best options", "what to look for"],
        }
        resp = c.post("/api/blogs/generate", headers=headers, json=payload)
        print("generate status:", resp.status_code)
        if resp.status_code >= 400:
            print(resp.text[:1500], file=sys.stderr)
            return 3
        data = resp.json()
        print("id:", data.get("id"))
        print("title:", data.get("title"))
        print("slug:", data.get("slug"))
        print("status:", data.get("status"))
        meta = data.get("metadata") or {}
        print("provider/model:", meta.get("provider"), meta.get("model"))
        body = data.get("body") or ""
        print("body_chars:", len(body))
        print("--- body preview ---")
        print(body[:1500])
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
