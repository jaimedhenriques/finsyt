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

Client support widget (AssistLoop):

- Set `NEXT_PUBLIC_ASSISTLOOP_AGENT_ID` in Vercel (already configured in production).
- The widget autoloads globally when this env var is present.

### Provider priority hard rule

- FMP is the primary data source for market/fundamental retrieval.
- Databento, Finnhub, FRED, and Alpha Vantage are fallback or complementary sources.
- Do not commit real API secrets to git; set them in Vercel project environment variables.

## Collaboration

See `COLLABORATION_BRIEF.md` for Cursor + Claude execution protocol.
