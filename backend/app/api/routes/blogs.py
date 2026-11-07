import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import decrypt_secret
from app.db.session import get_db
from app.models.blog_post import BlogPost
from app.models.blog_topic import BlogTopic
from app.models.usage_ledger import UsageLedger
from app.models.user import User
from app.models.website import Website
from app.models.website_connection import WebsiteConnection
from app.schemas.blog import (
    BlogGenerateRequest,
    BlogPostOut,
    BlogTopicOut,
    BlogUpdateRequest,
    PublishRequest,
    QuotaOut,
)
from app.services.blog_generation import generate_blog_draft, normalize_topic
from app.services.image_upload import save_blog_image
from app.services.writer_prompt import saved_category_names
from app.services.connectors import get_publisher
from app.services.connectors.export_fallback import export_html, export_markdown
from app.services.quota import assert_blog_quota, blog_quota_for_user, blogs_generated_today
from app.services.wordpress import make_idempotency_key

router = APIRouter(prefix="/blogs", tags=["blogs"])


def _owned_site(db: Session, user: User, website_id: int) -> Website:
    site = db.get(Website, website_id)
    if site is None or site.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Website not found")
    return site


def _post_out(post: BlogPost) -> BlogPostOut:
    meta = None
    if post.metadata_json:
        try:
            meta = json.loads(post.metadata_json)
        except json.JSONDecodeError:
            meta = None
    return BlogPostOut(
        id=post.id,
        website_id=post.website_id,
        topic_id=post.topic_id,
        title=post.title,
        slug=post.slug,
        body=post.body,
        metadata=meta,
        status=post.status,
        generated_at=post.generated_at,
        approved_at=post.approved_at,
        published_at=post.published_at,
        remote_post_id=post.remote_post_id,
        remote_url=post.remote_url,
        created_at=post.created_at,
        error_code=post.error_code,
    )


@router.get("/quota", response_model=QuotaOut)
def get_quota(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuotaOut:
    used = blogs_generated_today(db, current_user.id)
    limit = blog_quota_for_user(current_user)
    return QuotaOut(used=used, limit=limit, remaining=max(0, limit - used))


@router.post("/images")
async def upload_blog_image(
    request: Request,
    file: UploadFile = File(...),
    slug_hint: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    _ = current_user
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


@router.get("/topics/{website_id}", response_model=list[BlogTopicOut])
def list_topics(
    website_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BlogTopic]:
    _owned_site(db, current_user, website_id)
    return (
        db.query(BlogTopic)
        .filter(BlogTopic.website_id == website_id)
        .order_by(BlogTopic.id.desc())
        .all()
    )


@router.get("/posts", response_model=list[BlogPostOut])
def list_posts(
    website_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BlogPostOut]:
    q = db.query(BlogPost).join(Website).filter(Website.user_id == current_user.id)
    if website_id is not None:
        q = q.filter(BlogPost.website_id == website_id)
    rows = q.order_by(BlogPost.id.desc()).limit(100).all()
    return [_post_out(r) for r in rows]


@router.get("/posts/{post_id}", response_model=BlogPostOut)
def get_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BlogPostOut:
    post = (
        db.query(BlogPost)
        .join(Website)
        .filter(BlogPost.id == post_id, Website.user_id == current_user.id)
        .first()
    )
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return _post_out(post)


@router.post("/generate", response_model=BlogPostOut, status_code=status.HTTP_201_CREATED)
def generate_post(
    body: BlogGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BlogPostOut:
    site = _owned_site(db, current_user, body.website_id)
    if not site.profile_confirmed_at or not site.business_profile_json:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirm the website business profile before generating blogs",
        )
    try:
        assert_blog_quota(db, current_user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc

    profile = json.loads(site.business_profile_json)
    allowed = saved_category_names(profile)
    chosen = body.category.strip()
    match = next((name for name in allowed if name.lower() == chosen.lower()), None)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose one of this site's saved categories",
        )
    norm = normalize_topic(body.topic or "")
    existing = (
        db.query(BlogTopic)
        .filter(BlogTopic.website_id == site.id, BlogTopic.normalized_topic == norm)
        .first()
    )
    if existing and existing.status in {"used", "suggested"}:
        # Allow regenerate only if no successful post yet for exact topic normalization collision with completed
        pass
    if existing is None:
        existing = BlogTopic(
            website_id=site.id,
            topic=(body.topic or "").strip(),
            normalized_topic=norm,
            status="generating",
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)
    else:
        existing.status = "generating"
        db.commit()

    existing_topics = [t.topic for t in db.query(BlogTopic).filter(BlogTopic.website_id == site.id).all()]
    post = BlogPost(
        website_id=site.id,
        topic_id=existing.id,
        title="Generating...",
        slug="generating",
        body="",
        status="generating",
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    try:
        draft = generate_blog_draft(
            (body.topic or "").strip(),
            profile,
            existing_topics,
            options={
                "category": match,
                "nlp_keywords": body.nlp_keywords or [],
                "lsi_keywords": body.lsi_keywords or body.related_keywords or [],
                "target_words": body.target_words,
            },
        )
        post.title = str(draft["title"])[:500]
        post.slug = str(draft["slug"])[:500]
        post.body = str(draft["body"])
        post.metadata_json = json.dumps(draft)
        post.status = "draft"
        post.generated_at = datetime.now(UTC)
        post.error_code = None
        existing.status = "used"
        db.add(
            UsageLedger(
                user_id=current_user.id,
                website_id=site.id,
                action="blog_generate",
                quantity=1,
                provider_usage_json=json.dumps(draft.get("usage") or {"model": draft.get("model")}),
                status="completed",
            )
        )
        db.commit()
        db.refresh(post)
        return _post_out(post)
    except Exception as exc:
        post.status = "failed"
        post.error_code = "generation_failed"
        post.body = ""
        existing.status = "failed"
        db.add(
            UsageLedger(
                user_id=current_user.id,
                website_id=site.id,
                action="blog_generate",
                quantity=0,
                provider_usage_json=json.dumps({"error": str(exc)[:500]}),
                status="failed",
            )
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)[:500]) from exc


@router.patch("/posts/{post_id}", response_model=BlogPostOut)
def update_post(
    post_id: int,
    body: BlogUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BlogPostOut:
    post = (
        db.query(BlogPost)
        .join(Website)
        .filter(BlogPost.id == post_id, Website.user_id == current_user.id)
        .first()
    )
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.status not in {"draft", "approved", "failed"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Post not editable in current status")
    if body.title is not None:
        post.title = body.title.strip()[:500]
    if body.slug is not None:
        post.slug = body.slug.strip()[:500]
    if body.body is not None:
        post.body = body.body
    meta_fields = {
        "meta_description": body.meta_description,
        "meta_title": body.meta_title,
        "focus_keyword": body.focus_keyword,
        "featured_image_url": body.featured_image_url,
    }
    if any(v is not None for v in meta_fields.values()):
        meta: dict = {}
        if post.metadata_json:
            try:
                meta = json.loads(post.metadata_json)
            except json.JSONDecodeError:
                meta = {}
        for key, value in meta_fields.items():
            if value is not None:
                meta[key] = value
        post.metadata_json = json.dumps(meta)
    if post.status == "failed" and post.body:
        post.status = "draft"
        post.error_code = None
    db.commit()
    db.refresh(post)
    return _post_out(post)


@router.post("/posts/{post_id}/approve", response_model=BlogPostOut)
def approve_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BlogPostOut:
    post = (
        db.query(BlogPost)
        .join(Website)
        .filter(BlogPost.id == post_id, Website.user_id == current_user.id)
        .first()
    )
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.status != "draft":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only drafts can be approved")
    post.status = "approved"
    post.approved_at = datetime.now(UTC)
    db.commit()
    db.refresh(post)
    return _post_out(post)


@router.post("/posts/{post_id}/publish", response_model=BlogPostOut)
def publish_post(
    post_id: int,
    body: PublishRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BlogPostOut:
    post = (
        db.query(BlogPost)
        .join(Website)
        .filter(BlogPost.id == post_id, Website.user_id == current_user.id)
        .first()
    )
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.status not in {"draft", "approved", "published", "publishing"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Post cannot be published from this status")

    conn = db.query(WebsiteConnection).filter(WebsiteConnection.website_id == post.website_id).first()
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No publishing connection configured. Use WordPress/custom connection or download export.",
        )
    if conn.connection_status != "ok":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test connection first")

    desired = (body.status if body else "draft")
    if desired == "publish" and not conn.auto_publish:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Live publish requires auto_publish opt-in on the connection",
        )

    try:
        publisher = get_publisher(conn.connector_type)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    idem = make_idempotency_key(post.website_id, post.id, desired)
    if post.remote_post_id and post.publish_idempotency_key == idem and post.status == "published":
        return _post_out(post)

    post.status = "publishing"
    post.publish_idempotency_key = idem
    db.commit()

    meta_description = None
    category = None
    if post.metadata_json:
        try:
            meta = json.loads(post.metadata_json)
            meta_description = meta.get("meta_description")
            category = str(meta.get("category") or "").strip() or None
        except json.JSONDecodeError:
            meta_description = None
            category = None
    if conn.connector_type == "wordpress" and not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This draft has no category. Open Edit, set Category, Save draft, then publish again.",
        )

    try:
        secret = decrypt_secret(conn.secret_encrypted)
        result = publisher.publish(
            site_url=conn.site_url,
            username=conn.username,
            secret=secret,
            title=post.title,
            content=post.body,
            slug=post.slug,
            status=desired,
            idempotency_key=idem,
            remote_post_id=post.remote_post_id,
            meta_description=meta_description,
            category=category,
        )
        post.remote_post_id = str(result.get("id") or "")
        post.remote_url = result.get("link")
        post.status = "published" if desired == "publish" else "approved"
        if desired == "publish":
            post.published_at = datetime.now(UTC)
        post.error_code = None
        db.commit()
        db.refresh(post)
        return _post_out(post)
    except Exception as exc:
        post.status = "failed"
        post.error_code = "publish_failed"
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)[:500]) from exc


@router.get("/posts/{post_id}/export.md")
def export_post_markdown(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PlainTextResponse:
    post = (
        db.query(BlogPost)
        .join(Website)
        .filter(BlogPost.id == post_id, Website.user_id == current_user.id)
        .first()
    )
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    meta_description = None
    if post.metadata_json:
        try:
            meta_description = json.loads(post.metadata_json).get("meta_description")
        except json.JSONDecodeError:
            meta_description = None
    content = export_markdown(
        title=post.title,
        slug=post.slug,
        content_html=post.body,
        meta_description=meta_description,
    )
    return PlainTextResponse(
        content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{post.slug or post.id}.md"'},
    )


@router.get("/posts/{post_id}/export.html")
def export_post_html(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    post = (
        db.query(BlogPost)
        .join(Website)
        .filter(BlogPost.id == post_id, Website.user_id == current_user.id)
        .first()
    )
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    meta_description = None
    if post.metadata_json:
        try:
            meta_description = json.loads(post.metadata_json).get("meta_description")
        except json.JSONDecodeError:
            meta_description = None
    content = export_html(title=post.title, content_html=post.body, meta_description=meta_description)
    return Response(
        content,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{post.slug or post.id}.html"'},
    )
