# LeadRankPilot

Business lead finder + AI blog automation.

**Stack:** Next.js (frontend) · FastAPI / Python (backend) · existing Playwright Google Maps scraper (wrapped, not rewritten)

## Project layout

```
frontend/              Next.js App Router UI
backend/               FastAPI API + scraper service
leadrankpilot-plugin/  WordPress connector plugin
docs/                  Ops + publish contract notes
```

## Run locally

### 1. Backend (port 8000)

Use **Python 3.12** (not 3.14 — FastAPI/Pydantic are not stable on 3.14 yet).

```bash
cd backend
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
# set DATABASE_URL to your Neon Postgres URL (postgresql+psycopg://...)
.venv\Scripts\python.exe -m alembic upgrade head
.venv\Scripts\python.exe -m playwright install chromium
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs  
Health: http://localhost:8000/api/health

Database: **PostgreSQL (Neon)** only. Schema via Alembic (`alembic upgrade head`).

### 2. Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:3000

Copy `frontend/.env.local.example` → `frontend/.env.local` if needed (`NEXT_PUBLIC_API_URL=http://localhost:8000`).

### Auth / foundation API

- `GET/POST /api/websites` · analyze-profile · confirm profile
- `GET/POST /api/blogs/*` · generate/edit/approve/publish · export.md|html · quota (plan-based)
- `GET/POST /api/connections` · wordpress | custom | export · test/revoke
- `GET/POST /api/billing/*` · plans · subscription · checkout · mock-activate · webhook
- `POST /api/reference/custom-publish` · local custom-contract test receiver
- Lead search/qualify/audit endpoints from earlier phases

Frontend: `/`, `/pricing`, `/billing`, `/login`, `/register`, `/dashboard`, `/leads`, `/audits`, `/blogs`

Docs: `docs/custom-publish-contract.md` · `docs/ops-launch.md`

Set `OPENAI_API_KEY` + `BLOG_GENERATION_MODE=live` for real AI.  
Set `WORDPRESS_MODE=live` for real WP REST publishing (default mock).  
Set `BILLING_MODE=live` + Stripe price IDs for real checkout (default mock).
