# Threat Model

## Project Overview

Finsyt is a pnpm workspace monorepo for a financial intelligence product. The production-relevant services are a public marketing site (`artifacts/marketing`), an authenticated Next.js 15 platform (`artifacts/platform`), and an Express 5 API server (`artifacts/api-server`) backed by PostgreSQL/Drizzle (`lib/db`). Clerk is the primary user authentication system. The platform also exposes many server-side Next.js API routes that proxy market-data providers, LLM services, and internal admin functionality.

Production assumptions for this scan:
- `NODE_ENV=production` in deployed environments.
- Replit-managed TLS protects client↔server traffic.
- `artifacts/mockup-sandbox` is dev-only and not deployed to production.

## Assets

- **User accounts and sessions** — Clerk-authenticated user identities, organization context, and role claims. Compromise would allow tenant impersonation and access to research, team, and admin functions.
- **Tenant-scoped business data** — research notes, chat/workspace artifacts, screener presets, audit history, retention settings, and account export/delete requests. Cross-tenant exposure would break core customer isolation guarantees.
- **Application secrets and provider credentials** — database credentials, `INTERNAL_AUTH_SECRET`, Clerk secrets, and third-party data/LLM/API keys (Anthropic, OpenAI integration, FMP, EODHD, Finnhub, SEC API, 21st relay, etc.). Leakage or abuse can enable impersonation, SSRF amplification, or direct financial cost.
- **Admin / compliance data** — audit exports, retention purges, DSAR/account export and deletion flows. These are high-impact because they affect full-tenant records and compliance evidence.
- **LLM and provider spend** — publicly reachable server-side routes can trigger paid model invocations, relay-token issuance, or third-party API usage. Abuse here is an integrity and availability concern even without data theft.

## Trust Boundaries

- **Browser ↔ Next.js platform/API routes** — all client input is untrusted. Many `/platform/api/*` routes are publicly reachable unless they explicitly enforce auth server-side.
- **Browser ↔ Express API server** — the API server is a directly listening HTTP service, not a private in-process module. It must not trust caller-controlled identity headers unless they are verified in-process; do not assume an upstream gateway strips spoofed headers.
- **Next.js platform ↔ Express API server** — internal admin/account routes rely on signed identity headers (`INTERNAL_AUTH_SECRET`) when proxying to `artifacts/api-server`.
- **Application ↔ PostgreSQL** — tenant isolation depends on `withOrgContext` / `withClerkContext` correctly setting Postgres session state used by RLS policies.
- **Application ↔ third-party providers** — the platform fetches data from many external financial/LLM services. User-controlled parameters crossing this boundary can create SSRF, cost-abuse, or data-leak risk.
- **Public ↔ Authenticated ↔ Admin surfaces** — the repo mixes public marketing endpoints, authenticated workspace/team/notes surfaces, and highly sensitive admin/audit/retention flows. Those boundaries must be enforced server-side, not only in UI.

## Scan Anchors

- **Production entry points:** `artifacts/platform/app/api/**`, `artifacts/platform/middleware.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/**`, `lib/db/src/index.ts`, `lib/db/src/rls.sql`, `artifacts/marketing/src/**`.
- **Highest-risk code areas:** unauthenticated Next.js API routes that call LLMs, token relays, or external services; workspace ingest/chat/studio/source routes; admin proxy routes using `artifacts/platform/lib/audit-client.ts`; Express auth/actor middlewares; tenant-scoped DB wrappers and RLS.
- **Public surfaces:** marketing site, `POST /api/leads`, legacy `/api/mcp`, helper routes such as `/api/an-token`, any Next.js API route omitted from explicit auth checks (including renamed aliases like `/api/finsyt-agent/ask` and paid-provider helpers such as `/api/macro` and `/api/transcripts`), and any other Next.js API route without explicit auth. `/api/v1/**` is the intended public API surface and should require API-key auth.
- **Authenticated/admin surfaces:** Clerk-protected `/app/*` pages, notes/team/screener-presets routes, admin providers page, API-server audit/retention/account/team/research routes.
- **Dev-only / usually ignore:** `artifacts/mockup-sandbox`, `.agents/**`, `artifacts/platform/.agents/**`, docs, smoke scripts, local-only setup helpers, and any code path explicitly guarded out of production by `NODE_ENV` checks unless a production bypass exists.

## Threat Categories

### Spoofing

Authentication and tenant identity are split across Clerk session validation and a signed internal-header scheme for some platform→api-server calls. Production code must only trust identities derived from verified Clerk sessions or valid HMAC-signed internal headers. Any public route that accepts caller-controlled identity, or any misconfiguration that weakens `INTERNAL_AUTH_SECRET` protections, could let an attacker impersonate another tenant or an owner.

### Tampering

Users can submit leads, workspace documents, URLs, notes, team changes, and admin/account actions. The system must validate input shape and enforce state-changing operations server-side. Client-generated identifiers, role changes, or document source references must not let attackers overwrite another tenant’s data or inject untrusted content into privileged downstream operations.

### Information Disclosure

The platform handles tenant-scoped research data, audit trails, team metadata, and provider-backed responses. All reads must be scoped to the authenticated user/org or intentionally public product data. Error messages, logs, LLM prompts/results, and API responses must never expose secrets, private tenant content, or privileged provider responses to unauthorized callers.

### Denial of Service

This project exposes public endpoints that can trigger expensive operations: LLM generations, relay-token issuance, third-party API calls, PDF parsing, and server-side URL fetches. Production guarantees must include rate limiting, bounded request sizes, bounded fetch behavior, and authentication where necessary so attackers cannot turn public routes into cost-amplification or resource-exhaustion vectors.

### Elevation of Privilege

Tenant isolation relies on Postgres RLS plus request-scoped context setters, while admin operations depend on organization roles and owner-only actor context. Sensitive routes must enforce authorization before performing exports, deletions, invitation changes, or cross-tenant reads. Any route that uses privileged storage credentials, bypasses RLS, trusts predictable object IDs, or exposes internal tooling without auth can become a privilege-escalation path.
