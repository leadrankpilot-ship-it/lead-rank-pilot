"""Public-site crawl → seed business profile for AI blog writer.

Prior crawl used raw H1/H2 + full-page text, which filled profiles with nav chrome
and marketing section titles (bad for portfolio sites like personal engineer pages).
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup, Tag

from app.core.config import settings
from app.services.safe_http import assert_public_hostname, build_client, normalize_http_url

PROFILE_PATHS = (
    "/",
    "/about",
    "/about-us",
    "/services",
    "/products",
    "/stack",
    "/work",
    "/portfolio",
    "/blog",
)

# Section titles / chrome that are almost never real products/services
_JUNK_HEADING = re.compile(
    r"^(home|about|blog|contact|stack|work|experience|portfolio|projects|"
    r"discover more|quick facts|tech stack|get in touch|let'?s build|"
    r"where I'?ve grown|tools I ship|projects that|"
    r"hire me|menu|navigation|skip to|privacy|terms|services|quick links|"
    r"availability|send me a message|contact information)$",
    re.I,
)

_NAV_NOISE = re.compile(
    r"\b(skip to main content|hire me|home\s+about\s+stack|privacy policy|"
    r"terms of service|cookie|©\s*\d{4})\b",
    re.I,
)

_ROLE_SEP = re.compile(r"\s*[—–|\-·•]\s*")


def _clean(s: str | None, limit: int = 300) -> str:
    if not s:
        return ""
    text = re.sub(r"\s+", " ", s).strip()
    return text[:limit].strip()


def _meta_content(soup: BeautifulSoup, *keys: str) -> str:
    for key in keys:
        tag = soup.find("meta", attrs={"name": key}) or soup.find("meta", attrs={"property": key})
        if tag and tag.get("content"):
            return _clean(tag["content"], 400)
    return ""


def _strip_chrome(soup: BeautifulSoup) -> BeautifulSoup:
    for tag in soup(["script", "style", "noscript", "svg", "iframe", "form"]):
        tag.decompose()
    for tag in soup.find_all(["nav", "header", "footer", "aside"]):
        tag.decompose()
    return soup


def _main_root(soup: BeautifulSoup) -> Tag | BeautifulSoup:
    return (
        soup.find("main")
        or soup.find(id=re.compile(r"main|content|app", re.I))
        or soup.find("article")
        or soup.body
        or soup
    )


def _paragraphs(root: Tag | BeautifulSoup, limit: int = 8) -> list[str]:
    out: list[str] = []
    for p in root.find_all(["p", "li"]):
        t = _clean(p.get_text(" ", strip=True), 400)
        if len(t) < 40:
            continue
        if _NAV_NOISE.search(t):
            continue
        if _JUNK_HEADING.match(t):
            continue
        # Skip pure nav-ish short link dumps
        if t.count(" ") < 5 and len(t) < 60:
            continue
        out.append(t)
        if len(out) >= limit:
            break
    return out


def _list_items_near_heading(soup: BeautifulSoup, heading_re: re.Pattern[str]) -> list[str]:
    items: list[str] = []
    for heading in soup.find_all(re.compile(r"^h[1-6]$")):
        label = _clean(heading.get_text(" ", strip=True), 80)
        if not heading_re.search(label):
            continue
        # next sibling list or nested lists under parent section
        for sib in list(heading.next_siblings)[:6]:
            if not isinstance(sib, Tag):
                continue
            if sib.name in {"ul", "ol"}:
                for li in sib.find_all("li", recursive=False)[:12]:
                    t = _clean(li.get_text(" ", strip=True), 80)
                    if t and not _JUNK_HEADING.match(t):
                        items.append(t)
            if sib.name in {"div", "section"}:
                for li in sib.find_all("li")[:12]:
                    t = _clean(li.get_text(" ", strip=True), 80)
                    if t and 3 <= len(t) <= 60 and not _JUNK_HEADING.match(t):
                        items.append(t)
        if items:
            break
    return _uniq(items)


def _uniq(values: list[str], limit: int = 12) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for v in values:
        key = v.lower()
        if key in seen or not v:
            continue
        seen.add(key)
        out.append(v)
        if len(out) >= limit:
            break
    return out


def _parse_title_identity(title: str) -> tuple[str | None, str | None]:
    """'Muhammad Ramzan — Full-Stack Software Engineer & Flutter Developer' → name, niche."""
    title = _clean(title, 200)
    if not title:
        return None, None
    parts = _ROLE_SEP.split(title, maxsplit=1)
    if len(parts) == 2 and len(parts[0]) <= 60 and len(parts[1]) >= 8:
        return parts[0].strip(), parts[1].strip()
    return title, None


def _normalize_path_key(url: str) -> str:
    parsed = urlparse(url)
    path = (parsed.path or "/").rstrip("/") or "/"
    return f"{parsed.scheme}://{parsed.netloc.lower()}{path.lower()}"


def _extract_page(html: str, final_url: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    title = _clean(soup.title.get_text(" ", strip=True) if soup.title else "", 200)
    meta_desc = _meta_content(soup, "description", "og:description", "twitter:description")
    og_title = _meta_content(soup, "og:title", "twitter:title")
    role_candidates: list[str] = []

    # Common portfolio eyebrow / subtitle patterns
    for sel in (
        soup.select_one("[class*='eyebrow']"),
        soup.select_one("[class*='subtitle']"),
        soup.select_one("[class*='role']"),
        soup.select_one("main p"),
    ):
        if sel:
            t = _clean(sel.get_text(" ", strip=True), 120)
            if t and ("engineer" in t.lower() or "developer" in t.lower() or "·" in t or "|" in t):
                role_candidates.append(t)

    work = BeautifulSoup(str(soup), "html.parser")
    _strip_chrome(work)
    root = _main_root(work)
    h1s = [_clean(h.get_text(" ", strip=True), 120) for h in root.find_all("h1")[:5]]
    h2s = [_clean(h.get_text(" ", strip=True), 120) for h in root.find_all("h2")[:12]]
    h1s = [h for h in h1s if h]
    h2s = [h for h in h2s if h and not _JUNK_HEADING.match(h)]

    paragraphs = _paragraphs(root)
    services = _list_items_near_heading(work, re.compile(r"service|what I|what we|offer|I (build|ship)", re.I))
    # Footer-style services often survive before chrome strip — scan original too
    if not services:
        services = _list_items_near_heading(soup, re.compile(r"^services$", re.I))

    return {
        "url": final_url,
        "title": title,
        "og_title": og_title,
        "meta_description": meta_desc,
        "h1": h1s,
        "h2": h2s,
        "paragraphs": paragraphs,
        "role_candidates": role_candidates,
        "services": services,
        "path": urlparse(final_url).path.lower(),
    }


def crawl_business_profile(base_url: str) -> dict[str, Any]:
    root = normalize_http_url(base_url)
    host = urlparse(root).hostname
    if not host:
        raise ValueError("Invalid website URL")
    assert_public_hostname(host)

    pages: list[dict[str, Any]] = []
    seen_paths: set[str] = set()

    with build_client() as client:
        for path in PROFILE_PATHS:
            page_url = urljoin(root.rstrip("/") + "/", path.lstrip("/")) if path != "/" else root
            try:
                assert_public_hostname(urlparse(page_url).hostname or "")
                resp = client.get(page_url, follow_redirects=True)
                if resp.status_code >= 400:
                    continue
                final_url = str(resp.url)
                key = _normalize_path_key(final_url)
                if key in seen_paths:
                    continue
                # Skip soft-404 that bounce everything to home with same path key already taken
                seen_paths.add(key)
                body = resp.content[: settings.audit_max_response_bytes].decode(
                    resp.encoding or "utf-8", errors="replace"
                )
                pages.append(_extract_page(body, final_url))
            except Exception:
                continue
            if len(pages) >= settings.audit_max_pages + 3:
                break

    if not pages:
        raise ValueError("Could not fetch any public pages from this website")

    home = pages[0]
    about = next((p for p in pages if "about" in p["path"]), None)
    services_page = next((p for p in pages if "service" in p["path"] or "stack" in p["path"]), None)

    # --- Identity ---
    name_from_title, niche_from_title = _parse_title_identity(home.get("og_title") or home.get("title") or "")
    business_name = name_from_title
    if not business_name and home.get("h1"):
        # Prefer short personal/brand H1 over long marketing H1
        for h in home["h1"]:
            if len(h) <= 48 and not _JUNK_HEADING.match(h):
                business_name = h
                break
    if not business_name:
        business_name = host

    niche = niche_from_title
    if not niche:
        for cand in home.get("role_candidates") or []:
            if business_name and cand.lower().startswith(business_name.lower()):
                continue
            niche = cand
            break
    if not niche and home.get("meta_description"):
        niche = home["meta_description"][:120]
    # Never leave niche = person name
    if niche and business_name and niche.strip().lower() == business_name.strip().lower():
        niche = niche_from_title or "professional services"

    tagline = None
    for page in (about, home):
        if not page:
            continue
        for h in page.get("h2") or []:
            if _JUNK_HEADING.match(h) or not (8 <= len(h) <= 80):
                continue
            # Skip H2 that duplicates niche/role (prefer slogan-like lines)
            if niche and h.lower() in niche.lower():
                continue
            if business_name and h.lower() == business_name.lower():
                continue
            tagline = h
            break
        if tagline:
            break
    if not tagline and home.get("role_candidates"):
        tagline = home["role_candidates"][0][:80]

    # --- About ---
    about_parts: list[str] = []
    if home.get("meta_description"):
        about_parts.append(home["meta_description"])
    src_pages = [about, home] if about else [home]
    for page in src_pages:
        if not page:
            continue
        for para in page.get("paragraphs") or []:
            if business_name and para.lower() == business_name.lower():
                continue
            if _NAV_NOISE.search(para):
                continue
            about_parts.append(para)
            if sum(len(x) for x in about_parts) > 520:
                break
        if sum(len(x) for x in about_parts) > 400:
            break
    about_summary = _clean(" ".join(_uniq(about_parts, limit=6)), 700) or None

    # --- Services ---
    products: list[str] = []
    for page in (services_page, about, home):
        if page:
            products.extend(page.get("services") or [])
    # Fallback: infer from niche / role line tokens for portfolio sites
    if len(products) < 2 and niche:
        for token in re.split(r"[,/·|&]| and ", niche):
            t = _clean(token, 60)
            if len(t) >= 4 and not _JUNK_HEADING.match(t):
                products.append(t)
    # Last resort: meaningful H2s that look like offerings (not section chrome)
    if len(products) < 2:
        for page in pages:
            for h in page.get("h2") or []:
                if _JUNK_HEADING.match(h):
                    continue
                if any(w in h.lower() for w in ("app", "saas", "flutter", "web", "api", "ai", "develop", "service", "repair", "install", "clean")):
                    products.append(h)
    products = _uniq(products, limit=10)

    # --- Audience / area hints ---
    audience = None
    service_areas: list[str] = []
    blob = " ".join(
        [
            about_summary or "",
            home.get("meta_description") or "",
            " ".join((about or home).get("paragraphs") or []),
        ]
    )
    loc = re.search(
        r"\b(?:based in|located in|serving)\s+([A-Z][A-Za-z]+(?:[\s-][A-Z][A-Za-z]+)*)"
        r"(?:,\s*([A-Z][A-Za-z]+(?:[\s-][A-Z][A-Za-z]+)*))?",
        blob,
    )
    if loc:
        place = _clean(loc.group(1), 40)
        if loc.group(2):
            place = f"{place}, {_clean(loc.group(2), 40)}"
        service_areas = [place] if place else []
        audience = f"Clients seeking {niche or 'services'} (around {place})"
    elif niche:
        audience = f"People looking for {niche}"

    # Blog titles from blog page H2s / title (not the site title alone)
    existing_blog_titles: list[str] = []
    for page in pages:
        if "blog" not in page.get("path", ""):
            continue
        for h in (page.get("h2") or []) + (page.get("h1") or []):
            if h and not _JUNK_HEADING.match(h) and h.lower() != (business_name or "").lower():
                existing_blog_titles.append(h)
    existing_blog_titles = _uniq(existing_blog_titles, limit=20)

    usps: list[str] = []
    blob_l = blob.lower()
    for phrase, label in (
        ("end-to-end", "End-to-end product ownership"),
        ("end to end", "End-to-end product ownership"),
        ("app store", "App Store shipping"),
        ("play store", "Play Store shipping"),
        ("available worldwide", "Available worldwide"),
        ("full-stack", "Full-stack delivery"),
        ("full stack", "Full-stack delivery"),
    ):
        if phrase in blob_l:
            usps.append(label)
    usps = _uniq(usps, limit=6)

    content_pillars = _uniq(
        [h for h in ((about or home).get("h2") or []) if not _JUNK_HEADING.match(h)][:5]
        or products[:5],
        limit=5,
    )

    preferred_cta = None
    if re.search(r"hire|start a project|let'?s build", blob, re.I):
        preferred_cta = "Start a project / hire for delivery"
    elif re.search(r"free estimate|contact us|call us", blob, re.I):
        preferred_cta = "Contact us for a free estimate"

    source_pages = []
    seen_src: set[str] = set()
    for p in pages:
        key = _normalize_path_key(p["url"])
        if key in seen_src:
            continue
        seen_src.add(key)
        # Prefer canonical path without query noise
        parsed = urlparse(p["url"])
        clean_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", "", "", ""))
        source_pages.append({"url": clean_url.rstrip("/") or clean_url, "title": p.get("title")})

    return {
        "business_name": business_name,
        "tagline": tagline,
        "niche": niche,
        "about_summary": about_summary,
        "products_services": products,
        "service_areas": service_areas,
        "audience": audience,
        "brand_voice": "clear, expert, trustworthy",
        "tone": "professional yet approachable",
        "writing_style": "short paragraphs, scannable H2/H3s, practical examples, no fluff",
        "author_persona": f"{business_name} — {niche}" if niche else business_name,
        "language": "en",
        "content_mode": "niche_blog",
        "categories": content_pillars[:8] or _uniq([niche] if niche else [], limit=6),
        "content_pillars": content_pillars,
        "primary_keywords": _uniq([w for w in re.split(r"[,/·|&]", niche or "") if len(_clean(w)) >= 4], limit=6),
        "secondary_keywords": products[:6],
        "preferred_terms": [],
        "words_to_avoid": ["guaranteed ranking", "guaranteed traffic", "#1 agency"],
        "banned_claims": ["guaranteed results", "instant ranking"],
        "unique_selling_points": usps,
        "cta_style": "soft, helpful",
        "preferred_cta": preferred_cta,
        "existing_blog_titles": existing_blog_titles,
        "competitors_note": None,
        "extra_guidelines": None,
        "source_pages": source_pages,
        "notes_for_user": (
            "Auto-fill is a seed only — especially for portfolio sites. "
            "Fix services, audience, and about before confirming the AI writer prompt."
        ),
        "limitations": [
            "Bounded public crawl only",
            "Facts outside source pages are unverified and must be omitted",
            "Section titles are filtered; still verify products/services manually",
        ],
    }
