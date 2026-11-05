"""Reference custom publishing endpoint for local/integration tests.

Contract matches CustomPublisher payload/response.
"""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/reference/custom-publish", tags=["reference"])

_STORE: dict[str, dict] = {}
_TOKEN = "custom-test-token-12345678"


class CustomPublishIn(BaseModel):
    title: str
    slug: str
    content_html: str
    excerpt: str = ""
    meta_description: str = ""
    status: str = Field(pattern="^(draft|publish)$")
    idempotency_key: str
    remote_post_id: str | None = None


@router.post("")
def receive_post(
    body: CustomPublishIn,
    authorization: str | None = Header(default=None),
) -> dict:
    if authorization != f"Bearer {_TOKEN}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if body.idempotency_key in _STORE:
        return _STORE[body.idempotency_key]
    post_id = body.remote_post_id or str(abs(hash(body.idempotency_key)) % 10_000_000)
    result = {
        "success": True,
        "post_id": post_id,
        "url": f"https://reference.local/posts/{body.slug}",
        "status": body.status,
    }
    _STORE[body.idempotency_key] = result
    return result
