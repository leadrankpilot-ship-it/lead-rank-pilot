import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.platform_blog import PlatformBlog
from app.schemas.admin import AdminBlogOut, AdminRelatedLink
from app.services.blog_categories import normalize_blog_category

router = APIRouter(prefix="/platform-blogs", tags=["platform-blogs"])


def _parse_links(raw: str | None) -> list[AdminRelatedLink]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[AdminRelatedLink] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        if not title or not url:
            continue
        related_id = item.get("related_post_id")
        out.append(
            AdminRelatedLink(
                title=title[:300],
                url=url[:2000],
                related_post_id=int(related_id) if related_id is not None else None,
            )
        )
    return out


def _serialize(row: PlatformBlog) -> AdminBlogOut:
    return AdminBlogOut(
        id=row.id,
        title=row.title,
        slug=row.slug,
        excerpt=row.excerpt or "",
        body=row.body or "",
        cover_image_url=row.cover_image_url or "",
        category=normalize_blog_category(getattr(row, "category", None)),
        published_on=row.published_on,
        read_time=row.read_time or "5 min",
        related_links=_parse_links(row.related_links_json),
        status=row.status,
        author_user_id=row.author_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[AdminBlogOut])
def list_published_blogs(db: Session = Depends(get_db)) -> list[AdminBlogOut]:
    try:
        rows = (
            db.query(PlatformBlog)
            .filter(PlatformBlog.status == "published")
            .order_by(PlatformBlog.published_on.desc(), PlatformBlog.id.desc())
            .limit(100)
            .all()
        )
    except Exception:
        # Table may not exist yet during a rolling deploy — avoid hard 500/502 for empty blog UI.
        db.rollback()
        return []
    return [_serialize(r) for r in rows]


@router.get("/{slug}", response_model=AdminBlogOut)
def get_published_blog(slug: str, db: Session = Depends(get_db)) -> AdminBlogOut:
    key = (slug or "").strip().lower()
    row = (
        db.query(PlatformBlog)
        .filter(PlatformBlog.slug == key, PlatformBlog.status == "published")
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blog not found")
    return _serialize(row)
