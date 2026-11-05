"""Adapter around the existing Google Maps scraper.

Normalizes output, applies website labeling, and deduplicates.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from app.services.contact_discovery import discover_public_contacts
from app.services.scraper.google_maps import scrape_maps, scrape_maps_contacts
from app.services.scraper.relevance import is_relevant_place

ProgressCallback = Callable[[int, str], None]


def _dedupe_key(maps_link: str, phone: str) -> str:
    raw = f"{maps_link.strip().lower()}|{phone.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def normalize_and_dedupe(
    raw_rows: list[dict[str, Any]],
    *,
    category: str,
    location: str,
) -> list[dict[str, Any]]:
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    now = datetime.now(UTC)

    for row in raw_rows:
        maps_link = (row.get("maps_link") or "").strip()
        phone = (row.get("phone") or "").strip()
        website_url = (row.get("website_url") or "").strip() or None
        # Leads need phone; example sites need a website URL (phone optional).
        if not maps_link:
            continue
        if not phone and not website_url:
            continue

        key = _dedupe_key(maps_link, phone or website_url or maps_link)
        if key in seen:
            continue
        seen.add(key)

        has_whatsapp = bool(row.get("has_whatsapp"))
        email = (row.get("email") or "").strip() or None
        review_count = row.get("review_count")
        try:
            review_count = int(review_count) if review_count is not None else None
        except (TypeError, ValueError):
            review_count = None
        rating = row.get("rating")
        try:
            rating = float(rating) if rating is not None else None
        except (TypeError, ValueError):
            rating = None
        website_status = (row.get("website_status") or "").strip()
        if website_url:
            website_status = website_status or "working"
        else:
            website_status = "website_not_found"
        maps_category = (row.get("maps_category") or "").strip() or None
        if not is_relevant_place(
            category,
            business_name=row.get("business_name"),
            maps_category=maps_category,
        ):
            continue

        normalized.append(
            {
                "source_listing_url": maps_link,
                "business_name": row.get("business_name"),
                "location": location,
                "category": category,
                "website_url": website_url,
                "website_status": website_status,
                "phone": phone or None,
                "email": email,
                "review_count": review_count,
                "rating": rating,
                "contact_fields_json": json.dumps(
                    {
                        "phone": phone or None,
                        "has_whatsapp": has_whatsapp,
                        "email": email,
                        "review_count": review_count,
                        "rating": rating,
                        "website_url": website_url,
                        "maps_category": maps_category,
                    }
                ),
                "has_whatsapp": has_whatsapp,
                "dedupe_key": key,
                "last_checked_at": now,
            }
        )

    return normalized


def _rank_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        rows,
        key=lambda r: (int(r.get("review_count") or 0), float(r.get("rating") or 0)),
        reverse=True,
    )
    for i, row in enumerate(ranked, start=1):
        row["rank"] = i
    return ranked


def run_maps_search(
    business_type: str,
    location: str,
    progress_callback: ProgressCallback | None = None,
    max_results: int = 15,
    exclude_urls: list[str] | None = None,
    exclude_phones: list[str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    niche = business_type.strip()
    query = f"{niche} in {location.strip()}"
    raw = scrape_maps(
        query,
        progress_callback=progress_callback,
        max_places=max_results,
        exclude_urls=exclude_urls,
        exclude_phones=exclude_phones,
        niche=niche,
    )
    # Backward-safe if an older scrape_maps still returns a bare list.
    if isinstance(raw, list):
        leads_raw, examples_raw = raw, []
    else:
        leads_raw = list(raw.get("leads") or [])
        examples_raw = list(raw.get("examples") or [])

    _ = max_results  # display quota is applied in the browser pool, not here
    excl_urls = {
        (u or "").strip().split("?")[0].rstrip("/").lower()
        for u in (exclude_urls or [])
        if (u or "").strip()
    }
    excl_phones = {
        "".join(ch for ch in (p or "") if ch.isdigit())
        for p in (exclude_phones or [])
        if len("".join(ch for ch in (p or "") if ch.isdigit())) >= 8
    }

    def _not_excluded(row: dict[str, Any]) -> bool:
        url = (row.get("source_listing_url") or "").strip().split("?")[0].rstrip("/").lower()
        phone = "".join(ch for ch in (row.get("phone") or "") if ch.isdigit())
        if url and url in excl_urls:
            return False
        if phone and phone in excl_phones:
            return False
        return True

    # Return the full inventory for this query (client shows only the selected page size).
    leads = _rank_rows(
        [
            r
            for r in normalize_and_dedupe(
                leads_raw, category=business_type.strip(), location=location.strip()
            )
            if _not_excluded(r)
        ]
    )
    examples = _rank_rows(
        normalize_and_dedupe(
            examples_raw, category=business_type.strip(), location=location.strip()
        )
    )[:5]
    return {"leads": leads, "examples": examples}


def run_maps_contact_search(
    business_type: str,
    location: str,
    progress_callback: ProgressCallback | None = None,
    max_results: int = 15,
    exclude_urls: list[str] | None = None,
    exclude_phones: list[str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Maps businesses with websites → crawl for email/phone; skip if neither found."""
    niche = business_type.strip()
    loc = location.strip()
    query = f"{niche} in {loc}"
    raw = scrape_maps_contacts(
        query,
        progress_callback=progress_callback,
        max_places=max_results,
        exclude_urls=exclude_urls,
        exclude_phones=exclude_phones,
        niche=niche,
    )
    contacts_raw = list(raw.get("contacts") or [])

    excl_urls = {
        (u or "").strip().split("?")[0].rstrip("/").lower()
        for u in (exclude_urls or [])
        if (u or "").strip()
    }
    excl_phones = {
        "".join(ch for ch in (p or "") if ch.isdigit())
        for p in (exclude_phones or [])
        if len("".join(ch for ch in (p or "") if ch.isdigit())) >= 8
    }

    # Full inventory for this tab session; UI shows selected page size from a pool.
    _ = max_results
    kept: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    total = max(len(contacts_raw), 1)

    for i, row in enumerate(contacts_raw):
        if progress_callback and i % 2 == 0:
            pct = 78 + int(i / total * 20)
            try:
                progress_callback(min(98, pct), "Reading contact pages…")
            except Exception:
                pass

        website_url = (row.get("website_url") or "").strip()
        if not website_url:
            continue
        maps_link = (row.get("maps_link") or "").strip()
        if not maps_link:
            continue
        url_key = maps_link.split("?")[0].rstrip("/").lower()
        if url_key in excl_urls:
            continue

        maps_phone = (row.get("phone") or "").strip() or None
        maps_email = (row.get("email") or "").strip() or None
        email = maps_email
        phone = maps_phone
        contact_page = None
        try:
            discovered = discover_public_contacts(website_url)
            email = (discovered.get("email") or email or "").strip() or None
            phone = (discovered.get("phone") or phone or "").strip() or None
            contact_page = discovered.get("contact_page_url")
        except Exception:
            pass

        if not email and not phone:
            continue
        phone_digits = "".join(ch for ch in (phone or "") if ch.isdigit())
        if phone_digits and phone_digits in excl_phones:
            continue

        if not is_relevant_place(
            niche,
            business_name=row.get("business_name"),
            maps_category=(row.get("maps_category") or None),
        ):
            continue

        key = _dedupe_key(maps_link, phone or website_url or maps_link)
        if key in seen_keys:
            continue
        seen_keys.add(key)

        now = datetime.now(UTC)
        has_whatsapp = bool(row.get("has_whatsapp"))
        kept.append(
            {
                "source_listing_url": maps_link,
                "business_name": row.get("business_name"),
                "location": loc,
                "category": niche,
                "website_url": website_url,
                "website_status": "working",
                "phone": phone,
                "email": email,
                "contact_page_url": contact_page,
                "review_count": row.get("review_count"),
                "rating": row.get("rating"),
                "contact_fields_json": json.dumps(
                    {
                        "phone": phone,
                        "email": email,
                        "has_whatsapp": has_whatsapp,
                        "website_url": website_url,
                        "contact_page_url": contact_page,
                    }
                ),
                "has_whatsapp": has_whatsapp,
                "dedupe_key": key,
                "last_checked_at": now,
            }
        )

    if progress_callback:
        try:
            progress_callback(100, "Done")
        except Exception:
            pass
    return {"leads": _rank_rows(kept), "examples": []}


def run_manual_contact_search(
    websites: list[str],
    progress_callback: ProgressCallback | None = None,
    *,
    concurrency: int | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Visit user-provided websites and extract public email/phone via contact_discovery."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    from app.core.config import settings

    urls = [u.strip() for u in websites if (u or "").strip()]
    # Dedupe preserve order
    seen: set[str] = set()
    unique: list[str] = []
    for u in urls:
        key = u.split("?")[0].rstrip("/").lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(u)

    workers = max(1, min(int(concurrency or settings.manual_contact_concurrency), 8))
    total = max(len(unique), 1)
    done = 0
    kept: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    email_seen: set[str] = set()

    def _one(url: str) -> dict[str, Any]:
        now = datetime.now(UTC)
        try:
            discovered = discover_public_contacts(url)
            email = (discovered.get("email") or "").strip() or None
            phone = (discovered.get("phone") or "").strip() or None
            contact_page = discovered.get("contact_page_url")
            host = url.split("://", 1)[-1].split("/", 1)[0]
            if not email and not phone:
                return {
                    "_failed": True,
                    "website_url": url,
                    "error": "No public email or phone found",
                    "source_listing_url": url,
                    "business_name": host,
                    "location": None,
                    "category": "manual",
                    "website_status": "no_contact",
                    "phone": None,
                    "email": None,
                    "contact_page_url": contact_page,
                    "has_whatsapp": False,
                    "dedupe_key": _dedupe_key(url, url),
                    "last_checked_at": now,
                    "contact_fields_json": json.dumps({"error": "no_contact"}),
                }
            return {
                "_failed": False,
                "source_listing_url": url,
                "business_name": host,
                "location": None,
                "category": "manual",
                "website_url": url,
                "website_status": "working",
                "phone": phone,
                "email": email,
                "contact_page_url": contact_page,
                "review_count": None,
                "rating": None,
                "has_whatsapp": False,
                "dedupe_key": _dedupe_key(url, phone or email or url),
                "last_checked_at": now,
                "contact_fields_json": json.dumps(
                    {
                        "phone": phone,
                        "email": email,
                        "website_url": url,
                        "contact_page_url": contact_page,
                    }
                ),
            }
        except Exception as exc:
            host = url.split("://", 1)[-1].split("/", 1)[0]
            return {
                "_failed": True,
                "website_url": url,
                "error": str(exc)[:300],
                "source_listing_url": url,
                "business_name": host,
                "location": None,
                "category": "manual",
                "website_status": "failed",
                "phone": None,
                "email": None,
                "contact_page_url": None,
                "has_whatsapp": False,
                "dedupe_key": _dedupe_key(url, url),
                "last_checked_at": datetime.now(UTC),
                "contact_fields_json": json.dumps({"error": str(exc)[:300]}),
            }

    if progress_callback:
        try:
            progress_callback(5, "Starting website scrape…")
        except Exception:
            pass

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_one, u): u for u in unique}
        for fut in as_completed(futures):
            row = fut.result()
            done += 1
            if progress_callback:
                pct = 5 + int(done / total * 90)
                try:
                    progress_callback(min(95, pct), f"Checking sites… ({done}/{len(unique)})")
                except Exception:
                    pass
            if row.get("_failed"):
                failed.append({k: v for k, v in row.items() if not k.startswith("_")})
                continue
            email = (row.get("email") or "").strip().lower()
            if email and email in email_seen:
                # Keep first occurrence of an email; mark later as skipped-dupe in failed.
                failed.append(
                    {
                        **{k: v for k, v in row.items() if not k.startswith("_")},
                        "website_status": "duplicate_email",
                        "error": f"Duplicate email {email}",
                    }
                )
                continue
            if email:
                email_seen.add(email)
            kept.append({k: v for k, v in row.items() if not k.startswith("_")})

    if progress_callback:
        try:
            progress_callback(100, "Done")
        except Exception:
            pass
    return {"leads": _rank_rows(kept), "examples": [], "failed": failed}
