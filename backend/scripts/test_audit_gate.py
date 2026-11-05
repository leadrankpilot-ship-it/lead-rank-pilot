"""Phase 3 gate: status classification + SSRF/crawl-limit safety."""

from app.core.config import settings
from app.services.safe_http import assert_public_hostname, normalize_http_url
from app.services.website_status import classify_status

# SSRF blocks
try:
    assert_public_hostname("localhost")
    raise SystemExit("expected localhost block")
except ValueError:
    pass

try:
    normalize_http_url("ftp://example.com")
    raise SystemExit("expected scheme block")
except ValueError:
    pass

# Live classification against public httpbin-like target; use example.com
result = classify_status("https://example.com")
assert result["status_category"] in {"working", "redirect", "unknown_blocked"}, result
assert "limitations" in result
assert settings.audit_max_links_checked <= 50
assert settings.audit_max_pages <= 10
print("audit-gate-ok", result["status_category"], result["response_time_ms"])
