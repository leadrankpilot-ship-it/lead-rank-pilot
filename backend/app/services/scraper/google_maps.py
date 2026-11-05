"""Google Maps lead scraper — adapted from the original Streamlit tool.

Returns:
  - leads: listings with no website on Maps (phone required)
  - examples: top 5 listings that do show a website (by review count)

Label lead results as "website not found" at the API layer; do not claim the
business has no website in absolute terms.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import urllib.parse
from collections.abc import Callable
from typing import Any

from playwright.async_api import Browser, Page, async_playwright

from app.services.scraper.relevance import is_relevant_place

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[int, str], None]

MAX_PLACE_VISITS = int(os.getenv("MAPS_MAX_PLACE_VISITS", "28"))
MAX_SCROLL_ROUNDS = int(os.getenv("MAPS_MAX_SCROLL_ROUNDS", "45"))
PLACE_CONCURRENCY = int(os.getenv("MAPS_PLACE_CONCURRENCY", "6"))
FEED_RETRIES = int(os.getenv("MAPS_FEED_RETRIES", "2"))
# How many Maps cards to pull from the feed so we can dig past "has website" listings
# until lead_target is filled or the feed is exhausted.
FEED_LINK_MAX = int(os.getenv("MAPS_FEED_LINK_MAX", "150"))

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")


def _emit(cb: ProgressCallback | None, pct: int, message: str) -> None:
    if cb:
        try:
            cb(pct, message)
        except Exception:
            logger.debug("progress callback failed", exc_info=True)


async def _launch_chromium(p: Any) -> Browser:
    """Prefer bundled Chromium; fall back to installed Chrome/Edge if missing."""
    launch_args = [
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--no-sandbox",
        "--disable-background-networking",
    ]
    try:
        return await p.chromium.launch(headless=True, args=launch_args)
    except Exception as exc:
        msg = str(exc)
        if "Executable doesn't exist" not in msg and "playwright install" not in msg.lower():
            raise
        for channel in ("chrome", "msedge"):
            try:
                logger.warning("bundled Chromium missing; launching channel=%s", channel)
                return await p.chromium.launch(headless=True, channel=channel, args=launch_args)
            except Exception:
                logger.debug("channel %s failed", channel, exc_info=True)
        raise RuntimeError(
            "Playwright browser not found. Run: python -m playwright install chromium "
            "(or install Google Chrome / Edge)."
        ) from exc


async def _dismiss_consent(page: Page) -> None:
    for selector in [
        'button:has-text("Accept all")',
        'button:has-text("Reject all")',
        'button:has-text("I agree")',
        'button:has-text("Accept")',
    ]:
        try:
            btn = page.locator(selector).first
            if await btn.is_visible(timeout=500):
                await btn.click()
                await page.wait_for_timeout(300)
                return
        except Exception:
            continue


async def _detect_whatsapp(page: Page) -> bool:
    """Detect a WhatsApp action on the open Maps place panel.

    Google rotates markup (buttons, chips, aria-labels, wa.me links). A narrow
    CSS-only check missed many real WhatsApp CTAs → false negatives.
    """
    # Give the action row a moment after title/phone paint.
    for sel in (
        'button[data-item-id^="phone"]',
        'a[data-item-id="authority"]',
        '[aria-label*="WhatsApp" i]',
        '[data-item-id*="whatsapp" i]',
    ):
        try:
            await page.wait_for_selector(sel, timeout=1200)
            break
        except Exception:
            continue
    else:
        await page.wait_for_timeout(400)

    try:
        return bool(
            await page.evaluate(
                """() => {
                  const WA_RE = /whatsapp|\\bwa\\.me\\b|api\\.whatsapp\\.com|chat\\.whatsapp/i;
                  const nodes = document.querySelectorAll(
                    'a, button, [role="button"], [data-item-id], [aria-label], [data-tooltip], [data-value], [jsaction]'
                  );
                  for (const el of nodes) {
                    if (!(el instanceof HTMLElement)) continue;
                    // Prefer visible controls in the place panel (skip off-screen chrome).
                    const rect = el.getBoundingClientRect();
                    if (rect.width < 1 && rect.height < 1) continue;

                    const attrs = [
                      el.getAttribute('href') || '',
                      el.getAttribute('data-item-id') || '',
                      el.getAttribute('aria-label') || '',
                      el.getAttribute('data-tooltip') || '',
                      el.getAttribute('title') || '',
                      el.getAttribute('data-value') || '',
                      el.getAttribute('jsaction') || '',
                    ].join(' ');
                    if (WA_RE.test(attrs)) return true;

                    const text = (el.innerText || el.textContent || '').trim();
                    if (text && WA_RE.test(text) && text.length < 80) return true;
                  }

                  // Fallback: any wa.me / whatsapp href anywhere in the place DOM.
                  for (const a of document.querySelectorAll('a[href]')) {
                    const href = a.getAttribute('href') || '';
                    if (WA_RE.test(href)) return true;
                  }
                  return false;
                }"""
            )
        )
    except Exception:
        # Last-resort CSS probes (case-insensitive where supported).
        for sel in (
            'a[href*="wa.me" i]',
            'a[href*="api.whatsapp.com" i]',
            'a[href*="whatsapp.com" i]',
            '[data-item-id*="whatsapp" i]',
            '[aria-label*="WhatsApp" i]',
            '[aria-label*="whatsapp" i]',
            '[data-tooltip*="WhatsApp" i]',
            'button:has-text("WhatsApp")',
            'a:has-text("WhatsApp")',
        ):
            try:
                if await page.query_selector(sel):
                    return True
            except Exception:
                continue
        return False


async def _detect_reviews(page: Page) -> dict[str, Any]:
    """Pull star rating + review count from the Maps place header when present."""
    try:
        data = await page.evaluate(
            """() => {
              const out = { rating: null, review_count: null };
              const nodes = document.querySelectorAll('[aria-label], button, span, div');
              for (const el of nodes) {
                const label = (el.getAttribute('aria-label') || '').trim();
                // e.g. "4.6 stars 128 reviews" / "4,6 stars 1,234 reviews"
                let m = label.match(/([0-9]+(?:[.,][0-9])?)\\s*stars?.*?([0-9][0-9.,]*)\\s*reviews?/i);
                if (m) {
                  out.rating = parseFloat(m[1].replace(',', '.'));
                  out.review_count = parseInt(m[2].replace(/[.,]/g, ''), 10);
                  if (!Number.isNaN(out.rating) && !Number.isNaN(out.review_count)) return out;
                }
                m = label.match(/([0-9][0-9.,]*)\\s*reviews?/i);
                if (m && out.review_count == null) {
                  const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
                  if (!Number.isNaN(n)) out.review_count = n;
                }
              }
              // Fallback: visible "(1,234)" near rating
              if (out.review_count == null) {
                const text = (document.body && document.body.innerText) ? document.body.innerText.slice(0, 4000) : '';
                const m = text.match(/([0-9]+(?:[.,][0-9])?)\\s*[\\n\\r\\s]*\\(([0-9][0-9.,]*)\\)/);
                if (m) {
                  out.rating = parseFloat(m[1].replace(',', '.'));
                  out.review_count = parseInt(m[2].replace(/[.,]/g, ''), 10);
                }
              }
              return out;
            }"""
        )
        rating = data.get("rating")
        count = data.get("review_count")
        return {
            "rating": float(rating) if isinstance(rating, (int, float)) and 0 < float(rating) <= 5 else None,
            "review_count": int(count) if isinstance(count, (int, float)) and int(count) >= 0 else None,
        }
    except Exception:
        return {"rating": None, "review_count": None}


async def _detect_email(page: Page) -> str | None:
    """Best-effort email from the Maps place panel (mailto / visible text). Rare on Maps."""
    try:
        raw = await page.evaluate(
            """() => {
              const mails = [];
              for (const a of document.querySelectorAll('a[href^="mailto:"], a[href^="MAILTO:"]')) {
                const href = a.getAttribute('href') || '';
                const mail = href.replace(/^mailto:/i, '').split('?')[0].trim();
                if (mail) mails.push(mail);
              }
              const text = document.body ? (document.body.innerText || '') : '';
              return { mails, text: text.slice(0, 12000) };
            }"""
        )
    except Exception:
        return None

    candidates: list[str] = []
    for m in raw.get("mails") or []:
        if isinstance(m, str) and m.strip():
            candidates.append(m.strip().lower())
    for m in _EMAIL_RE.findall(raw.get("text") or ""):
        low = m.lower()
        if low.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")):
            continue
        candidates.append(low)

    # Prefer non-google / non-schema junk
    skip_parts = ("google.com", "schema.org", "example.com", "sentry.io", "wixpress.com")
    for email in candidates:
        if any(p in email for p in skip_parts):
            continue
        if 5 < len(email) < 255:
            return email
    return None


async def _detect_maps_category(page: Page) -> str:
    """Maps place type chip under the title (e.g. Gym, Housing society)."""
    try:
        raw = await page.evaluate(
            """() => {
              const clean = (t) => (t || '').replace(/\\s+/g, ' ').trim();
              const skip = /direction|save|share|call|website|review|star|open|close|hour|menu|suggest|owned|claim|photo|write|search|result|\\$|^[0-9.,]+$/i;
              // Prefer the official category control only — broad button walks caused false "Gym" chips.
              const sels = [
                'button[jsaction*="pane.rating.category"]',
                'button[jsaction*="pane.category"]',
                'button[jsaction*="category"]',
              ];
              for (const sel of sels) {
                const el = document.querySelector(sel);
                const t = clean(el && el.textContent);
                if (t && t.length >= 2 && t.length < 60 && !skip.test(t)) return t;
              }
              // Tight fallback: first short button immediately under the title block only.
              const h1 = document.querySelector('h1');
              if (!h1) return '';
              const root = h1.parentElement;
              if (!root) return '';
              for (const b of root.querySelectorAll('button')) {
                const t = clean(b.textContent);
                if (!t || t.length > 40 || t.length < 2) continue;
                if (skip.test(t)) continue;
                if (t.split(' ').length > 5) continue;
                if (/https?:|www\\./i.test(t)) continue;
                const ja = (b.getAttribute('jsaction') || '').toLowerCase();
                if (ja && !ja.includes('category') && !ja.includes('rating')) continue;
                return t;
              }
              return '';
            }"""
        )
        return (raw or "").strip()
    except Exception:
        return ""


async def _extract_place(page: Page, link: str, niche: str = "") -> dict[str, Any] | None:
    """Open a place page; return lead/example dict or skip marker.

    - No Maps website + phone → lead (website_not_found)
    - Has Maps website → example candidate (working + URL); phone optional
    - No website and no phone → skip
    - Maps category / name must match searched niche
    """
    try:
        await page.goto(link, wait_until="domcontentloaded", timeout=20000)
        try:
            await page.wait_for_selector("h1", timeout=3500)
        except Exception:
            await page.wait_for_timeout(250)

        business_name = ""
        h1 = await page.query_selector("h1")
        if h1:
            business_name = ((await h1.inner_text()) or "").strip()
        maps_category = await _detect_maps_category(page)

        if niche and not is_relevant_place(
            niche, business_name=business_name, maps_category=maps_category or None
        ):
            return {"_skip": "irrelevant", "business_name": business_name, "maps_category": maps_category}

        website_url: str | None = None
        authority = await page.query_selector('a[data-item-id="authority"]')
        if authority:
            href = (await authority.get_attribute("href") or "").strip()
            if href.startswith("http"):
                website_url = href.split("?")[0]

        phone = ""
        phone_el = await page.query_selector('button[data-item-id^="phone:tel:"]')
        if phone_el:
            phone_attr = await phone_el.get_attribute("data-item-id") or ""
            phone = phone_attr.replace("phone:tel:", "").strip()
            phone = re.sub(r"[^\d+]", "", phone)

        if not phone:
            try:
                phone = await page.evaluate(
                    """() => {
                      const btn = document.querySelector('button[data-item-id^="phone:tel:"]');
                      if (btn) {
                        const id = btn.getAttribute('data-item-id') || '';
                        return id.replace(/^phone:tel:/, '');
                      }
                      const a = document.querySelector('a[href^="tel:"]');
                      if (a) return (a.getAttribute('href') || '').replace(/^tel:/, '');
                      return '';
                    }"""
                )
                phone = re.sub(r"[^\d+]", "", phone or "")
            except Exception:
                phone = ""

        # Leads need a phone; example sites (with website) can proceed without one.
        if not phone and not website_url:
            return {"_skip": "no_phone"}

        if phone and not phone.startswith("+") and len(re.sub(r"\D", "", phone)) >= 10:
            digits_only = re.sub(r"\D", "", phone)
            if digits_only:
                phone = f"+{digits_only}"
        elif phone.startswith("+"):
            phone = "+" + re.sub(r"\D", "", phone)

        has_whatsapp = await _detect_whatsapp(page)
        email = await _detect_email(page)
        reviews = await _detect_reviews(page)

        maps_link = page.url.split("?")[0]
        is_example = bool(website_url)
        return {
            "maps_link": maps_link,
            "phone": phone or "",
            "email": email,
            "business_name": business_name or None,
            "maps_category": maps_category or None,
            "website_url": website_url,
            "website_status": "working" if is_example else "website_not_found",
            "has_whatsapp": has_whatsapp,
            "review_count": reviews.get("review_count"),
            "rating": reviews.get("rating"),
            "_bucket": "example" if is_example else "lead",
        }
    except Exception as exc:
        logger.debug("place extract failed for %s: %s", link, exc)
        return None


def _norm_maps_url(url: str | None) -> str:
    if not url:
        return ""
    return url.strip().split("?")[0].rstrip("/").lower()


def _norm_phone(phone: str | None) -> str:
    if not phone:
        return ""
    return re.sub(r"\D", "", phone)


async def _scroll_feed(
    page: Page,
    progress_callback: ProgressCallback | None,
    link_budget: int,
) -> list[str]:
    """Scroll the Maps results feed until it stops growing or link_budget is reached.

    Google Maps only lazy-loads more cards when the results panel is scrolled
    (scrollTop alone is often not enough in headless) — use scrollIntoView + wheel.
    """
    prev_unique = 0
    stable_rounds = 0
    target = max(10, min(FEED_LINK_MAX, int(link_budget)))

    async def _unique_count() -> int:
        return int(
            await page.evaluate(
                """() => {
                  const hrefs = new Set();
                  for (const a of document.querySelectorAll('a[href*="/maps/place/"]')) {
                    const h = (a.getAttribute('href') || '').split('?')[0];
                    if (h) hrefs.add(h);
                  }
                  return hrefs.size;
                }"""
            )
        )

    for i in range(MAX_SCROLL_ROUNDS):
        try:
            await page.evaluate(
                """() => {
                  const feed = document.querySelector('div[role="feed"]');
                  if (!feed) return;
                  const items = feed.querySelectorAll('a[href*="/maps/place/"]');
                  const last = items[items.length - 1];
                  if (last) last.scrollIntoView({ block: 'end', inline: 'nearest' });
                  feed.scrollTop = feed.scrollHeight;
                }"""
            )
            try:
                feed = page.locator('div[role="feed"]').first
                await feed.hover(timeout=1500)
                await page.mouse.wheel(0, 3200)
            except Exception:
                pass
            await page.wait_for_timeout(700)

            unique = await _unique_count()
            _emit(progress_callback, min(12 + i, 24), "Loading listings…")
            if unique >= target:
                break
            if unique <= prev_unique:
                stable_rounds += 1
                if stable_rounds >= 5:
                    break
            else:
                stable_rounds = 0
                prev_unique = unique
        except Exception:
            break

    listings = await page.query_selector_all('a[href*="/maps/place/"]')
    links: list[str] = []
    seen_norms: set[str] = set()
    for listing in listings:
        href = await listing.get_attribute("href")
        if not href:
            continue
        if href.startswith("/"):
            href = "https://www.google.com" + href
        norm = _norm_maps_url(href)
        if not norm or norm in seen_norms:
            continue
        seen_norms.add(norm)
        links.append(href)
        if len(links) >= target:
            break
    return links


async def _open_feed_with_retry(browser: Browser, maps_url: str, progress_callback: ProgressCallback | None):
    last_err: Exception | None = None
    for attempt in range(1, FEED_RETRIES + 1):
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            locale="en-US",
        )
        await context.route(
            "**/*",
            lambda route: (
                route.abort()
                if route.request.resource_type in {"image", "media", "font"}
                else route.continue_()
            ),
        )
        page = await context.new_page()
        try:
            _emit(progress_callback, 5, "Opening Google Maps…")
            await page.goto(maps_url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(1200)
            await _dismiss_consent(page)
            await page.wait_for_selector('div[role="feed"]', timeout=15000)
            return context, page
        except Exception as exc:
            last_err = exc
            logger.warning("Maps feed load failed attempt %s: %s", attempt, exc)
            await context.close()
            await asyncio.sleep(0.8 * attempt)
    raise RuntimeError(f"Could not load Google Maps feed: {last_err}")


def _clamp_max_places(max_places: int | None) -> int:
    allowed = (5, 10, 15, 20, 25, 30)
    n = int(max_places) if max_places is not None else MAX_PLACE_VISITS
    if n in allowed:
        return n
    return min(allowed, key=lambda x: abs(x - n))


async def scrape_maps_async(
    search_query: str,
    progress_callback: ProgressCallback | None = None,
    max_places: int | None = None,
    exclude_urls: list[str] | None = None,
    exclude_phones: list[str] | None = None,
    niche: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    # Full dig up to FEED_LINK_MAX (150). Display quota (5–30) is applied in the browser pool.
    _ = max_places  # API compat; not used to stop early
    niche_key = (niche or "").strip()
    if not niche_key:
        # "Gym in Lahore" → niche "Gym"
        niche_key = re.split(r"\bin\b", search_query, maxsplit=1, flags=re.I)[0].strip()
    exclude_url_set = {_norm_maps_url(u) for u in (exclude_urls or []) if _norm_maps_url(u)}
    exclude_phone_set = {_norm_phone(p) for p in (exclude_phones or []) if len(_norm_phone(p)) >= 8}
    link_budget = FEED_LINK_MAX
    encoded_query = urllib.parse.quote_plus(search_query)
    maps_url = f"https://www.google.com/maps/search/{encoded_query}"
    data_list: list[dict[str, Any]] = []
    examples_list: list[dict[str, Any]] = []
    seen_links: set[str] = set()
    skipped_dup = 0

    async with async_playwright() as p:
        browser = await _launch_chromium(p)
        try:
            context, page = await _open_feed_with_retry(browser, maps_url, progress_callback)
        except RuntimeError:
            await browser.close()
            _emit(progress_callback, 100, "Failed to load Maps feed")
            return {"leads": [], "examples": []}

        try:
            _emit(progress_callback, 12, "Loading listings…")
            raw_links = await _scroll_feed(page, progress_callback, link_budget)
            await page.close()

            links = [lnk for lnk in raw_links if _norm_maps_url(lnk) not in exclude_url_set]
            skipped_dup = len(raw_links) - len(links)

            if not links:
                _emit(progress_callback, 100, "Done")
                await context.close()
                await browser.close()
                return {"leads": [], "examples": []}

            _emit(progress_callback, 28, "Checking places…")

            sem = asyncio.Semaphore(max(1, PLACE_CONCURRENCY))
            done = 0
            skipped_phone = 0
            skipped_error = 0
            skipped_irrelevant = 0
            total = len(links)
            lock = asyncio.Lock()

            async def worker(link: str) -> None:
                nonlocal done, skipped_phone, skipped_error, skipped_dup, skipped_irrelevant
                async with sem:
                    place_page = await context.new_page()
                    try:
                        row = await _extract_place(place_page, link, niche=niche_key)
                    finally:
                        await place_page.close()

                    async with lock:
                        done += 1
                        pct = 28 + int(done / max(total, 1) * 68)
                        if not row:
                            skipped_error += 1
                        elif row.get("_skip") == "irrelevant":
                            skipped_irrelevant += 1
                        elif row.get("_skip") == "no_phone":
                            skipped_phone += 1
                        else:
                            maps_link = row["maps_link"]
                            phone_key = _norm_phone(row.get("phone"))
                            if (
                                _norm_maps_url(maps_link) in exclude_url_set
                                or (phone_key and phone_key in exclude_phone_set)
                            ):
                                skipped_dup += 1
                            elif maps_link not in seen_links:
                                seen_links.add(maps_link)
                                if row.get("_bucket") == "example":
                                    examples_list.append(row)
                                else:
                                    data_list.append(row)
                        _emit(progress_callback, pct, "Checking places…")

            batch_size = max(PLACE_CONCURRENCY * 2, 8)
            for i in range(0, len(links), batch_size):
                batch = links[i : i + batch_size]
                await asyncio.gather(*(worker(link) for link in batch))

            await context.close()
            logger.info(
                "scrape done query=%r niche=%r leads=%s feed=%s examples=%s nophone=%s irrelevant=%s errors=%s dups=%s",
                search_query,
                niche_key,
                len(data_list),
                len(raw_links),
                len(examples_list),
                skipped_phone,
                skipped_irrelevant,
                skipped_error,
                skipped_dup,
            )
        finally:
            await browser.close()

    examples_list.sort(
        key=lambda r: (int(r.get("review_count") or 0), float(r.get("rating") or 0)),
        reverse=True,
    )
    top_examples = examples_list[:5]

    _emit(progress_callback, 100, "Done")
    return {"leads": data_list, "examples": top_examples}


async def scrape_maps_contacts_async(
    search_query: str,
    progress_callback: ProgressCallback | None = None,
    max_places: int | None = None,
    exclude_urls: list[str] | None = None,
    exclude_phones: list[str] | None = None,
    niche: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Maps dig for Contact finder: visit all feed listings with a website (full dig)."""
    _ = max_places  # display quota applied in browser pool, not here
    niche_key = (niche or "").strip()
    if not niche_key:
        niche_key = re.split(r"\bin\b", search_query, maxsplit=1, flags=re.I)[0].strip()
    exclude_url_set = {_norm_maps_url(u) for u in (exclude_urls or []) if _norm_maps_url(u)}
    exclude_phone_set = {_norm_phone(p) for p in (exclude_phones or []) if len(_norm_phone(p)) >= 8}
    link_budget = FEED_LINK_MAX
    encoded_query = urllib.parse.quote_plus(search_query)
    maps_url = f"https://www.google.com/maps/search/{encoded_query}"
    contacts: list[dict[str, Any]] = []
    seen_links: set[str] = set()
    skipped_dup = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-dev-shm-usage",
                "--disable-extensions",
                "--no-sandbox",
                "--disable-background-networking",
            ],
        )
        try:
            context, page = await _open_feed_with_retry(browser, maps_url, progress_callback)
        except RuntimeError:
            await browser.close()
            _emit(progress_callback, 100, "Failed to load Maps feed")
            return {"contacts": []}

        try:
            _emit(progress_callback, 12, "Loading listings…")
            raw_links = await _scroll_feed(page, progress_callback, link_budget)
            await page.close()

            links = [lnk for lnk in raw_links if _norm_maps_url(lnk) not in exclude_url_set]
            skipped_dup = len(raw_links) - len(links)
            if not links:
                _emit(progress_callback, 100, "Done")
                await context.close()
                await browser.close()
                return {"contacts": []}

            _emit(progress_callback, 28, "Checking sites…")
            sem = asyncio.Semaphore(max(1, PLACE_CONCURRENCY))
            done = 0
            skipped_skip = 0
            skipped_error = 0
            skipped_irrelevant = 0
            total = len(links)
            lock = asyncio.Lock()

            async def worker(link: str) -> None:
                nonlocal done, skipped_skip, skipped_error, skipped_dup, skipped_irrelevant
                async with sem:
                    place_page = await context.new_page()
                    try:
                        row = await _extract_place(place_page, link, niche=niche_key)
                    finally:
                        await place_page.close()

                    async with lock:
                        done += 1
                        pct = 28 + int(min(done, total) / max(total, 1) * 50)
                        if not row:
                            skipped_error += 1
                        elif row.get("_skip") in {"irrelevant", "no_phone"}:
                            if row.get("_skip") == "irrelevant":
                                skipped_irrelevant += 1
                            else:
                                skipped_skip += 1
                        elif not row.get("website_url"):
                            skipped_skip += 1
                        else:
                            maps_link = row["maps_link"]
                            phone_key = _norm_phone(row.get("phone"))
                            if (
                                _norm_maps_url(maps_link) in exclude_url_set
                                or (phone_key and phone_key in exclude_phone_set)
                            ):
                                skipped_dup += 1
                            elif maps_link not in seen_links:
                                seen_links.add(maps_link)
                                contacts.append(row)
                        _emit(progress_callback, pct, "Checking sites…")

            batch_size = max(PLACE_CONCURRENCY * 2, 8)
            for i in range(0, len(links), batch_size):
                batch = links[i : i + batch_size]
                await asyncio.gather(*(worker(link) for link in batch))

            await context.close()
            logger.info(
                "contacts scrape query=%r niche=%r sites=%s feed=%s skip=%s irrelevant=%s errors=%s dups=%s",
                search_query,
                niche_key,
                len(contacts),
                len(raw_links),
                skipped_skip,
                skipped_irrelevant,
                skipped_error,
                skipped_dup,
            )
        finally:
            await browser.close()

    _emit(progress_callback, 78, "Reading contact pages…")
    return {"contacts": contacts}


def scrape_maps(
    search_query: str,
    progress_callback: ProgressCallback | None = None,
    max_places: int | None = None,
    exclude_urls: list[str] | None = None,
    exclude_phones: list[str] | None = None,
    niche: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Sync entrypoint used by search_runner (daemon thread)."""
    try:
        return asyncio.run(
            scrape_maps_async(
                search_query,
                progress_callback,
                max_places,
                exclude_urls,
                exclude_phones,
                niche=niche,
            )
        )
    except RuntimeError as exc:
        # Nested event loop edge case
        if "asyncio.run()" in str(exc) or "running event loop" in str(exc).lower():
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(
                    scrape_maps_async(
                        search_query,
                        progress_callback,
                        max_places,
                        exclude_urls,
                        exclude_phones,
                        niche=niche,
                    )
                )
            finally:
                loop.close()
        raise


def scrape_maps_contacts(
    search_query: str,
    progress_callback: ProgressCallback | None = None,
    max_places: int | None = None,
    exclude_urls: list[str] | None = None,
    exclude_phones: list[str] | None = None,
    niche: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Sync entrypoint for Contact finder (websites only)."""
    try:
        return asyncio.run(
            scrape_maps_contacts_async(
                search_query,
                progress_callback,
                max_places,
                exclude_urls,
                exclude_phones,
                niche=niche,
            )
        )
    except RuntimeError as exc:
        if "asyncio.run()" in str(exc) or "running event loop" in str(exc).lower():
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(
                    scrape_maps_contacts_async(
                        search_query,
                        progress_callback,
                        max_places,
                        exclude_urls,
                        exclude_phones,
                        niche=niche,
                    )
                )
            finally:
                loop.close()
        raise
