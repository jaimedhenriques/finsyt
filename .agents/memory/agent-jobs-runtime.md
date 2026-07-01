---
name: Delegated agent-jobs runtime
description: How the async "Delegate to agent" job runtime is wired in artifacts/platform, and its non-obvious org-keying split.
---

# Delegated analyst agent-jobs runtime

A durable, org-scoped background job runtime for delegated analyst work lives under
`artifacts/platform/lib/agent-jobs/*` (store/runner/notify/types/recipients), the DB schema
`lib/db/src/schema/agent-jobs.ts`, API routes `app/api/agent-jobs/**`, client provider
`lib/agent-jobs.tsx`, and the inbox page `app/app/jobs/page.tsx`.

## Org-keying split (the trap)
- `agent_jobs` is **Clerk-org keyed** (text `org_id`, accessed via `withClerkContext`, GUC
  `app.current_clerk_org_id`) — same model as `agents` / `agent_runs`.
- `research_notes` is **UUID-org keyed** (`resolveLocalOrgId(clerkOrgId)` from `@/lib/org-resolver`,
  then `withOrgContext`). So the runner must translate the Clerk org id to the local UUID before
  writing a research-note deliverable. Mixing the two will silently violate RLS.

**Why:** the platform has two parallel tenancy schemes; new tenant tables can pick either, and the
runner straddles both because it both reads jobs (Clerk-keyed) and writes notes (UUID-keyed).

## Never use drizzle-kit push for this repo's schema
`pnpm --filter @workspace/db run push` goes interactive with dangerous rename prompts that can
clobber existing tables. Apply DDL via raw SQL (executeSql) for the new table + indexes, then run
`pnpm --filter @workspace/db run rls` to apply the RLS policy. Add the table to `TENANT_TABLES` and a
matching block in `rls-sql.ts`.

## Validation gate does NOT typecheck the platform artifact
The root `typecheck` workflow runs `typecheck:libs` (tsc --build, covers `lib/db`) plus
`pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck`. The
`@workspace/platform` package has **no `typecheck` script**, so it is skipped by the gate. To check
platform code directly: `cd artifacts/platform && npx tsc -p tsconfig.json --noEmit`.

**Why:** running that direct tsc surfaces a large pile of PRE-EXISTING errors (test files using
`.ts` import extensions, `slackResponder`, `demo-bootstrap`, `live-highlights`, `memo-service`).
These are not regressions — do not panic or try to "fix" them when adding platform code. Filter the
output to only your own files.
