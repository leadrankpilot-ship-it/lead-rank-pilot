"""One-shot scrape verify: speed + WhatsApp flags + non-empty reliability."""

from __future__ import annotations

import os
import sys
import time

# Ensure backend package root on path
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault("MAPS_MAX_PLACE_VISITS", "12")
os.environ.setdefault("MAPS_PLACE_CONCURRENCY", "4")
os.environ.setdefault("MAPS_MAX_SCROLL_ROUNDS", "12")
os.environ.setdefault("MAPS_FEED_RETRIES", "2")

from app.services.scraper.adapter import run_maps_search  # noqa: E402


def main() -> None:
    business = os.getenv("TEST_BUSINESS", "Gym")
    location = os.getenv("TEST_LOCATION", "Los Angeles, USA")
    print(f"Starting scrape: {business} in {location}")
    t0 = time.perf_counter()
    last = {"pct": -1}

    def on_progress(pct: int, message: str) -> None:
        if pct != last["pct"] and (pct % 10 == 0 or pct >= 95 or pct <= 15):
            print(f"  [{pct:3d}%] {message}")
            last["pct"] = pct

    bundled = run_maps_search(business, location, progress_callback=on_progress)
    rows = list(bundled.get("leads") or [])
    examples = list(bundled.get("examples") or [])
    elapsed = time.perf_counter() - t0
    wa = sum(1 for r in rows if r.get("has_whatsapp"))
    print("---")
    print(f"elapsed_sec={elapsed:.1f}")
    print(f"leads={len(rows)} examples={len(examples)} whatsapp={wa}")
    for r in rows[:8]:
        print(
            f"  - {r.get('business_name')!r} phone={r.get('phone')} "
            f"wa={r.get('has_whatsapp')} url={r.get('source_listing_url')[:60]}..."
        )
    for r in examples[:5]:
        print(
            f"  * example {r.get('business_name')!r} reviews={r.get('review_count')} "
            f"site={r.get('website_url')}"
        )
    if len(rows) == 0 and len(examples) == 0:
        print("FAIL: 0 leads — flaky feed or filters too strict for this query")
        sys.exit(2)
    print("OK: scrape-once-gate-ok")


if __name__ == "__main__":
    main()
