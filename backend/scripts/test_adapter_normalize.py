"""Unit-style check for normalize/dedupe without hitting Google Maps."""

from app.services.scraper.adapter import normalize_and_dedupe

raw = [
    {
        "maps_link": "https://www.google.com/maps/place/A",
        "phone": "+15551212",
        "business_name": "Gold Gym",
        "maps_category": "Gym",
    },
    {
        "maps_link": "https://www.google.com/maps/place/A",
        "phone": "+15551212",
        "business_name": "Gold Gym dup",
        "maps_category": "Gym",
    },
    {
        "maps_link": "https://www.google.com/maps/place/B",
        "phone": "+15559999",
        "business_name": "Fit Club",
        "maps_category": "Fitness center",
    },
    {
        "maps_link": "https://www.google.com/maps/place/C",
        "phone": "+15550001",
        "business_name": "Green Homes",
        "maps_category": "Housing society",
    },
    {"maps_link": "", "phone": "+1000", "business_name": "bad"},
]

out = normalize_and_dedupe(raw, category="Gym", location="LA")
assert len(out) == 2, out
assert all(r["website_status"] == "website_not_found" for r in out)
assert out[0]["category"] == "Gym"
assert out[0]["location"] == "LA"
assert out[0]["dedupe_key"] != out[1]["dedupe_key"]
assert all("Housing" not in (r["business_name"] or "") for r in out)
print("adapter-normalize-ok", len(out))
