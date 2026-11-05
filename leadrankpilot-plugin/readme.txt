=== LeadRankPilot ===
Contributors: leadrankpilot
Tags: seo, blogging, publishing, rest-api, automation
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Securely connect WordPress to LeadRankPilot for remote AI blog publishing. Keywords and schedules stay in the LeadRankPilot dashboard.

== Description ==

LeadRankPilot is a thin connector plugin:

* Generates a site token + signing secret
* Exposes authenticated REST endpoints for health, connect, and post upsert
* Creates standard WordPress posts so your theme controls the look
* Supports idempotent publishing to avoid duplicates
* Best-effort SEO meta for Yoast / Rank Math

It does not run AI on your WordPress host. Generation happens in LeadRankPilot cloud.

== Installation ==

1. Upload the `leadrankpilot-plugin` folder to `/wp-content/plugins/`
2. Activate the plugin through the Plugins menu
3. Open Settings → LeadRankPilot
4. Copy the site token into your LeadRankPilot dashboard connection screen

== Frequently Asked Questions ==

= Do I need to open the WordPress editor? =

No. LeadRankPilot publishes through the plugin REST API.

= Will posts match my site design? =

Yes. Posts use normal WordPress content. Your theme / templates style them.

== Changelog ==

= 0.1.0 =
* Initial connector: health, connect, authenticated post upsert, admin settings, idempotency
