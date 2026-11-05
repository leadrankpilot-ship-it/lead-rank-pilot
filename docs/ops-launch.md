# LeadRankPilot — ops & launch checklist

## Monitoring

- Health: `GET /api/health` — expects `status=ok`, `database=up`, mode flags for billing/blog/wordpress.
- App logs: set `LOG_LEVEL=INFO` (or `WARNING` in production). Follow uvicorn stdout / host aggregator.
- Neon dashboard: connection count, storage, query insights.

## Backups

- Neon continuous PITR / automatic backups — confirm project has restore point retention meeting your SLA.
- Before paid launch: document restore drill (create branch from timestamp, verify `alembic current`, smoke `/api/health` + login).
- Secrets stay in env / secret manager — never in git. Rotate `JWT_SECRET`, `ENCRYPTION_KEY`, Stripe keys on schedule.

## Support process

1. Intake: email or form → triage severity (billing / data-loss / scrape outage / content quality).
2. Billing: verify `users.plan_id` + `billing_status`; Stripe Dashboard for live invoices; mock mode uses `/api/billing/mock-activate` only in non-prod.
3. Quotas: daily blog caps from plan catalog (`app/services/plans.py`); ledger in `usage_ledger`.
4. Escalation: on-call owner + Neon/OpenAI/Stripe status pages.

## Launch gates

- [ ] `python scripts/test_subscription_gate.py` → `subscription-gate-ok`
- [ ] Paid plan margins ≥ `MIN_PAID_PLAN_MARGIN_USD` and ratio ≥ `MIN_PAID_PLAN_MARGIN_RATIO`
- [ ] `BILLING_MODE=live` only with Stripe price IDs + webhook secret configured
- [ ] `BLOG_GENERATION_MODE` / `WORDPRESS_MODE` set intentionally for production
- [ ] CORS / `FRONTEND_BASE_URL` match production origins
