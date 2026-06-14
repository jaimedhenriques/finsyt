// NOTE: this module is server-side only — the only importer is
// `agent-scheduler.ts`, which itself carries `import 'server-only'` and is
// only loaded from `instrumentation.ts` under the `nodejs` runtime guard.
// We deliberately omit `import 'server-only'` here so the unit tests in
// `__tests__/filing-rerun-watcher.test.ts` can run under plain `node:test`
// (the marker package throws synchronously outside React Server contexts).
import { and, eq, sql } from 'drizzle-orm'
import {
  db,
  withOrgContext,
  matricesTable,
  type MatrixCellPayload,
} from '@workspace/db'

// ── Filing-rerun watcher ────────────────────────────────────────────────────
//
// Matrices have a "Rerun on new filing" toggle (`rerunOnFiling=true`). When
// a row's company files a fresh 10-K / 10-Q / 8-K with the SEC, we want
// every cell that touches that row to be re-run so the analyst sees the
// updated answer the next time they open the matrix.
//
// There is no internal filing-publish event bus today (filings are fetched
// on demand from SEC EDGAR / FMP), so this module *polls*: the in-process
// cron (see `agent-scheduler.ts`) calls `tickFilingRerunWatcher()` every
// few minutes. The tick:
//
//   1. Selects all matrices with `rerunOnFiling=true` (cross-org scan via
//      the unrestricted owner role; per-row writes are rebound to the
//      matrix's org via `withOrgContext`).
//   2. Builds a deduped list of row tickers across those matrices.
//   3. For each ticker, fetches the most recent SEC filing via the
//      injected `fetchLatestFiling` (defaults to SEC EDGAR's submissions
//      API — same path the agent uses).
//   4. Compares the freshly-fetched filing to each matrix's recorded
//      per-symbol marker (`lastFilingMarkers[SYMBOL]`). When the new
//      filing is strictly newer, marks every cell in every row for that
//      symbol as `dirty: true` and updates the marker so we don't refire
//      on the next poll.
//   5. Always advances `lastFilingCheckAt` for every scanned matrix so
//      ops can see the watcher is alive.
//
// Cells are *not* re-run headlessly — the rerun route's contract is to
// queue cells dirty and let the foreground page re-stream them via
// `/api/agent/ask` (which needs Clerk auth). On the *first* tick after a
// matrix flips its `rerunOnFiling` flag on, we seed the per-symbol marker
// from the live SEC response *without* dirtying any cells, so we don't
// fire a spurious "rerun" for a filing the analyst already had.
//
// All side effects (DB queries, HTTP) are dependency-injected so the unit
// tests in `__tests__/filing-rerun-watcher.test.ts` can drive the full
// orchestration with fakes.

/** A row inside a matrix's `rows` JSONB array. */
interface MatrixRowRef {
  id: string
  label?: string
  ticker?: string
  kind?: string
  meta?: Record<string, unknown>
}

/** A column inside a matrix's `columns` JSONB array. */
interface MatrixColRef {
  id: string
  label?: string
}

/** Per-symbol cursor stored in `matrices.last_filing_markers`. */
export interface FilingMarker {
  /** ISO date `YYYY-MM-DD` of the most recent filing already processed. */
  date: string
  /** SEC accession number (canonical or stripped) of that filing. */
  accession?: string
  /** SEC form type (e.g. `10-K`, `10-Q`, `8-K`). */
  form?: string
}

/** The shape returned by `fetchLatestFiling`. */
export interface LatestFiling {
  symbol: string
  date: string
  accession?: string
  form?: string
}

export type FetchLatestFiling = (symbol: string) => Promise<LatestFiling | null>

/**
 * A minimal slice of `matricesTable` that the pure logic needs. Defined as
 * an interface (rather than re-using `MatrixRow`) so tests can hand-roll
 * fixtures without dragging in every column.
 */
export interface WatchedMatrix {
  id: string
  orgId: string
  rows: MatrixRowRef[]
  columns: MatrixColRef[]
  cells: Record<string, MatrixCellPayload>
  lastFilingMarkers: Record<string, FilingMarker>
}

export interface MatrixUpdate {
  matrixId: string
  orgId: string
  /** Cell keys (`${rowId}.${colId}`) flipped to `dirty: true`. */
  dirtiedCellKeys: string[]
  /** Symbols whose marker advanced this tick (includes seeded-from-empty markers). */
  advancedSymbols: string[]
  /** Whether any cell was actually marked dirty (i.e. a real new filing landed). */
  triggered: boolean
  /**
   * The full marker map to persist back to `matrices.last_filing_markers`.
   * Includes both pre-existing markers (untouched) and any markers advanced
   * this tick. Empty when nothing changed — caller can short-circuit the
   * update.
   */
  nextMarkers: Record<string, FilingMarker>
}

export interface TickResult {
  scannedMatrices: number
  scannedSymbols: number
  newFilings: number
  updates: MatrixUpdate[]
}

/**
 * The minimal Drizzle tx surface the watcher needs inside an org context.
 * Defined as a structural interface so tests can hand-roll a fake without
 * pulling in the real PG transaction type.
 */
export interface TxLike {
  update: typeof db.update
}

/** Bind a callback to a tenant org id (real impl: `SET LOCAL` GUCs + role). */
export type WithOrgContextFn = <T>(orgId: string, fn: (tx: TxLike) => Promise<T>) => Promise<T>

export interface TickOptions {
  fetchLatestFiling?: FetchLatestFiling
  /** Override `Date.now()` for deterministic tests. */
  now?: () => Date
  /** Cap per-tick to be polite to upstream APIs. */
  maxSymbolsPerTick?: number
  /** Inject a custom DB client (defaults to the workspace `db`). Used by tests. */
  database?: typeof db
  /** Inject a `withOrgContext` impl. Defaults to the real one from `@workspace/db`. */
  withOrgContext?: WithOrgContextFn
}

/** Default per-tick fan-out cap for upstream filing lookups. */
export const DEFAULT_MAX_SYMBOLS_PER_TICK = 50

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Returns the unique uppercase tickers referenced by `matrix.rows`. Rows
 * with no ticker (e.g. private companies, custom labels) are skipped.
 */
export function uniqueTickersForMatrix(matrix: Pick<WatchedMatrix, 'rows'>): string[] {
  const seen = new Set<string>()
  for (const r of matrix.rows) {
    const t = typeof r.ticker === 'string' ? r.ticker.trim().toUpperCase() : ''
    if (!t) continue
    seen.add(t)
  }
  return [...seen]
}

/**
 * Given the latest filing for a symbol and the recorded marker, decide
 * whether the matrix needs a rerun for that symbol. A filing is "new"
 * when:
 *
 *   - There is no marker yet **and** `seedIfMissing=false` (i.e. the
 *     matrix has never been polled, so we want to dirty cells once on
 *     first detection — but see the orchestrator note below: real first
 *     polls pass `seedIfMissing=true` so we *don't* fire spuriously on
 *     pre-existing filings).
 *   - The filing's date is strictly later than the marker's date.
 *   - The dates match but the accession number differs (companies can
 *     amend a filing same-day; a different accession is a different
 *     document).
 */
export function isNewerFiling(
  latest: LatestFiling,
  marker: FilingMarker | undefined,
  opts: { seedIfMissing: boolean } = { seedIfMissing: false },
): boolean {
  if (!marker) return !opts.seedIfMissing
  if (latest.date > marker.date) return true
  if (latest.date === marker.date) {
    const a = (latest.accession || '').replace(/-/g, '')
    const b = (marker.accession || '').replace(/-/g, '')
    if (a && b && a !== b) return true
  }
  return false
}

/**
 * Find every row in `matrix` whose ticker matches `symbol` (case-
 * insensitive). Returns the row IDs.
 */
export function rowIdsForSymbol(matrix: Pick<WatchedMatrix, 'rows'>, symbol: string): string[] {
  const up = symbol.toUpperCase()
  const out: string[] = []
  for (const r of matrix.rows) {
    if (typeof r.ticker === 'string' && r.ticker.trim().toUpperCase() === up) {
      out.push(r.id)
    }
  }
  return out
}

/**
 * Compute the dirty-cell mutation for one matrix given freshly-fetched
 * latest filings (keyed by uppercase symbol). Returns a description of
 * what *would* be written; the caller is responsible for the actual
 * `UPDATE matrices …` statement.
 *
 * @param freshlyTracked — tickers for which this matrix had no marker
 *                         before the tick. They are seeded into the
 *                         marker map but their cells are NOT dirtied
 *                         (avoids spurious reruns on first observation).
 */
export function computeMatrixUpdate(
  matrix: WatchedMatrix,
  latestBySymbol: Map<string, LatestFiling>,
  freshlyTracked: Set<string>,
): MatrixUpdate {
  const dirtied = new Set<string>()
  const advancedSymbols: string[] = []
  const nextMarkers: Record<string, FilingMarker> = { ...matrix.lastFilingMarkers }
  const cols = matrix.columns

  for (const symbol of uniqueTickersForMatrix(matrix)) {
    const latest = latestBySymbol.get(symbol)
    if (!latest) continue
    const marker = matrix.lastFilingMarkers[symbol]
    const seed = freshlyTracked.has(symbol) || !marker
    const newer = isNewerFiling(latest, marker, { seedIfMissing: seed })
    const willAdvance = !marker || latest.date > marker.date ||
      (latest.date === marker.date && (latest.accession || '') !== (marker.accession || ''))

    if (willAdvance) {
      nextMarkers[symbol] = {
        date: latest.date,
        accession: latest.accession,
        form: latest.form,
      }
      advancedSymbols.push(symbol)
    }

    if (newer && !seed) {
      for (const rid of rowIdsForSymbol(matrix, symbol)) {
        for (const c of cols) dirtied.add(`${rid}.${c.id}`)
      }
    }
  }

  return {
    matrixId: matrix.id,
    orgId: matrix.orgId,
    dirtiedCellKeys: [...dirtied],
    advancedSymbols,
    triggered: dirtied.size > 0,
    nextMarkers,
  }
}

// ── Default IO impls ────────────────────────────────────────────────────────

/**
 * Fetch the most recent SEC filing for a single ticker via SEC EDGAR's
 * public submissions API. No API key required. Returns `null` on any
 * failure (network, unknown ticker, malformed payload) so a single bad
 * symbol never aborts the whole tick.
 *
 * Mirrors the lookup path in `app/api/agent/ask/route.ts` so the watcher
 * sees the same filings as the foreground agent.
 */
export const defaultFetchLatestFiling: FetchLatestFiling = async (symbol) => {
  const cik = await secCikFor(symbol)
  if (!cik) return null
  try {
    const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { 'User-Agent': 'Finsyt FilingWatcher contact@finsyt.dev' },
      // Filings are slow-changing; cache for 5 minutes between matrices.
      next: { revalidate: 300 },
    })
    if (!r.ok) return null
    const j = (await r.json()) as {
      filings?: {
        recent?: {
          form?: string[]
          filingDate?: string[]
          accessionNumber?: string[]
        }
      }
    }
    const recent = j?.filings?.recent
    if (!recent?.form) return null
    // The recent arrays are sorted newest-first.
    const date = recent.filingDate?.[0]
    const form = recent.form?.[0]
    const accession = recent.accessionNumber?.[0]
    if (!date) return null
    return { symbol: symbol.toUpperCase(), date, form, accession }
  } catch {
    return null
  }
}

async function secCikFor(symbol: string): Promise<string | null> {
  try {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': 'Finsyt FilingWatcher contact@finsyt.dev' },
      next: { revalidate: 86400 },
    })
    if (!r.ok) return null
    const j = (await r.json()) as Record<string, { ticker?: string; cik_str?: number | string }>
    const up = symbol.toUpperCase()
    for (const k of Object.keys(j)) {
      const entry = j[k]
      if (entry?.ticker?.toUpperCase() === up && entry.cik_str !== undefined) {
        return String(entry.cik_str).padStart(10, '0')
      }
    }
    return null
  } catch {
    return null
  }
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Run one watcher tick. Safe to call concurrently — the in-process latch
 * in `agent-scheduler.ts` already prevents overlapping ticks per process.
 */
export async function tickFilingRerunWatcher(opts: TickOptions = {}): Promise<TickResult> {
  const fetchLatest = opts.fetchLatestFiling ?? defaultFetchLatestFiling
  const now = opts.now ?? (() => new Date())
  const cap = opts.maxSymbolsPerTick ?? DEFAULT_MAX_SYMBOLS_PER_TICK
  const database = opts.database ?? db
  const withOrg = opts.withOrgContext ?? (withOrgContext as WithOrgContextFn)

  // Cross-org scan via the unrestricted owner role. Per-row writes are
  // rebound to the matrix's org via `withOrgContext` below.
  //
  // Order by `lastFilingCheckAt ASC NULLS FIRST` so the least-recently-
  // checked matrix gets first crack at this tick's symbol budget. With
  // every successful tick stamping `lastFilingCheckAt`, this gives us
  // round-robin fairness across all watched matrices: even with hundreds
  // of unique tickers and a 50-symbol per-tick cap, every matrix is
  // guaranteed to be polled within ~`ceil(N/cap)` ticks. Without this
  // ordering a stable-but-unlucky tail could be starved indefinitely.
  const watched = await database
    .select({
      id: matricesTable.id,
      orgId: matricesTable.orgId,
      rows: matricesTable.rows,
      columns: matricesTable.columns,
      cells: matricesTable.cells,
      lastFilingMarkers: matricesTable.lastFilingMarkers,
    })
    .from(matricesTable)
    .where(eq(matricesTable.rerunOnFiling, true))
    .orderBy(sql`${matricesTable.lastFilingCheckAt} asc nulls first`)

  if (watched.length === 0) {
    return { scannedMatrices: 0, scannedSymbols: 0, newFilings: 0, updates: [] }
  }

  // Collect the deduped set of symbols we need to look up this tick.
  // Walking `watched` in lastFilingCheckAt-ASC order (above) means the
  // least-recently-polled matrices contribute their symbols first, so a
  // stable >cap symbol set still rotates fully across consecutive ticks.
  const symbolSet = new Set<string>()
  const includedMatrixIds = new Set<string>()
  for (const m of watched) {
    const tickers = uniqueTickersForMatrix({ rows: (m.rows as MatrixRowRef[]) || [] })
    let added = false
    for (const t of tickers) {
      if (symbolSet.size >= cap && !symbolSet.has(t)) continue
      symbolSet.add(t)
      added = true
    }
    if (added || tickers.length === 0) includedMatrixIds.add(m.id)
    if (symbolSet.size >= cap) {
      // Keep walking the rest of `watched` so any matrix whose tickers are
      // entirely covered by the already-collected set still gets evaluated
      // this tick (cheap — no extra HTTP), but stop adding *new* symbols.
      // Matrices whose tickers were skipped will be picked up next tick
      // because their lastFilingCheckAt won't have advanced.
    }
  }

  // Fan out filing lookups with mild parallelism — SEC asks for ≤10 req/s
  // shared across all clients; we do a handful at a time with no retry.
  const symbols = [...symbolSet]
  const latestBySymbol = new Map<string, LatestFiling>()
  const PAR = 4
  let cursor = 0
  async function worker() {
    while (cursor < symbols.length) {
      const idx = cursor++
      const s = symbols[idx]
      try {
        const latest = await fetchLatest(s)
        if (latest && latest.date) latestBySymbol.set(s.toUpperCase(), latest)
      } catch {
        // swallow — one bad symbol must not abort the tick
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PAR, symbols.length) }, () => worker()))

  let totalNewFilings = 0
  let scannedMatrices = 0
  const updates: MatrixUpdate[] = []
  for (const row of watched) {
    // Skip matrices whose tickers were squeezed out by this tick's symbol
    // budget — leaving their `last_filing_check_at` untouched bumps them
    // to the front of next tick's ASC-NULLS-FIRST queue (round-robin).
    if (!includedMatrixIds.has(row.id)) continue
    scannedMatrices++

    const matrix: WatchedMatrix = {
      id: row.id,
      orgId: row.orgId,
      rows: (row.rows as MatrixRowRef[]) || [],
      columns: (row.columns as MatrixColRef[]) || [],
      cells: (row.cells as Record<string, MatrixCellPayload>) || {},
      lastFilingMarkers: (row.lastFilingMarkers as Record<string, FilingMarker>) || {},
    }
    const freshlyTracked = new Set<string>()
    for (const t of uniqueTickersForMatrix(matrix)) {
      if (!matrix.lastFilingMarkers[t]) freshlyTracked.add(t)
    }
    const update = computeMatrixUpdate(matrix, latestBySymbol, freshlyTracked)

    await applyMatrixUpdate(database, withOrg, matrix, update, update.nextMarkers, now())
    if (update.triggered) totalNewFilings += update.dirtiedCellKeys.length
    updates.push(update)
  }

  return {
    scannedMatrices,
    scannedSymbols: symbols.length,
    newFilings: totalNewFilings,
    updates,
  }
}

/**
 * Persist a single matrix update inside its org context. Always advances
 * `last_filing_check_at`; only writes `cells` / `last_filing_markers`
 * when something actually changed (avoids unnecessary RLS round-trips
 * and `updatedAt` churn).
 */
async function applyMatrixUpdate(
  database: typeof db,
  withOrg: WithOrgContextFn,
  matrix: WatchedMatrix,
  update: MatrixUpdate,
  nextMarkers: Record<string, FilingMarker>,
  checkedAt: Date,
): Promise<void> {
  const cellsChanged = update.dirtiedCellKeys.length > 0
  const markersChanged = update.advancedSymbols.length > 0

  if (!cellsChanged && !markersChanged) {
    // Just stamp the heartbeat. Use the raw db so we don't pay for the
    // `withOrgContext` SET LOCAL round-trip when there's nothing else to
    // write. The owner role bypasses RLS, and we still scope by org id.
    await database
      .update(matricesTable)
      .set({ lastFilingCheckAt: checkedAt })
      .where(and(eq(matricesTable.id, matrix.id), eq(matricesTable.orgId, matrix.orgId)))
    return
  }

  await withOrg(matrix.orgId, async (tx) => {
    const nextCells = { ...matrix.cells }
    for (const key of update.dirtiedCellKeys) {
      const prev = nextCells[key] || { state: 'idle' as const }
      nextCells[key] = { ...prev, dirty: true }
    }
    await tx
      .update(matricesTable)
      .set({
        cells: nextCells,
        lastFilingMarkers: nextMarkers,
        lastFilingCheckAt: checkedAt,
        // Bump `updatedAt` so list views surface the change.
        updatedAt: cellsChanged ? new Date() : sql`${matricesTable.updatedAt}`,
      })
      .where(and(eq(matricesTable.id, matrix.id), eq(matricesTable.orgId, matrix.orgId)))
  })
}
