/**
 * Integration test for Live Highlights persistence (task #320).
 *
 * Pins the contract that:
 *   1. A fresh user/org sees default settings + the seeded default
 *      watchlist on first read.
 *   2. Mutations to settings (`adHocSymbols`, `disabledSymbols`) and to
 *      the watchlist (add / remove) round-trip through Postgres and are
 *      visible on a subsequent read.
 *   3. Two consecutive `tickLiveHighlights` calls against the same call
 *      produce no duplicate pins and no duplicate notifications. The
 *      composite primary key on `live_highlights_pins` and the
 *      deterministic `id` on `live_highlights_notifications` are the
 *      authoritative dedup guards — this test pins that contract.
 *   4. Mutations and dedup state survive a "simulated restart". The
 *      engine and watchlist store are fully DB-driven on every tick (no
 *      in-process cursor cache), so re-reading after the second tick is
 *      operationally indistinguishable from "process restarted, then
 *      read/ticked again". A third tick after that re-read also
 *      produces no duplicates, proving the persisted dedup state is
 *      what's keeping the engine honest.
 *
 * Strategy
 * ────────
 * - `PLATFORM_OPEN_MODE=1` is asserted at the top so any helper that
 *   reaches `auth-server` resolves to the demo principal without
 *   contacting Clerk. This test does not exercise route handlers, but
 *   the env flip keeps the harness self-contained.
 * - `live-events-source` is mocked via `node:test`'s experimental
 *   module-mock API so `liveSelection()` returns a single, fixed call
 *   whose `startedAt` is far enough in the past that every transcript
 *   chunk is revealed AND the call has already ended in a single tick.
 *   That gives us a deterministic, fully-pinned + end-of-call-notified
 *   transcript to dedup against.
 * - `agent-executor.executeAgent` is mocked to return a `RunOutput`
 *   whose `summary` contains the literal token `kind: kpi_change`. The
 *   engine's `parseKindFromOutput` picks that up and the chunk is
 *   pinned. Mocking out the LLM call keeps the test deterministic and
 *   completely free of network / API-key dependencies in CI.
 * - The published "live-highlights" Blueprint is seeded into the DB up
 *   front via `ensureSeedBlueprints`, mirroring what `instrumentation.ts`
 *   does on server boot. Without this, `resolveBlueprintForOrg` returns
 *   null in a fresh database and the engine never even attempts to pin.
 *
 * The mock requires `--experimental-test-module-mocks`, which is wired
 * into `pnpm test` via `artifacts/platform/package.json`.
 */

// ── 1) Force the demo principal BEFORE importing any auth-touching
//    module. Mirrors the pattern in `copilot-deck-route-integration.test.ts`.
process.env.PLATFORM_OPEN_MODE = '1'

import { test, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'

// Resolve module URLs relative to *this* test file so mock.module keeps
// working regardless of repo checkout location. Same pattern as the
// other module-mock tests in this folder.
const LIVE_EVENTS_SOURCE_URL = new URL('../live-events-source.ts', import.meta.url).href
const AGENT_EXECUTOR_URL     = new URL('../agent-executor.ts',     import.meta.url).href

// `server-only` is a runtime no-op marker that Next.js resolves to its
// `empty.js` entry via the `react-server` export condition. The Node
// test runner doesn't set that condition, so the package's default
// `index.js` loads — and it throws on purpose ("can only be used from
// a Server Component"). We're already in a server-side test context,
// so swap the module out for an empty namespace before the engine
// modules are imported in `before()`.
mock.module('server-only', { namedExports: {} })

// `live-events-pure` provides the `callKey` derivation we want to keep
// real (so the engine's persisted `call_key` matches what a production
// call would produce). The mock below re-exports it directly.
import { callKey as pureCallKey, type LiveCall } from '../live-events-pure.ts'

// ── 2) Build a deterministic "live call" ──────────────────────────────────
// startedAt = 500 seconds ago. The engine's chunk script has 12 chunks
// at 35s intervals (last chunk at 11*35 + jitter ≈ 389s) and `callHasEnded`
// triggers at lastChunkSec + 35 ≈ 424s, so 500s ago guarantees:
//   • every chunk is `chunksRevealedAt`
//   • the call is reported as ended
//   • the engine fires both the first-pin AND end-of-call notification
//     in a single tick — exactly the surface we want to dedup against.
const FIXED_START_MS = Date.now() - 500_000
const FIXED_CALL: LiveCall = {
  symbol:    'AAPL',
  name:      'Apple Inc.',
  sector:    'Technology',
  event:     'Q1 2026 Earnings Call',
  startedAt: new Date(FIXED_START_MS).toISOString(),
  listeners: 1234,
}

// Synthetic 12-chunk transcript. Shape MUST match the engine's
// `LiveChunk` interface exactly — `idx`, `startSec`, `speaker`, `role`,
// `text`, `kind`, `headline`. `kind` here is the seed-script hint; the
// engine's pinning decision comes from the Blueprint classifier
// (mocked below), so this field is just shape-keeping.
interface MockChunk {
  idx:      number
  startSec: number
  speaker:  string
  role:     string
  text:     string
  kind:     'management_commentary' | 'kpi_change' | 'qa_standout' | 'none'
  headline: string
}
const MOCK_SCRIPT: Omit<MockChunk, 'idx' | 'startSec'>[] = Array.from({ length: 12 }, (_, i) => ({
  speaker:  'CEO',
  role:     'CEO',
  kind:     'kpi_change',
  headline: `Synthetic chunk ${i}`,
  text:     `Synthetic transcript chunk ${i} for the persistence test.`,
}))

// Mirrors `chunksForCall` in `live-events-source.ts` so the engine's
// per-chunk dedup keys (chunk.idx) line up with what it would compute
// against the real source.
function mockChunksForCall(call: LiveCall): MockChunk[] {
  const jitter = (call.symbol.charCodeAt(0) + call.symbol.charCodeAt(1) || 0) % 7
  return MOCK_SCRIPT.map((c, i) => ({ ...c, idx: i, startSec: i * 35 + jitter }))
}
function mockChunksRevealedAt(call: LiveCall, now: Date = new Date()): MockChunk[] {
  const elapsedSec = (now.getTime() - new Date(call.startedAt).getTime()) / 1000
  return mockChunksForCall(call).filter((c) => c.startSec <= elapsedSec)
}
function mockCallHasEnded(call: LiveCall, now: Date = new Date()): boolean {
  const elapsedSec = (now.getTime() - new Date(call.startedAt).getTime()) / 1000
  const lastChunk = mockChunksForCall(call).at(-1)
  if (!lastChunk) return true
  return elapsedSec >= lastChunk.startSec + 35
}
function mockFmtTimestamp(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── 3) Mock `live-events-source` BEFORE importing `live-highlights`. ──────
// `live-highlights.ts` imports `liveSelection`, `callKey`, `callHasEnded`,
// `chunksForCall`, `chunksRevealedAt`, `fmtTimestamp` and the LiveCall /
// LiveChunk types from this module. Types disappear at runtime; we
// only need to provide the named function exports.
mock.module(LIVE_EVENTS_SOURCE_URL, {
  namedExports: {
    liveSelection:    () => [FIXED_CALL],
    callKey:          pureCallKey,
    callHasEnded:     mockCallHasEnded,
    chunksForCall:    mockChunksForCall,
    chunksRevealedAt: mockChunksRevealedAt,
    fmtTimestamp:     mockFmtTimestamp,
    COMPANIES:        [],
  },
})

// ── 4) Mock `agent-executor.executeAgent` ─────────────────────────────────
// The engine calls the executor twice per pinnable chunk (classify +
// summarize). We return a `RunOutput` whose summary contains the
// literal `kind: kpi_change` token so `parseKindFromOutput` extracts a
// non-`none` verdict. `harvestTickers` is also exported by the real
// module so we provide a no-op stub (other modules import it; we don't
// want their import to break if they happen to be loaded transitively).
let executeAgentCallCount = 0
mock.module(AGENT_EXECUTOR_URL, {
  namedExports: {
    executeAgent: async () => {
      executeAgentCallCount += 1
      return {
        headline: 'Mocked KPI highlight (persistence test)',
        summary:
          'kind: kpi_change — Synthetic mocked summary for the persistence test. ' +
          'No real LLM provider was contacted. — Analysis is AI-generated; verify before acting.',
        findings:  [],
        sources:   [],
        model:     'mock',
        provider:  'fallback' as const,
        latencyMs: 1,
        ok:        true,
      }
    },
    harvestTickers: () => [],
  },
})

// ── 5) NOW import the modules under test (post mock.module). ──────────────
// Importing `@workspace/db` for cleanup is fine before the mocks
// because it has no transitive coupling to the mocked modules.
import { eq } from 'drizzle-orm'
import {
  withComplianceContext,
  liveHighlightsSettingsTable,
  liveHighlightsCallsTable,
  liveHighlightsPinsTable,
  liveHighlightsNotificationsTable,
  watchlistsTable,
} from '@workspace/db'

type LhMod = typeof import('../live-highlights.ts')
type WlMod = typeof import('../watchlist-store.ts')
let lh: LhMod
let wl: WlMod

const TEST_USER_ID = 'user_test_persistence'

// Each test run uses a unique synthetic Clerk-shaped org id so cases
// never bleed into one another in the shared development DB.
function freshOrg(label: string): string {
  return `org_test_lh_persist_${label}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

const createdOrgs: string[] = []

before(async () => {
  // The published "live-highlights" Blueprint is what `resolveBlueprintForOrg`
  // falls back to for any org that hasn't picked a custom one. On a
  // freshly-pushed schema (CI) it isn't installed yet, so seed it now —
  // this mirrors `instrumentation.ts` running on the Next.js server.
  const seeds = await import('../blueprint-seeds.ts')
  await seeds.ensureSeedBlueprints()

  // Now (and only now — after both mock.module calls) load the modules
  // under test so the engine binds to our deterministic stubs.
  lh = await import('../live-highlights.ts')
  wl = await import('../watchlist-store.ts')
})

after(async () => {
  // Best-effort cleanup of every persistent table this test writes
  // into. Failures here must NOT mask test failures, hence try/catch
  // around each org's teardown.
  for (const org of createdOrgs) {
    try {
      await withComplianceContext(org, async (tx) => {
        await tx.delete(liveHighlightsPinsTable).where(eq(liveHighlightsPinsTable.orgId, org))
        await tx.delete(liveHighlightsNotificationsTable).where(eq(liveHighlightsNotificationsTable.orgId, org))
        await tx.delete(liveHighlightsCallsTable).where(eq(liveHighlightsCallsTable.orgId, org))
        await tx.delete(liveHighlightsSettingsTable).where(eq(liveHighlightsSettingsTable.orgId, org))
        await tx.delete(watchlistsTable).where(eq(watchlistsTable.orgId, org))
      })
    } catch {
      /* swallow — cleanup is best-effort, the test result is what matters */
    }
  }
})

test('Live Highlights: settings + watchlist mutations + two consecutive ticks produce no duplicate pins / notifications and survive a simulated restart', async () => {
  const org = freshOrg('main')
  createdOrgs.push(org)

  // ── 1. Fresh user/org sees default settings (engine creates the row
  //    lazily on first write; the read returns defaults).
  const initial = await lh.getLiveHighlightsSettings(org)
  assert.equal(initial.enabled, true, 'fresh org must start with engine enabled')
  assert.deepEqual(initial.adHocSymbols, [], 'fresh org must start with no ad-hoc symbols')
  assert.deepEqual(initial.disabledSymbols, [], 'fresh org must start with no disabled symbols')

  // ── 2. Mutate settings: opt explicitly into AAPL via adHocSymbols
  //    and opt out of TSLA via disabledSymbols.
  const patched = await lh.updateLiveHighlightsSettings(org, {
    adHocSymbols:    ['AAPL'],
    disabledSymbols: ['TSLA'],
  })
  assert.deepEqual(patched.adHocSymbols, ['AAPL'])
  assert.deepEqual(patched.disabledSymbols, ['TSLA'])

  // ── 3. Fresh user/org gets the seeded default watchlist on first read.
  const seededWl = await wl.getWatchlist(org)
  assert.deepEqual(
    seededWl,
    ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META'],
    'fresh org must be seeded with the default watchlist',
  )

  // ── 4. Mutate watchlist: add AMZN, remove NVDA.
  await wl.addToWatchlist(org, 'AMZN')
  const trimmed = await wl.removeFromWatchlist(org, 'NVDA')
  assert.ok(trimmed.includes('AMZN'),  'AMZN should be present after add')
  assert.ok(!trimmed.includes('NVDA'), 'NVDA should be absent after remove')

  // ── 5. Tick #1 — process the entire mocked call. Expectations:
  //    a) one active call (AAPL), reported ended
  //    b) at least one new pin (the engine pins every classified chunk,
  //       and our mock executor classifies every chunk as kpi_change)
  //    c) exactly two new notifications: one `first_pin` and one
  //       `end_of_call` rollup.
  const tick1 = await lh.tickLiveHighlights({
    orgId:     org,
    userId:    TEST_USER_ID,
    watchlist: trimmed,
  })
  assert.equal(tick1.enabled, true)
  assert.equal(tick1.activeCalls.length, 1, `expected one active call, got ${JSON.stringify(tick1.activeCalls)}`)
  assert.equal(tick1.activeCalls[0].symbol, 'AAPL')
  assert.equal(tick1.activeCalls[0].ended, true, 'mocked call (started 500s ago) should be reported as ended')

  const pinsAfterFirstTick = tick1.newPins.length
  assert.ok(
    pinsAfterFirstTick > 0,
    `expected at least one pin from tick #1, got ${pinsAfterFirstTick} (executor calls so far: ${executeAgentCallCount})`,
  )
  assert.deepEqual(
    tick1.newNotifications.map((n) => n.kind).sort(),
    ['end_of_call', 'first_pin'],
    'tick #1 must produce exactly one first_pin + one end_of_call notification',
  )

  // Snapshot the persisted state — this is the dedup baseline tick #2
  // and tick #3 must match.
  const dbPinsAfter1 = await withComplianceContext(org, (tx) =>
    tx.select().from(liveHighlightsPinsTable).where(eq(liveHighlightsPinsTable.orgId, org)),
  )
  const dbNotifsAfter1 = await withComplianceContext(org, (tx) =>
    tx.select().from(liveHighlightsNotificationsTable).where(eq(liveHighlightsNotificationsTable.orgId, org)),
  )
  assert.equal(
    dbPinsAfter1.length,
    pinsAfterFirstTick,
    'persisted pin count must match tick #1 newPins (no silent extra inserts)',
  )
  assert.equal(dbNotifsAfter1.length, 2, 'persisted notification count must be exactly 2 after tick #1')

  // ── 6. Tick #2 — same call, same time. The engine reads its cursor +
  //    flag state and the dedup guards (pin PK, deterministic notif id)
  //    from Postgres on every tick — no in-process cursor cache. So
  //    this tick is operationally indistinguishable from "process
  //    restarted, then ticked again". Must produce zero new pins and
  //    zero new notifications.
  const tick2 = await lh.tickLiveHighlights({
    orgId:     org,
    userId:    TEST_USER_ID,
    watchlist: trimmed,
  })
  assert.equal(tick2.activeCalls.length, 1)
  assert.equal(tick2.newPins.length, 0,          'tick #2 must not produce any new pins')
  assert.equal(tick2.newNotifications.length, 0, 'tick #2 must not produce any new notifications')

  const dbPinsAfter2 = await withComplianceContext(org, (tx) =>
    tx.select().from(liveHighlightsPinsTable).where(eq(liveHighlightsPinsTable.orgId, org)),
  )
  const dbNotifsAfter2 = await withComplianceContext(org, (tx) =>
    tx.select().from(liveHighlightsNotificationsTable).where(eq(liveHighlightsNotificationsTable.orgId, org)),
  )
  assert.equal(dbPinsAfter2.length,   dbPinsAfter1.length,   'pin count must NOT grow on tick #2')
  assert.equal(dbNotifsAfter2.length, dbNotifsAfter1.length, 'notification count must NOT grow on tick #2')

  // ── 7. Simulated restart — re-read settings + watchlist. Both stores
  //    pull straight from Postgres on every read, so re-reading after
  //    the dedup tick IS the post-restart contract: any value that
  //    survives this re-read survives a real restart.
  const settingsAfterRestart = await lh.getLiveHighlightsSettings(org)
  assert.deepEqual(
    settingsAfterRestart.adHocSymbols, ['AAPL'],
    'adHocSymbols mutation must survive a simulated restart',
  )
  assert.deepEqual(
    settingsAfterRestart.disabledSymbols, ['TSLA'],
    'disabledSymbols mutation must survive a simulated restart',
  )
  const watchlistAfterRestart = await wl.getWatchlist(org)
  assert.ok(
    watchlistAfterRestart.includes('AMZN'),
    'added watchlist ticker (AMZN) must survive a simulated restart',
  )
  assert.ok(
    !watchlistAfterRestart.includes('NVDA'),
    'removed watchlist ticker (NVDA) must NOT reappear after a simulated restart',
  )

  // ── 8. Tick #3 — after the simulated restart re-read. Still no
  //    duplicates. This is the strongest single assertion in the test:
  //    the persisted dedup state alone is what stops the engine from
  //    re-pinning the same call after a restart.
  const tick3 = await lh.tickLiveHighlights({
    orgId:     org,
    userId:    TEST_USER_ID,
    watchlist: watchlistAfterRestart,
  })
  assert.equal(tick3.newPins.length, 0,          'tick #3 (post-restart) must not produce any new pins')
  assert.equal(tick3.newNotifications.length, 0, 'tick #3 (post-restart) must not produce any new notifications')

  const dbPinsFinal = await withComplianceContext(org, (tx) =>
    tx.select().from(liveHighlightsPinsTable).where(eq(liveHighlightsPinsTable.orgId, org)),
  )
  const dbNotifsFinal = await withComplianceContext(org, (tx) =>
    tx.select().from(liveHighlightsNotificationsTable).where(eq(liveHighlightsNotificationsTable.orgId, org)),
  )
  assert.equal(dbPinsFinal.length,   dbPinsAfter1.length, 'final pin count must equal post-tick-#1 baseline')
  assert.equal(dbNotifsFinal.length, dbNotifsAfter1.length, 'final notification count must equal post-tick-#1 baseline')

  // Pin the dedup contract explicitly: every persisted pin row must
  // have a unique (call_key, chunk_idx) tuple. The composite primary
  // key on `live_highlights_pins` would already raise on a duplicate
  // INSERT, but pinning it here keeps the contract obvious to anyone
  // reading the test.
  const seenPinKeys = new Set<string>()
  for (const row of dbPinsFinal) {
    const k = `${row.callKey}::${row.chunkIdx}`
    assert.ok(!seenPinKeys.has(k), `duplicate persisted pin row for ${k}`)
    seenPinKeys.add(k)
  }
  // Same contract for notifications: the deterministic id (`${callKey}:first:${noteId}`
  // and `${callKey}:end`) is the dedup guard. Verify uniqueness.
  const seenNotifIds = new Set<string>()
  for (const row of dbNotifsFinal) {
    assert.ok(!seenNotifIds.has(row.id), `duplicate persisted notification id ${row.id}`)
    seenNotifIds.add(row.id)
  }
})
