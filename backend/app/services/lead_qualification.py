from __future__ import annotations

import json
import re
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.lead import Lead
from app.services.contact_discovery import discover_public_contacts
from app.services.lead_scoring import score_lead


def _norm_name(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def qualify_lead(db: Session, lead: Lead, *, discover_contacts: bool = True) -> Lead:
    email = None
    contact_page = None
    contacts_payload = {}

    if lead.contact_fields_json:
        try:
            contacts_payload = json.loads(lead.contact_fields_json)
            email = contacts_payload.get("email")
            contact_page = contacts_payload.get("contact_page_url")
        except json.JSONDecodeError:
            contacts_payload = {}

    if discover_contacts and lead.website_url:
        discovered = discover_public_contacts(lead.website_url)
        email = discovered.get("email") or email
        contact_page = discovered.get("contact_page_url") or contact_page
        if discovered.get("phone") and not lead.phone:
            lead.phone = discovered["phone"]
        contacts_payload = {
            **contacts_payload,
            "email": email,
            "phone": lead.phone,
            "contact_page_url": contact_page,
            "discovery": discovered,
        }
        lead.contact_fields_json = json.dumps(contacts_payload)

    result = score_lead(
        website_status=lead.website_status,
        phone=lead.phone,
        business_name=lead.business_name,
        location=lead.location,
        email=email,
        contact_page_url=contact_page,
        website_url=lead.website_url,
    )
    lead.score = int(result["score"])
    lead.score_reasons_json = json.dumps(result)
    lead.email = email
    lead.contact_page_url = contact_page
    lead.last_checked_at = datetime.now(UTC)
    db.add(lead)
    return lead


def find_duplicate_groups(leads: list[Lead]) -> list[dict]:
    """Conservative duplicate grouping by phone or normalized name+location."""
    by_phone: dict[str, list[int]] = {}
    by_name_loc: dict[str, list[int]] = {}
    for lead in leads:
        if lead.phone:
            key = re.sub(r"\D", "", lead.phone)
            if len(key) >= 8:
                by_phone.setdefault(key, []).append(lead.id)
        name = _norm_name(lead.business_name)
        loc = _norm_name(lead.location)
        if name and loc:
            by_name_loc.setdefault(f"{name}|{loc}", []).append(lead.id)

    groups = []
    for key, ids in by_phone.items():
        if len(ids) > 1:
            groups.append({"type": "phone", "key": key, "lead_ids": ids})
    for key, ids in by_name_loc.items():
        if len(ids) > 1:
            groups.append({"type": "name_location", "key": key, "lead_ids": ids})
    return groups
