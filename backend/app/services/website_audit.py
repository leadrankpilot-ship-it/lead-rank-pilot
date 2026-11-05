from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.core.config import settings
from app.services.safe_http import assert_public_hostname, build_client, normalize_http_url
from app.services.website_status import classify_status


def _same_site(base: str, candidate: str) -> bool:
    b = urlparse(base)
    c = urlparse(candidate)
    return (b.hostname or "").lower() == (c.hostname or "").lower()


def _score(checks: dict[str, Any], status_category: str) -> dict[str, Any]:
    score = 100
    reasons: list[str] = []
    if status_category != "working":
        score -= 40
        reasons.append(f"status={status_category}")
    seo = checks.get("seo", {})
    if not seo.get("title"):
        score -= 10
        reasons.append("missing_title")
    if not seo.get("meta_description"):
        score -= 8
        reasons.append("missing_meta_description")
    if not checks.get("mobile", {}).get("has_viewport"):
        score -= 10
        reasons.append("missing_viewport")
    broken = checks.get("broken_links", {})
    broken_count = int(broken.get("broken_count") or 0)
    if broken_count:
        score -= min(20, broken_count * 2)
        reasons.append(f"broken_links={broken_count}")
    return {"score": max(0, score), "reasons": reasons}


def run_website_audit(url: str) -> dict[str, Any]:
    status = classify_status(url)
    checks: dict[str, Any] = {
        "status": status,
        "performance": {},
        "mobile": {},
        "seo": {},
        "broken_links": {"checked": 0, "broken_count": 0, "samples": []},
    }
    limitations = list(status.get("limitations") or [])
    limitations.extend(
        [
            f"Max pages crawled: {settings.audit_max_pages}",
            f"Max links checked: {settings.audit_max_links_checked}",
            f"Max response bytes: {settings.audit_max_response_bytes}",
            "Not a Lighthouse/device-lab substitute",
        ]
    )

    if status["status_category"] not in {"working", "redirect"}:
        return {
            "status_category": status["status_category"],
            "checks": checks,
            "score": _score(checks, status["status_category"]),
            "limitations": limitations,
            "target_url": status.get("final_url") or url,
        }

    target = normalize_http_url(status.get("final_url") or url)
    html = ""
    content_type = ""
    with build_client() as client:
        # Follow to final content with bounded redirects already classified
        current = target
        response = None
        for _ in range(5):
            assert_public_hostname(urlparse(current).hostname or "")
            response = client.get(current, follow_redirects=False)
            if response.status_code in {301, 302, 303, 307, 308}:
                loc = response.headers.get("location")
                if not loc:
                    break
                current = normalize_http_url(urljoin(current, loc))
                continue
            break
        if response is None:
            return {
                "status_category": "broken_unreachable",
                "checks": checks,
                "score": _score(checks, "broken_unreachable"),
                "limitations": limitations,
                "target_url": target,
            }

        body = response.content[: settings.audit_max_response_bytes]
        html = body.decode(response.encoding or "utf-8", errors="replace")
        content_type = response.headers.get("content-type", "")
        checks["performance"] = {
            "response_time_ms": status.get("response_time_ms"),
            "bytes_sampled": len(body),
            "http_status": response.status_code,
            "content_type": content_type,
        }

    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.string or "").strip() if soup.title else ""
    meta_desc = ""
    meta = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
    if meta and meta.get("content"):
        meta_desc = str(meta.get("content")).strip()
    canonical = ""
    link_canon = soup.find("link", attrs={"rel": re.compile("canonical", re.I)})
    if link_canon and link_canon.get("href"):
        canonical = str(link_canon.get("href")).strip()
    robots = ""
    robots_meta = soup.find("meta", attrs={"name": re.compile("^robots$", re.I)})
    if robots_meta and robots_meta.get("content"):
        robots = str(robots_meta.get("content")).strip()
    headings = {f"h{i}": len(soup.find_all(f"h{i}")) for i in range(1, 4)}
    images = soup.find_all("img")
    images_missing_alt = sum(1 for img in images if not (img.get("alt") or "").strip())
    viewport = soup.find("meta", attrs={"name": re.compile("^viewport$", re.I)})

    checks["seo"] = {
        "title": title[:300],
        "meta_description": meta_desc[:500],
        "canonical": canonical[:500],
        "robots": robots[:200],
        "headings": headings,
        "image_count": len(images),
        "images_missing_alt": images_missing_alt,
    }
    checks["mobile"] = {
        "has_viewport": bool(viewport and viewport.get("content")),
        "viewport_content": (str(viewport.get("content"))[:200] if viewport else None),
    }

    # Bounded same-site link checks
    anchors = []
    for a in soup.find_all("a", href=True):
        href = str(a.get("href")).strip()
        if href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
            continue
        abs_url = urljoin(target, href)
        try:
            abs_url = normalize_http_url(abs_url)
        except ValueError:
            continue
        if _same_site(target, abs_url):
            anchors.append(abs_url)
        if len(anchors) >= settings.audit_max_links_checked:
            break

    broken_samples: list[dict[str, Any]] = []
    broken_count = 0
    checked = 0
    with build_client() as client:
        for link in anchors[: settings.audit_max_links_checked]:
            checked += 1
            try:
                assert_public_hostname(urlparse(link).hostname or "")
                resp = client.head(link, follow_redirects=False)
                code = resp.status_code
                if code in {405, 501}:
                    resp = client.get(link, follow_redirects=False)
                    code = resp.status_code
                if code >= 400 and code not in {401, 403, 429}:
                    broken_count += 1
                    if len(broken_samples) < 5:
                        broken_samples.append({"url": link, "status_code": code})
            except Exception as exc:
                broken_count += 1
                if len(broken_samples) < 5:
                    broken_samples.append({"url": link, "error": str(exc)[:200]})

    checks["broken_links"] = {
        "checked": checked,
        "broken_count": broken_count,
        "samples": broken_samples,
    }

    status_category = status["status_category"]
    return {
        "status_category": status_category,
        "checks": checks,
        "score": _score(checks, status_category),
        "limitations": limitations,
        "target_url": target,
    }
