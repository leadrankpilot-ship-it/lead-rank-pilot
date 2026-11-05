# LeadRankPilot WordPress Plugin

Professional connector plugin: install on any WordPress site, connect with a site token, and let LeadRankPilot publish articles remotely.

## Install

1. Copy `leadrankpilot-plugin` into `wp-content/plugins/`
2. Activate **LeadRankPilot**
3. Go to **Settings → LeadRankPilot**
4. Copy **Site token** into the LeadRankPilot dashboard

## What it does

- Exposes `GET /wp-json/leadrankpilot/v1/health`
- Exposes authenticated `POST /wp-json/leadrankpilot/v1/posts`
- Idempotent upserts (no duplicate posts on retry)
- Optional HMAC request signing
- Best-effort Yoast / Rank Math meta fields

## What it does not do

- Does not run AI on WordPress
- Does not replace your theme design
- Does not require opening the WP post editor

See [ARCHITECTURE.md](./ARCHITECTURE.md).
