"""WordPress REST API connector (Application Passwords)."""

from __future__ import annotations

import base64
import hashlib
import json
import re
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import settings
from app.services.safe_http import assert_public_hostname, normalize_http_url

# In-memory mock store so retries return the same remote post (idempotency gate)
_MOCK_POSTS: dict[str, dict[str, Any]] = {}


def _normalize_app_password(app_password: str) -> str:
    # WordPress shows spaces for readability; they are optional.
    return "".join((app_password or "").split())


def _auth_header(username: str, app_password: str) -> str:
    token = base64.b64encode(
        f"{username.strip()}:{_normalize_app_password(app_password)}".encode("utf-8")
    ).decode("ascii")
    return f"Basic {token}"


def _api_base(site_url: str) -> str:
    root = normalize_http_url(site_url).rstrip("/")
    host = urlparse(root).hostname
    if not host:
        raise ValueError("Invalid WordPress site URL")
    assert_public_hostname(host)
    return f"{root}/wp-json/wp/v2"


def _auth_failed_message(resp: httpx.Response) -> str:
    detail = ""
    try:
        payload = resp.json()
        if isinstance(payload, dict):
            detail = str(payload.get("message") or payload.get("code") or "").strip()
    except Exception:  # noqa: BLE001
        detail = (resp.text or "")[:160].strip()
    hint = (
        "Use the WordPress login username (often your email), not the Application Password name. "
        "Paste the Application Password from Users → Profile."
    )
    if detail:
        return f"WordPress authentication failed ({resp.status_code}): {detail}. {hint}"
    return f"WordPress authentication failed ({resp.status_code}). {hint}"


def test_connection(site_url: str, username: str, app_password: str) -> dict[str, Any]:
    if (settings.wordpress_mode or "live").lower() == "mock":
        return {
            "ok": True,
            "mode": "mock",
            "capabilities": {"posts": True, "draft": True, "publish": True},
            "user": username,
        }

    if not username.strip():
        raise ValueError("WordPress username is required")
    if len(_normalize_app_password(app_password)) < 8:
        raise ValueError("Application password looks too short")

    base = _api_base(site_url)
    headers = {
        "Authorization": _auth_header(username, app_password),
        "User-Agent": settings.audit_user_agent,
    }
    with httpx.Client(timeout=settings.audit_request_timeout_seconds, follow_redirects=True) as client:
        # /users/me requires auth on most WP installs
        resp = client.get(f"{base}/users/me", headers=headers, params={"context": "edit"})
        if resp.status_code in {401, 403}:
            raise PermissionError(_auth_failed_message(resp))
        if resp.status_code >= 400:
            raise RuntimeError(f"WordPress connection failed ({resp.status_code})")
        data = resp.json()
        return {
            "ok": True,
            "mode": "live",
            "capabilities": {"posts": True, "draft": True, "publish": True},
            "user": data.get("slug") or data.get("name") or username,
        }


_SKIP_PAGE_SLUGS = {
    "home",
    "homepage",
    "about",
    "about-us",
    "contact",
    "contact-us",
    "blogs",
    "blog",
    "privacy",
    "privacy-policy",
    "terms",
    "terms-of-service",
    "cookie-policy",
}


def list_categories(site_url: str, username: str, app_password: str) -> list[dict[str, Any]]:
    """Return WordPress categories for this site (id, name, slug, count)."""
    if (settings.wordpress_mode or "live").lower() == "mock":
        return [
            {"id": 1, "name": "Uncategorized", "slug": "uncategorized", "count": 0, "source": "category"},
            {"id": 2, "name": "Health", "slug": "health", "count": 0, "source": "category"},
        ]

    base = _api_base(site_url)
    headers = {
        "Authorization": _auth_header(username, app_password),
        "User-Agent": settings.audit_user_agent,
    }
    out: list[dict[str, Any]] = []
    page = 1
    with httpx.Client(timeout=settings.audit_request_timeout_seconds, follow_redirects=True) as client:
        while page <= 10:
            resp = client.get(
                f"{base}/categories",
                headers=headers,
                params={"per_page": 100, "page": page, "hide_empty": False},
            )
            if resp.status_code in {401, 403}:
                raise PermissionError(_auth_failed_message(resp))
            if resp.status_code >= 400:
                raise RuntimeError(f"Could not load WordPress categories ({resp.status_code})")
            rows = resp.json()
            if not isinstance(rows, list) or not rows:
                break
            for row in rows:
                if not isinstance(row, dict):
                    continue
                name = str(row.get("name") or "").strip()
                if not name:
                    continue
                out.append(
                    {
                        "id": int(row.get("id") or 0),
                        "name": name,
                        "slug": str(row.get("slug") or ""),
                        "count": int(row.get("count") or 0),
                        "source": "category",
                    }
                )
            if len(rows) < 100:
                break
            page += 1
    return out


def list_section_pages(site_url: str, username: str, app_password: str) -> list[dict[str, Any]]:
    """Return content-section Pages often used in the header (Health, Medicines, …)."""
    if (settings.wordpress_mode or "live").lower() == "mock":
        return [
            {"id": 35, "name": "Health", "slug": "health", "count": 0, "source": "page"},
            {"id": 36, "name": "Medicines", "slug": "medicines", "count": 0, "source": "page"},
        ]

    base = _api_base(site_url)
    headers = {
        "Authorization": _auth_header(username, app_password),
        "User-Agent": settings.audit_user_agent,
    }
    out: list[dict[str, Any]] = []
    page = 1
    with httpx.Client(timeout=settings.audit_request_timeout_seconds, follow_redirects=True) as client:
        while page <= 10:
            resp = client.get(
                f"{base}/pages",
                headers=headers,
                params={"per_page": 100, "page": page, "status": "publish"},
            )
            if resp.status_code in {401, 403}:
                raise PermissionError(_auth_failed_message(resp))
            if resp.status_code >= 400:
                raise RuntimeError(f"Could not load WordPress pages ({resp.status_code})")
            rows = resp.json()
            if not isinstance(rows, list) or not rows:
                break
            for row in rows:
                if not isinstance(row, dict):
                    continue
                slug = str(row.get("slug") or "").strip().lower()
                if not slug or slug in _SKIP_PAGE_SLUGS:
                    continue
                title = row.get("title")
                if isinstance(title, dict):
                    name = str(title.get("rendered") or "").strip()
                else:
                    name = str(title or "").strip()
                # Strip simple HTML entities/tags WordPress sometimes returns
                name = re.sub(r"<[^>]+>", "", name).replace("&#8217;", "'").replace("&amp;", "&").strip()
                if not name:
                    continue
                out.append(
                    {
                        "id": int(row.get("id") or 0),
                        "name": name,
                        "slug": slug,
                        "count": 0,
                        "source": "page",
                    }
                )
            if len(rows) < 100:
                break
            page += 1
    return out


def list_importable_sections(site_url: str, username: str, app_password: str) -> list[dict[str, Any]]:
    """Categories + header-like Pages, deduped by name (categories win)."""
    categories = list_categories(site_url, username, app_password)
    pages = list_section_pages(site_url, username, app_password)
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in categories + pages:
        key = str(row.get("name") or "").strip().casefold()
        if not key or key in seen:
            continue
        if key == "uncategorized":
            continue
        seen.add(key)
        merged.append(row)
    return merged


def resolve_category_id(
    client: httpx.Client,
    *,
    base: str,
    headers: dict[str, str],
    category_name: str,
) -> int | None:
    """Find a WP category by name (case-insensitive) or create it. Returns category id."""
    name = (category_name or "").strip()
    if not name:
        return None

    # Search first
    resp = client.get(
        f"{base}/categories",
        headers=headers,
        params={"search": name, "per_page": 100, "hide_empty": False},
    )
    if resp.status_code < 400 and isinstance(resp.json(), list):
        needle = name.casefold()
        for row in resp.json():
            if isinstance(row, dict) and str(row.get("name") or "").strip().casefold() == needle:
                cid = int(row.get("id") or 0)
                if cid:
                    return cid

    # Create if missing
    create = client.post(
        f"{base}/categories",
        headers=headers,
        json={"name": name},
    )
    if create.status_code in {401, 403}:
        raise PermissionError(_auth_failed_message(create))
    if create.status_code >= 400:
        # Race: category may already exist; try search once more
        retry = client.get(
            f"{base}/categories",
            headers=headers,
            params={"search": name, "per_page": 100, "hide_empty": False},
        )
        if retry.status_code < 400 and isinstance(retry.json(), list):
            needle = name.casefold()
            for row in retry.json():
                if isinstance(row, dict) and str(row.get("name") or "").strip().casefold() == needle:
                    cid = int(row.get("id") or 0)
                    if cid:
                        return cid
        raise RuntimeError(f"Could not create WordPress category '{name}' ({create.status_code})")
    data = create.json()
    cid = int((data or {}).get("id") or 0)
    return cid or None


def create_or_update_post(
    *,
    site_url: str,
    username: str,
    app_password: str,
    title: str,
    content: str,
    slug: str,
    status: str,
    idempotency_key: str,
    remote_post_id: str | None = None,
    category: str | None = None,
) -> dict[str, Any]:
    if status not in {"draft", "publish"}:
        raise ValueError("status must be draft or publish")

    if (settings.wordpress_mode or "live").lower() == "mock":
        if idempotency_key in _MOCK_POSTS:
            return _MOCK_POSTS[idempotency_key]
        if remote_post_id:
            for item in _MOCK_POSTS.values():
                if str(item.get("id")) == str(remote_post_id):
                    item["status"] = status
                    item["title"] = title
                    item["slug"] = slug
                    item["category"] = category
                    return item
        mock_id = str(abs(hash(idempotency_key)) % 10_000_000)
        result = {
            "id": mock_id,
            "link": f"https://example.com/?p={mock_id}",
            "status": status,
            "slug": slug,
            "title": title,
            "category": category,
            "mode": "mock",
        }
        _MOCK_POSTS[idempotency_key] = result
        return result

    base = _api_base(site_url)
    headers = {
        "Authorization": _auth_header(username, app_password),
        "User-Agent": settings.audit_user_agent,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotency_key,
    }
    payload: dict[str, Any] = {
        "title": title,
        "content": content,
        "slug": slug,
        "status": status,
    }
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        if category and category.strip():
            cat_id = resolve_category_id(
                client,
                base=base,
                headers=headers,
                category_name=category.strip(),
            )
            if cat_id:
                # Assign only this category so the post is not left in Uncategorized alone
                # and does not appear under every archive by accident.
                payload["categories"] = [cat_id]
        if remote_post_id:
            resp = client.post(f"{base}/posts/{remote_post_id}", headers=headers, json=payload)
        else:
            resp = client.post(f"{base}/posts", headers=headers, json=payload)
        if resp.status_code in {401, 403}:
            raise PermissionError(_auth_failed_message(resp))
        if resp.status_code >= 400:
            raise RuntimeError(f"WordPress publish failed ({resp.status_code}): {resp.text[:300]}")
        data = resp.json()
        return {
            "id": str(data.get("id")),
            "link": data.get("link"),
            "status": data.get("status"),
            "slug": data.get("slug"),
            "title": (data.get("title") or {}).get("rendered") if isinstance(data.get("title"), dict) else data.get("title"),
            "categories": data.get("categories") or [],
            "mode": "live",
        }


def _apply_category_filter_to_query_blocks(raw_html: str, category_id: int) -> tuple[str, int]:
    """Force every wp:query block on a page to filter by one category id."""
    pattern = re.compile(r"(<!--\s*wp:query\s+)(\{.*?\})(\s*-->)", re.DOTALL)
    updated = 0

    def _rewrite(match: re.Match[str]) -> str:
        nonlocal updated
        prefix, json_text, suffix = match.group(1), match.group(2), match.group(3)
        try:
            attrs = json.loads(json_text)
        except Exception:  # noqa: BLE001
            return match.group(0)
        if not isinstance(attrs, dict):
            return match.group(0)
        query = attrs.get("query")
        if not isinstance(query, dict):
            query = {}
            attrs["query"] = query
        query["inherit"] = False
        query["taxQuery"] = {"category": [int(category_id)]}
        # Older block variants sometimes use top-level taxQuery
        attrs["taxQuery"] = {"category": [int(category_id)]}
        updated += 1
        return f"{prefix}{json.dumps(attrs, separators=(',', ':'))}{suffix}"

    new_html = pattern.sub(_rewrite, raw_html or "")
    return new_html, updated


def sync_section_page_category_filters(
    site_url: str,
    username: str,
    app_password: str,
) -> dict[str, Any]:
    """
    Header section Pages (Health, Medicines, …) often use an unfiltered Query Loop,
    so every post appears on every page. Create matching categories and lock each
    page query to that category only.
    """
    if (settings.wordpress_mode or "live").lower() == "mock":
        return {"ok": True, "mode": "mock", "updated": [], "skipped": []}

    base = _api_base(site_url)
    headers = {
        "Authorization": _auth_header(username, app_password),
        "User-Agent": settings.audit_user_agent,
        "Content-Type": "application/json",
    }
    pages = list_section_pages(site_url, username, app_password)
    updated: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    with httpx.Client(timeout=45.0, follow_redirects=True) as client:
        for page in pages:
            name = str(page.get("name") or "").strip()
            page_id = int(page.get("id") or 0)
            if not name or not page_id:
                continue
            cat_id = resolve_category_id(client, base=base, headers=headers, category_name=name)
            if not cat_id:
                skipped.append({"page": name, "reason": "category_missing"})
                continue

            get_resp = client.get(
                f"{base}/pages/{page_id}",
                headers=headers,
                params={"context": "edit"},
            )
            if get_resp.status_code in {401, 403}:
                raise PermissionError(_auth_failed_message(get_resp))
            if get_resp.status_code >= 400:
                skipped.append({"page": name, "reason": f"load_failed_{get_resp.status_code}"})
                continue
            data = get_resp.json()
            content = data.get("content") or {}
            raw = content.get("raw") if isinstance(content, dict) else None
            if not isinstance(raw, str) or "wp:query" not in raw:
                skipped.append({"page": name, "reason": "no_query_block"})
                continue

            new_raw, changed = _apply_category_filter_to_query_blocks(raw, cat_id)
            if not changed or new_raw == raw:
                skipped.append({"page": name, "reason": "unchanged", "category_id": cat_id})
                continue

            put = client.post(
                f"{base}/pages/{page_id}",
                headers=headers,
                json={"content": new_raw},
            )
            if put.status_code in {401, 403}:
                raise PermissionError(_auth_failed_message(put))
            if put.status_code >= 400:
                skipped.append({"page": name, "reason": f"save_failed_{put.status_code}"})
                continue
            updated.append(
                {
                    "page": name,
                    "page_id": page_id,
                    "category": name,
                    "category_id": cat_id,
                    "query_blocks": changed,
                }
            )

    return {"ok": True, "mode": "live", "updated": updated, "skipped": skipped}


def make_idempotency_key(website_id: int, post_id: int, status: str) -> str:
    raw = f"wp:{website_id}:{post_id}:{status}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
