import { pgTable, text, uuid, integer, boolean, jsonb, timestamp, primaryKey, index } from "drizzle-orm/pg-core";

// ── Live Highlights persistence ─────────────────────────────────────────────
//
// Retention: rows in `live_highlights_notifications`,
// `live_highlights_calls`, and `live_highlights_pins` are pruned by a
// daily background tick — see `pruneLiveHighlights()` in
// `../live-highlights-bootstrap.ts` and the cron registration in
// `artifacts/platform/lib/agent-scheduler.ts`. Cutoffs are read from
// the env vars below (defaults: 30d for notifications, 7d for ended
// calls + their pins) so a deployment can tune retention without a
// code change. The "Live Highlights" UI continues to render unaffected
// because the per-org reads (`getRecentPins`, `getRecentNotifications`)
// already cap at the most recent N rows and ignore older history.
//
// Per-org bookkeeping for the Live Highlights engine in
// `artifacts/platform/lib/live-highlights.ts`. The pinned research notes
// themselves live in `research_notes` (workspace-UUID-scoped, RLS-enforced
// via `withOrgContext`) — these tables persist the *engine state* that used
// to live in process memory and is required to avoid duplicate pins after a
// dev restart, deploy, or process crash.
//
// All four tables are keyed on the Clerk org id (`org_…` text), matching
// the existing pattern for blueprints / agent_runs / audit_events. RLS
// policies live in `rls-sql.ts` and read `app.current_clerk_org_id`, so
// callers must enter `withComplianceContext(orgId, …)` (single-GUC, no
// user dimension required) for every read or write.
//
// Schema is also created by an idempotent CREATE TABLE bootstrap in
// `live-highlights-bootstrap.ts` so a fresh database self-heals on boot
// without a `drizzle-kit push` step (mirrors the audit / blueprint pattern).

// ── Settings ────────────────────────────────────────────────────────────────
// One row per org. Mirrors the previous in-memory `LiveHighlightsSettings`
// shape exactly so the engine code path is unchanged after persistence.
export const liveHighlightsSettingsTable = pgTable("live_highlights_settings", {
  orgId: text("org_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  /** UUID of the Blueprint chosen by the user; null → use published "live-highlights". */
  blueprintId: uuid("blueprint_id"),
  /** Tickers the user has explicitly opted out of monitoring. */
  disabledSymbols: jsonb("disabled_symbols").$type<string[]>().notNull().default([]),
  /** Tickers monitored even if not on the watchlist. */
  adHocSymbols: jsonb("ad_hoc_symbols").$type<string[]>().notNull().default([]),
  /** Per-org fan-out preferences for first-pin and end-of-call notifications. */
  deliveryChannels: jsonb("delivery_channels")
    .$type<{ bell: true; email: boolean; slack: boolean }>()
    .notNull()
    .default({ bell: true, email: false, slack: false }),
  /** Org-wide Slack incoming webhook URL (when `deliveryChannels.slack`). */
  slackWebhookUrl: text("slack_webhook_url"),
  /** Optional explicit email recipient list. Empty = use org member emails. */
  emailRecipients: jsonb("email_recipients").$type<string[]>().notNull().default([]),
  /**
   * Minimum AI signal score (0–100) a fresh SEC filing must hit before the
   * filing-signal watcher pins a Live Highlight + fires an alert. Tuned by
   * the user from the Live Highlights settings page. Default 70.
   */
  filingScoreThreshold: integer("filing_score_threshold").notNull().default(70),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type LiveHighlightsSettingsRow = typeof liveHighlightsSettingsTable.$inferSelect;

// ── Per-call cursor ─────────────────────────────────────────────────────────
// One row per (org, callKey). Records the high-water mark chunk index the
// engine has already processed, the per-call notification flags, the
// blueprint_runs row scoping every pin, and whether alignment has been
// swapped. After a restart the engine seeds its in-memory `PerCallState`
// from this row so it never re-pins a chunk.
export const liveHighlightsCallsTable = pgTable(
  "live_highlights_calls",
  {
    orgId: text("org_id").notNull(),
    callKey: text("call_key").notNull(),
    symbol: text("symbol").notNull(),
    event: text("event").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastChunkIdx: integer("last_chunk_idx").notNull().default(-1),
    ended: boolean("ended").notNull().default(false),
    firstPinNotified: boolean("first_pin_notified").notNull().default(false),
    endRollupNotified: boolean("end_rollup_notified").notNull().default(false),
    alignmentSwapped: boolean("alignment_swapped").notNull().default(false),
    runId: uuid("run_id"),
    runClosed: boolean("run_closed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.callKey] }),
    byOrg: index("live_highlights_calls_org_idx").on(t.orgId),
  }),
);
export type LiveHighlightsCallRow = typeof liveHighlightsCallsTable.$inferSelect;

// ── Per-pin record ──────────────────────────────────────────────────────────
// One row per (org, callKey, chunkIdx). The presence of a row is the
// authoritative "this chunk has been pinned" signal — duplicate-pin
// prevention is enforced by the composite primary key, so even a racing
// concurrent tick cannot create two notes for the same chunk.
//
// Stores enough metadata (alignment, blueprint, pinnedAt) that the engine
// can reconstruct the full `LiveHighlightPin` shape returned to the UI by
// joining with the per-call row + the deterministic chunk script.
export const liveHighlightsPinsTable = pgTable(
  "live_highlights_pins",
  {
    orgId: text("org_id").notNull(),
    callKey: text("call_key").notNull(),
    chunkIdx: integer("chunk_idx").notNull(),
    noteId: uuid("note_id").notNull(),
    alignment: text("alignment").notNull().default("estimated"),
    blueprintId: uuid("blueprint_id"),
    blueprintVersion: integer("blueprint_version"),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.callKey, t.chunkIdx] }),
    byOrgPinned: index("live_highlights_pins_org_pinned_idx").on(t.orgId, t.pinnedAt),
  }),
);
export type LiveHighlightsPinRow = typeof liveHighlightsPinsTable.$inferSelect;

// ── Notifications ───────────────────────────────────────────────────────────
// Persisted bell-notification rollups. The id is the same deterministic
// string the in-memory queue used (`${callKey}:first:${noteId}` /
// `${callKey}:end`) so re-emitting on a tick after restart is a no-op via
// `ON CONFLICT (id) DO NOTHING`.
export const liveHighlightsNotificationsTable = pgTable(
  "live_highlights_notifications",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    kind: text("kind").notNull(),
    symbol: text("symbol").notNull(),
    event: text("event").notNull(),
    callKey: text("call_key").notNull(),
    message: text("message").notNull(),
    noteId: uuid("note_id"),
    pinCount: integer("pin_count"),
    read: boolean("read").notNull().default(false),
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byOrgTs: index("live_highlights_notifs_org_ts_idx").on(t.orgId, t.ts),
  }),
);
export type LiveHighlightsNotificationRow = typeof liveHighlightsNotificationsTable.$inferSelect;

// ── Filing-signal dedup ─────────────────────────────────────────────────────
// One row per (org, accession). The presence of a row means the
// filing-signal watcher has already pinned a Live Highlight + fired an
// alert for this SEC filing in this workspace, so a later tick never
// re-notifies for the same document. Kept independent of
// `live_highlights_notifications` (which is pruned after 30d) so a pruned
// notification can't cause a duplicate alert when the filing is re-scored.
export const liveHighlightsFilingSignalsTable = pgTable(
  "live_highlights_filing_signals",
  {
    orgId: text("org_id").notNull(),
    accession: text("accession").notNull(),
    symbol: text("symbol").notNull(),
    formType: text("form_type"),
    score: integer("score").notNull(),
    noteId: uuid("note_id"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.accession] }),
    byOrgNotified: index("live_highlights_filing_signals_org_idx").on(t.orgId, t.notifiedAt),
  }),
);
export type LiveHighlightsFilingSignalRow = typeof liveHighlightsFilingSignalsTable.$inferSelect;

// ── Watchlists ──────────────────────────────────────────────────────────────
// One row per org. Replaces the in-process per-org `watchlist-store.ts`
// map so the set of monitored tickers (which the live engine reads on
// every tick) survives restarts.
export const watchlistsTable = pgTable("watchlists", {
  orgId: text("org_id").primaryKey(),
  symbols: jsonb("symbols").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type WatchlistRow = typeof watchlistsTable.$inferSelect;
