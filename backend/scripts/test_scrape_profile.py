"""Profile a scrape with default UI niche/location and timed phase logs."""

from __future__ import annotations

import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Match product defaults unless overridden
os.environ.setdefault("MAPS_MAX_PLACE_VISITS", "28")
os.environ.setdefault("MAPS_PLACE_CONCURRENCY", "4")
os.environ.setdefault("MAPS_MAX_SCROLL_ROUNDS", "18")
os.environ.setdefault("MAPS_FEED_RETRIES", "2")

from app.services.scraper.adapter import run_maps_search  # noqa: E402


def main() -> None:
    business = os.getenv("TEST_BUSINESS", "Gym")
    location = os.getenv("TEST_LOCATION", "Los Angeles, USA")
    print("=" * 60)
    print(f"PROFILE SCRAPE  niche={business!r}  location={location!r}")
    print(
        "env:",
        f"VISITS={os.environ['MAPS_MAX_PLACE_VISITS']}",
        f"CONCURRENCY={os.environ['MAPS_PLACE_CONCURRENCY']}",
        f"SCROLLS={os.environ['MAPS_MAX_SCROLL_ROUNDS']}",
    )
    print("=" * 60)

    t0 = time.perf_counter()
    phase_marks: list[tuple[float, int, str]] = []
    last_bucket = ""

    def on_progress(pct: int, message: str) -> None:
        nonlocal last_bucket
        elapsed = time.perf_counter() - t0
        # Bucket by major phase for timing
        if pct <= 11:
            bucket = "open_maps"
        elif pct < 28:
            bucket = "scroll_feed"
        elif pct < 100:
            bucket = "check_places"
        else:
            bucket = "done"
        if bucket != last_bucket or pct % 5 == 0 or pct >= 95:
            print(f"  t={elapsed:6.1f}s  [{pct:3d}%]  ({bucket})  {message}")
            phase_marks.append((elapsed, pct, f"{bucket}|{message}"))
            last_bucket = bucket if pct < 100 else last_bucket

    bundled = run_maps_search(business, location, progress_callback=on_progress)
    rows = list(bundled.get("leads") or [])
    examples = list(bundled.get("examples") or [])
    total = time.perf_counter() - t0

    # Derive phase durations from first mark of each bucket
    first: dict[str, float] = {}
    for elapsed, _pct, label in phase_marks:
        bucket = label.split("|", 1)[0]
        first.setdefault(bucket, elapsed)
    first["end"] = total

    def dur(a: str, b: str) -> float:
        if a not in first or b not in first:
            return -1.0
        return first[b] - first[a]

    print("-" * 60)
    print("PHASE TIMING (approx from progress marks)")
    print(f"  open_maps     ~ {dur('open_maps', 'scroll_feed'):.1f}s" if "scroll_feed" in first else "  open_maps: n/a")
    print(f"  scroll_feed   ~ {dur('scroll_feed', 'check_places'):.1f}s" if "check_places" in first else "  scroll_feed: n/a")
    print(f"  check_places  ~ {dur('check_places', 'done'):.1f}s" if "done" in first and "check_places" in first else "  check_places: n/a")
    print(f"  TOTAL         = {total:.1f}s")
    print("-" * 60)

    wa = sum(1 for r in rows if r.get("has_whatsapp"))
    print(f"RESULT  leads={len(rows)}  examples={len(examples)}  whatsapp={wa}")
    if rows:
        for r in rows[:10]:
            print(
                f"  • {r.get('business_name')!r}  phone={r.get('phone')}  "
                f"wa={r.get('has_whatsapp')}"
            )
    for r in examples[:5]:
        print(
            f"  ★ {r.get('business_name')!r}  reviews={r.get('review_count')}  "
            f"site={r.get('website_url')}"
        )
    if not rows and not examples:
        print("  (0 leads) HINT: for Gym+LA most Maps cards already have a website;")
        print("  scraper keeps website_not_found + phone as leads, and top sites as examples.")
    print("=" * 60)
    if total > 90:
        print("HINT: check_places dominates — raise MAPS_PLACE_CONCURRENCY or lower MAPS_MAX_PLACE_VISITS")
    if len(rows) == 0:
        print("HINT: empty != crash; niche is saturated with websites on Maps")
        sys.exit(2)
    print("OK: profile-scrape-ok")


if __name__ == "__main__":
    main()
