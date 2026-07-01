/**
 * Tests for the filing-signal watcher.
 *
 * The watcher is the cron hook that scores recent SEC filings for every
 * watchlisted ticker and pins a Live Highlight + fires an alert for any
 * filing scoring at/above the org's `filingScoreThreshold`. These tests
 * cover both the pure helpers (`monitoredSymbolsFor`, `qualifyingFilings`)
 * and the full `tickFilingSignalWatcher` orchestration via an injected
 * fake DB (cross-org settings scan) + injected `loadOrgConfig`,
 * `scoreFilings`, and `recordHighlight`.
 *
 * Scenarios covered:
 *
 *   1. Pure helpers: monitored-set derivation (watchlist + ad-hoc −
 *      disabled, case-insensitive, blanks dropped), qualifying-filing
 *      filtering (threshold, missing accession, in-batch dedupe).
 *   2. Happy path: a qualifying filing is routed to `recordHighlight` and
 *      counted as pinned.
 *   3. Below-threshold filings are scanned but never pinned.
 *   4. Idempotency: a `recordHighlight` that reports `pinned:false`
 *      (dedup no-op) is counted as qualifying but not pinned.
 *   5. Resilience: a `scoreFilings` throw for one symbol does not abort
 *      the org or the tick.
 *   6. Disabled orgs are skipped (loadOrgConfig returns null).
 *   7. Per-org and per-tick caps bound the work done.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  monitoredSymbolsFor,
  qualifyingFilings,
  tickFilingSignalWatcher,
  type OrgConfig,
  type LoadOrgConfigFn,
  type ScoreFilingsFn,
  type RecordHighlightFn,
} from '../filing-signal-watcher.ts'
import type { LiveHighlightsSettings, ScoredFiling } from '../live-highlights.ts'

// ── Pure helpers ────────────────────────────────────────────────────────────

test('monitoredSymbolsFor: union of watchlist + ad-hoc, minus disabled, upper-cased', () => {
  const out = monitoredSymbolsFor(['aapl', 'MSFT'], {
    adHocSymbols: ['nvda', 'aapl'], // aapl dupes watchlist
    disabledSymbols: ['msft'],
  })
  assert.deepEqual(out.sort(), ['AAPL', 'NVDA'])
})

test('monitoredSymbolsFor: blanks and whitespace are dropped', () => {
  const out = monitoredSymbolsFor(['  aapl ', '', '   '], {
    adHocSymbols: [' '],
    disabledSymbols: [],
  })
  assert.deepEqual(out, ['AAPL'])
})

test('monitoredSymbolsFor: disable wins even when also ad-hoc', () => {
  const out = monitoredSymbolsFor(['AAPL'], {
    adHocSymbols: ['NVDA'],
    disabledSymbols: ['NVDA'],
  })
  assert.deepEqual(out, ['AAPL'])
})

test('qualifyingFilings: keeps only score >= threshold with a real accession', () => {
  const filings: ScoredFiling[] = [
    { accession: 'A1', symbol: 'AAPL', formType: '8-K', score: 80, filedAt: null, attribution: '', materialSections: [] },
    { accession: 'A2', symbol: 'AAPL', formType: '10-Q', score: 70, filedAt: null, attribution: '', materialSections: [] },
    { accession: 'A3', symbol: 'AAPL', formType: '10-K', score: 69, filedAt: null, attribution: '', materialSections: [] },
    { accession: '', symbol: 'AAPL', formType: '8-K', score: 95, filedAt: null, attribution: '', materialSections: [] },
  ]
  const out = qualifyingFilings(filings, 70)
  assert.deepEqual(out.map((f) => f.accession), ['A1', 'A2'])
})

test('qualifyingFilings: de-dupes by normalised accession within the batch', () => {
  const filings: ScoredFiling[] = [
    { accession: '0000320193-26-0001', symbol: 'AAPL', formType: '8-K', score: 90, filedAt: null, attribution: '', materialSections: [] },
    { accession: '000032019326 0001', symbol: 'AAPL', formType: '8-K', score: 88, filedAt: null, attribution: '', materialSections: [] },
  ]
  // Different punctuation/spacing but same digits → one survivor.
  const out = qualifyingFilings(filings, 70)
  assert.equal(out.length, 1)
  assert.equal(out[0].accession, '0000320193-26-0001')
})

test('qualifyingFilings: non-finite scores are excluded', () => {
  const filings: ScoredFiling[] = [
    { accession: 'A1', symbol: 'AAPL', formType: null, score: Number.NaN, filedAt: null, attribution: '', materialSections: [] },
  ]
  assert.deepEqual(qualifyingFilings(filings, 70), [])
})

// ── Orchestrator (with injected fakes) ──────────────────────────────────────

function makeSettings(overrides: Partial<LiveHighlightsSettings> = {}): LiveHighlightsSettings {
  return {
    enabled: true,
    blueprintId: null,
    disabledSymbols: [],
    adHocSymbols: [],
    deliveryChannels: { bell: true, email: false, slack: false },
    slackWebhookUrl: null,
    emailRecipients: [],
    filingScoreThreshold: 70,
    ...overrides,
  } as LiveHighlightsSettings
}

/** Fake owner-DB whose select→from→where resolves the enabled org rows. */
function makeFakeDb(orgIds: string[]) {
  return {
    select() {
      return {
        from() {
          return {
            where: () => Promise.resolve(orgIds.map((orgId) => ({ orgId }))),
          }
        },
      }
    },
  }
}

function filing(accession: string, score: number, symbol = 'AAPL'): ScoredFiling {
  return { accession, symbol, formType: '8-K', score, filedAt: null, attribution: '', materialSections: [] }
}

test('tickFilingSignalWatcher: routes a qualifying filing to recordHighlight and counts it pinned', async () => {
  const fakeDb = makeFakeDb(['org-1'])
  const cfg: OrgConfig = { settings: makeSettings(), monitoredSymbols: ['AAPL'] }
  const loadOrgConfig: LoadOrgConfigFn = async () => cfg
  const scoreFilings: ScoreFilingsFn = async () => [filing('A1', 85)]
  const recorded: string[] = []
  const recordHighlight: RecordHighlightFn = async ({ filing }) => {
    recorded.push(filing.accession)
    return { pinned: true, noteId: 'n1', notification: null }
  }

  const res = await tickFilingSignalWatcher({
    database: fakeDb as never,
    loadOrgConfig,
    scoreFilings,
    recordHighlight,
  })

  assert.equal(res.scannedOrgs, 1)
  assert.equal(res.scannedSymbols, 1)
  assert.equal(res.qualifyingFilings, 1)
  assert.equal(res.pinned, 1)
  assert.deepEqual(recorded, ['A1'])
})

test('tickFilingSignalWatcher: below-threshold filings are scanned but never pinned', async () => {
  const fakeDb = makeFakeDb(['org-1'])
  const loadOrgConfig: LoadOrgConfigFn = async () => ({
    settings: makeSettings({ filingScoreThreshold: 90 }),
    monitoredSymbols: ['AAPL'],
  })
  const scoreFilings: ScoreFilingsFn = async () => [filing('A1', 80), filing('A2', 88)]
  let calls = 0
  const recordHighlight: RecordHighlightFn = async () => {
    calls++
    return { pinned: true, noteId: 'n', notification: null }
  }

  const res = await tickFilingSignalWatcher({
    database: fakeDb as never,
    loadOrgConfig,
    scoreFilings,
    recordHighlight,
  })

  assert.equal(res.qualifyingFilings, 0)
  assert.equal(res.pinned, 0)
  assert.equal(calls, 0, 'recordHighlight is never invoked below threshold')
})

test('tickFilingSignalWatcher: dedup no-op (pinned:false) counts as qualifying but not pinned', async () => {
  const fakeDb = makeFakeDb(['org-1'])
  const loadOrgConfig: LoadOrgConfigFn = async () => ({
    settings: makeSettings(),
    monitoredSymbols: ['AAPL'],
  })
  const scoreFilings: ScoreFilingsFn = async () => [filing('A1', 85)]
  const recordHighlight: RecordHighlightFn = async () => ({ pinned: false, noteId: null, notification: null })

  const res = await tickFilingSignalWatcher({
    database: fakeDb as never,
    loadOrgConfig,
    scoreFilings,
    recordHighlight,
  })

  assert.equal(res.qualifyingFilings, 1)
  assert.equal(res.pinned, 0, 'an already-seen filing is not double-counted as pinned')
})

test('tickFilingSignalWatcher: a scoreFilings throw for one symbol does not abort the tick', async () => {
  const fakeDb = makeFakeDb(['org-1'])
  const loadOrgConfig: LoadOrgConfigFn = async () => ({
    settings: makeSettings(),
    monitoredSymbols: ['BAD', 'AAPL'],
  })
  const scoreFilings: ScoreFilingsFn = async (_org, symbol) => {
    if (symbol === 'BAD') throw new Error('actor exploded')
    return [filing('A1', 85)]
  }
  const recordHighlight: RecordHighlightFn = async () => ({ pinned: true, noteId: 'n', notification: null })

  const res = await tickFilingSignalWatcher({
    database: fakeDb as never,
    loadOrgConfig,
    scoreFilings,
    recordHighlight,
  })

  assert.equal(res.scannedSymbols, 2, 'both symbols are attempted')
  assert.equal(res.pinned, 1, 'the healthy symbol still pins')
})

test('tickFilingSignalWatcher: disabled orgs (loadOrgConfig null) are skipped', async () => {
  const fakeDb = makeFakeDb(['org-off', 'org-on'])
  const loadOrgConfig: LoadOrgConfigFn = async (orgId) =>
    orgId === 'org-on' ? { settings: makeSettings(), monitoredSymbols: ['AAPL'] } : null
  const scoreFilings: ScoreFilingsFn = async () => [filing('A1', 85)]
  const recordHighlight: RecordHighlightFn = async () => ({ pinned: true, noteId: 'n', notification: null })

  const res = await tickFilingSignalWatcher({
    database: fakeDb as never,
    loadOrgConfig,
    scoreFilings,
    recordHighlight,
  })

  assert.equal(res.scannedOrgs, 1, 'only the enabled org is scanned')
  assert.equal(res.pinned, 1)
})

test('tickFilingSignalWatcher: per-org symbol cap bounds the lookups', async () => {
  const fakeDb = makeFakeDb(['org-1'])
  const loadOrgConfig: LoadOrgConfigFn = async () => ({
    settings: makeSettings(),
    monitoredSymbols: ['A', 'B', 'C', 'D'],
  })
  const scored: string[] = []
  const scoreFilings: ScoreFilingsFn = async (_org, symbol) => {
    scored.push(symbol)
    return []
  }
  const recordHighlight: RecordHighlightFn = async () => ({ pinned: true, noteId: 'n', notification: null })

  const res = await tickFilingSignalWatcher({
    database: fakeDb as never,
    loadOrgConfig,
    scoreFilings,
    recordHighlight,
    maxSymbolsPerOrg: 2,
  })

  assert.equal(res.scannedSymbols, 2)
  assert.deepEqual(scored, ['A', 'B'])
})

test('tickFilingSignalWatcher: per-tick lookup cap halts further work across orgs', async () => {
  const fakeDb = makeFakeDb(['org-1', 'org-2'])
  const loadOrgConfig: LoadOrgConfigFn = async () => ({
    settings: makeSettings(),
    monitoredSymbols: ['A', 'B'],
  })
  let totalScored = 0
  const scoreFilings: ScoreFilingsFn = async () => {
    totalScored++
    return []
  }
  const recordHighlight: RecordHighlightFn = async () => ({ pinned: true, noteId: 'n', notification: null })

  const res = await tickFilingSignalWatcher({
    database: fakeDb as never,
    loadOrgConfig,
    scoreFilings,
    recordHighlight,
    maxLookupsPerTick: 3,
  })

  assert.equal(res.scannedSymbols, 3, 'global cap stops the 4th lookup')
  assert.equal(totalScored, 3)
})
