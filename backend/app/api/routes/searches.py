import csv
import io
import json
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.lead import Lead
from app.models.search_run import SearchRun
from app.models.user import User
from app.core.config import settings
from app.schemas.search import LeadOut, ManualLimitsOut, QualifyRequest, SearchCreate, SearchRunOut
from app.services import jobs as job_service
from app.services.lead_scoring import score_lead
from app.services.search_runner import start_search_run_background

router = APIRouter(prefix="/searches", tags=["searches"])


@router.get("/manual-limits", response_model=ManualLimitsOut)
def manual_limits(
    current_user: User = Depends(get_current_user),
) -> ManualLimitsOut:
    _ = current_user
    return ManualLimitsOut(
        max_urls=settings.manual_contact_url_max,
        concurrency=settings.manual_contact_concurrency,
    )


@router.get("", response_model=list[SearchRunOut])
def list_searches(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SearchRun]:
    return (
        db.query(SearchRun)
        .filter(SearchRun.user_id == current_user.id)
        .order_by(SearchRun.id.desc())
        .limit(50)
        .all()
    )


@router.post("", response_model=SearchRunOut, status_code=status.HTTP_201_CREATED)
def create_search(
    body: SearchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SearchRun:
    mode = body.normalized_mode()
    if mode == "manual_contacts":
        job_type = "manual_contacts"
        websites = body.normalized_websites()
        input_name = "Manual websites"
        input_location = f"{len(websites)} URL{'s' if len(websites) != 1 else ''}"
        max_results = len(websites)
        input_urls_json = json.dumps(websites)
    elif mode == "contacts":
        job_type = "maps_contacts"
        websites = []
        input_name = body.business_type.strip()
        input_location = body.location.strip()
        max_results = body.normalized_max_results()
        input_urls_json = None
    else:
        job_type = "maps_scrape"
        websites = []
        input_name = body.business_type.strip()
        input_location = body.location.strip()
        max_results = body.normalized_max_results()
        input_urls_json = None

    idem = f"{job_type}-{current_user.id}-{uuid.uuid4()}"
    job = job_service.create_job(
        db,
        user_id=current_user.id,
        job_type=job_type,
        idempotency_key=idem,
    )
    search = SearchRun(
        user_id=current_user.id,
        job_id=job.id,
        input_name=input_name,
        input_location=input_location,
        max_results=max_results,
        mode=mode,
        status="queued",
        progress_pct=0,
        progress_message="Queued",
        results_json=None,
        input_urls_json=input_urls_json,
    )
    db.add(search)
    db.commit()
    db.refresh(search)
    start_search_run_background(
        search.id,
        exclude_urls=list(body.exclude_urls or [])[:500],
        exclude_phones=list(body.exclude_phones or [])[:500],
    )
    return search


@router.get("/{search_id}", response_model=SearchRunOut)
def get_search(
    search_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SearchRun:
    search = db.get(SearchRun, search_id)
    if search is None or search.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search not found")
    return search


def _owned_search(db: Session, user: User, search_id: int) -> SearchRun:
    search = db.get(SearchRun, search_id)
    if search is None or search.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search not found")
    return search


def _load_ephemeral_bundle(search: SearchRun) -> dict[str, list[dict]]:
    """Return {leads, examples}. Supports legacy bare-list JSON."""
    empty: dict[str, list[dict]] = {"leads": [], "examples": []}
    if not search.results_json:
        return empty
    try:
        data = json.loads(search.results_json)
    except json.JSONDecodeError:
        return empty
    if isinstance(data, list):
        leads, examples = [], []
        for row in data:
            if (row.get("website_url") or row.get("website_status") == "working"):
                examples.append(row)
            else:
                leads.append(row)
        return {"leads": leads, "examples": examples[:5]}
    if isinstance(data, dict):
        return {
            "leads": list(data.get("leads") or []),
            "examples": list(data.get("examples") or [])[:5],
        }
    return empty


def _load_ephemeral(search: SearchRun) -> list[dict]:
    bundle = _load_ephemeral_bundle(search)
    return list(bundle["leads"]) + list(bundle["examples"])


def _save_ephemeral(db: Session, search: SearchRun, rows: list[dict]) -> None:
    # Preserve examples already stored when qualify/etc. rewrite lead rows.
    bundle = _load_ephemeral_bundle(search)
    leads_only = [
        r
        for r in rows
        if not r.get("website_url")
        and (r.get("website_status") or "website_not_found") == "website_not_found"
    ]
    search.results_json = json.dumps({"leads": leads_only, "examples": bundle["examples"]})
    search.result_count = len(leads_only)
    db.add(search)


def _dict_has_whatsapp(row: dict) -> bool:
    if row.get("has_whatsapp"):
        return True
    raw = row.get("contact_fields_json")
    if not raw:
        return False
    try:
        payload = json.loads(raw) if isinstance(raw, str) else raw
        return bool(payload.get("has_whatsapp"))
    except (json.JSONDecodeError, TypeError):
        return False


def _lead_out_from_dict(row: dict, search_id: int, idx: int) -> LeadOut:
    reasons = row.get("score_reasons")
    if isinstance(reasons, str):
        try:
            reasons = json.loads(reasons)
        except json.JSONDecodeError:
            reasons = None
    return LeadOut(
        id=int(row.get("id") or idx),
        search_run_id=search_id,
        source_listing_url=row.get("source_listing_url") or "",
        business_name=row.get("business_name"),
        location=row.get("location"),
        category=row.get("category"),
        website_url=row.get("website_url"),
        website_status=row.get("website_status") or "website_not_found",
        phone=row.get("phone"),
        has_whatsapp=_dict_has_whatsapp(row),
        email=row.get("email"),
        contact_page_url=row.get("contact_page_url"),
        review_count=row.get("review_count"),
        rating=row.get("rating"),
        rank=row.get("rank") or idx,
        score=row.get("score"),
        score_reasons=reasons if isinstance(reasons, dict) else None,
        dedupe_key=row.get("dedupe_key") or f"ephemeral-{search_id}-{idx}",
        last_checked_at=_parse_dt(row.get("last_checked_at")),
        created_at=_parse_dt(row.get("created_at")),
    )


def _parse_dt(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _filter_rows(
    rows: list[dict],
    *,
    category: str | None,
    location: str | None,
    website_status: str | None,
    min_score: int | None,
) -> list[dict]:
    out = rows
    if category:
        c = category.strip().lower()
        out = [r for r in out if c in (r.get("category") or "").lower()]
    if location:
        loc = location.strip().lower()
        out = [r for r in out if loc in (r.get("location") or "").lower()]
    if website_status:
        ws = website_status.strip()
        out = [r for r in out if (r.get("website_status") or "") == ws]
    if min_score is not None:
        out = [r for r in out if (r.get("score") or 0) >= min_score]
    return out


def _dup_groups_from_rows(rows: list[dict]) -> list[dict]:
    by_phone: dict[str, list[int]] = {}
    by_name_loc: dict[str, list[int]] = {}
    for row in rows:
        lid = int(row.get("id") or 0)
        phone = row.get("phone") or ""
        key = re.sub(r"\D", "", phone)
        if len(key) >= 8:
            by_phone.setdefault(key, []).append(lid)
        name = re.sub(r"[^a-z0-9]+", " ", (row.get("business_name") or "").lower()).strip()
        loc = re.sub(r"[^a-z0-9]+", " ", (row.get("location") or "").lower()).strip()
        if name and loc:
            by_name_loc.setdefault(f"{name}|{loc}", []).append(lid)
    groups = []
    for key, ids in by_phone.items():
        if len(ids) > 1:
            groups.append({"type": "phone", "key": key, "lead_ids": ids})
    for key, ids in by_name_loc.items():
        if len(ids) > 1:
            groups.append({"type": "name_location", "key": key, "lead_ids": ids})
    return groups


@router.get("/{search_id}/leads", response_model=list[LeadOut])
def list_leads(
    search_id: int,
    category: str | None = None,
    location: str | None = None,
    website_status: str | None = None,
    min_score: int | None = Query(default=None, ge=0, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LeadOut]:
    search = _owned_search(db, current_user, search_id)
    rows = _filter_rows(
        _load_ephemeral(search),
        category=category,
        location=location,
        website_status=website_status,
        min_score=min_score,
    )
    rows = sorted(
        rows,
        key=lambda r: (-(r.get("review_count") or 0), -(r.get("rating") or 0), int(r.get("id") or 0)),
    )
    return [_lead_out_from_dict({**r, "rank": i}, search.id, i) for i, r in enumerate(rows, start=1)]


@router.post("/{search_id}/claim", response_model=list[LeadOut])
def claim_search_leads(
    search_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LeadOut]:
    """Hand results to the browser cache and wipe server-side payload (no durable leads).

    Returns leads first (ranked), then up to 5 example sites (ranked). Frontend splits
    by website_url / website_status for the Top 5 sites tab.
    """
    search = _owned_search(db, current_user, search_id)
    bundle = _load_ephemeral_bundle(search)
    leads = sorted(
        bundle["leads"],
        key=lambda r: (-(r.get("review_count") or 0), -(r.get("rating") or 0), int(r.get("id") or 0)),
    )
    examples = sorted(
        bundle["examples"],
        key=lambda r: (-(r.get("review_count") or 0), -(r.get("rating") or 0), int(r.get("id") or 0)),
    )[:5]
    out: list[LeadOut] = []
    for i, r in enumerate(leads, start=1):
        out.append(_lead_out_from_dict({**r, "rank": i}, search.id, i))
    for i, r in enumerate(examples, start=1):
        out.append(_lead_out_from_dict({**r, "rank": i}, search.id, 10_000 + i))
    search.results_json = None
    db.query(Lead).filter(Lead.search_run_id == search.id).delete(synchronize_session=False)
    db.add(search)
    db.commit()
    return out


@router.post("/{search_id}/qualify", response_model=list[LeadOut])
def qualify_search_leads(
    search_id: int,
    body: QualifyRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LeadOut]:
    search = _owned_search(db, current_user, search_id)
    bundle = _load_ephemeral_bundle(search)
    rows = bundle["leads"]
    if not rows and not bundle["examples"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No ephemeral results left — already claimed into browser cache",
        )
    # Lightweight in-memory scoring only (no website crawl fan-out on ephemeral payload).
    _ = body
    for row in rows:
        result = score_lead(
            website_status=row.get("website_status") or "website_not_found",
            phone=row.get("phone"),
            business_name=row.get("business_name"),
            location=row.get("location"),
            email=row.get("email"),
            contact_page_url=row.get("contact_page_url"),
            website_url=row.get("website_url"),
        )
        row["score"] = int(result["score"])
        row["score_reasons"] = result
    _save_ephemeral(db, search, rows)
    db.commit()
    rows = sorted(
        rows,
        key=lambda r: (-(r.get("review_count") or 0), -(r.get("rating") or 0), int(r.get("id") or 0)),
    )
    return [_lead_out_from_dict({**r, "rank": i}, search.id, i) for i, r in enumerate(rows, start=1)]


@router.get("/{search_id}/duplicates")
def search_duplicates(
    search_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    search = _owned_search(db, current_user, search_id)
    rows = _load_ephemeral(search)
    groups = _dup_groups_from_rows(rows)
    return {"count": len(groups), "groups": groups}


@router.get("/{search_id}/export.csv")
def export_leads_csv(
    search_id: int,
    category: str | None = None,
    location: str | None = None,
    website_status: str | None = None,
    min_score: int | None = Query(default=None, ge=0, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    search = _owned_search(db, current_user, search_id)
    leads = _filter_rows(
        _load_ephemeral(search),
        category=category,
        location=location,
        website_status=website_status,
        min_score=min_score,
    )
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=[
            "business_name",
            "phone",
            "email",
            "location",
            "category",
            "website_status",
            "website_url",
            "contact_page_url",
            "score",
            "score_reasons",
            "maps_link",
            "dedupe_key",
        ],
    )
    writer.writeheader()
    for lead in leads:
        reasons = lead.get("score_reasons")
        if isinstance(reasons, dict):
            reasons = json.dumps(reasons)
        writer.writerow(
            {
                "business_name": lead.get("business_name") or "",
                "phone": lead.get("phone") or "",
                "email": lead.get("email") or "",
                "location": lead.get("location") or "",
                "category": lead.get("category") or "",
                "website_status": lead.get("website_status") or "",
                "website_url": lead.get("website_url") or "",
                "contact_page_url": lead.get("contact_page_url") or "",
                "score": lead.get("score") if lead.get("score") is not None else "",
                "score_reasons": reasons or "",
                "maps_link": lead.get("source_listing_url") or "",
                "dedupe_key": lead.get("dedupe_key") or "",
            }
        )
    buffer.seek(0)
    filename = f"leads_search_{search.id}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
