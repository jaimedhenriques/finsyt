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

# Schema push: apply any new Drizzle-managed tables and columns.
# drizzle.config.ts prefers DATABASE_MIGRATION_URL (Supabase direct connection)
# and falls back to DATABASE_URL — no extra env wiring needed here.
# push-force (drizzle-kit push --force) is used instead of plain push because
# drizzle-kit's default mode prompts interactively for destructive changes;
# in an unattended post-merge script that prompt would hang the process.
# The pre-clean step above already drops the one table that triggers rename
# heuristics, so force mode here is safe.
# Failure is surfaced on stderr but does not block the merge so that a
# transient DB connectivity issue never prevents code from landing.
#
# notify_ops posts a Slack/Discord/generic-compatible alert to
# OPS_ALERT_WEBHOOK_URL (same payload shape as
# artifacts/platform/lib/credential-health-notifier.ts: both `text` and
# `content` keys so Slack and Discord receivers both work). When the env
# var is unset the function is a clean no-op. The webhook call itself is
# defensive — a failed POST is logged but never aborts the merge.
notify_ops() {
  local message="$1"
  if [ -z "$OPS_ALERT_WEBHOOK_URL" ]; then
    return 0
  fi
  local payload
  payload=$(MSG="$message" node -e 'process.stdout.write(JSON.stringify({ text: process.env.MSG, content: process.env.MSG }))')
  if ! curl -fsS -m 10 -X POST -H 'content-type: application/json' \
       -d "$payload" "$OPS_ALERT_WEBHOOK_URL" >/dev/null 2>&1; then
    echo "WARNING: failed to POST ops alert to OPS_ALERT_WEBHOOK_URL." >&2
  fi
}

if pnpm --filter @workspace/db run push-force; then
  echo "schema push: completed successfully."
else
  push_exit=$?
  merge_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "WARNING: drizzle-kit push failed — the database schema may be out of date." \
       "Re-run 'pnpm --filter @workspace/db run push-force' manually to apply pending changes." >&2
  notify_ops "🚨 [Finsyt] post-merge schema push FAILED at ${merge_ts} (exit ${push_exit}).
The production database may be missing tables/columns and could throw runtime errors.
Reproduce/apply manually from the workspace root:
  pnpm --filter @workspace/db run push-force
(drizzle.config.ts uses DATABASE_MIGRATION_URL, falling back to DATABASE_URL.)"
fi

pnpm --filter @workspace/db run rls

# Mirror the freshly-merged main branch up to the user's GitHub repo
# (https://github.com/jaimedhenriques/finsyt). Never fail the post-merge
# on a sync issue — the script is defensive and exits 0 even on errors.
if [ -x "$PWD/scripts/sync-to-github.sh" ]; then
  "$PWD/scripts/sync-to-github.sh" || true
fi
