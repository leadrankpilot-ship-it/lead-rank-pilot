# Custom publish contract (v1)

Use this when a site is not WordPress but can accept authenticated POSTs.

## Request

`POST <site_publish_endpoint>`

Headers:
- `Authorization: Bearer <revocable_secret>`
- `Content-Type: application/json`
- `Idempotency-Key: <key>`

Body:

```json
{
  "title": "Blog title",
  "slug": "suggested-blog-slug",
  "content_html": "<h1>...</h1><p>...</p>",
  "excerpt": "Short summary",
  "meta_description": "SEO description",
  "status": "draft",
  "idempotency_key": "sha256...",
  "remote_post_id": null
}
```

## Response

```json
{
  "success": true,
  "post_id": "123",
  "url": "https://customer-site.example/blog/suggested-blog-slug"
}
```

On failure return a non-2xx status and/or `{ "success": false, "error": "..." }`.

## Local reference endpoint

LeadRankPilot exposes a test receiver at:

`POST /api/reference/custom-publish`

Bearer token: `custom-test-token-12345678`
