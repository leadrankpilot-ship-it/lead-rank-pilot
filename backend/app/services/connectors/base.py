from __future__ import annotations

from typing import Any, Protocol


class Publisher(Protocol):
    connector_type: str

    def test(self, *, site_url: str, username: str, secret: str) -> dict[str, Any]:
        ...

    def publish(
        self,
        *,
        site_url: str,
        username: str,
        secret: str,
        title: str,
        content: str,
        slug: str,
        status: str,
        idempotency_key: str,
        remote_post_id: str | None = None,
        excerpt: str | None = None,
        meta_description: str | None = None,
        category: str | None = None,
    ) -> dict[str, Any]:
        ...
