import json
from datetime import UTC, datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.website import Website
from app.schemas.website import WebsiteCreate, WebsiteOut, WebsiteProfileUpdate, WriterPromptOut
from app.services.quota import assert_website_quota
from app.services.site_profile import crawl_business_profile
from app.services.writer_prompt import attach_writer_prompt, build_writer_system_prompt

router = APIRouter(prefix="/websites", tags=["websites"])

_PROFILE_LIST_KEYS = (
    "products_services",
    "service_areas",
    "categories",
    "content_pillars",
    "primary_keywords",
    "secondary_keywords",
    "preferred_terms",
    "words_to_avoid",
    "banned_claims",
    "unique_selling_points",
    "existing_blog_titles",
)

_PROFILE_SCALAR_KEYS = (
    "business_name",
    "tagline",
    "niche",
    "about_summary",
    "audience",
    "brand_voice",
    "tone",
    "writing_style",
    "author_persona",
    "language",
    "content_mode",
    "publish_category",
    "cta_style",
    "preferred_cta",
    "competitors_note",
    "extra_guidelines",
)

_USER_LOCKED_KEYS = (
    "about_summary",
    "content_mode",
    "niche_mode",
    "categories",
    "site_categories",
    "publish_category",
    "extra_guidelines",
    "words_to_avoid",
    "banned_claims",
    "preferred_cta",
    "brand_voice",
    "tone",
    "language",
)


def _normalize_site_categories(body: WebsiteProfileUpdate) -> tuple[list[str], list[dict[str, str | None]]]:
    rows: list[dict[str, str | None]] = []
    seen: set[str] = set()

    def add(name: str, note: str | None) -> None:
        clean = name.strip()
        key = clean.lower()
        if not clean or key in seen:
            return
        seen.add(key)
        text = (note or "").strip() or None
        rows.append({"name": clean, "note": text})

    for item in body.site_categories or []:
        add(item.name, item.note)
    if not rows:
        for name in body.categories or []:
            add(name, None)
        if body.publish_category:
            add(body.publish_category, None)
    return [row["name"] or "" for row in rows], rows


def _normalize_domain(url: str) -> str:
    host = urlparse(url).hostname or ""
    return host.lower().removeprefix("www.")


def _site_out(site: Website) -> WebsiteOut:
    profile = None
    if site.business_profile_json:
        try:
            profile = json.loads(site.business_profile_json)
        except json.JSONDecodeError:
            profile = None
    return WebsiteOut(
        id=site.id,
        base_url=site.base_url,
        normalized_domain=site.normalized_domain,
        ownership_confirmed_at=site.ownership_confirmed_at,
        profile_confirmed_at=site.profile_confirmed_at,
        business_profile=profile,
        created_at=site.created_at,
    )


def _merge_profile(current: dict, body: WebsiteProfileUpdate) -> dict:
    data = dict(current)
    payload = body.model_dump()
    for key in _PROFILE_SCALAR_KEYS:
        if key in payload and payload[key] is not None:
            data[key] = payload[key]
    for key in _PROFILE_LIST_KEYS:
        if key in payload:
            data[key] = payload[key]
    names, rows = _normalize_site_categories(body)
    if names:
        data["categories"] = names
        data["site_categories"] = rows
        data["publish_category"] = names[0]
    return attach_writer_prompt(data)


@router.get("", response_model=list[WebsiteOut])
def list_websites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WebsiteOut]:
    rows = (
        db.query(Website)
        .filter(Website.user_id == current_user.id)
        .order_by(Website.id.desc())
        .all()
    )
    return [_site_out(r) for r in rows]


@router.post("", response_model=WebsiteOut, status_code=status.HTTP_201_CREATED)
def create_website(
    body: WebsiteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WebsiteOut:
    base_url = str(body.base_url).rstrip("/")
    domain = _normalize_domain(base_url)
    if not domain:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid website URL")

    try:
        assert_website_quota(db, current_user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    existing = (
        db.query(Website)
        .filter(Website.user_id == current_user.id, Website.normalized_domain == domain)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This site is already connected to your account",
        )

    site = Website(
        user_id=current_user.id,
        base_url=base_url,
        normalized_domain=domain,
        ownership_confirmed_at=datetime.now(UTC) if body.ownership_confirmed else None,
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    return _site_out(site)


@router.get("/{website_id}", response_model=WebsiteOut)
def get_website(
    website_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WebsiteOut:
    site = db.get(Website, website_id)
    if site is None or site.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Website not found")
    return _site_out(site)


@router.post("/{website_id}/analyze-profile", response_model=WebsiteOut)
def analyze_profile(
    website_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WebsiteOut:
    site = db.get(Website, website_id)
    if site is None or site.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Website not found")
    previous: dict = {}
    if site.business_profile_json:
        try:
            previous = json.loads(site.business_profile_json)
        except json.JSONDecodeError:
            previous = {}
    was_confirmed = bool(site.profile_confirmed_at)
    try:
        profile = crawl_business_profile(site.base_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    for key in _USER_LOCKED_KEYS:
        current = previous.get(key)
        if current not in (None, "", [], {}):
            profile[key] = current
    profile = attach_writer_prompt(profile)
    site.business_profile_json = json.dumps(profile)
    if not was_confirmed:
        site.profile_confirmed_at = None
    db.commit()
    db.refresh(site)
    return _site_out(site)


@router.put("/{website_id}/profile", response_model=WebsiteOut)
def update_profile(
    website_id: int,
    body: WebsiteProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WebsiteOut:
    site = db.get(Website, website_id)
    if site is None or site.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Website not found")
    current: dict = {}
    if site.business_profile_json:
        try:
            current = json.loads(site.business_profile_json)
        except json.JSONDecodeError:
            current = {}
    merged = _merge_profile(current, body)
    site.business_profile_json = json.dumps(merged)
    if body.confirm:
        site.profile_confirmed_at = datetime.now(UTC)
    db.commit()
    db.refresh(site)
    return _site_out(site)


@router.get("/{website_id}/writer-prompt", response_model=WriterPromptOut)
def get_writer_prompt(
    website_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WriterPromptOut:
    site = db.get(Website, website_id)
    if site is None or site.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Website not found")
    profile = None
    if site.business_profile_json:
        try:
            profile = json.loads(site.business_profile_json)
        except json.JSONDecodeError:
            profile = None
    prompt = ""
    if profile:
        prompt = profile.get("ai_writer_prompt") or build_writer_system_prompt(profile)
    return WriterPromptOut(
        website_id=site.id,
        system_prompt=prompt,
        profile_confirmed=bool(site.profile_confirmed_at),
        profile=profile,
    )
