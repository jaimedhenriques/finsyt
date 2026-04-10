# finsyt

Finsyt is an AI-powered financial intelligence platform.

## Quick start

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## API endpoints

- `GET /api/v1/status`
- `POST /api/v1/research`

## Environment

Copy `.env.example` to `.env` and fill provider keys.

### Supabase Postgres (connected via Vercel)

For the `supabase-violet-battery` database, ensure these are set in Vercel project env vars:

- `DATABASE_URL` (pooled connection string from Supabase integration)
- `DIRECT_URL` (direct connection string for migrations, if provided)
- `SUPABASE_PROJECT_ID` (for reference/tracing; e.g. `xgdygzkddknvaliokxfk`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Local migration workflow:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

The API health endpoint now includes database connectivity:

- `GET /api/v1/status` -> includes `database.status` as `healthy | unconfigured | unhealthy`

### Provider priority hard rule

- FMP is the primary data source for market/fundamental retrieval.
- Databento, Finnhub, FRED, and Alpha Vantage are fallback or complementary sources.
- Do not commit real API secrets to git; set them in Vercel project environment variables.

## Collaboration

See `COLLABORATION_BRIEF.md` for Cursor + Claude execution protocol.
