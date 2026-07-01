/**
 * Bridge that lets the server-side agent loop pause on an `excel_op` until the
 * task pane has executed it via Office.js and POSTed the result back to
 * `/api/v1/agent/tool-result`.
 *
 * Flow:
 *   1. `runAgent` emits an `excel_op` SSE frame, then `await waitForOp(id)`.
 *   2. The task pane runs the op, then POSTs `{ id, ok, result, error }`.
 *   3. The tool-result route calls `resolveOp(id, result)`, unblocking the
 *      loop so the model receives the real outcome.
 *
 * Multi-instance safety: in a horizontally-scaled deployment the SSE stream
 * (which calls `waitForOp`) and the tool-result POST (which calls `resolveOp`)
 * can land on *different* Node instances. A process-local Map alone would never
 * resolve in that case, stalling the build until timeout. We therefore back the
 * bridge with a shared Postgres table (`excel_pending_ops`):
 *
 *   - `waitForOp` registers a pending row and, in addition to the in-memory
 *     fast path, polls that row so it can observe a resolution recorded by
 *     *any* instance.
 *   - `resolveOp` resolves the in-memory waiter when present (same-instance,
 *     instant) and always records the outcome in the shared row so a waiter on
 *     a different instance picks it up on its next poll.
 *
 * Graceful degradation: if no database is configured / reachable, the bridge
 * transparently falls back to pure in-memory behaviour (correct for a single
 * instance). A timeout fallback always guarantees the loop can never hang
 * forever if the client disconnects or the user walks away mid-approval.
 */

export interface ExcelOpResult {
  ok: boolean;
  /** Payload for read ops (read_range / get_sheet_names / get_used_range). */
  result?: unknown;
  error?: string;
  /** The user declined the preview/approve card. */
  cancelled?: boolean;
  /** The client never responded within the wait budget. */
  timedOut?: boolean;
}

interface PendingOp {
  resolve: (r: ExcelOpResult) => void;
  /** Settle as superseded WITHOUT deleting the shared row (it gets re-registered). */
  supersede: () => void;
  timer: ReturnType<typeof setTimeout>;
}

const PENDING_KEY = Symbol.for("finsyt.excel.pendingOps");

// Survive Next.js dev hot-reloads by hanging the Map off globalThis.
const g = globalThis as unknown as { [PENDING_KEY]?: Map<string, PendingOp> };
const pending: Map<string, PendingOp> = g[PENDING_KEY] || (g[PENDING_KEY] = new Map());

/** Default time the loop will wait for a client op result before giving up. */
export const DEFAULT_OP_TIMEOUT_MS = 120_000;

/** How often a waiter polls the shared row for a cross-instance resolution. */
const POLL_INTERVAL_MS = 500;

/** Drop coordination rows orphaned by a crashed instance after this long. */
const STALE_ROW_TTL_MS = 15 * 60_000;

// Re-imported lazily alongside the db module (see getDbModule) to keep this
// file importable in environments without a database.
type DrizzleOps = typeof import("drizzle-orm");

function unref(timer: { unref?: () => void }): void {
  // Don't keep the event loop alive purely for these timers.
  if (typeof timer.unref === "function") timer.unref();
}

// ── Shared-store (Postgres) helpers ─────────────────────────────────────────
// All DB access is best-effort: on the first failure (e.g. no DATABASE_URL, or
// the table not yet migrated) we flip `dbActive` off so the bridge behaves as a
// pure in-memory singleton without spamming errors.

let dbActive = true;
let lastSweep = 0;

type DbModule = typeof import("@workspace/db");
interface Store {
  db: DbModule["db"];
  table: DbModule["excelPendingOpsTable"];
  eq: DrizzleOps["eq"];
  and: DrizzleOps["and"];
  lt: DrizzleOps["lt"];
}
let storePromise: Promise<Store | null> | null = null;

async function getStore(): Promise<Store | null> {
  if (!dbActive) return null;
  if (!storePromise) {
    storePromise = Promise.all([import("@workspace/db"), import("drizzle-orm")])
      .then(([dbMod, ops]): Store => ({
        db: dbMod.db,
        table: dbMod.excelPendingOpsTable,
        eq: ops.eq,
        and: ops.and,
        lt: ops.lt,
      }))
      .catch(() => {
        dbActive = false;
        return null;
      });
  }
  return storePromise;
}

function disableDb(): void {
  dbActive = false;
}

/**
 * Insert a pending row for a waiter. Uses `onConflictDoNothing` so it can NEVER
 * clobber a result that a faster `resolveOp` already recorded (the
 * resolve-before-register race): if a resolved row is already present, this is a
 * no-op and the waiter's first poll picks up that result immediately. Op ids are
 * globally unique per run (`<runId>:<toolCallId>`), so there is no stale-row
 * reuse to reset. Returns true whenever the shared store is usable.
 */
async function registerOpRow(id: string): Promise<boolean> {
  const s = await getStore();
  if (!s) return false;
  try {
    await s.db
      .insert(s.table)
      .values({ id, status: "pending" })
      .onConflictDoNothing();
    void sweepStaleRows(s);
    return true;
  } catch {
    disableDb();
    return false;
  }
}

/**
 * Read a pending row; if it has been resolved (by this or another instance),
 * return the stored outcome. `null` means still pending / unknown / DB down.
 */
async function fetchResolvedRow(id: string): Promise<ExcelOpResult | null> {
  const s = await getStore();
  if (!s) return null;
  try {
    const rows = await s.db
      .select()
      .from(s.table)
      .where(s.eq(s.table.id, id))
      .limit(1);
    const row = rows[0];
    if (row && row.status === "resolved") {
      return (row.result as ExcelOpResult) ?? { ok: true };
    }
    return null;
  } catch {
    disableDb();
    return null;
  }
}

/**
 * Record a resolution in the shared row, durable regardless of ordering. This is
 * an UPSERT so it works even when the result arrives *before* the waiter has
 * registered its pending row (the cross-instance resolve-before-register race):
 *
 *   - row missing  → INSERT a resolved row; the waiter's `registerOpRow`
 *     (onConflictDoNothing) then leaves it, and its first poll observes it.
 *   - row pending  → UPDATE it to resolved for the polling waiter to pick up.
 *   - row resolved → idempotent overwrite (duplicate / retried POST).
 *
 * Returns true whenever the outcome was persisted to a usable shared store.
 */
async function markRowResolved(id: string, result: ExcelOpResult): Promise<boolean> {
  const s = await getStore();
  if (!s) return false;
  try {
    const now = new Date();
    const rows = await s.db
      .insert(s.table)
      .values({ id, status: "resolved", result, resolvedAt: now })
      .onConflictDoUpdate({
        target: s.table.id,
        set: { status: "resolved", result, resolvedAt: now },
      })
      .returning({ id: s.table.id });
    return rows.length > 0;
  } catch {
    disableDb();
    return false;
  }
}

async function deleteOpRow(id: string): Promise<void> {
  const s = await getStore();
  if (!s) return;
  try {
    await s.db.delete(s.table).where(s.eq(s.table.id, id));
  } catch {
    disableDb();
  }
}

async function sweepStaleRows(s: Store): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < STALE_ROW_TTL_MS) return;
  lastSweep = now;
  try {
    await s.db
      .delete(s.table)
      .where(s.lt(s.table.createdAt, new Date(now - STALE_ROW_TTL_MS)));
  } catch {
    disableDb();
  }
}

/**
 * Register an op and return a promise that resolves when the client POSTs its
 * result (on any instance), or after `timeoutMs` with `{ ok:false,
 * timedOut:true }`.
 */
export function waitForOp(id: string, timeoutMs: number = DEFAULT_OP_TIMEOUT_MS): Promise<ExcelOpResult> {
  return new Promise<ExcelOpResult>((resolve) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      clearTimeout(timer);
      if (pollTimer) clearInterval(pollTimer);
      if (pending.get(id) === entry) pending.delete(id);
    };

    const finish = (r: ExcelOpResult, removeRow: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (removeRow) void deleteOpRow(id);
      resolve(r);
    };

    // If an id is somehow reused, resolve the stale waiter first — without
    // deleting the shared row, which this new waiter is about to re-register.
    const stale = pending.get(id);
    if (stale) {
      clearTimeout(stale.timer);
      stale.supersede();
    }

    const timer = setTimeout(() => {
      finish({ ok: false, timedOut: true, error: "client did not respond in time" }, true);
    }, timeoutMs);
    unref(timer);

    // In-memory fast path: same-instance resolveOp delivers directly here.
    const entry: PendingOp = {
      resolve: (r) => finish(r, true),
      supersede: () => finish({ ok: false, error: "superseded" }, false),
      timer,
    };
    pending.set(id, entry);

    // Shared store: register the row and start polling so a resolution recorded
    // by *another* instance is observed here. Only poll if the store is usable.
    void registerOpRow(id).then((ok) => {
      if (!ok || settled) return;
      // Immediate check: the result may have been recorded by another instance
      // *before* we registered (resolve-before-register). Don't wait a full poll.
      void fetchResolvedRow(id).then((row) => {
        if (row && !settled) finish(row, true);
      });
      pollTimer = setInterval(() => {
        void fetchResolvedRow(id).then((row) => {
          if (row && !settled) finish(row, true);
        });
      }, POLL_INTERVAL_MS);
      unref(pollTimer);
    });
  });
}

/**
 * Resolve a pending op with the client-supplied result. Returns false if no
 * op with that id is awaiting resolution anywhere (already resolved, timed out,
 * or unknown).
 *
 * Same-instance waiters are delivered instantly via the in-memory map; for a
 * waiter on another instance the outcome is written to the shared row, which
 * that instance's poll loop picks up.
 */
export async function resolveOp(id: string, result: ExcelOpResult): Promise<boolean> {
  const p = pending.get(id);
  if (p) {
    // Same-instance fast path: the waiter is right here. Deliver in-memory; its
    // `finish` then deletes the shared row. We deliberately do NOT also write the
    // shared row here — that would race the row deletion and could leave an
    // orphan. The shared store is only needed for the cross-instance case below.
    p.resolve(result);
    return true;
  }
  // Cross-instance (or resolve-before-register): persist the outcome to the
  // shared row so the waiting instance observes it on its next poll. This is an
  // upsert, so it is durable even if the waiter has not registered yet.
  return markRowResolved(id, result);
}

/**
 * Test-only: force the shared Postgres store on or off and reset the cached
 * connection so the next call re-imports (picking up any mocked `@workspace/db`).
 * Production code never calls this — the store auto-detects availability.
 */
export function __setSharedStoreEnabledForTests(enabled: boolean): void {
  dbActive = enabled;
  storePromise = null;
  lastSweep = 0;
}

/** Number of ops currently awaiting a client result in THIS process (diagnostics/tests). */
export function pendingOpCount(): number {
  return pending.size;
}
