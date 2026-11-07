import json
import re
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.db.session import get_db
from app.models.platform_blog import PlatformBlog
from app.models.user import User
from app.schemas.admin import AdminBlogCreate, AdminBlogOut, AdminBlogUpdate, AdminRelatedLink
from app.services.image_upload import save_blog_image

router = APIRouter(prefix="/admin/blogs", tags=["admin-blogs"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug[:80] or "blog-post"


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


def _dump_links(links: list[AdminRelatedLink]) -> str:
    return json.dumps([link.model_dump() for link in links])


def _unique_slug(db: Session, base: str, *, exclude_id: int | None = None) -> str:
    slug = _slugify(base)
    candidate = slug
    n = 2
    while True:
        q = db.query(PlatformBlog).filter(PlatformBlog.slug == candidate)
        if exclude_id is not None:
            q = q.filter(PlatformBlog.id != exclude_id)
        if q.first() is None:
            return candidate
        candidate = f"{slug}-{n}"[:80]
        n += 1


def _serialize(row: PlatformBlog) -> AdminBlogOut:
    return AdminBlogOut(
        id=row.id,
        title=row.title,
        slug=row.slug,
        excerpt=row.excerpt or "",
        body=row.body or "",
        cover_image_url=row.cover_image_url or "",
        published_on=row.published_on,
        read_time=row.read_time or "5 min",
        related_links=_parse_links(row.related_links_json),
        status=row.status,
        author_user_id=row.author_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[AdminBlogOut])
def list_admin_blogs(
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> list[AdminBlogOut]:
    rows = db.query(PlatformBlog).order_by(PlatformBlog.id.desc()).limit(200).all()
    return [_serialize(r) for r in rows]


@router.post("/images")
async def upload_admin_blog_image(
    request: Request,
    file: UploadFile = File(...),
    slug_hint: str | None = Form(default=None),
    _: User = Depends(get_admin_user),
) -> dict[str, str]:
    try:
        saved = await save_blog_image(file, slug_hint=slug_hint)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    path = saved["path"]
    url = saved.get("url") or (
        path if path.startswith("http") else f"{str(request.base_url).rstrip('/')}{path}"
    )
    return {
        "filename": saved["filename"],
        "path": path,
        "url": url,
        "original_name": saved["original_name"],
        "content_type": saved["content_type"],
        "storage": saved.get("storage", "local"),
    }


@router.post("", response_model=AdminBlogOut, status_code=status.HTTP_201_CREATED)
def create_admin_blog(
    body: AdminBlogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> AdminBlogOut:
    slug_source = body.slug.strip() if body.slug else body.title
    slug = _unique_slug(db, slug_source)
    row = PlatformBlog(
        title=body.title.strip(),
        slug=slug,
        excerpt=(body.excerpt or "").strip(),
        body=body.body or "",
        cover_image_url=(body.cover_image_url or "").strip(),
        published_on=body.published_on or date.today(),
        read_time=(body.read_time or "5 min").strip() or "5 min",
        related_links_json=_dump_links(body.related_links),
        status=body.status,
        author_user_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.get("/{blog_id}", response_model=AdminBlogOut)
def get_admin_blog(
    blog_id: int,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> AdminBlogOut:
    row = db.get(PlatformBlog, blog_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blog not found")
    return _serialize(row)


@router.patch("/{blog_id}", response_model=AdminBlogOut)
def update_admin_blog(
    blog_id: int,
    body: AdminBlogUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
) -> AdminBlogOut:
    row = db.get(PlatformBlog, blog_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blog not found")
    if body.title is not None:
        row.title = body.title.strip()
    if body.slug is not None and body.slug.strip():
        row.slug = _unique_slug(db, body.slug.strip(), exclude_id=row.id)
    if body.excerpt is not None:
        row.excerpt = body.excerpt.strip()
    if body.body is not None:
        row.body = body.body
    if body.cover_image_url is not None:
        row.cover_image_url = body.cover_image_url.strip()
    if body.published_on is not None:
        row.published_on = body.published_on
    if body.read_time is not None:
        row.read_time = body.read_time.strip() or "5 min"
    if body.related_links is not None:
        row.related_links_json = _dump_links(body.related_links)
    if body.status is not None:
        row.status = body.status
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.delete("/{blog_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admin_blog(
    blog_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
) -> None:
    row = db.get(PlatformBlog, blog_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blog not found")
    db.delete(row)
    db.commit()
