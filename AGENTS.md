<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Product overview

Finsyt is an AI-powered financial intelligence platform (Next.js 15 App Router, React 19, Tailwind CSS 4). It aggregates financial data from multiple external APIs using a waterfall/fallback pattern and provides AI research via Groq/Anthropic.

### Running the app

- **Dev server:** `npm run dev` (port 3000)
- **Lint:** `npx eslint .` — existing `@typescript-eslint/no-explicit-any` errors are pre-existing in the codebase
- **Build:** `npm run build`
- The `.npmrc` sets `legacy-peer-deps=true`; always use `npm install --legacy-peer-deps`

### Architecture notes

- The root `/workspace` project is the active one. `/workspace/finsyt-platform/` is an older parallel copy — avoid modifying it.
- No database is required; the workspace ingestion store is an in-memory `Map`.
- All financial data comes from external REST APIs (FMP, EODHD, Finnhub, FRED, etc.) configured via env vars. The app runs without API keys but financial data endpoints return empty results.
- AI features (research chat, workspace chat) require `GROQ_API_KEY` and/or `ANTHROPIC_API_KEY`.
- `next.config.ts` has `eslint.ignoreDuringBuilds: true` and `typescript.ignoreBuildErrors: true`, so builds succeed even with lint/type errors.
