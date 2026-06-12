# Finsyt

## Overview

Finsyt is an institutional investor intelligence platform, offering a suite of tools for financial analysis and research. It's built as a pnpm workspace monorepo using TypeScript, designed for scalability and maintainability. The platform aims to provide comprehensive financial data, AI-powered insights, and workflow management for investors. Key capabilities include company analysis, AI-driven research agents, persistent workspaces, and AI-extracted document analysis.

The project's vision is to become a leading platform in the financial technology sector, leveraging advanced AI and data aggregation to deliver unparalleled insights to institutional investors. It integrates various financial data APIs and internal services to provide a rich user experience, focusing on enhancing research efficiency and decision-making for its users.

## User Preferences

- I prefer a structured and organized approach to development.
- I appreciate detailed explanations for complex features or architectural decisions.
- I expect clear communication regarding changes and their impact.
- Do not make changes to the `DEMO_USER_PASSWORD` Replit secret without prior discussion.

## System Architecture

The Finsyt platform is built as a pnpm workspace monorepo, facilitating modular development and shared dependencies.

**Technical Stack:**
- **Monorepo:** pnpm workspaces
- **Language:** TypeScript 5.9
- **Runtime:** Node.js 24
- **Package Manager:** pnpm
- **API Framework:** Express 5
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API Codegen:** Orval (from OpenAPI spec)
- **Build Tool:** esbuild (CJS bundle)

**UI/UX Decisions:**
- **`artifacts/platform` (Finsyt Data Platform):** A Next.js 15 + React 19 application served at `/platform/`. It features company pages, AI workflow agents, persistent workspaces, and a document matrix for AI-extracted analysis. The UI incorporates financial data APIs (FMP, Finnhub, Groq, Perplexity) when configured. A temporary `PLATFORM_OPEN_MODE` allows auth bypass for demos, displaying a persistent "Demo mode" banner.
- **`artifacts/marketing` (Finsyt Marketing Site):** A React + Vite + Tailwind + Framer Motion site for marketing purposes, handling lead generation via a `POST /api/leads` endpoint.

**Feature Specifications:**
- **Finsyt Research Agent (Phase 2):** An AI research agent (`POST /platform/api/agent/ask`) utilizing Server-Sent Events (SSE) for streaming responses. It supports configurable models (default `gpt-5-mini`) and OpenAI function calling with parallel tool calls. Tools include `get_quote`, `get_news`, `get_filings`, `get_financials`, `get_estimates`, `get_transcripts`, and `get_macro`, each with public data fallbacks.
- **Data Provider Wiring:** Implements a robust data provider hierarchy for various financial domains (Quotes, Bars, Financials, News, Insider, M&A Deals). FMP is the primary upstream for quotes, financials, news and `/api/deals` (M&A latest + search). All provider routes return a `source` attribution field (`fmp`, `finnhub`, `synthetic`, `none`, etc.) which the platform UI surfaces in headers and KPIs (e.g. Deals page header reads "source: Financial Modeling Prep"). It uses Replit Postgres as the primary database. An admin interface (`/app/admin/providers`) offers observability into provider health and enables re-probing.
- **Tenant-scoped Alerts & Workspaces:** `lib/db/src/schema/alerts.ts` and `lib/db/src/schema/workspaces.ts` persist user-created price alerts and research workspaces, both keyed by `org_id` (UUID FK to `organizations`) and gated by row-level security via the standard `withOrgContext`/`resolveLocalOrgId` helpers. CRUD is exposed at `/api/alerts` and `/api/workspaces` (GET/POST/PATCH/DELETE). The `/app/alerts` and `/app/workspaces` pages hydrate from these endpoints; demo data is no longer hard-coded in the React components. Demo bootstrap (`ensureDemoData()`) is gated to `OPEN_MODE && process.env.NODE_ENV !== 'production'` so production tenants always start clean.
- **U.S. Census Bureau Provider:** Integrates first-class support for U.S. demographics, geographies, and business dynamics data. It includes internal (`/api/census/*`), public (`/api/v1/census/*`), and MCP tool endpoints.
- **FinceptTerminal-inspired Functionality:** Integrates World Bank Open Data, investor persona AI agents, portfolio risk analytics (Sharpe, Sortino, Calmar, VaR, CVaR, beta, alpha, R², correlation), and a multi-stage DCF model.
- **Census Surfacing in Platform UI:** Census data is integrated into the Macro workspace, Company workspace (HQ Context), and Screener workspace for enhanced demographic and geographical filtering.
- **Demo Login:** Provides a pre-seeded demo workspace with a one-click sign-in option for preview environments. The demo user (`demo@finsyt.com`) is provisioned with an organization, agents, inbox runs, and research notes.
- **Football Field Valuations:** A banker-style "Football Field" valuations surface that overlays multiple valuation methodologies on a shared price axis. Available at `/app/valuations` (ticker picker), `/app/valuations/[symbol]` (chart page), and as a `Valuations` tab on `/app/company/[symbol]`. The chart shows side-by-side valuation ranges (52W stock price, Peer Comps via IQR of peer multiples × subject per-share metric, Transaction Comps placeholder, DCF range from `/api/dcf?sensitivity=true`) with Current Price (green) and Weighted Valuation (dashed) overlay lines. Reusable `FootballFieldChart`, `useValuationBands` hook, and `ValuationsView` composer live under `components/valuations/`.
- **Peers Workspace (T198):** Workspace-scoped peer baskets stored in `peer_sets` + `peer_set_members` (RLS-isolated by Clerk org). Surfaces:
    - `/app/peers` global workspace and per-company `/app/company/[symbol]/peers` page with the institutional Selected Peers table (replaces the old `PeerCompareModal`).
    - `POST /api/peers/seed` provisions six starter baskets (Mega-Cap Tech, AI Semiconductors, EV & Auto OEMs, US Money-Center Banks, Streaming & Ad-tech, Energy Supermajors).
    - `GET /api/peers/compare?symbols=…` aggregator that returns real quote/financial cells plus three synth NTM/forward/exercisable demo cells (`forwardPe`, `evEbitdaNtm`, `optionsItmPct`) tagged `demo:true` in `metricsMeta`.
    - Copilot integration: 5 tools on `/api/agent/ask` (`list_peer_sets`, `get_peer_set`, `compare_peers`, `create_peer_set`, `modify_peer_set`); write tools never auto-mutate — they emit a `confirm_required` SSE event with an action descriptor that the AppShell renders as an inline approval card before POSTing.
    - Topbar `/peers` slash command and "Compare my peers on…" Ask-AI quick action.

**System Design Choices:**
- **Monorepo Structure:** Uses pnpm workspaces for managing multiple packages (`platform`, `marketing`, `api-server`, `tests`, `scripts`, `api-spec`, `db`).
- **Validation Gates:** Employs `typecheck`, `build`, `lint`, and `e2e-signin` validations to ensure code quality and prevent regressions.
- **Environment Configuration:** Leverages environment variables for API keys and operational settings (e.g., `AGENT_MODEL`, `OPS_ALERT_WEBHOOK_URL`).
- **Credential Health:** `lib/credential-health.ts` monitors upstream API key rejections and triggers alerts via webhooks for operational awareness.
- **Playwright End-to-End Tests:** `tests/` workspace contains Playwright smoke tests for critical user flows, such as sign-in.

## Connector Hub

The platform includes a Connector Hub (`/platform/app/connectors`) that lets
admins wire any REST API or MCP server into the workspace from a curated
catalog (~50 entries) or via custom REST/MCP endpoints. Connections are
exposed:

- as OpenAI tools to the chat agent (`/api/agent/ask`, alias
  `/api/finsyt-agent/ask`) — see `lib/connectors/agent-tools.ts`
- as MCP tools at `/api/mcp` (named `conn__<slug>__<op>`)
- as a public REST surface at `/api/v1/connectors/[slug]/[operation]`
- as a read-only inventory in the scheduled workflow agent
  (`lib/agent-executor.ts`) so generated briefs can cite available
  connector data

The hub honours a `?source=<slug>` deep-link query string emitted by the
marketing Solutions page's "Coming from FactSet/CapIQ/Refinitiv/Bloomberg/PitchBook?"
cards: when the slug matches a non-first-party catalog entry, the hub
auto-opens that entry's Connect modal, scrolls the matching tile into
view via `connector-tile-<slug>` ids, and clears the param from the URL.

Authorization is centralised in `lib/connectors/permissions.ts`
(`requireConnectorActor` / `requireConnectorAdmin` — admin / owner only for
mutations and OAuth). Credentials are envelope-encrypted with AES-256-GCM
under a master key from `CONNECTOR_ENCRYPTION_KEY` (or the Clerk secret as
fallback). OAuth state cookies are HMAC-signed via `signSerialized` /
`verifySerialized` in `lib/connectors/crypto.ts`. The chat assistant has
been renamed end-to-end from "Copilot" to "Finsyt Agent".

### Data-room sync (Box / Dropbox / Datasite / Intralinks / SecureDocs)

Diligence workspaces can pick a folder from any connected data-room
provider and stream its files into the workspace via
`POST /api/workspaces/connectors/sync`. The flow:

- Per-provider adapters live in
  `artifacts/platform/lib/connectors/data-room/providers.ts` and expose
  `listFolder()` / `downloadFile()` using whatever credential bag the
  provider stored (Box/Dropbox use OAuth access tokens; SecureDocs uses
  `X-API-Key`; Datasite/Intralinks accept a partner-issued bearer token).
- The orchestrator
  (`artifacts/platform/lib/connectors/data-room/sync.ts`) walks the chosen
  folder (recursive, capped at 200 files / 50 folders), routes each file
  through the shared `ingestBufferAsSource` helper
  (`artifacts/platform/lib/workspaces/ingest-helper.ts`) and dedupes by
  sha256 hash within the same workspace + connector slug. Reruns of the
  same sync are no-ops.
- Routes:
  `GET /api/workspaces/connectors/connections` (data-room-eligible
  connections for the picker), `GET /api/workspaces/connectors/folders`
  (children for drill-down), `POST /api/workspaces/connectors/sync` (run a
  sync). Each call loads the connection under the user's org context and
  uses *that user's* OAuth token / API key for the upstream calls — no
  shared service account.
- UI: a "🔗 Sync from data room" button in the Add Source panel of
  diligence workspaces opens a connector → folder picker modal in
  `artifacts/platform/app/app/workspaces/_WorkspacesInner.tsx`, with both
  per-folder and recursive sync. New sources are tagged
  `origin=connector` + `connectorSlug=<slug>` and auto-selected so the
  chat surface can use them immediately.

### Alt-data scrapers (Apify Actors)

The catalog ships an `Alt Data & Scrapers` category whose first tile
(`apify-actors`) fronts the Apify actor marketplace. The connection
authenticates with a per-user Apify API token (Bearer), validated
against `GET /v2/users/me` on connect. Three actors are exposed as
operations on this single tile so the agent surface stays uncluttered:

- `capitol_trades` — `saswave~capitol-trades-scraper` (U.S. Congress
  stock disclosures; ticker / politician filters; 15m cache hint)
- `sec_filings_intelligence` —
  `benthepythondev~sec-edgar-filings-intelligence` (parsed 10-K / 10-Q /
  8-K / Form 4 highlights; ticker or CIK; 1h cache hint)
- `glassdoor_company` — `bitty-studio~glassdoor-reviews` (Glassdoor
  rating, reviews, pros/cons sentiment; companyName required; 1h cache
  hint)

Each actor call hits `POST /v2/acts/<actorId>/run-sync-get-dataset-items`
with `?timeout=20&memory=…&format=json` baked into the path so Apify
returns whatever rows it has produced before the executor's 25-second
wall fires. Cache TTLs are documentation-only for these POSTs (the
executor only caches GETs); long-running scrapes are tracked under the
follow-up background-jobs task. Each run is billed against the
connecting user's Apify account.

#### Surfacing on `/app/company/[symbol]` (Task #322)

The Company workspace consumes all three actors through
`components/company/AltDataTiles.tsx`:

- **Insider Activity tile** merges the existing FMP Form-4 feed with
  Capitol Trades disclosures into one chronological list. Each row gets
  a numbered citation chip that opens the page-level Drawer with the
  raw provider record body — same inline-marker pattern as Tasks #241
  / #291.
- **People & Culture tile** renders the Glassdoor headline rating, %
  recommend / CEO approval, median salary, and top pros / cons. The
  citation chip dumps a formatted snapshot into the Drawer.
- **Filings tab Signal column** issues one `sec_filings_intelligence`
  call per page load and maps results into the table by normalised
  accession number, rendering a 0–100 pill (green ≥ 70, amber ≥ 40,
  red < 40) with material-section tooltips. Per-row missing scores
  fall back to `—` so an Apify miss never blocks the rest of the row.

When the workspace has no active `apify-actors` connection, both tiles
collapse to a "Connect Apify Actors" CTA that deep-links into
`/app/connectors?source=apify-actors` (the connectors page reads the
`source` query param and auto-opens the connect modal).

The `Ask` agent gets a built-in `score_filing(symbol|cik|accession,
formType?)` tool that resolves the same `apify-actors` connection
through `withOrgContext` + `executeConnectionOperation`, normalises the
actor row into `{ score, attribution, materialSections }`, and is
recognised by the citation tracer (`lib/data-sources-trace.ts`) so the
"Sources used" panel attributes scored filings back to "SEC EDGAR
Filings Intelligence" with a Connector Hub deep link. When no
connection exists the tool returns a structured `connector_required`
payload with the same CTA.

The slide deck "Data sources used" slide (`lib/deck-service.ts`) also
gained `insider | people | signals` categories so generated decks list
Apify-backed sources alongside the FMP / SEC / Yahoo waterfall.

## Strategy

Strategic prioritisation for parity + leapfrog vs. AlphaSense, Hebbia, Rogo,
BlueFlame, Quartr, FactSet, and Capsa lives in
`artifacts/platform/docs/competitive-roadmap.md`. That doc is the umbrella
that sequences all in-flight platform tasks under seven themes (Workflow
Matrix, Blueprint Library, Live Events, IB/PE Vertical, Premium Data
Partnerships, Trust & Compliance, Cross-cutting Agent UX). Sub-features
already tracked as their own tasks fold into the relevant theme rather than
being duplicated.

## External Dependencies

- **Database:** PostgreSQL (via Replit's managed service)
- **ORM:** Drizzle ORM
- **Authentication:** Clerk (for user authentication and organization management)
- **Financial Data APIs:**
    - FMP (Financial Modeling Prep)
    - Finnhub
    - Groq
    - Perplexity
    - EODHD
    - Twelve Data
    - Marketstack
    - Alpha Vantage
    - Yahoo Finance
    - Financial Datasets
    - FinanceFlow
    - FRED (Federal Reserve Economic Data)
- **AI Integration:** OpenAI (via Replit OpenAI integration proxy)
- **Alerting/Monitoring:** Slack/Discord (via configurable webhooks for `OPS_ALERT_WEBHOOK_URL`)
- **Other APIs:**
    - U.S. Census Bureau API
    - World Bank Open Data API
- **Testing:** Playwright

## GitHub mirror

The workspace's `main` branch is automatically mirrored to https://github.com/jaimedhenriques/finsyt on every task merge.

- **Trigger:** `scripts/post-merge.sh` invokes `scripts/sync-to-github.sh` after the DB push step, so each successful task merge re-syncs the GitHub `main` branch.
- **Auth:** No PATs or tokens in URLs. `scripts/git-credential-replit-github.mjs` is registered as a Git credential helper and fetches a short-lived access token from the Replit GitHub connector at request time.
- **Push model:** Each run builds a fresh, parentless "mirror commit" — a snapshot of the current local `HEAD` tree with `.github/workflows/` excluded — and pushes it to `github/main` with `--force-with-lease`. The local repository, index, refs, and working tree are never modified.
- **Idempotency:** Before pushing, the script compares the candidate mirror tree to the current `github/main` tree. If they're identical, no push is made.
- **Safety:** The push uses `--force-with-lease=main:<observed remote sha>`. If anything pushed to the GitHub mirror between our fetch and our push, the lease fails and the script aborts instead of clobbering it.
- **Why a snapshot, not a 1:1 history mirror?** The Replit GitHub OAuth app does not include the `workflow` scope, so GitHub rejects any push that creates or modifies files under `.github/workflows/`. Stripping that one directory and pushing a single snapshot per sync works around this without requiring re-authorization. Full git history continues to live in the Replit workspace and its checkpoints.
- **To enable a 1:1 history mirror later:** re-authorize the GitHub connection with the `workflow` scope, then change `sync-to-github.sh` to push `HEAD` directly instead of synthesizing a snapshot commit.