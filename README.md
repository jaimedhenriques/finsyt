# finsyt

Finsyt is an AI-powered financial intelligence platform.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Then open http://localhost:3000.

## API endpoints

- `GET /api/v1/status`
- `POST /api/v1/research`

## Environment

Copy `.env.example` to `.env` and fill provider keys.

### Supabase + Vercel database wiring

- If you connected Supabase Postgres through Vercel integration, Vercel usually injects:
  - `POSTGRES_PRISMA_URL` (pooled; best for runtime)
  - `POSTGRES_URL_NON_POOLING` (direct; best for Prisma migrations)
- This repo auto-detects those keys and maps them to Prisma runtime/config.
- If you prefer explicit keys, set:
  - `DATABASE_URL` (pooled runtime URL)
  - `DIRECT_URL` (non-pooled migration URL)

### Provider priority hard rule

- FMP is the primary data source for market/fundamental retrieval.
- Databento, Finnhub, FRED, and Alpha Vantage are fallback or complementary sources.
- Do not commit real API secrets to git; set them in Vercel project environment variables.

## Collaboration

See `COLLABORATION_BRIEF.md` for Cursor + Claude execution protocol.

## Health check

- `GET /api/v1/status` now reports:
  - overall status
  - provider health
  - database health (`healthy`, `degraded`, or `unconfigured`) and active env source key
