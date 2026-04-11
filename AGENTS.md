<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Repository structure

This is a monorepo with **two independent Next.js apps**:

| App | Path | Next.js | Port | Notes |
|-----|------|---------|------|-------|
| **finsyt-platform** (main) | `/workspace/finsyt-platform` | 15.2.4 | 3000 | Primary app with full feature set |
| Root app | `/workspace` | 16.2.3 (Turbopack) | 3001 | Earlier/simpler version |

Each app has its own `package.json` and `node_modules`. Dependencies use **npm** (`package-lock.json` present).

### Running services

- **finsyt-platform**: `cd /workspace/finsyt-platform && npm run dev` (default port 3000)
- **Root app**: `cd /workspace && npm run dev -- --port 3001` (use `--port 3001` to avoid conflict)
- No database, Docker, or external services are required to start the dev servers.
- The apps use external financial data APIs (EODHD, FMP, Finnhub, Alpha Vantage). Without API keys, the UI still renders but data panels show errors/empty states.

### Lint / Build / Test

- **Lint**: `npm run lint` (runs `eslint`) — both apps have pre-existing lint errors; these are in the source, not the environment.
- **Build**: `npm run build` — finsyt-platform builds cleanly; root app has a pre-existing TypeScript error in `app/app/research/page.tsx`.
- **No test suite** exists in either app (no test scripts or test framework configured).

### Gotchas

- The root app's `package.json` `name` field is also `"finsyt-platform"` (same as the sub-app), which can be confusing. They are separate apps with separate dependencies.
- The root app redirects `/` to `/app` via a 307 redirect; the finsyt-platform does the same.
- When running both apps simultaneously, assign different ports (e.g., 3000 and 3001).
