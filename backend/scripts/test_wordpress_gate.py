"""Phase 6 gate: mock WordPress publish is idempotent (no duplicate remote posts)."""

from app.core.config import settings
from app.services.wordpress import create_or_update_post, make_idempotency_key, test_connection

settings.wordpress_mode = "mock"

ok = test_connection("https://example.com", "editor", "xxxx xxxx xxxx xxxx xxxx xxxx")
assert ok["ok"] is True

key = make_idempotency_key(1, 42, "draft")
first = create_or_update_post(
    site_url="https://example.com",
    username="editor",
    app_password="app-pass",
    title="Hello",
    content="<p>Body</p>",
    slug="hello",
    status="draft",
    idempotency_key=key,
)
second = create_or_update_post(
    site_url="https://example.com",
    username="editor",
    app_password="app-pass",
    title="Hello again",
    content="<p>Body</p>",
    slug="hello",
    status="draft",
    idempotency_key=key,
)
assert first["id"] == second["id"], (first, second)
assert first["link"] == second["link"]
print("wordpress-gate-ok", first["id"])
