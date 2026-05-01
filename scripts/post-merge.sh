#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Pre-clean tables so drizzle-kit push can run cleanly:
# audit_events partitions are runtime-managed (lib/db/src/audit.ts) and
# confuse drizzle's rename heuristics. The API server recreates them at
# boot via ensureAuditSchema().
if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -c "DROP TABLE IF EXISTS audit_events CASCADE" >/dev/null 2>&1 || true
fi

pnpm --filter db push --force
pnpm --filter db rls

# Mirror the freshly-merged main branch up to the user's GitHub repo
# (https://github.com/jaimedhenriques/finsyt). Never fail the post-merge
# on a sync issue — the script is defensive and exits 0 even on errors.
if [ -x "$PWD/scripts/sync-to-github.sh" ]; then
  "$PWD/scripts/sync-to-github.sh" || true
fi
