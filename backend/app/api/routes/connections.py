import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import decrypt_secret, encrypt_secret
from app.db.session import get_db
from app.models.user import User
from app.models.website import Website
from app.models.website_connection import WebsiteConnection
from app.schemas.connection import ConnectionCreate, ConnectionOut, ConnectionUpdate
from app.services import wordpress as wp
from app.services.connectors import get_publisher, supported_connectors

router = APIRouter(prefix="/connections", tags=["connections"])


def _owned_site(db: Session, user: User, website_id: int) -> Website:
    site = db.get(Website, website_id)
    if site is None or site.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Website not found")
    return site


@router.get("/types")
def list_connector_types() -> dict:
    return {"supported": supported_connectors()}


@router.get("", response_model=list[ConnectionOut])
def list_connections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WebsiteConnection]:
    return (
        db.query(WebsiteConnection)
        .join(Website)
        .filter(Website.user_id == current_user.id)
        .order_by(WebsiteConnection.id.desc())
        .all()
    )


@router.post("", response_model=ConnectionOut, status_code=status.HTTP_201_CREATED)
def upsert_connection(
    body: ConnectionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WebsiteConnection:
    site = _owned_site(db, current_user, body.website_id)
    existing = db.query(WebsiteConnection).filter(WebsiteConnection.website_id == site.id).first()
    site_url = str(body.site_url).rstrip("/")
    secret_value = "".join(body.application_password.split()) or "export-placeholder"
    encrypted = encrypt_secret(secret_value)
    username = body.username.strip() or ("export" if body.connector_type == "export" else "api")

    if existing:
        existing.site_url = site_url
        existing.username = username
        existing.secret_encrypted = encrypted
        existing.auto_publish = body.auto_publish
        existing.connector_type = body.connector_type
        existing.connection_status = "untested"
        existing.last_error = None
        conn = existing
    else:
        conn = WebsiteConnection(
            website_id=site.id,
            connector_type=body.connector_type,
            site_url=site_url,
            username=username,
            secret_encrypted=encrypted,
            auto_publish=body.auto_publish,
            connection_status="untested",
        )
        db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


@router.patch("/{connection_id}", response_model=ConnectionOut)
def update_connection(
    connection_id: int,
    body: ConnectionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WebsiteConnection:
    conn = (
        db.query(WebsiteConnection)
        .join(Website)
        .filter(WebsiteConnection.id == connection_id, Website.user_id == current_user.id)
        .first()
    )
    if conn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    if body.auto_publish is not None:
        conn.auto_publish = body.auto_publish
    if body.username is not None:
        conn.username = body.username.strip()
    if body.application_password:
        conn.secret_encrypted = encrypt_secret(body.application_password)
        conn.connection_status = "untested"
    db.commit()
    db.refresh(conn)
    return conn


@router.post("/{connection_id}/test", response_model=ConnectionOut)
def test_site_connection(
    connection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WebsiteConnection:
    conn = (
        db.query(WebsiteConnection)
        .join(Website)
        .filter(WebsiteConnection.id == connection_id, Website.user_id == current_user.id)
        .first()
    )
    if conn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    try:
        publisher = get_publisher(conn.connector_type)
        secret = decrypt_secret(conn.secret_encrypted)
        result = publisher.test(site_url=conn.site_url, username=conn.username, secret=secret)
        conn.connection_status = "ok"
        conn.capabilities_json = json.dumps(result.get("capabilities") or {})
        conn.last_error = None
        conn.last_tested_at = datetime.now(UTC)
    except Exception as exc:
        conn.connection_status = "error"
        conn.last_error = str(exc)[:1000]
        conn.last_tested_at = datetime.now(UTC)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)[:500]) from exc
    db.commit()
    db.refresh(conn)
    return conn


@router.get("/{connection_id}/categories")
def list_connection_categories(
    connection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    conn = (
        db.query(WebsiteConnection)
        .join(Website)
        .filter(WebsiteConnection.id == connection_id, Website.user_id == current_user.id)
        .first()
    )
    if conn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    if conn.connector_type != "wordpress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Categories can only be imported from a WordPress connection",
        )
    if conn.connection_status != "ok":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test WordPress connection first")
    try:
        secret = decrypt_secret(conn.secret_encrypted)
        categories = wp.list_importable_sections(conn.site_url, conn.username, secret)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)[:500]) from exc
    return {"categories": categories}


@router.post("/{connection_id}/sync-section-pages")
def sync_connection_section_pages(
    connection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Lock each header section Page query loop to its matching WordPress category."""
    conn = (
        db.query(WebsiteConnection)
        .join(Website)
        .filter(WebsiteConnection.id == connection_id, Website.user_id == current_user.id)
        .first()
    )
    if conn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    if conn.connector_type != "wordpress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Section sync only works with a WordPress connection",
        )
    if conn.connection_status != "ok":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test WordPress connection first")
    try:
        secret = decrypt_secret(conn.secret_encrypted)
        result = wp.sync_section_page_category_filters(conn.site_url, conn.username, secret)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)[:500]) from exc
    return result


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    connection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    conn = (
        db.query(WebsiteConnection)
        .join(Website)
        .filter(WebsiteConnection.id == connection_id, Website.user_id == current_user.id)
        .first()
    )
    if conn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    db.delete(conn)
    db.commit()
