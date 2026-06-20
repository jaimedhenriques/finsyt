---
name: Supabase migration
description: How Replit's runtime-managed DATABASE_URL interacts with removing the postgresql-16 module, and the drizzle-kit push interactive prompt issue on Supabase (with partitioned tables).
---

# Supabase migration quirks

## Releasing the runtime-managed DATABASE_URL
Replit's `postgresql-16` module auto-provisions `DATABASE_URL` and marks it as `runtimeManaged` in the secrets API. Even after calling `uninstallProgrammingLanguage({ moduleId: "postgresql-16" })`, the API still returns `runtimeManaged: ["DATABASE_URL"]` for a while — the secret system doesn't update immediately.

**`requestEnvVar` will fail** with "directly populated by Replit from the user's account" for DATABASE_URL until the runtime-managed status clears. The workaround: uninstall the module, then ask the user to set DATABASE_URL manually in the Replit Secrets panel. The user-set value takes precedence.

**Why:** Replit's Postgres module injects DATABASE_URL at the environment level; removing the module stops provisioning on next boot but the API flag lags.

## drizzle-kit push interactive prompt on Supabase (SOLVED)

### Root cause
`audit_events` is a **partitioned table** (`relkind='p'`). drizzle-kit cannot introspect partitioned tables. It instead sees the monthly partition children (`audit_events_202606`, `audit_events_202607`, `relkind='r'`) as regular tables and interactively prompts "rename to audit_events?".

Adding `tablesFilter: ["!audit_events*"]` alone doesn't work either: drizzle-kit then sees `audit_events` in the Drizzle schema definition but absent from the DB snapshot and tries to `CREATE TABLE audit_events` — failing with "relation already exists".

### Fix (both changes required together)
1. **`lib/db/src/schema/drizzle-managed.ts`** — a separate schema entry-point for drizzle-kit that re-exports all managed tables *except* the compliance tables (`audit_events`, `org_retention_settings`, `account_deletion_requests`, `data_export_requests`), which are owned by `ensureAuditSchema()` in `src/audit.ts`. Application code still imports from `src/schema/index.ts`.
2. **`lib/db/drizzle.config.ts`** — `schema` points to `drizzle-managed.ts`; `tablesFilter: ["!audit_events*"]` excludes the partition children from DB introspection.

Combined effect: audit_events* tables are invisible to drizzle-kit on both sides — no diff, no prompt, no data-loss warning.

**Why both are needed:** The schema side stops drizzle from wanting to CREATE the table; the tablesFilter side stops drizzle from wanting to DROP the partition children.

## DATABASE_MIGRATION_URL convention
`lib/db/drizzle.config.ts` prefers `DATABASE_MIGRATION_URL || DATABASE_URL`. This supports Supabase's two-URL model: pooler (port 6543) for runtime, direct (port 5432) for DDL. Without it, drizzle-kit uses the pooler which can behave unexpectedly with DDL.
