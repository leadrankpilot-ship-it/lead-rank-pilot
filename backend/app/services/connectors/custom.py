"""Generic custom-site publishing contract.

POST {endpoint}
Authorization: Bearer <secret>
JSON body:
{
  "title": "...",
  "slug": "...",
  "content_html": "...",
  "excerpt": "...",
  "meta_description": "...",
  "status": "draft"|"publish",
  "idempotency_key": "..."
}
Expected response JSON:
{ "success": true, "post_id": "...", "url": "..." }
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import settings
from app.services.safe_http import assert_public_hostname, normalize_http_url

_MOCK: dict[str, dict[str, Any]] = {}


class CustomPublisher:
    connector_type = "custom"

    def test(self, *, site_url: str, username: str, secret: str) -> dict[str, Any]:
        if (settings.wordpress_mode or "live").lower() == "mock":
            return {
                "ok": True,
                "mode": "mock",
                "capabilities": {"posts": True, "draft": True, "publish": True, "custom": True},
                "user": username or "custom",
            }
        endpoint = normalize_http_url(site_url)
        host = urlparse(endpoint).hostname
        if not host:
            raise ValueError("Invalid custom endpoint URL")
        assert_public_hostname(host)
        headers = {
            "Authorization": f"Bearer {secret}",
            "User-Agent": settings.audit_user_agent,
        }
        with httpx.Client(timeout=settings.audit_request_timeout_seconds, follow_redirects=True) as client:
            # Health-style probe: OPTIONS or GET; many custom endpoints only accept POST
            resp = client.request("OPTIONS", endpoint, headers=headers)
            if resp.status_code >= 500:
                raise RuntimeError(f"Custom endpoint unhealthy ({resp.status_code})")
        return {
            "ok": True,
            "mode": "live",
            "capabilities": {"posts": True, "draft": True, "publish": True, "custom": True},
            "user": username or "custom",
        }

    def publish(
        self,
        *,
        site_url: str,
        username: str,
        secret: str,
        title: str,
        content: str,
        slug: str,
        status: str,
        idempotency_key: str,
        remote_post_id: str | None = None,
        excerpt: str | None = None,
        meta_description: str | None = None,
        category: str | None = None,
    ) -> dict[str, Any]:
        if status not in {"draft", "publish"}:
            raise ValueError("status must be draft or publish")

        if (settings.wordpress_mode or "live").lower() == "mock":
            if idempotency_key in _MOCK:
                return _MOCK[idempotency_key]
            result = {
                "id": str(abs(hash(idempotency_key)) % 10_000_000),
                "link": f"https://custom.example/posts/{slug}",
                "status": status,
                "slug": slug,
                "title": title,
                "category": category,
                "mode": "mock",
            }
            _MOCK[idempotency_key] = result
            return result

        endpoint = normalize_http_url(site_url)
        assert_public_hostname(urlparse(endpoint).hostname or "")
        headers = {
            "Authorization": f"Bearer {secret}",
            "User-Agent": settings.audit_user_agent,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        }
        payload = {
            "title": title,
            "slug": slug,
            "content_html": content,
            "excerpt": excerpt or "",
            "meta_description": meta_description or "",
            "category": category or "",
            "status": status,
            "idempotency_key": idempotency_key,
            "remote_post_id": remote_post_id,
        }
        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            resp = client.post(endpoint, headers=headers, json=payload)
            if resp.status_code in {401, 403}:
                raise PermissionError("Custom endpoint authentication failed")
            if resp.status_code >= 400:
                raise RuntimeError(f"Custom publish failed ({resp.status_code}): {resp.text[:300]}")
            data = resp.json()
            if not data.get("success", True):
                raise RuntimeError(data.get("error") or "Custom publish rejected")
            return {
                "id": str(data.get("post_id") or data.get("id") or ""),
                "link": data.get("url") or data.get("canonical_url"),
                "status": status,
                "slug": slug,
                "title": title,
                "mode": "live",
            }
