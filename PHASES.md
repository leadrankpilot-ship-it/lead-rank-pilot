# LeadRankPilot — Implementation Phases

Status legend: `pending` → `in_progress` → `done`

Work **one phase at a time**. Do not start the next phase until the current completion gate is met.

## Locked decisions

| Topic | Decision |
|-------|----------|
| Frontend | Next.js (App Router) |
| Backend | Python + FastAPI |
| Workers (later) | Redis + Celery/RQ |
| Database | PostgreSQL (Neon) — SQLite disabled |
| Existing scraper | Extend / wrap — do not rewrite by default |
| Site profile | Hybrid — light public crawl + client confirmation/extra fields |
| Publishing | WordPress REST API first; custom site connector + export fallback |

| Phase | Name | Status | Completion gate |
|-------|------|--------|-----------------|
| 0 | Codebase and source review | done | Team approves integration plan and source-access policy |
| 1 | Foundation | done | Tenant isolation and basic job lifecycle tested |
| 2 | Existing scraper integration | done | Known test cases return consistent, traceable results |
| 3 | Website verification / audit | done | Correct status classification and safe crawl limits demonstrated |
| 4 | Lead qualification | done | Data quality and duplicate cases reviewed |
| 5 | Website onboarding + AI drafts | done | Factuality checks, quota checks and failure/retry tests pass |
| 6 | WordPress connector | done | Test site draft/publish flow passes without duplicate posts |
| 7 | Custom-site connector framework | done | One custom integration test passes; unsupported sites fail clearly |
| 8 | Subscription and launch | done | Cost margins and usage caps validated before public paid launch |

---

## Phase details

### Phase 0 — Codebase and source review
- Review existing scraper, current stack, source terms, output fields, deployment and security gaps
- **Gate:** Team approves integration plan and source-access policy

### Phase 1 — Foundation
- User/site data model, auth/authorization, job status model, logging, secret handling, configuration
- **Gate:** Tenant isolation and basic job lifecycle tested

### Phase 2 — Existing scraper integration
- Wrap current scraper, normalize results, missing-website labeling, deduplication, results UI and CSV export
- **Gate:** Known test cases return consistent, traceable results

### Phase 3 — Website verification / audit
- Status checker, basic SEO/mobile/performance checks, bounded broken-link checks, saved searches and re-checks
- **Gate:** Correct status classification and safe crawl limits demonstrated

### Phase 4 — Lead qualification
- Category/location filters, public contact discovery, rule-based scoring with reasons, exports
- **Gate:** Data quality and duplicate cases reviewed

### Phase 5 — Website onboarding + AI drafts
- Site crawl/profile, user confirmation, OpenAI generation, topic history, editor and draft states
- **Gate:** Factuality checks, quota checks and failure/retry tests pass

### Phase 6 — WordPress connector
- Secure connection test, draft creation, opt-in publishing, result tracking and idempotency
- **Gate:** Test site draft/publish flow passes without duplicate posts

### Phase 7 — Custom-site connector framework ✅
- Connector interface, documented API contract, one reference plugin/endpoint if selected, export fallback
- **Gate:** One custom integration test passes; unsupported sites fail clearly — **PASSED** (`custom-connector-gate-ok`)

### Phase 8 — Subscription and launch ✅
- Plan configuration, usage ledger, billing integration, landing pages, monitoring, backups and support process
- **Gate:** Cost margins and usage caps validated before public paid launch — **PASSED** (`subscription-gate-ok`)

---

## Progress log

| Date | Phase | Note |
|------|-------|------|
| 2026-10-27 | — | Phases saved from technical specification. Stack decision pending. |
| 2026-10-27 | 0 | Stack locked: Next.js + FastAPI. Hybrid site profile. Phase 0 closed. |
| 2026-10-27 | 1 | Scaffold Next.js frontend + FastAPI backend; wrap existing scraper (no Streamlit UI). |
| 2026-10-27 | 1 | Frontend/backend folders live; `/api/health` works; Streamlit moved to `legacy/`. Auth/DB still pending. |
| 2026-10-27 | 1 | Auth JWT, User/Website/Job models (SQLite), secret helpers, logging, tenant-scoped APIs + dashboard. Smoke gate passed. |
| 2026-10-27 | 1 | Switched to Neon PostgreSQL + Alembic; SQLite removed. |
| 2026-10-28 | 2 | Scraper adapter + SearchRun/Lead, background scrape, /leads UI, CSV export. Normalize/dedupe gate passed. |
| 2026-10-28 | 3 | Status/audit services + SSRF limits, AuditReport/SavedSearch, /audits UI. Gate passed. |
| 2026-10-28 | 4 | Lead scoring, contact discovery, filters/duplicates/export. Qualify gate passed. |
| 2026-10-28 | 5 | Site profile crawl/confirm, blog drafts + quota/topic ledger, /blogs UI. Gate passed. |
| 2026-10-28 | 6 | WordPress connections (encrypted), draft/publish + idempotency. Gate passed. |
| 2026-10-28 | 7 | Connector registry (wordpress/custom/export), reference endpoint, .md/.html export. Gate passed. |
| 2026-10-28 | 8 | Plans free/starter/pro, mock Stripe billing, landing/pricing, ops checklist. Gate passed. |
