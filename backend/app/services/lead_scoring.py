from __future__ import annotations

from typing import Any


def score_lead(
    *,
    website_status: str,
    phone: str | None,
    business_name: str | None,
    location: str | None,
    email: str | None = None,
    contact_page_url: str | None = None,
    website_url: str | None = None,
) -> dict[str, Any]:
    """Rule-based opportunity score. Not purchase-intent."""
    score = 0
    reasons: list[str] = []

    if website_status == "website_not_found":
        score += 40
        reasons.append("website_not_found_on_listing")
    elif website_status == "working" and website_url:
        score += 5
        reasons.append("website_present")
    elif website_status in {"broken_unreachable", "tls_issue"}:
        score += 25
        reasons.append(f"website_{website_status}")

    if phone:
        score += 25
        reasons.append("phone_present")
    if business_name:
        score += 10
        reasons.append("business_name_present")
    if location:
        score += 5
        reasons.append("location_present")
    if email:
        score += 20
        reasons.append("public_email_found")
    if contact_page_url:
        score += 10
        reasons.append("contact_page_found")

    return {
        "score": min(100, score),
        "reasons": reasons,
        "disclaimer": "Rule-based opportunity score from observed fields only — not confirmed purchase intent",
    }
