from __future__ import annotations

import ssl
import time
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from app.core.config import settings
from app.services.safe_http import assert_public_hostname, build_client, normalize_http_url


def classify_status(url: str) -> dict[str, Any]:
    """Classify website reachability with conservative unknown/blocked handling."""
    started = time.perf_counter()
    evidence: dict[str, Any] = {"requested_url": url, "hops": []}
    current = normalize_http_url(url)
    final_url = current
    status_category = "unknown"
    http_status: int | None = None

    try:
        with build_client() as client:
            for _ in range(5):
                host = urlparse(current).hostname
                if not host:
                    status_category = "broken_unreachable"
                    break
                assert_public_hostname(host)
                try:
                    response = client.request("GET", current)
                except httpx.TimeoutException:
                    status_category = "broken_unreachable"
                    evidence["error"] = "timeout"
                    break
                except httpx.ConnectError as exc:
                    msg = str(exc).lower()
                    if "certificate" in msg or "ssl" in msg or "tls" in msg:
                        status_category = "tls_issue"
                    else:
                        status_category = "broken_unreachable"
                    evidence["error"] = str(exc)[:500]
                    break
                except ssl.SSLError as exc:
                    status_category = "tls_issue"
                    evidence["error"] = str(exc)[:500]
                    break

                http_status = response.status_code
                hop = {
                    "url": current,
                    "status_code": response.status_code,
                    "content_length": len(response.content[: settings.audit_max_response_bytes]),
                }
                evidence["hops"].append(hop)

                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        status_category = "broken_unreachable"
                        break
                    next_url = urljoin(current, location)
                    next_url = normalize_http_url(next_url)
                    assert_public_hostname(urlparse(next_url).hostname or "")
                    current = next_url
                    final_url = current
                    status_category = "redirect"
                    continue

                if response.status_code in {401, 403, 429}:
                    status_category = "unknown_blocked"
                    final_url = str(response.url)
                    evidence["body_preview"] = response.text[:300]
                    break

                if 200 <= response.status_code < 400:
                    status_category = "working" if response.status_code < 300 else "redirect"
                    final_url = str(response.url)
                    evidence["final_content_type"] = response.headers.get("content-type")
                    break

                if response.status_code >= 500:
                    status_category = "broken_unreachable"
                    break

                status_category = "unknown_blocked"
                break
    except ValueError as exc:
        status_category = "unknown_blocked"
        evidence["error"] = str(exc)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return {
        "status_category": status_category,
        "http_status": http_status,
        "final_url": final_url,
        "response_time_ms": elapsed_ms,
        "evidence": evidence,
        "limitations": [
            "403/bot protection is treated as unknown_blocked, not broken",
            "This is a single-path reachability check, not a full uptime monitor",
        ],
    }
