# Objective
Run an in-depth production-scope security scan across the Finsyt monorepo and confirm whether public, authenticated, and admin surfaces preserve tenant isolation, auth boundaries, and cost controls.

# Relevant information
- Production services:
  - `artifacts/platform` — Next.js 15 platform and many server-side API routes.
  - `artifacts/api-server` — Express 5 API server.
  - `artifacts/marketing` — public marketing site.
  - `lib/db` — Drizzle/Postgres schema and RLS enforcement.
- Production assumptions:
  - `NODE_ENV=production` in deployment.
  - Replit TLS is present.
  - `artifacts/mockup-sandbox` is dev-only and should be ignored unless production reachability is proven.
- High-risk boundaries:
  - Public caller → Next.js API routes (`artifacts/platform/app/api/**`).
  - Next.js platform → Express API server via signed actor headers (`artifacts/platform/lib/audit-client.ts`, `artifacts/api-server/src/lib/actor.ts`).
  - Request handlers → Postgres via `withOrgContext` / `withClerkContext` + RLS.
- Early recon findings to verify:
  - Several Next.js API routes have no explicit auth.
  - Workspace ingest/chat/studio routes use privileged storage and LLM/provider calls.
  - MCP route is currently intentionally open in code comments.
  - Admin/account proxy routes claim to refuse production traffic unless real auth is wired.

# Tasks

### T001: Public AI / workspace surfaces
- **Blocked By**: []
- **Details**:
  - Analyze `artifacts/platform/app/api/workspaces/**`, `artifacts/platform/app/api/agent/ask/route.ts`, and nearby source storage code for SSRF, unauthenticated access, cross-tenant reads, and cost-abuse issues.
  - Validate whether client-generated `sourceId` values can expose or overwrite another user's content.
  - Acceptance: confirm or rule out auth, tenant-isolation, and SSRF/cost vulnerabilities with exact code references.

### T002: Public API / developer surfaces
- **Blocked By**: []
- **Details**:
  - Analyze public-facing Next.js routes such as `artifacts/platform/app/api/mcp/route.ts`, provider proxies, and any unauthenticated LLM-backed or secret-backed endpoints for abuse, data exposure, and missing auth.
  - Focus on real production impact, not merely "route is public".
  - Acceptance: identify externally reachable routes that expose privileged capability, secrets, or costly backend resources.

### T003: Internal auth proxy + admin/account flows
- **Blocked By**: []
- **Details**:
  - Review `artifacts/platform/lib/audit-client.ts`, platform admin/account proxy routes, and `artifacts/api-server/src/lib/actor.ts` plus relevant Express routes.
  - Verify whether production guards are sufficient and whether spoofing or privilege-escalation paths remain.
  - Acceptance: confirm whether owner/admin-only flows can be reached or abused in production.

### T004: Tenant isolation and authenticated data surfaces
- **Blocked By**: []
- **Details**:
  - Review `artifacts/platform/app/api/notes/**`, `artifacts/platform/app/api/screener/**`, `artifacts/api-server/src/routes/research.ts`, `lib/db/src/index.ts`, and `lib/db/src/rls.sql`.
  - Check for IDOR, broken RLS usage, missing org resolution checks, or other cross-tenant leakage paths.
  - Acceptance: determine whether tenant-scoped reads/writes are consistently enforced.

### T005: Express public/authenticated route review
- **Blocked By**: []
- **Details**:
  - Review `artifacts/api-server/src/routes/{leads,me,team,audit,retention,account}.ts` and supporting middleware for CSRF, authz, brute-force, and input-validation issues.
  - Prioritize routes with state changes or data export/delete behavior.
  - Acceptance: identify any exploitable server-side authn/authz or request-validation flaws not already covered above.
