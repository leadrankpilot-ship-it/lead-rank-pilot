"""Export fallback when no live publishing connector is available."""

from __future__ import annotations

import re
from typing import Any


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "post"


def export_markdown(*, title: str, slug: str, content_html: str, meta_description: str | None = None) -> str:
    parts = [
        "---",
        f'title: "{title.replace(chr(34), chr(39))}"',
        f"slug: {_slug(slug)}",
    ]
    if meta_description:
        parts.append(f'description: "{meta_description.replace(chr(34), chr(39))}"')
    parts.extend(["---", "", content_html, ""])
    return "\n".join(parts)


def export_html(*, title: str, content_html: str, meta_description: str | None = None) -> str:
    meta = f'<meta name="description" content="{meta_description}">' if meta_description else ""
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{title}</title>{meta}</head><body>{content_html}</body></html>"
    )


class ExportPublisher:
    """Not a live publisher — used to signal unsupported live publish clearly."""

    connector_type = "export"

    def test(self, *, site_url: str, username: str, secret: str) -> dict[str, Any]:
        return {
            "ok": True,
            "mode": "export",
            "capabilities": {"posts": False, "draft": False, "publish": False, "export": True},
            "user": "export",
        }

    def publish(self, **kwargs: Any) -> dict[str, Any]:
        raise RuntimeError(
            "Export connector cannot live-publish. Download Markdown/HTML export instead."
        )
