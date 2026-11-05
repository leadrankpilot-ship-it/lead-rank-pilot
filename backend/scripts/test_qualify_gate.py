"""Phase 4 gate: scoring consistency + duplicate grouping."""

from app.models.lead import Lead
from app.services.lead_qualification import find_duplicate_groups
from app.services.lead_scoring import score_lead

a = score_lead(
    website_status="website_not_found",
    phone="+15551234567",
    business_name="Acme Gym",
    location="Los Angeles",
)
b = score_lead(
    website_status="working",
    phone=None,
    business_name=None,
    location=None,
    website_url="https://example.com",
)
assert a["score"] > b["score"], (a, b)
assert "website_not_found_on_listing" in a["reasons"]
assert "disclaimer" in a

leads = [
    Lead(
        id=1,
        search_run_id=1,
        source_listing_url="https://maps/a",
        business_name="Acme Gym",
        location="Los Angeles",
        website_status="website_not_found",
        phone="+1 (555) 123-4567",
        dedupe_key="a",
    ),
    Lead(
        id=2,
        search_run_id=1,
        source_listing_url="https://maps/b",
        business_name="Acme Gym",
        location="Los Angeles",
        website_status="website_not_found",
        phone="15551234567",
        dedupe_key="b",
    ),
    Lead(
        id=3,
        search_run_id=1,
        source_listing_url="https://maps/c",
        business_name="Other Place",
        location="Boston",
        website_status="website_not_found",
        phone="9999999999",
        dedupe_key="c",
    ),
]
groups = find_duplicate_groups(leads)
assert any(g["type"] == "phone" and set(g["lead_ids"]) == {1, 2} for g in groups), groups
assert any(g["type"] == "name_location" and set(g["lead_ids"]) == {1, 2} for g in groups), groups
print("qualify-gate-ok", a["score"], len(groups))
