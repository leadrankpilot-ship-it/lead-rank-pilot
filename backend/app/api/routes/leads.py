import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.lead import Lead
from app.models.search_run import SearchRun
from app.models.user import User
from app.schemas.search import LeadOut
from app.services.lead_qualification import find_duplicate_groups, qualify_lead

router = APIRouter(prefix="/leads", tags=["leads"])


def _lead_has_whatsapp(lead: Lead) -> bool:
    if not lead.contact_fields_json:
        return False
    try:
        payload = json.loads(lead.contact_fields_json)
        return bool(payload.get("has_whatsapp"))
    except json.JSONDecodeError:
        return False


def _lead_out(lead: Lead) -> LeadOut:
    reasons = None
    if lead.score_reasons_json:
        try:
            reasons = json.loads(lead.score_reasons_json)
        except json.JSONDecodeError:
            reasons = None
    return LeadOut(
        id=lead.id,
        search_run_id=lead.search_run_id,
        source_listing_url=lead.source_listing_url,
        business_name=lead.business_name,
        location=lead.location,
        category=lead.category,
        website_url=lead.website_url,
        website_status=lead.website_status,
        phone=lead.phone,
        has_whatsapp=_lead_has_whatsapp(lead),
        email=lead.email,
        contact_page_url=lead.contact_page_url,
        score=lead.score,
        score_reasons=reasons,
        dedupe_key=lead.dedupe_key,
        last_checked_at=lead.last_checked_at,
        created_at=lead.created_at,
    )


def _owned_leads_query(db: Session, user_id: int):
    return (
        db.query(Lead)
        .join(SearchRun, Lead.search_run_id == SearchRun.id)
        .filter(SearchRun.user_id == user_id)
    )


@router.get("", response_model=list[LeadOut])
def list_leads(
    category: str | None = None,
    location: str | None = None,
    website_status: str | None = None,
    min_score: int | None = Query(default=None, ge=0, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LeadOut]:
    q = _owned_leads_query(db, current_user.id)
    if category:
        q = q.filter(Lead.category.ilike(f"%{category.strip()}%"))
    if location:
        q = q.filter(Lead.location.ilike(f"%{location.strip()}%"))
    if website_status:
        q = q.filter(Lead.website_status == website_status.strip())
    if min_score is not None:
        q = q.filter(Lead.score >= min_score)
    rows = q.order_by(Lead.score.desc().nullslast(), Lead.id.desc()).limit(200).all()
    return [_lead_out(r) for r in rows]


@router.get("/duplicates")
def list_duplicates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rows = _owned_leads_query(db, current_user.id).all()
    groups = find_duplicate_groups(rows)
    return {"count": len(groups), "groups": groups}


@router.post("/{lead_id}/qualify", response_model=LeadOut)
def qualify_one(
    lead_id: int,
    discover_contacts: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeadOut:
    lead = (
        _owned_leads_query(db, current_user.id)
        .filter(Lead.id == lead_id)
        .first()
    )
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    qualify_lead(db, lead, discover_contacts=discover_contacts)
    db.commit()
    db.refresh(lead)
    return _lead_out(lead)


@router.get("/export.csv")
def export_filtered_csv(
    category: str | None = None,
    location: str | None = None,
    website_status: str | None = None,
    min_score: int | None = Query(default=None, ge=0, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    q = _owned_leads_query(db, current_user.id)
    if category:
        q = q.filter(Lead.category.ilike(f"%{category.strip()}%"))
    if location:
        q = q.filter(Lead.location.ilike(f"%{location.strip()}%"))
    if website_status:
        q = q.filter(Lead.website_status == website_status.strip())
    if min_score is not None:
        q = q.filter(Lead.score >= min_score)
    leads = q.order_by(Lead.score.desc().nullslast(), Lead.id.desc()).limit(1000).all()

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
        writer.writerow(
            {
                "business_name": lead.business_name or "",
                "phone": lead.phone or "",
                "email": lead.email or "",
                "location": lead.location or "",
                "category": lead.category or "",
                "website_status": lead.website_status,
                "website_url": lead.website_url or "",
                "contact_page_url": lead.contact_page_url or "",
                "score": lead.score if lead.score is not None else "",
                "score_reasons": lead.score_reasons_json or "",
                "maps_link": lead.source_listing_url,
                "dedupe_key": lead.dedupe_key,
            }
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="leads_filtered.csv"'},
    )
