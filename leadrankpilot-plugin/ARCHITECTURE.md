# LeadRankPilot WordPress Plugin — Architecture

## Role

Thin, secure **publish bridge**. AI writing, keywords, and scheduling live in LeadRankPilot cloud. This plugin only:

1. Stores site credentials (token + signing secret)
2. Authenticates inbound requests
3. Upserts standard `post` content into WordPress
4. Returns remote post id / permalink

## Request flow

```
LeadRankPilot Dashboard
        │ keyword + schedule
        ▼
LeadRankPilot Backend (Python)
        │ generate HTML article
        ▼
POST /wp-json/leadrankpilot/v1/posts
  Authorization: Bearer <site_token>
  X-LRP-Idempotency-Key: <hash>
  X-LRP-Timestamp / X-LRP-Signature (optional HMAC)
        ▼
Plugin → wp_insert_post / wp_update_post
        ▼
Theme single.php / block theme → public URL
```

## REST surface (`leadrankpilot/v1`)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/health` | public | version / connectivity probe |
| POST | `/connect` | bearer | mark site connected |
| POST | `/posts` | bearer (+ optional HMAC) | create/update post |

### `/posts` body (JSON)

- `title` (required)
- `content` (required, HTML; sanitized with `wp_kses_post`)
- `slug`, `status` (`draft`|`publish`|`pending`|`future`)
- `excerpt`, `categories[]`, `featured_image_url`
- `meta_description`, `focus_keyword`
- `remote_post_id` (update existing)
- `idempotency_key` (or header)

## Security

- Bearer site token required for mutating routes
- Optional HMAC over `timestamp.METHOD.route.sha256(body)`
- 5-minute timestamp skew window
- Capability-gated admin settings
- Secrets never logged
- Publish can be forced to draft via `allow_publish`

## Why posts look like the site

Content is a normal WordPress post. Presentation is 100% theme / builder CSS. The plugin does not inject a custom front-end skin.

## Local development

```bash
# optional Composer (PHPCS / PHPStan / PHPUnit)
composer install

# zip for manual install
# zip -r leadrankpilot-plugin.zip leadrankpilot-plugin -x '*/vendor/*' '*/.git/*'
```

Install folder into `wp-content/plugins/leadrankpilot-plugin` and activate.
