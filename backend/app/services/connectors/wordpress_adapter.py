from __future__ import annotations

from typing import Any

from app.services import wordpress as wp


class WordPressPublisher:
    connector_type = "wordpress"

    def test(self, *, site_url: str, username: str, secret: str) -> dict[str, Any]:
        return wp.test_connection(site_url, username, secret)

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
        return wp.create_or_update_post(
            site_url=site_url,
            username=username,
            app_password=secret,
            title=title,
            content=content,
            slug=slug,
            status=status,
            idempotency_key=idempotency_key,
            remote_post_id=remote_post_id,
            category=category,
        )
