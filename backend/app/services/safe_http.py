"""SSRF-aware HTTP helpers for outbound website checks."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import httpx

from app.core.config import settings

BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def normalize_http_url(url: str) -> str:
    value = url.strip()
    raw = urlparse(value)
    if raw.scheme and raw.scheme not in {"http", "https"}:
        raise ValueError("Only http/https URLs are allowed")
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http/https URLs are allowed")
    if not parsed.hostname:
        raise ValueError("URL host is required")
    if parsed.port and parsed.port not in {80, 443, 8080, 8443}:
        raise ValueError("Port not allowed")
    return value


def assert_public_hostname(hostname: str) -> None:
    host = hostname.lower().strip(".")
    if host in {"localhost"} or host.endswith(".localhost") or host.endswith(".local"):
        raise ValueError("Localhost targets are blocked")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise ValueError("Unable to resolve host") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if any(ip in net for net in BLOCKED_NETWORKS):
            raise ValueError("Private/reserved IP targets are blocked")


def build_client() -> httpx.Client:
    return httpx.Client(
        follow_redirects=False,
        timeout=settings.audit_request_timeout_seconds,
        headers={"User-Agent": settings.audit_user_agent},
    )


def fetch_url(url: str, *, method: str = "GET") -> httpx.Response:
    safe_url = normalize_http_url(url)
    host = urlparse(safe_url).hostname
    if not host:
        raise ValueError("Invalid URL")
    assert_public_hostname(host)

    with build_client() as client:
        response = client.request(method, safe_url)
        # Re-check redirect targets one hop at a time (caller handles classification)
        return response
