# Content Studio

Internal, single-user content-operations tool. See `docs/` for the full spec — start with `docs/CLAUDE.md`.

## Setup

```bash
cp .env.example .env   # then fill in the keys you have
```

### Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

SQLite DB and uploads live under `backend/storage/` (gitignored). Tables are created automatically on startup.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on http://localhost:5173, talks to the backend at http://localhost:8000.

## What's built

- **Discovery** — RSS scraping (live, no auth needed) + X/Instagram source adapters (need API keys/credentials, degrade gracefully without them) → Gemini topic generation.
- **Articles** — full draft → humanize → SEO pipeline via Gemini.
- **Posts / Carousel Studio** — 3 templates (darkened background, transparency overlay, background-removed via `rembg`), fabric.js editor, live Instagram-preview mockup, Cloudinary upload + Instagram Graph API publish (needs credentials).
- **Dashboard** — Instagram/Twitter metric snapshots, KPI summary, Twitter post suggestions.
- **Video pipeline** — intentionally not built (out of scope per current instructions; placeholder screen only).

## Needs your input before these work end-to-end

Fill in `.env` for the pipeline(s) you want to actually run:
- `GEMINI_API_KEY` — required for all topic/article/opinion generation
- `X_BEARER_TOKEN` (+ OAuth1 keys for posting) — Discovery's Twitter source, Dashboard Twitter stats/posting
- `IG_BUSINESS_ACCOUNT_ID` / `IG_ACCESS_TOKEN` — Dashboard IG stats, Posts publishing
- `CLOUDINARY_URL` — required before Posts can publish to Instagram (IG needs a public image URL)
- Instagram scraping (match-day opinion suggestions' IG source, general Discovery IG source) is **not implemented** — see `backend/app/services/scraping/instagram.py` docstring
# studiodecontent
