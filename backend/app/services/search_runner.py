from __future__ import annotations

import json
import logging
import threading
import time
from datetime import UTC, datetime

from app.db.session import SessionLocal
from app.models.job import Job
from app.models.lead import Lead
from app.models.search_run import SearchRun
from app.services import jobs as job_service
from app.services.scraper.adapter import (
    run_manual_contact_search,
    run_maps_contact_search,
    run_maps_search,
)

logger = logging.getLogger(__name__)

# Per-run exclude lists (saved / already-seen leads) — cleared when the thread finishes.
_EXCLUDE_BY_SEARCH: dict[int, dict[str, list[str]]] = {}


def _update_progress(db, search: SearchRun, pct: int, message: str) -> None:
    search.progress_pct = min(int(pct), 100)
    search.progress_message = message[:255]
    db.commit()


def execute_search_run(search_run_id: int) -> None:
    logger.info("search-run thread started id=%s thread=%s", search_run_id, threading.current_thread().name)
    db = SessionLocal()
    try:
        search = db.get(SearchRun, search_run_id)
        if search is None:
            logger.warning("search-run %s missing in DB", search_run_id)
            return

        # Mark running ASAP so UI leaves "Queued 0%" even before Playwright boots
        job = db.get(Job, search.job_id) if search.job_id else None
        search.status = "running"
        search.started_at = datetime.now(UTC)
        search.progress_pct = 1
        search.progress_message = "Starting scraper..."
        db.commit()
        logger.info("search-run %s marked running", search_run_id)

        if job and job.status == "queued":
            job_service.advance_job(db, job, to_status="running")

        last_commit_at = 0.0
        last_pct = -1

        def on_progress(pct: int, message: str) -> None:
            nonlocal last_commit_at, last_pct
            now = time.monotonic()
            # Throttle DB writes: every 1.5s or jump of 5%+ or completion
            if pct < 100 and (now - last_commit_at) < 1.5 and abs(pct - last_pct) < 5:
                return
            fresh = db.get(SearchRun, search_run_id)
            if fresh is None:
                return
            _update_progress(db, fresh, pct, message)
            last_commit_at = now
            last_pct = pct

        max_results = int(getattr(search, "max_results", None) or 15)
        mode = (getattr(search, "mode", None) or "leads").strip().lower()
        exclude = _EXCLUDE_BY_SEARCH.pop(search_run_id, {}) or {}
        if mode == "manual_contacts":
            urls: list[str] = []
            if search.input_urls_json:
                try:
                    parsed = json.loads(search.input_urls_json)
                    if isinstance(parsed, list):
                        urls = [str(u) for u in parsed if str(u).strip()]
                except Exception:
                    urls = []
            bundled = run_manual_contact_search(urls, progress_callback=on_progress)
        elif mode == "contacts":
            bundled = run_maps_contact_search(
                search.input_name,
                search.input_location,
                progress_callback=on_progress,
                max_results=max_results,
                exclude_urls=list(exclude.get("urls") or []),
                exclude_phones=list(exclude.get("phones") or []),
            )
        else:
            bundled = run_maps_search(
                search.input_name,
                search.input_location,
                progress_callback=on_progress,
                max_results=max_results,
                exclude_urls=list(exclude.get("urls") or []),
                exclude_phones=list(exclude.get("phones") or []),
            )

        search = db.get(SearchRun, search_run_id)
        if search is None:
            return

        # Do not persist Lead rows (DB fill). Keep a short-lived JSON blob until the browser claims it.
        db.query(Lead).filter(Lead.search_run_id == search.id).delete(synchronize_session=False)

        def _to_payload(rows: list, *, start_id: int = 1) -> list[dict]:
            out = []
            for i, row in enumerate(rows, start=start_id):
                checked = row.get("last_checked_at")
                if hasattr(checked, "isoformat"):
                    checked = checked.isoformat()
                contacts = row.get("contact_fields_json")
                if isinstance(contacts, dict):
                    contacts = json.dumps(contacts)
                out.append(
                    {
                        "id": i,
                        "search_run_id": search.id,
                        "source_listing_url": row["source_listing_url"],
                        "business_name": row.get("business_name"),
                        "location": row.get("location"),
                        "category": row.get("category"),
                        "website_url": row.get("website_url"),
                        "website_status": row["website_status"],
                        "phone": row.get("phone"),
                        "email": row.get("email"),
                        "has_whatsapp": bool(row.get("has_whatsapp")),
                        "review_count": row.get("review_count"),
                        "rating": row.get("rating"),
                        "rank": row.get("rank") or (i - start_id + 1),
                        "contact_fields_json": contacts,
                        "contact_page_url": row.get("contact_page_url"),
                        "score": None,
                        "score_reasons": None,
                        "dedupe_key": row["dedupe_key"],
                        "last_checked_at": checked,
                        "created_at": None,
                    }
                )
            return out

        def _is_no_site(row: dict) -> bool:
            if row.get("website_url"):
                return False
            return (row.get("website_status") or "website_not_found") == "website_not_found"

        if mode in {"contacts", "manual_contacts"}:
            # Full inventory (email|phone found). Failed manual URLs appended with status.
            lead_rows = list(bundled.get("leads") or [])
            failed_rows = list(bundled.get("failed") or [])
            examples_payload: list[dict] = []
            leads_payload = _to_payload(lead_rows, start_id=1)
            if mode == "manual_contacts" and failed_rows:
                # Keep failed rows visible in claim payload (after successes).
                leads_payload.extend(_to_payload(failed_rows, start_id=50_001))
        else:
            # Full inventory (no-website only). Browser shows selected page size from a pool.
            lead_rows = [r for r in (bundled.get("leads") or []) if _is_no_site(r)]
            example_rows = [
                r for r in (bundled.get("examples") or []) if not _is_no_site(r)
            ][:5]
            leads_payload = _to_payload(lead_rows, start_id=1)
            examples_payload = _to_payload(example_rows, start_id=10_001)

        search.results_json = json.dumps({"leads": leads_payload, "examples": examples_payload})
        search.status = "completed"
        # result_count = successful contacts / display quota (not failed rows)
        if mode == "manual_contacts":
            ok_n = sum(1 for r in leads_payload if (r.get("website_status") or "") == "working")
            search.result_count = ok_n
        else:
            search.result_count = min(len(leads_payload), max_results)
        search.progress_pct = 100
        search.progress_message = "Done"
        search.completed_at = datetime.now(UTC)
        if not leads_payload and not examples_payload:
            search.error_summary = None
        db.commit()

        job = db.get(Job, search.job_id) if search.job_id else None
        if job and job.status == "running":
            job_service.advance_job(db, job, to_status="succeeded")
    except Exception as exc:
        logger.exception("Search run %s failed", search_run_id)
        search = db.get(SearchRun, search_run_id)
        if search:
            search.status = "failed"
            search.error_summary = str(exc)[:2000]
            search.completed_at = datetime.now(UTC)
            search.progress_message = "Failed"
            db.commit()
            job = db.get(Job, search.job_id) if search.job_id else None
            if job and job.status in {"queued", "running"}:
                try:
                    if job.status == "queued":
                        job_service.advance_job(db, job, to_status="running")
                        job = db.get(Job, search.job_id)
                    if job and job.status == "running":
                        job_service.advance_job(db, job, to_status="failed", error_summary=str(exc)[:2000])
                except Exception:
                    logger.exception("Failed to mark job failed for search %s", search_run_id)
    finally:
        _EXCLUDE_BY_SEARCH.pop(search_run_id, None)
        db.close()


def start_search_run_background(
    search_run_id: int,
    *,
    exclude_urls: list[str] | None = None,
    exclude_phones: list[str] | None = None,
) -> None:
    _EXCLUDE_BY_SEARCH[search_run_id] = {
        "urls": list(exclude_urls or []),
        "phones": list(exclude_phones or []),
    }

    def _safe_run() -> None:
        try:
            execute_search_run(search_run_id)
        except Exception:
            logger.exception("search-run thread crashed id=%s", search_run_id)
        finally:
            _EXCLUDE_BY_SEARCH.pop(search_run_id, None)

    thread = threading.Thread(
        target=_safe_run,
        args=(),
        name=f"search-run-{search_run_id}",
        daemon=True,
    )
    thread.start()
    logger.info("spawned background search-run id=%s alive=%s", search_run_id, thread.is_alive())
