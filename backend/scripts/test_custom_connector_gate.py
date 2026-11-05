"""Phase 7 gate: connector registry + custom mock idempotency + export fallback."""

from app.core.config import settings
from app.services.connectors import get_publisher, supported_connectors
from app.services.connectors.export_fallback import export_markdown

settings.wordpress_mode = "mock"

assert set(supported_connectors()) == {"wordpress", "custom", "export"}

custom = get_publisher("custom")
key = "custom-idem-1"
first = custom.publish(
    site_url="https://example.com/api/publish",
    username="api",
    secret="token-12345678",
    title="Hello",
    content="<p>Hi</p>",
    slug="hello",
    status="draft",
    idempotency_key=key,
)
second = custom.publish(
    site_url="https://example.com/api/publish",
    username="api",
    secret="token-12345678",
    title="Hello 2",
    content="<p>Hi</p>",
    slug="hello",
    status="draft",
    idempotency_key=key,
)
assert first["id"] == second["id"]

export = get_publisher("export")
try:
    export.publish(
        site_url="https://example.com",
        username="export",
        secret="x",
        title="t",
        content="<p>x</p>",
        slug="t",
        status="draft",
        idempotency_key="e1",
    )
    raise SystemExit("export publish should fail clearly")
except RuntimeError as exc:
    assert "Export connector cannot live-publish" in str(exc)

md = export_markdown(title="T", slug="t", content_html="<p>Body</p>", meta_description="d")
assert "title:" in md and "<p>Body</p>" in md
print("custom-connector-gate-ok", first["id"])
