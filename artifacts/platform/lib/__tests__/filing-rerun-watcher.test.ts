/**
 * Tests for the filing-rerun watcher.
 *
 * The watcher is the cron hook that flips matrix cells dirty when a new
 * SEC filing lands for any row's ticker. These tests cover both the
 * pure helpers (`uniqueTickersForMatrix`, `isNewerFiling`,
 * `rowIdsForSymbol`, `computeMatrixUpdate`) and the full
 * `tickFilingRerunWatcher` orchestration via an injected fake DB +
 * fake `fetchLatestFiling` + injected `withOrgContext`.
 *
 * Scenarios covered:
 *
 *   1. Pure helpers: ticker dedupe, marker comparison (date-newer,
 *      same-date-different-accession, missing marker with seedIfMissing),
 *      row-by-symbol lookup, single-matrix update computation.
 *   2. First-poll seeding: a matrix with no markers does NOT dirty cells
 *      on the first observation (we only fire on filings published
 *      *after* we started watching).
 *   3. Real new filing: a matrix whose marker date is older than the
 *      freshly-fetched filing dirties every cell on the matching rows,
 *      preserves prior cell `state`, and advances the marker.
 *   4. No-op tick: matrix marker already matches latest → no cells
 *      dirtied; only the `last_filing_check_at` heartbeat is bumped.
 *   5. Multi-symbol matrix: only rows whose ticker matched a new filing
 *      are dirtied; other rows are left alone.
 *   6. Symbols that don't resolve to a CIK (fetcher returns null) are
 *      skipped without aborting the tick.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  uniqueTickersForMatrix,
  isNewerFiling,
  rowIdsForSymbol,
  computeMatrixUpdate,
  tickFilingRerunWatcher,
  type LatestFiling,
  type WatchedMatrix,
  type FetchLatestFiling,
  type WithOrgContextFn,
  type TxLike,
} from '../filing-rerun-watcher.ts'

// ── Pure helpers ────────────────────────────────────────────────────────────

test('uniqueTickersForMatrix: dedupes case-insensitively and skips empty tickers', () => {
  const out = uniqueTickersForMatrix({
    rows: [
      { id: 'r1', ticker: 'AAPL' },
      { id: 'r2', ticker: 'aapl' }, // dupe
      { id: 'r3', ticker: '  MSFT  ' },
      { id: 'r4', ticker: '' },     // skipped
      { id: 'r5' },                 // skipped (no ticker)
    ],
  })
  assert.deepEqual(out.sort(), ['AAPL', 'MSFT'])
})

test('isNewerFiling: missing marker without seed → newer', () => {
  const latest: LatestFiling = { symbol: 'AAPL', date: '2026-04-12' }
  assert.equal(isNewerFiling(latest, undefined, { seedIfMissing: false }), true)
})

test('isNewerFiling: missing marker WITH seed → not newer (first observation)', () => {
  const latest: LatestFiling = { symbol: 'AAPL', date: '2026-04-12' }
  assert.equal(isNewerFiling(latest, undefined, { seedIfMissing: true }), false)
})

test('isNewerFiling: latest date strictly later than marker → newer', () => {
  assert.equal(
    isNewerFiling({ symbol: 'AAPL', date: '2026-04-12' }, { date: '2026-04-11' }),
    true,
  )
})

test('isNewerFiling: same date but different accession → newer (amendment)', () => {
  assert.equal(
    isNewerFiling(
      { symbol: 'AAPL', date: '2026-04-12', accession: '0000320193-26-000010' },
      { date: '2026-04-12', accession: '0000320193-26-000009' },
    ),
    true,
  )
})

test('isNewerFiling: same date and same accession → not newer', () => {
  assert.equal(
    isNewerFiling(
      { symbol: 'AAPL', date: '2026-04-12', accession: '0000320193-26-000010' },
      { date: '2026-04-12', accession: '0000320193-26-000010' },
    ),
    false,
  )
})

test('isNewerFiling: marker newer than latest (clock skew / re-poll) → not newer', () => {
  assert.equal(
    isNewerFiling({ symbol: 'AAPL', date: '2026-04-10' }, { date: '2026-04-12' }),
    false,
  )
})

test('rowIdsForSymbol: returns every row with the matching ticker (case-insensitive)', () => {
  const rows = [
    { id: 'r1', ticker: 'AAPL' },
    { id: 'r2', ticker: 'msft' },
    { id: 'r3', ticker: 'aapl' },
    { id: 'r4' },
  ]
  assert.deepEqual(rowIdsForSymbol({ rows }, 'AAPL').sort(), ['r1', 'r3'])
  assert.deepEqual(rowIdsForSymbol({ rows }, 'MSFT'), ['r2'])
  assert.deepEqual(rowIdsForSymbol({ rows }, 'NVDA'), [])
})

test('computeMatrixUpdate: real new filing dirties every cell on matched rows and advances marker', () => {
  const matrix: WatchedMatrix = {
    id: 'm1',
    orgId: 'org-1',
    rows: [
      { id: 'r1', ticker: 'AAPL' },
      { id: 'r2', ticker: 'MSFT' },
    ],
    columns: [{ id: 'c1' }, { id: 'c2' }],
    cells: { 'r1.c1': { state: 'done', text: 'old' } },
    lastFilingMarkers: { AAPL: { date: '2026-04-11' } },
  }
  const latest = new Map<string, LatestFiling>([
    ['AAPL', { symbol: 'AAPL', date: '2026-04-12', accession: 'A1', form: '8-K' }],
  ])
  const update = computeMatrixUpdate(matrix, latest, new Set())
  assert.equal(update.triggered, true)
  assert.deepEqual(update.dirtiedCellKeys.sort(), ['r1.c1', 'r1.c2'])
  assert.deepEqual(update.advancedSymbols, ['AAPL'])
  assert.deepEqual(update.nextMarkers.AAPL, { date: '2026-04-12', accession: 'A1', form: '8-K' })
})

test('computeMatrixUpdate: freshly-tracked symbol seeds marker without dirtying cells', () => {
  const matrix: WatchedMatrix = {
    id: 'm1',
    orgId: 'org-1',
    rows: [{ id: 'r1', ticker: 'AAPL' }],
    columns: [{ id: 'c1' }],
    cells: {},
    lastFilingMarkers: {},
  }
  const latest = new Map<string, LatestFiling>([
    ['AAPL', { symbol: 'AAPL', date: '2026-04-12', accession: 'A1', form: '10-Q' }],
  ])
  const update = computeMatrixUpdate(matrix, latest, new Set(['AAPL']))
  assert.equal(update.triggered, false, 'first observation must not dirty cells')
  assert.deepEqual(update.dirtiedCellKeys, [])
  assert.deepEqual(update.advancedSymbols, ['AAPL'])
})

test('computeMatrixUpdate: matrix already up-to-date is a complete no-op', () => {
  const matrix: WatchedMatrix = {
    id: 'm1',
    orgId: 'org-1',
    rows: [{ id: 'r1', ticker: 'AAPL' }],
    columns: [{ id: 'c1' }],
    cells: {},
    lastFilingMarkers: { AAPL: { date: '2026-04-12', accession: 'A1' } },
  }
  const latest = new Map<string, LatestFiling>([
    ['AAPL', { symbol: 'AAPL', date: '2026-04-12', accession: 'A1' }],
  ])
  const update = computeMatrixUpdate(matrix, latest, new Set())
  assert.equal(update.triggered, false)
  assert.deepEqual(update.dirtiedCellKeys, [])
  assert.deepEqual(update.advancedSymbols, [])
})

test('computeMatrixUpdate: only rows for the affected symbol are dirtied', () => {
  const matrix: WatchedMatrix = {
    id: 'm1',
    orgId: 'org-1',
    rows: [
      { id: 'r1', ticker: 'AAPL' },
      { id: 'r2', ticker: 'MSFT' },
    ],
    columns: [{ id: 'c1' }, { id: 'c2' }],
    cells: {},
    lastFilingMarkers: {
      AAPL: { date: '2026-04-11' },
      MSFT: { date: '2026-04-11' },
    },
  }
  const latest = new Map<string, LatestFiling>([
    ['AAPL', { symbol: 'AAPL', date: '2026-04-12', accession: 'A1' }],
    ['MSFT', { symbol: 'MSFT', date: '2026-04-11' }], // unchanged
  ])
  const update = computeMatrixUpdate(matrix, latest, new Set())
  assert.deepEqual(update.dirtiedCellKeys.sort(), ['r1.c1', 'r1.c2'])
  assert.deepEqual(update.advancedSymbols, ['AAPL'])
})

// ── Orchestrator (with fake DB + fetcher + injected withOrgContext) ─────────

interface FakeMatrixRow {
  id: string
  orgId: string
  rows: Array<{ id: string; ticker?: string }>
  columns: Array<{ id: string }>
  cells: Record<string, { state: string; text?: string; dirty?: boolean }>
  lastFilingMarkers: Record<string, { date: string; accession?: string; form?: string }>
  rerunOnFiling: boolean
}

interface CapturedUpdate {
  matrixId: string
  via: 'heartbeat' | 'orgContext'
  set: Record<string, unknown>
}

/**
 * Build a minimal in-memory stand-in for the parts of `db` the watcher
 * touches: a chained `select…from…where`, and a chained `update…set…where`.
 * The fake also serves as the `tx` argument injected via `withOrgContext`,
 * so both the heartbeat path and the cells-write path land in the same
 * captured-updates array.
 */
function makeFakeDb(rows: FakeMatrixRow[]) {
  const updates: CapturedUpdate[] = []
  const matrixById = new Map(rows.map((r) => [r.id, r]))

  // The watcher processes matrices sequentially in the order returned by
  // `select()`. Each iteration produces exactly one `update().set().where()`
  // call (either heartbeat OR orgContext). We can therefore attribute each
  // captured write to the next matrix in line without parsing Drizzle's
  // opaque SQL AST. Heartbeat and orgContext chains share this counter.
  const watchedOrder = rows.filter((r) => r.rerunOnFiling)
  let currentIdx = 0

  function makeUpdateChain(via: 'heartbeat' | 'orgContext') {
    return () => {
      let captured: Record<string, unknown> = {}
      return {
        set(values: Record<string, unknown>) {
          captured = values
          return {
            where(predicate: unknown) {
              void predicate
              const target = watchedOrder[currentIdx]
              currentIdx++
              const targetId = target?.id ?? ''
              if (target) {
                if ('cells' in captured) target.cells = captured.cells as typeof target.cells
                if ('lastFilingMarkers' in captured) {
                  target.lastFilingMarkers = captured.lastFilingMarkers as typeof target.lastFilingMarkers
                }
              }
              void matrixById
              updates.push({ matrixId: targetId, via, set: captured })
              return Promise.resolve([])
            },
          }
        },
      }
    }
  }

  // The watcher walks watched matrices in `lastFilingCheckAt ASC NULLS
  // FIRST` order to give round-robin fairness when there are more unique
  // tickers than the per-tick symbol budget. Our fake honours the order
  // in which rows were passed to `makeFakeDb` (callers can pre-sort to
  // simulate "matrix A was polled most recently").
  const watchedView = () =>
    rows
      .filter((r) => r.rerunOnFiling)
      .map((r) => ({
        id: r.id,
        orgId: r.orgId,
        rows: r.rows,
        columns: r.columns,
        cells: r.cells,
        lastFilingMarkers: r.lastFilingMarkers,
      }))

  const fakeDb = {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                orderBy: () => Promise.resolve(watchedView()),
              }
            },
          }
        },
      }
    },
    update: makeUpdateChain('heartbeat'),
  }

  // The withOrgContext stub hands the callback a tx whose `update` lands in
  // the *same* captured array but tagged 'orgContext' so tests can assert
  // which path was taken.
  const txStub: TxLike = { update: makeUpdateChain('orgContext') as unknown as TxLike['update'] }
  const withOrgStub: WithOrgContextFn = async (_orgId, fn) => fn(txStub) as Promise<never>

  return { fakeDb, updates, withOrgStub }
}

test('tickFilingRerunWatcher: first poll seeds markers without dirtying any cells', async () => {
  const matrix: FakeMatrixRow = {
    id: 'm1',
    orgId: 'org-1',
    rows: [{ id: 'r1', ticker: 'AAPL' }],
    columns: [{ id: 'c1' }],
    cells: {},
    lastFilingMarkers: {},
    rerunOnFiling: true,
  }
  const { fakeDb, updates, withOrgStub } = makeFakeDb([matrix])
  const fetcher: FetchLatestFiling = async (sym) =>
    sym === 'AAPL' ? { symbol: 'AAPL', date: '2026-04-12', accession: 'A1', form: '10-Q' } : null

  const res = await tickFilingRerunWatcher({
    database: fakeDb as never,
    withOrgContext: withOrgStub,
    fetchLatestFiling: fetcher,
    now: () => new Date('2026-04-12T12:00:00Z'),
  })
  assert.equal(res.scannedMatrices, 1)
  assert.equal(res.scannedSymbols, 1)
  assert.equal(res.newFilings, 0)
  assert.equal(res.updates[0].triggered, false)
  assert.equal(updates.length, 1)
  // Marker write must go through the org-scoped path (RLS-safe).
  assert.equal(updates[0].via, 'orgContext')
  const set = updates[0].set
  assert.ok(set.lastFilingMarkers, 'seeded markers must be persisted')
  assert.equal(
    (set.lastFilingMarkers as Record<string, { date: string }>).AAPL.date,
    '2026-04-12',
  )
  // No cells were dirtied on the seed write.
  assert.deepEqual(Object.keys(set.cells as object), [])
})

test('tickFilingRerunWatcher: real new filing dirties matched cells and preserves prior state', async () => {
  const matrix: FakeMatrixRow = {
    id: 'm1',
    orgId: 'org-1',
    rows: [
      { id: 'r1', ticker: 'AAPL' },
      { id: 'r2', ticker: 'MSFT' },
    ],
    columns: [{ id: 'c1' }, { id: 'c2' }],
    cells: {
      'r1.c1': { state: 'done', text: 'old answer' },
      'r2.c1': { state: 'done', text: 'msft answer' },
    },
    lastFilingMarkers: { AAPL: { date: '2026-04-11' }, MSFT: { date: '2026-04-11' } },
    rerunOnFiling: true,
  }
  const { fakeDb, updates, withOrgStub } = makeFakeDb([matrix])
  const fetcher: FetchLatestFiling = async (sym) => {
    if (sym === 'AAPL') return { symbol: 'AAPL', date: '2026-04-12', accession: 'A1', form: '8-K' }
    if (sym === 'MSFT') return { symbol: 'MSFT', date: '2026-04-11', accession: 'M1' }
    return null
  }

  const res = await tickFilingRerunWatcher({
    database: fakeDb as never,
    withOrgContext: withOrgStub,
    fetchLatestFiling: fetcher,
    now: () => new Date('2026-04-12T12:00:00Z'),
  })
  assert.equal(res.newFilings, 2, 'two AAPL cells dirtied (c1 + c2)')
  assert.equal(res.updates[0].triggered, true)
  assert.deepEqual(res.updates[0].dirtiedCellKeys.sort(), ['r1.c1', 'r1.c2'])
  // The single update must:
  //   - keep r1.c1's prior text
  //   - add `dirty: true` on both r1 cells
  //   - leave r2.c1 untouched (different ticker, no new filing)
  const last = updates.at(-1)!
  assert.equal(last.via, 'orgContext', 'cells write must go through RLS-bound tx')
  const cells = last.set.cells as Record<string, { state: string; text?: string; dirty?: boolean }>
  assert.equal(cells['r1.c1'].dirty, true)
  assert.equal(cells['r1.c1'].text, 'old answer', 'prior text must be preserved')
  assert.equal(cells['r1.c2'].dirty, true)
  assert.equal(cells['r2.c1'].dirty, undefined, 'unaffected row stays clean')
  assert.equal(cells['r2.c1'].text, 'msft answer')
  // Marker advanced for AAPL only.
  const markers = last.set.lastFilingMarkers as Record<string, { date: string }>
  assert.equal(markers.AAPL.date, '2026-04-12')
  assert.equal(markers.MSFT.date, '2026-04-11')
})

test('tickFilingRerunWatcher: matrix already up-to-date only stamps the heartbeat', async () => {
  const matrix: FakeMatrixRow = {
    id: 'm1',
    orgId: 'org-1',
    rows: [{ id: 'r1', ticker: 'AAPL' }],
    columns: [{ id: 'c1' }],
    cells: { 'r1.c1': { state: 'done', text: 'fresh' } },
    lastFilingMarkers: { AAPL: { date: '2026-04-12', accession: 'A1' } },
    rerunOnFiling: true,
  }
  const { fakeDb, updates, withOrgStub } = makeFakeDb([matrix])
  const fetcher: FetchLatestFiling = async () => ({
    symbol: 'AAPL', date: '2026-04-12', accession: 'A1', form: '10-Q',
  })

  const res = await tickFilingRerunWatcher({
    database: fakeDb as never,
    withOrgContext: withOrgStub,
    fetchLatestFiling: fetcher,
    now: () => new Date('2026-04-12T12:00:00Z'),
  })
  assert.equal(res.newFilings, 0)
  assert.equal(updates.length, 1, 'one heartbeat update')
  assert.equal(updates[0].via, 'heartbeat')
  const set = updates[0].set
  // Heartbeat path only writes the timestamp — no cells, no markers.
  assert.ok('lastFilingCheckAt' in set)
  assert.equal('cells' in set, false)
  assert.equal('lastFilingMarkers' in set, false)
})

test('tickFilingRerunWatcher: unknown ticker (fetcher returns null) is skipped without aborting tick', async () => {
  const matrix: FakeMatrixRow = {
    id: 'm1',
    orgId: 'org-1',
    rows: [
      { id: 'r1', ticker: 'AAPL' },
      { id: 'r2', ticker: 'PRIVATECO' }, // not in EDGAR
    ],
    columns: [{ id: 'c1' }],
    cells: {},
    lastFilingMarkers: { AAPL: { date: '2026-04-11' } },
    rerunOnFiling: true,
  }
  const { fakeDb, updates, withOrgStub } = makeFakeDb([matrix])
  const fetcher: FetchLatestFiling = async (sym) =>
    sym === 'AAPL' ? { symbol: 'AAPL', date: '2026-04-12', accession: 'A1' } : null

  const res = await tickFilingRerunWatcher({
    database: fakeDb as never,
    withOrgContext: withOrgStub,
    fetchLatestFiling: fetcher,
    now: () => new Date('2026-04-12T12:00:00Z'),
  })
  assert.equal(res.scannedSymbols, 2)
  assert.equal(res.newFilings, 1)
  const last = updates.at(-1)!
  const cells = last.set.cells as Record<string, { state: string; dirty?: boolean }>
  assert.equal(cells['r1.c1'].dirty, true)
  assert.equal(cells['r2.c1'], undefined, 'unknown-ticker row stays untouched')
})

test('tickFilingRerunWatcher: round-robin fairness — over-cap matrices are skipped this tick and picked up next', async () => {
  // Six matrices, each watching one unique ticker. With a per-tick cap of
  // 3 symbols the first tick must cover the first 3 (ASC NULLS FIRST →
  // input order in the fake) and skip the remaining 3 entirely. Crucially
  // the skipped matrices must NOT have their heartbeat stamped, otherwise
  // they'd never make it back to the front of the queue.
  const tickers = ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'NVDA', 'META']
  const matrices: FakeMatrixRow[] = tickers.map((t, i) => ({
    id: `m${i + 1}`,
    orgId: 'org-1',
    rows: [{ id: 'r1', ticker: t }],
    columns: [{ id: 'c1' }],
    cells: {},
    lastFilingMarkers: {},
    rerunOnFiling: true,
  }))
  const { fakeDb, updates, withOrgStub } = makeFakeDb(matrices)
  const fetched = new Set<string>()
  const fetcher: FetchLatestFiling = async (sym) => {
    fetched.add(sym)
    return { symbol: sym, date: '2026-04-12', accession: `${sym}-1` }
  }

  const res = await tickFilingRerunWatcher({
    database: fakeDb as never,
    withOrgContext: withOrgStub,
    fetchLatestFiling: fetcher,
    now: () => new Date('2026-04-12T12:00:00Z'),
    maxSymbolsPerTick: 3,
  })

  // Only the first 3 symbols were polled; only those 3 matrices were
  // processed — the cap held and the rest were left for next tick.
  assert.equal(res.scannedMatrices, 3, 'only matrices whose tickers fit the cap were processed')
  assert.equal(res.scannedSymbols, 3)
  assert.equal(fetched.size, 3)
  assert.deepEqual([...fetched].sort(), ['AAPL', 'GOOG', 'MSFT'])

  // Persisted writes only for the 3 included matrices.
  const writtenIds = new Set(updates.map((u) => u.matrixId))
  assert.equal(writtenIds.size, 3, 'skipped matrices must not be written (no heartbeat starvation)')
})

test('tickFilingRerunWatcher: matrix whose tickers are already covered by the cap still gets evaluated this tick', async () => {
  // Two matrices share the same single ticker. Cap = 1. Both must be
  // processed: the second matrix doesn't add a new symbol, so it's free
  // to ride along on the first matrix's lookup. This guards against an
  // overly-aggressive "stop iterating once cap hit" implementation.
  const matrices: FakeMatrixRow[] = [
    {
      id: 'm1',
      orgId: 'org-1',
      rows: [{ id: 'r1', ticker: 'AAPL' }],
      columns: [{ id: 'c1' }],
      cells: {},
      lastFilingMarkers: { AAPL: { date: '2026-04-11' } },
      rerunOnFiling: true,
    },
    {
      id: 'm2',
      orgId: 'org-2',
      rows: [{ id: 'r1', ticker: 'AAPL' }],
      columns: [{ id: 'c1' }],
      cells: {},
      lastFilingMarkers: { AAPL: { date: '2026-04-11' } },
      rerunOnFiling: true,
    },
  ]
  const { fakeDb, updates, withOrgStub } = makeFakeDb(matrices)
  const fetcher: FetchLatestFiling = async (sym) =>
    sym === 'AAPL' ? { symbol: 'AAPL', date: '2026-04-12', accession: 'A1' } : null

  const res = await tickFilingRerunWatcher({
    database: fakeDb as never,
    withOrgContext: withOrgStub,
    fetchLatestFiling: fetcher,
    now: () => new Date('2026-04-12T12:00:00Z'),
    maxSymbolsPerTick: 1,
  })

  assert.equal(res.scannedMatrices, 2, 'both shared-ticker matrices fit under the cap')
  assert.equal(res.scannedSymbols, 1)
  const writtenIds = new Set(updates.map((u) => u.matrixId))
  assert.deepEqual([...writtenIds].sort(), ['m1', 'm2'])
})
