import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.saved_search import SavedSearch
from app.models.search_run import SearchRun
from app.models.user import User
from app.schemas.audit import SavedSearchCreate, SavedSearchOut
from app.schemas.search import SearchRunOut
from app.services import jobs as job_service
from app.services.search_runner import start_search_run_background

router = APIRouter(prefix="/saved-searches", tags=["saved-searches"])


@router.get("", response_model=list[SavedSearchOut])
def list_saved(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SavedSearch]:
    return (
        db.query(SavedSearch)
        .filter(SavedSearch.user_id == current_user.id)
        .order_by(SavedSearch.id.desc())
        .all()
    )


@router.post("", response_model=SavedSearchOut, status_code=status.HTTP_201_CREATED)
def create_saved(
    body: SavedSearchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedSearch:
    row = SavedSearch(
        user_id=current_user.id,
        name=body.name.strip(),
        filters_json=json.dumps(
            {"business_type": body.business_type.strip(), "location": body.location.strip()}
        ),
        schedule=body.schedule.strip() or "manual",
        enabled=body.enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{saved_id}/disable", response_model=SavedSearchOut)
def disable_saved(
    saved_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedSearch:
    row = db.get(SavedSearch, saved_id)
    if row is None or row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved search not found")
    row.enabled = False
    db.commit()
    db.refresh(row)
    return row


@router.post("/{saved_id}/recheck", response_model=SearchRunOut, status_code=status.HTTP_201_CREATED)
def recheck_saved(
    saved_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SearchRun:
    row = db.get(SavedSearch, saved_id)
    if row is None or row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved search not found")
    if not row.enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Saved search is disabled")

    filters = json.loads(row.filters_json)
    business_type = filters.get("business_type")
    location = filters.get("location")
    if not business_type or not location:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid saved filters")

    idem = f"maps-recheck-{current_user.id}-{uuid.uuid4()}"
    job = job_service.create_job(
        db,
        user_id=current_user.id,
        job_type="maps_scrape",
        idempotency_key=idem,
    )
    search = SearchRun(
        user_id=current_user.id,
        job_id=job.id,
        input_name=business_type,
        input_location=location,
        status="queued",
        progress_pct=0,
        progress_message="Queued from saved search",
    )
    db.add(search)
    row.last_run_at = datetime.now(UTC)
    db.commit()
    db.refresh(search)
    start_search_run_background(search.id)
    return search
