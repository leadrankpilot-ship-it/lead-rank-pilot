"""Public contact discovery from Contact/About pages (bounded + SSRF-safe)."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.core.config import settings
from app.services.safe_http import assert_public_hostname, build_client, normalize_http_url

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
PHONE_RE = re.compile(r"(?:\+?\d[\d\-\s().]{7,}\d)")

CONTACT_PATHS = ("/contact", "/contact-us", "/about", "/about-us", "/support")


def _extract_contacts(html: str, base_url: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    emails = sorted({e.lower() for e in EMAIL_RE.findall(text) if not e.lower().endswith((".png", ".jpg", ".gif"))})
    phones = sorted({re.sub(r"[^\d+]", "", p) for p in PHONE_RE.findall(text) if len(re.sub(r"\D", "", p)) >= 8})
    mailto = []
    for a in soup.find_all("a", href=True):
        href = str(a.get("href"))
        if href.lower().startswith("mailto:"):
            mail = href.split(":", 1)[1].split("?", 1)[0].strip().lower()
            if mail:
                mailto.append(mail)
    emails = sorted(set(emails) | set(mailto))
    return {
        "emails": emails[:5],
        "phones": phones[:5],
        "source_url": base_url,
    }


def discover_public_contacts(website_url: str) -> dict[str, Any]:
    base = normalize_http_url(website_url)
    host = urlparse(base).hostname
    if not host:
        raise ValueError("Invalid website URL")
    assert_public_hostname(host)

    found: dict[str, Any] = {
        "email": None,
        "phone": None,
        "contact_page_url": None,
        "candidates": [],
        "limitations": [
            "Public page scan only",
            "Email/DNS presence is not mailbox proof",
            f"Max pages: {min(4, settings.audit_max_pages + 1)}",
        ],
    }

    paths = [base.rstrip("/")] + [urljoin(base.rstrip("/") + "/", p.lstrip("/")) for p in CONTACT_PATHS]
    seen: set[str] = set()
    with build_client() as client:
        for page_url in paths:
            if page_url in seen:
                continue
            seen.add(page_url)
            if len(seen) > 4:
                break
            try:
                assert_public_hostname(urlparse(page_url).hostname or "")
                resp = client.get(page_url, follow_redirects=False)
                if resp.status_code in {301, 302, 303, 307, 308}:
                    loc = resp.headers.get("location")
                    if loc:
                        page_url = normalize_http_url(urljoin(page_url, loc))
                        assert_public_hostname(urlparse(page_url).hostname or "")
                        resp = client.get(page_url, follow_redirects=False)
                if resp.status_code >= 400:
                    continue
                body = resp.content[: settings.audit_max_response_bytes].decode(
                    resp.encoding or "utf-8", errors="replace"
                )
                extracted = _extract_contacts(body, page_url)
                found["candidates"].append(extracted)
                path_l = urlparse(page_url).path.lower()
                if any(x in path_l for x in ("contact", "about", "support")) and not found["contact_page_url"]:
                    found["contact_page_url"] = page_url
                if extracted["emails"] and not found["email"]:
                    found["email"] = extracted["emails"][0]
                if extracted["phones"] and not found["phone"]:
                    found["phone"] = extracted["phones"][0]
            except Exception:
                continue

    found["contact_fields_json"] = json.dumps(
        {
            "email": found["email"],
            "phone": found["phone"],
            "contact_page_url": found["contact_page_url"],
            "candidates": found["candidates"],
        }
    )
    return found
