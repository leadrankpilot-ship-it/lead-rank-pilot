import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.audit_report import AuditReport
from app.models.lead import Lead
from app.models.search_run import SearchRun
from app.models.user import User
from app.models.website import Website
from app.schemas.audit import AuditCreate, AuditReportOut
from app.services.website_audit import run_website_audit

router = APIRouter(prefix="/audits", tags=["audits"])


def _serialize(report: AuditReport) -> AuditReportOut:
    return AuditReportOut(
        id=report.id,
        website_id=report.website_id,
        lead_id=report.lead_id,
        target_url=report.target_url,
        status_category=report.status_category,
        checks=json.loads(report.checks_json),
        score=json.loads(report.score_json) if report.score_json else None,
        limitations=json.loads(report.limitations_json) if report.limitations_json else None,
        checked_at=report.checked_at,
        created_at=report.created_at,
    )


@router.get("", response_model=list[AuditReportOut])
def list_audits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuditReportOut]:
    rows = (
        db.query(AuditReport)
        .filter(AuditReport.user_id == current_user.id)
        .order_by(AuditReport.id.desc())
        .limit(50)
        .all()
    )
    return [_serialize(r) for r in rows]


@router.post("", response_model=AuditReportOut, status_code=status.HTTP_201_CREATED)
def create_audit(
    body: AuditCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditReportOut:
    website_id = body.website_id
    lead_id = body.lead_id
    target = str(body.url) if body.url else None

    if website_id is not None:
        site = db.get(Website, website_id)
        if site is None or site.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Website not found")
        target = site.base_url

    if lead_id is not None:
        lead = db.get(Lead, lead_id)
        if lead is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        search = db.get(SearchRun, lead.search_run_id)
        if search is None or search.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not lead.website_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lead has no website URL to audit (website_not_found)",
            )
        target = lead.website_url

    if not target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No audit target")

    try:
        result = run_website_audit(target)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    report = AuditReport(
        user_id=current_user.id,
        website_id=website_id,
        lead_id=lead_id,
        target_url=result["target_url"],
        status_category=result["status_category"],
        checks_json=json.dumps(result["checks"]),
        score_json=json.dumps(result["score"]),
        limitations_json=json.dumps(result["limitations"]),
    )
    db.add(report)

    if website_id is not None:
        # Keep latest check timestamp path simple via ownership_confirmed unused field no-op
        pass

    db.commit()
    db.refresh(report)
    return _serialize(report)


@router.get("/{audit_id}", response_model=AuditReportOut)
def get_audit(
    audit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditReportOut:
    report = db.get(AuditReport, audit_id)
    if report is None or report.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit not found")
    return _serialize(report)
