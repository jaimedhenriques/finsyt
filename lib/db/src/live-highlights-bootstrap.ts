import { pool } from "./index";

// ── Retention defaults ─────────────────────────────────────────────────────
// Live-highlights tables grow forever otherwise — per-org "recent pins" and
// "recent notifications" reads slow down and disk usage climbs. Both
// cutoffs are overridable via env so a deployment can keep more (or less)
// history without a code change.
const DEFAULT_NOTIFICATION_RETENTION_DAYS = 30;
const DEFAULT_ENDED_CALL_RETENTION_DAYS = 7;
const NOTIFICATION_RETENTION_ENV = "LIVE_HIGHLIGHTS_NOTIF_RETENTION_DAYS";
const CALL_RETENTION_ENV = "LIVE_HIGHLIGHTS_CALL_RETENTION_DAYS";
const RETENTION_DAYS_CAP = 3650; // 10 years — refuse absurd inputs without erroring.

function readRetentionDays(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, RETENTION_DAYS_CAP);
}

export interface LiveHighlightsCleanupResult {
  notificationsDeleted: number;
  pinsDeleted: number;
  callsDeleted: number;
  notificationCutoffDays: number;
  endedCallCutoffDays: number;
}

/**
 * Cross-org cleanup for the Live Highlights persistence tables. Removes:
 *   1. notifications older than `LIVE_HIGHLIGHTS_NOTIF_RETENTION_DAYS`
 *      (default 30 days), measured by `ts`,
 *   2. pins belonging to ended calls whose `updated_at` is older than
 *      `LIVE_HIGHLIGHTS_CALL_RETENTION_DAYS` (default 7 days),
 *   3. the matching ended call rows themselves.
 *
 * Pin rows are deleted before their parent call rows so a join-style
 * `USING` filter can locate them; the per-call PK guard plus the tight
 * `ended = true` filter mean an in-flight call (live `tickLiveHighlights`
 * still updating its cursor) can never be pruned out from under the
 * engine.
 *
 * Runs as the connection's owner role (the same privileged identity that
 * `bootstrapRls()` uses) so a single `DELETE` can sweep across every
 * tenant. Each statement is independent — a failure on one table still
 * lets the others finish, and the caller logs the row counts so an
 * unexpectedly empty sweep is visible in the platform workflow logs.
 */
export async function pruneLiveHighlights(): Promise<LiveHighlightsCleanupResult> {
  const notificationCutoffDays = readRetentionDays(
    NOTIFICATION_RETENTION_ENV,
    DEFAULT_NOTIFICATION_RETENTION_DAYS,
  );
  const endedCallCutoffDays = readRetentionDays(
    CALL_RETENTION_ENV,
    DEFAULT_ENDED_CALL_RETENTION_DAYS,
  );

  let notificationsDeleted = 0;
  let pinsDeleted = 0;
  let callsDeleted = 0;

  try {
    const r = await pool.query(
      `DELETE FROM live_highlights_notifications
        WHERE ts < now() - ($1::int || ' days')::interval`,
      [notificationCutoffDays],
    );
    notificationsDeleted = r.rowCount ?? 0;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pruneLiveHighlights] notifications delete failed:", err);
  }

  try {
    const r = await pool.query(
      `DELETE FROM live_highlights_pins p
         USING live_highlights_calls c
        WHERE p.org_id = c.org_id
          AND p.call_key = c.call_key
          AND c.ended = true
          AND c.updated_at < now() - ($1::int || ' days')::interval`,
      [endedCallCutoffDays],
    );
    pinsDeleted = r.rowCount ?? 0;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pruneLiveHighlights] pins delete failed:", err);
  }

  try {
    const r = await pool.query(
      `DELETE FROM live_highlights_calls
        WHERE ended = true
          AND updated_at < now() - ($1::int || ' days')::interval`,
      [endedCallCutoffDays],
    );
    callsDeleted = r.rowCount ?? 0;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pruneLiveHighlights] calls delete failed:", err);
  }

  return {
    notificationsDeleted,
    pinsDeleted,
    callsDeleted,
    notificationCutoffDays,
    endedCallCutoffDays,
  };
}

/**
 * Idempotent bootstrap for the Live Highlights persistence tables. Same
 * pattern as `ensureBlueprintSchema` / `ensureAuditSchema`: the drizzle
 * definitions in `./schema/live-highlights.ts` remain the source of truth
 * for queries, and this raw SQL guarantees the physical tables exist with
 * matching shapes on a fresh database without having to run
 * `drizzle-kit push` interactively.
 *
 * RLS policies for these tables are installed by `bootstrapRls()` from
 * `./rls-sql.ts`, which is also called from instrumentation on boot.
 */
export async function ensureLiveHighlightsSchema(): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_highlights_settings (
      org_id text PRIMARY KEY,
      enabled boolean NOT NULL DEFAULT true,
      blueprint_id uuid,
      disabled_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
      ad_hoc_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
      delivery_channels jsonb NOT NULL DEFAULT '{"bell":true,"email":false,"slack":false}'::jsonb,
      slack_webhook_url text,
      email_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // Idempotent column adds for databases that bootstrapped the table before
  // the delivery-channel fields were introduced.
  await pool.query(`
    ALTER TABLE live_highlights_settings
      ADD COLUMN IF NOT EXISTS delivery_channels jsonb NOT NULL
        DEFAULT '{"bell":true,"email":false,"slack":false}'::jsonb
  `);
  await pool.query(`
    ALTER TABLE live_highlights_settings
      ADD COLUMN IF NOT EXISTS slack_webhook_url text
  `);
  await pool.query(`
    ALTER TABLE live_highlights_settings
      ADD COLUMN IF NOT EXISTS email_recipients jsonb NOT NULL DEFAULT '[]'::jsonb
  `);
  await pool.query(`
    ALTER TABLE live_highlights_settings
      ADD COLUMN IF NOT EXISTS filing_score_threshold integer NOT NULL DEFAULT 70
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_highlights_calls (
      org_id text NOT NULL,
      call_key text NOT NULL,
      symbol text NOT NULL,
      event text NOT NULL,
      started_at timestamptz NOT NULL,
      last_chunk_idx integer NOT NULL DEFAULT -1,
      ended boolean NOT NULL DEFAULT false,
      first_pin_notified boolean NOT NULL DEFAULT false,
      end_rollup_notified boolean NOT NULL DEFAULT false,
      alignment_swapped boolean NOT NULL DEFAULT false,
      run_id uuid,
      run_closed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (org_id, call_key)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS live_highlights_calls_org_idx ON live_highlights_calls (org_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_highlights_pins (
      org_id text NOT NULL,
      call_key text NOT NULL,
      chunk_idx integer NOT NULL,
      note_id uuid NOT NULL,
      alignment text NOT NULL DEFAULT 'estimated',
      blueprint_id uuid,
      blueprint_version integer,
      pinned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (org_id, call_key, chunk_idx)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS live_highlights_pins_org_pinned_idx ON live_highlights_pins (org_id, pinned_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_highlights_notifications (
      id text PRIMARY KEY,
      org_id text NOT NULL,
      kind text NOT NULL,
      symbol text NOT NULL,
      event text NOT NULL,
      call_key text NOT NULL,
      message text NOT NULL,
      note_id uuid,
      pin_count integer,
      read boolean NOT NULL DEFAULT false,
      ts timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS live_highlights_notifs_org_ts_idx ON live_highlights_notifications (org_id, ts)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_highlights_filing_signals (
      org_id text NOT NULL,
      accession text NOT NULL,
      symbol text NOT NULL,
      form_type text,
      score integer NOT NULL,
      note_id uuid,
      notified_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (org_id, accession)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS live_highlights_filing_signals_org_idx ON live_highlights_filing_signals (org_id, notified_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS watchlists (
      org_id text PRIMARY KEY,
      symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}
