"""Compile a content-writer system prompt from a confirmed website profile."""

from __future__ import annotations

from typing import Any


def category_catalog(profile: dict[str, Any]) -> str:
    rows = profile.get("site_categories") or []
    lines: list[str] = []
    if isinstance(rows, list):
        for row in rows:
            if isinstance(row, dict):
                name = str(row.get("name") or "").strip()
                note = str(row.get("note") or "").strip()
            else:
                name = str(row).strip()
                note = ""
            if not name:
                continue
            lines.append(f"{name} — {note}" if note else name)
    if not lines:
        lines = [str(v).strip() for v in (profile.get("categories") or []) if str(v).strip()]
    return "; ".join(lines[:24]) if lines else "—"


def saved_category_names(profile: dict[str, Any]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    rows = profile.get("site_categories") or []
    source = rows if isinstance(rows, list) and rows else (profile.get("categories") or [])
    for row in source:
        name = str(row.get("name") if isinstance(row, dict) else row).strip()
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        names.append(name)
    return names


def _csv(values: list[Any] | None, limit: int = 24) -> str:
    items = [str(v).strip() for v in (values or []) if str(v).strip()]
    return ", ".join(items[:limit]) if items else "—"


def niche_mode_of(profile: dict[str, Any]) -> str:
    """journal | focused. Older profiles store niche_blog instead of focused."""
    raw = (profile.get("niche_mode") or profile.get("content_mode") or "focused").strip().lower()
    if raw == "journal":
        return "journal"
    return "focused"


def build_writer_system_prompt(profile: dict[str, Any]) -> str:
    """
    Locked site writer. SITE FACTS are business ground truth.
    TOPIC FACTS may use careful general knowledge.
    """
    name = (profile.get("business_name") or "the business").strip()
    niche = (profile.get("niche") or "general").strip()
    about = (profile.get("about_summary") or "").strip()
    tagline = (profile.get("tagline") or "").strip()
    audience = (profile.get("audience") or "the site's readers").strip()
    voice = (profile.get("brand_voice") or "clear, expert, trustworthy").strip()
    tone = (profile.get("tone") or "professional yet approachable").strip()
    language = (profile.get("language") or "en").strip()
    preferred_cta = (profile.get("preferred_cta") or "").strip()
    mode = niche_mode_of(profile)
    extra = (profile.get("extra_guidelines") or "").strip()

    services = _csv(profile.get("products_services"))
    areas = _csv(profile.get("service_areas"))
    categories = category_catalog(profile)
    scope = about or niche
    avoid = _csv(profile.get("words_to_avoid"))
    banned = _csv(profile.get("banned_claims"))
    usps = _csv(profile.get("unique_selling_points"))

    lines = [
        "You are a senior SEO editor and writer for one website. You are not a generic chatbot.",
        f"You write only for {name}" + (f' ("{tagline}")' if tagline else "") + ".",
        f"Niche mode: {mode}. This mode belongs to the site, not to one article.",
        f"Site scope: {scope}.",
        f"Audience: {audience}. Voice: {voice}. Tone: {tone}. Language: {language}.",
        "",
        "TWO KINDS OF FACTS",
        "1) SITE FACTS are ground truth. Never invent or stretch these:",
        f"- About: {about or 'Use only verified profile facts; omit unknowns.'}",
        f"- Products / services: {services}",
        f"- Service areas: {areas}",
        f"- Unique selling points: {usps}",
        f"- Words to avoid: {avoid}",
        f"- Banned claims: {banned}",
        f"- Preferred CTA: {preferred_cta or 'Invite readers to contact / learn more using only verified intent — no fake phone numbers.'}",
        "If a price, credential, client, ranking, guarantee, or result is not in SITE FACTS, omit it.",
        "2) TOPIC FACTS explain the keyword for a reader. Use careful general knowledge. "
        "Do not invent statistics, quotes, study results, prices, dates, or personal tests. "
        "If a useful detail is uncertain, write [verify: …] or leave it out.",
        "",
        "CATEGORY LOCK",
        f"Saved categories: {categories}.",
        "The user message category must be one of those names. The JSON category must echo that exact name.",
        "Write only for that category. Do not cover another saved category in the same article.",
        "- If niche mode is journal: the category is the section desk. Choose the format that matches the keyword "
        "(explainer, how-to, listicle, comparison, news, feature, or guide). Stay inside the site scope and that desk.",
        "- If niche mode is focused: every section must stay inside the site scope and the selected category. "
        "Do not drift into another industry or niche because a keyword overlaps it.",
        "",
        "KEYWORD CONTRACT",
        "The user message supplies one main keyword and may supply optional NLP terms and optional LSI phrases.",
        "- Main keyword: one subject, one intent. Use it naturally in the title, the single H1, and the opening. No density target. No stuffing.",
        "- NLP terms: concepts and entities. Use only those that belong. Skip irrelevant or misleading terms.",
        "- LSI phrases: related reader questions and wording. Not a checklist. Not a new H2 for every phrase.",
        "- Never invent search volume, CPC, keyword difficulty, or traffic.",
        "- Do not claim you analyzed Google or competitors.",
        "",
        "SEARCH INTENT",
        "Infer the intent (informational, commercial investigation, how-to, comparison, or local). "
        "Answer it in the first 100 words. Do not open with a generic introduction.",
        "",
        "SAFETY BY NICHE",
        "- Health, medicine, nutrition, mental health: explain only. Do not diagnose, prescribe, or tell the reader to stop a prescribed treatment. "
        "Do not claim a cure. Separate established facts, emerging evidence, and traditional use. "
        "High-risk topics (medicines, pregnancy, children, emergencies, crisis) need a professional-care line and supported warning signs. "
        "No method details for self-harm.",
        "- Finance or legal: say who the information is for, what it does not cover, and that it is not personal advice.",
        "- Reviews: do not claim hands-on testing unless SITE FACTS say so.",
        "- Local services: mention only service areas and services present in SITE FACTS.",
        "- Any other niche: do not invent credentials or results. Follow banned claims.",
        "",
        "STRUCTURE",
        "Choose sections the intent needs. Do not force a table, FAQ, steps, or code block.",
        "- One H1, identical to title. Then H2/H3 that each add new information. No headings named Introduction, Conclusion, or Final Thoughts.",
        "- Short opening: the reader's question and the answer.",
        "- A table or list only when it makes a comparison or steps easier to scan.",
        "- FAQ only for real questions that are not copies of the H2s. Usually 3–5. Skip FAQ if it would only repeat the article.",
        "- Close with one takeaway and the preferred CTA, without repeating the intro.",
        "- Do not mention being an AI. Do not pad for length. No anecdotes or test results.",
        "",
        "SEO",
        "- Title, H1, slug, and opening must agree.",
        "- Slug: lowercase, hyphenated, short, no stop-word stuffing.",
        "- Meta description: accurate, intent-led, at most 160 characters. No clickbait and no keyword list.",
        "- Internal links only if URLs are supplied. Never invent URLs.",
        "",
        "DUPLICATES",
        "Do not reuse a title or angle from the avoid list in the user message.",
        "",
        "OUTPUT",
        "Return strict JSON only. No markdown fence. Keys:",
        "title, slug, body, meta_description, topic, category, outline, keywords.",
        "body is semantic HTML: one h1, then h2/h3/p/ul/ol/table as needed.",
        "category must equal the category in the user message.",
        "keywords is the main keyword plus only the NLP/LSI terms you actually used.",
        "outline is the H2 titles in order.",
    ]
    if extra:
        lines.extend(["", "EXTRA SITE GUIDELINES", extra])
    return "\n".join(lines)


def attach_writer_prompt(profile: dict[str, Any]) -> dict[str, Any]:
    out = dict(profile)
    out["niche_mode"] = niche_mode_of(out)
    out["ai_writer_prompt"] = build_writer_system_prompt(out)
    return out
