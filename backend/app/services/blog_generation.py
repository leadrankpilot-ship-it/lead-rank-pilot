from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.core.config import settings
from app.services.writer_prompt import build_writer_system_prompt, niche_mode_of

DRAFT_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "slug": {"type": "string"},
        "body": {"type": "string"},
        "meta_description": {"type": "string"},
        "topic": {"type": "string"},
        "category": {"type": "string"},
        "outline": {"type": "array", "items": {"type": "string"}},
        "keywords": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "slug", "body", "meta_description", "topic"],
}


def normalize_topic(topic: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", topic.lower()).strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "blog-post"


def _html_text(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value).strip()


def _escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _sync_single_h1(body: str, title: str) -> str:
    """Keep exactly one H1, and make its text identical to title."""
    rest = re.sub(r"<h1\b[^>]*>.*?</h1>", "", body, flags=re.I | re.S).lstrip()
    return f"<h1>{_escape(title)}</h1>{rest}"


def _outline_from_body(body: str) -> list[str]:
    titles = []
    for raw in re.findall(r"<h2\b[^>]*>(.*?)</h2>", body, flags=re.I | re.S):
        text = re.sub(r"\s+", " ", _html_text(raw)).strip()
        if text:
            titles.append(text)
    return titles


def validate_draft_against_profile(draft: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    """Required JSON keys, one H1, and no fabricated price/guarantee claims."""
    if not draft.get("slug") and draft.get("title"):
        draft["slug"] = slugify(str(draft["title"]))
    if not isinstance(draft.get("outline"), list) or not draft.get("outline"):
        draft["outline"] = _outline_from_body(str(draft.get("body") or ""))
    if not isinstance(draft.get("keywords"), list) or not draft.get("keywords"):
        topic = str(draft.get("topic") or "").strip()
        draft["keywords"] = [topic] if topic else []

    required = ["title", "slug", "body", "meta_description", "topic", "category", "outline", "keywords"]
    missing = [
        k
        for k in required
        if k not in draft or (k not in {"outline", "keywords"} and not str(draft.get(k) or "").strip())
    ]
    if missing:
        raise ValueError(f"Draft missing required fields: {', '.join(missing)}")

    title = str(draft["title"]).strip()
    draft["title"] = title
    draft["body"] = _sync_single_h1(str(draft["body"]), title)
    if not draft.get("outline"):
        draft["outline"] = _outline_from_body(draft["body"])

    body = str(draft["body"])
    banned = re.compile(r"\b(guaranteed ranking|guaranteed traffic|\$\d[\d,]*)\b", re.I)
    if banned.search(body) and not any(
        str(x).find("$") >= 0 for x in (profile.get("products_services") or [])
    ):
        body = banned.sub("[unverified claim removed]", body)
        draft["body"] = body
        draft.setdefault("warnings", []).append("Removed unverified price/guarantee claims")

    meta = str(draft.get("meta_description") or "").strip()
    if len(meta) > 160:
        draft["meta_description"] = meta[:157].rstrip() + "..."
    draft["meta_description"] = str(draft.get("meta_description") or "").strip()

    # Dashboard SEO fields (editor expects these keys, not only keywords[])
    keywords = [str(k).strip() for k in (draft.get("keywords") or []) if str(k).strip()]
    focus = str(draft.get("focus_keyword") or "").strip()
    if not focus:
        focus = keywords[0] if keywords else str(draft.get("topic") or "").strip()
    draft["focus_keyword"] = focus[:80]
    if not str(draft.get("meta_title") or "").strip():
        draft["meta_title"] = title[:60]
    return draft


def _mock_draft(topic: str, profile: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    name = profile.get("business_name") or "Our business"
    cta = profile.get("preferred_cta") or "Contact us to learn more."
    category = options.get("category") or ((profile.get("categories") or ["General"])[0])
    title = f"{topic.strip().title()}"
    body = (
        f"<h1>{_escape(title)}</h1>"
        f"<p>This explains {topic} for readers of {name}. "
        f"Topic facts here are general; site-specific claims stay inside the confirmed profile.</p>"
        f"<h2>What to know about {topic}</h2>"
        f"<p>Use this as a starting point. Mark anything uncertain as [verify: detail].</p>"
        f"<h2>Takeaway</h2><p>{cta}</p>"
    )
    return {
        "title": title[:200],
        "slug": slugify(topic),
        "body": body,
        "meta_description": f"A clear look at {topic}."[:160],
        "topic": topic,
        "category": category,
        "outline": [f"What to know about {topic}", "Takeaway"],
        "keywords": [topic],
        "focus_keyword": topic[:80],
        "meta_title": title[:60],
        "model": "mock",
    }


def _clean_terms(values: Any, limit: int = 20) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    for item in values:
        text = str(item).strip()
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _default_target_words(profile: dict[str, Any]) -> int:
    return 1500 if niche_mode_of(profile) == "journal" else 1200


def _build_user_payload(
    topic: str,
    profile: dict[str, Any],
    opts: dict[str, Any],
    existing_topics: list[str],
) -> dict[str, Any]:
    """Article brief only. Site facts stay in the locked system prompt."""
    target = opts.get("target_words")
    try:
        target_words = int(target) if target else _default_target_words(profile)
    except (TypeError, ValueError):
        target_words = _default_target_words(profile)
    target_words = max(400, min(2500, target_words))
    return {
        "topic_or_keyword": topic,
        "nlp_keywords": _clean_terms(opts.get("nlp_keywords")),
        "lsi_keywords": _clean_terms(opts.get("lsi_keywords")),
        "category": opts.get("category"),
        "language": (profile.get("language") or "en"),
        "target_words": target_words,
        "avoid_duplicate_topics": [str(t).strip() for t in existing_topics if str(t).strip()][:50],
        "instruction": (
            "Write one complete article for this category and keyword. "
            "Follow the system writer prompt. Choose the format, FAQ, and table yourself. "
            "Return the JSON object only."
        ),
    }


def _parse_json_content(content: str) -> dict[str, Any]:
    text = (content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    data = json.loads(text or "{}")
    if not isinstance(data, dict):
        raise ValueError("AI draft must be a JSON object")
    return data


def resolve_blog_provider() -> str:
    """Return mock | gemini | openai based on mode + keys + provider setting."""
    mode = (settings.blog_generation_mode or "live").lower()
    if mode == "mock":
        return "mock"

    preferred = (settings.blog_ai_provider or "auto").lower().strip()
    has_gemini = bool((settings.gemini_api_key or "").strip())
    has_openai = bool((settings.openai_api_key or "").strip())

    if preferred == "gemini":
        return "gemini" if has_gemini else "mock"
    if preferred == "openai":
        return "openai" if has_openai else "mock"
    # auto
    if has_gemini:
        return "gemini"
    if has_openai:
        return "openai"
    return "mock"


def _generate_with_openai(system: str, user: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.45,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user)},
        ],
    )
    content = response.choices[0].message.content or "{}"
    draft = _parse_json_content(content)
    usage = {
        "prompt_tokens": getattr(response.usage, "prompt_tokens", None),
        "completion_tokens": getattr(response.usage, "completion_tokens", None),
    }
    return draft, usage


def _gemini_model_candidates() -> list[str]:
    primary = (settings.gemini_model or "gemini-3.5-flash-lite").strip()
    fallbacks = [
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
        "gemini-3.8-flash",
    ]
    ordered: list[str] = []
    for name in [primary, *fallbacks]:
        if name and name not in ordered:
            ordered.append(name)
    return ordered


def _generate_with_gemini(system: str, user: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    api_key = (settings.gemini_api_key or "").strip()
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [
            {
                "role": "user",
                "parts": [{"text": json.dumps(user)}],
            }
        ],
        "generationConfig": {
            "temperature": 0.45,
            "responseMimeType": "application/json",
            "responseSchema": DRAFT_JSON_SCHEMA,
        },
    }

    last_error = "Gemini generation failed"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    with httpx.Client(timeout=60.0) as client:
        for model in _gemini_model_candidates():
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            try:
                resp = client.post(url, headers=headers, json=payload)
            except httpx.TimeoutException:
                last_error = f"Gemini timed out on {model}"
                continue
            if resp.status_code in {404, 429, 503}:
                last_error = f"Gemini generation failed ({resp.status_code}) on {model}: {resp.text[:300]}"
                continue
            if resp.status_code >= 400:
                detail = resp.text[:500]
                raise RuntimeError(f"Gemini generation failed ({resp.status_code}) on {model}: {detail}")
            data = resp.json()

            candidates = data.get("candidates") or []
            if not candidates:
                last_error = f"Gemini returned no candidates on {model}"
                continue
            parts = (((candidates[0] or {}).get("content") or {}).get("parts")) or []
            text = "".join(str(p.get("text") or "") for p in parts if isinstance(p, dict))
            draft = _parse_json_content(text)
            draft["_resolved_model"] = model

            usage_meta = data.get("usageMetadata") or {}
            usage = {
                "prompt_tokens": usage_meta.get("promptTokenCount"),
                "completion_tokens": usage_meta.get("candidatesTokenCount"),
            }
            return draft, usage

    raise RuntimeError(last_error)


def generate_blog_draft(
    topic: str,
    profile: dict[str, Any],
    existing_topics: list[str],
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    opts = {
        "category": None,
        "nlp_keywords": [],
        "lsi_keywords": [],
        "target_words": None,
    }
    if options:
        opts.update({k: v for k, v in options.items() if k in opts and v is not None})
    opts["nlp_keywords"] = _clean_terms(opts.get("nlp_keywords"))
    opts["lsi_keywords"] = _clean_terms(opts.get("lsi_keywords"))

    system = profile.get("ai_writer_prompt") or build_writer_system_prompt(profile)
    provider = resolve_blog_provider()

    if provider == "mock":
        draft = _mock_draft(topic, profile, opts)
        return validate_draft_against_profile(draft, profile)

    user = _build_user_payload(topic, profile, opts, existing_topics)

    if provider == "gemini":
        draft, usage = _generate_with_gemini(system, user)
        model_name = str(draft.pop("_resolved_model", None) or settings.gemini_model)
    else:
        draft, usage = _generate_with_openai(system, user)
        model_name = settings.openai_model

    draft["topic"] = draft.get("topic") or topic
    draft["category"] = opts.get("category") or draft.get("category")
    draft["model"] = model_name
    draft["provider"] = provider
    draft["usage"] = usage
    return validate_draft_against_profile(draft, profile)
