/**
 * Integration test for `POST /api/copilot/deck` (banker-pitch template).
 *
 * Where the unit suite (`banker-pitch-data.test.ts`) drives the
 * assemblers in isolation, this suite drives the *route handler* itself
 * end-to-end:
 *
 *   1. body validation + ticker normalisation
 *   2. workspace overrides → `assembleBankerPitch` opts
 *   3. peer-set lookup via the real database (RLS-scoped, seeded row)
 *   4. PPTX render through the real `renderDeck` pipeline
 *   5. download URL returned to the caller (via the memo-store handoff)
 *
 * Strategy
 * ────────
 * - `PLATFORM_OPEN_MODE=1` (set in CI / `replit.toml`) is asserted at
 *   load time so `auth()` resolves to the demo principal without hitting
 *   Clerk. The seeded peer set is namespaced under that demo org so
 *   teardown is trivial.
 * - `globalThis.fetch` is replaced with a per-test stub that intercepts
 *   every internal `${baseUrl}/api/...` call and every `financialmodelingprep.com`
 *   URL. Anything not whitelisted returns 404, so an unstubbed regression
 *   that adds a new upstream call fails loudly here instead of silently
 *   making a real network request from CI.
 * - `lib/memo-store.putMemo` is mocked via `node:test`'s experimental
 *   module-mock API. We capture the buffer the route hands off so the
 *   test can verify the bytes are a valid PPTX (PK signature + sane
 *   length) without writing anything to GCS / App Storage.
 *
 * The mock requires `--experimental-test-module-mocks`, which is wired
 * into `pnpm test` via `package.json`.
 */

// ── 1) Force the demo principal BEFORE the route module is imported. ───────
// `auth-server.ts` reads `PLATFORM_OPEN_MODE` at import time via the
// `OPEN_MODE` constant in `lib/open-mode.ts`. The Replit dev container
// always has it set to "1" but we re-assert here so the test is self-
// contained when run from a vanilla shell.
process.env.PLATFORM_OPEN_MODE = '1'

import { test, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
// Resolve the memo-store module path relative to *this* test file so the
// mock keeps working regardless of where the repo is checked out. Using a
// `file://` URL is what `mock.module` normalises to internally, so we
// pass it directly. We use `new URL(..., import.meta.url)` (the same
// pattern other tests in this folder use, see `connectors-crypto.test.ts`)
// because `import.meta.dirname` is undefined under tsx's CJS transpile.
const MEMO_STORE_URL = new URL('../memo-store.ts', import.meta.url).href

// ── 2) Mock the memo store BEFORE importing the route. ────────────────────
// The route's `import { putMemo } from '@/lib/memo-store'` resolves to
// the same absolute path as the URL we register here. Using an absolute
// path keeps the mock robust to changes in CWD.
interface CapturedPutMemoCall {
  buffer:   Buffer
  filename: string
  ticker:   string
  userId:   string | null
  template?: string
  slides?:  number
}
const memoCalls: CapturedPutMemoCall[] = []
let nextFakeFileId = 1
mock.module(MEMO_STORE_URL, {
  namedExports: {
    putMemo: async (input: CapturedPutMemoCall) => {
      memoCalls.push(input)
      const fileId = `test-fileid-${nextFakeFileId++}`
      return {
        fileId,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        bytes: input.buffer.byteLength,
      }
    },
    listForUser: async () => [],
    getMemo: async () => null,
  },
})

// ── 3) Pull in DB helpers eagerly; route is loaded lazily *after* the
//    mock above so ESM import hoisting doesn't bind the real `putMemo`
//    into the route's module scope before `mock.module()` runs.
import { NextRequest } from 'next/server'
import {
  withClerkContext,
  peerSetsTable,
  peerSetMembersTable,
} from '@workspace/db'
import { eq } from 'drizzle-orm'
type DeckRoute = typeof import('../../app/api/copilot/deck/route.ts')
let deckRoute: DeckRoute

const DEMO_ORG_ID = 'org_demo_open_mode'
const DEMO_USER_ID = 'user_demo_open_mode'
const PK_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04])

// ── 4) Fetch stubbing harness. ────────────────────────────────────────────
type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>
// Capture the genuine `fetch` *exactly once* at module-eval time. If
// `installFetchStub` re-assigned `originalFetch` on every call it would
// "restore" to a previous stub on teardown when several tests run
// in-process (which is the default for the node:test runner).
const ORIGINAL_FETCH: typeof globalThis.fetch = globalThis.fetch
const fetchedUrls: string[] = []

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function installFetchStub(handler: FetchHandler) {
  fetchedUrls.length = 0
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : (input?.url || '')
    const u = String(url)
    fetchedUrls.push(u)
    return await handler(u, init)
  }) as typeof globalThis.fetch
}

function restoreFetch() {
  globalThis.fetch = ORIGINAL_FETCH
}

// A canned subject + peer quote response that gives the assembler enough
// to emit a 52-week band, a peer-comp band, and a quote-derived peer
// table. Anything missing degrades gracefully — that's the point of the
// "lots of small upstream sources" architecture.
function buildDefaultFetchHandler(opts: { newsArticles?: unknown[] } = {}): FetchHandler {
  const news = opts.newsArticles ?? [
    { title: 'MSFT lifts FY guidance on Azure strength', publishedAt: '2026-04-25T13:00:00Z', source: 'Reuters' },
  ]
  return (url: string) => {
    if (url.includes('/api/quote?symbol=MSFT')) {
      return jsonResp({
        symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', sector: 'Technology',
        price: 400, yearLow: 350, yearHigh: 450,
        pe: 30, ps: 12, evEbitda: 22, sharesOut: 7_500_000_000,
        marketCap: 3_000_000_000_000, revenue: 260_000_000_000,
        description: 'Microsoft develops software.',
        totalDebt: 100_000_000_000, cash: 50_000_000_000,
      })
    }
    if (url.includes('/api/quote?symbol=')) {
      // Generic peer quote — the route's `loadAugmentedQuote` extracts
      // the ticker; we echo a sane payload for any peer.
      const m = /symbol=([A-Za-z0-9.\-]+)/.exec(url)
      const sym = m ? m[1].toUpperCase() : 'X'
      return jsonResp({
        symbol: sym, name: sym, price: 150 + sym.length,
        marketCap: 1_500_000_000_000, pe: 25, ps: 6, evEbitda: 20,
        sharesOut: 5_000_000_000, revenue: 200_000_000_000,
      })
    }
    if (url.includes('/api/financials/statements')) {
      // A handful of LTM-quarter rows so the memo's KPI tiles compute.
      if (url.includes('income-statement') && url.includes('quarter')) {
        return jsonResp({
          rows: [
            { revenue: 65e9, operatingIncome: 30e9, depreciationAndAmortization: 2e9 },
            { revenue: 64e9, operatingIncome: 29e9, depreciationAndAmortization: 2e9 },
            { revenue: 63e9, operatingIncome: 28e9, depreciationAndAmortization: 2e9 },
            { revenue: 62e9, operatingIncome: 27e9, depreciationAndAmortization: 2e9 },
          ],
        })
      }
      return jsonResp({ rows: [] })
    }
    if (url.includes('/api/financials/segments')) return jsonResp({})
    if (url.includes('/api/estimates'))           return jsonResp({ symbol: 'MSFT', quarterly: [] })
    if (url.includes('/api/news'))                return jsonResp({ articles: news })
    // Block any FMP / external upstream — the test must not hit the
    // open internet under any circumstance.
    if (url.includes('financialmodelingprep.com')) return jsonResp([], 200)
    // Anything else returns 404 so the assembler degrades gracefully and
    // the test still completes deterministically.
    return jsonResp({}, 404)
  }
}

// Shape the route's downstream `defaultDcfFetcher` defers to the in-process
// `/api/dcf` POST handler. That handler uses real upstream financial data
// which we have intentionally stubbed out, so DCF will return null and the
// assembler will skip the DCF band. This is the expected production
// behavior when financials API keys are unavailable, and the deck still
// renders without a DCF row in the football field.

// ── 5) Helper that builds a NextRequest mirroring what the front-end sends ─
function buildDeckRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:80/api/copilot/deck', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── 6) DB seeding helpers (RLS-scoped, demo org) ───────────────────────────
async function seedPeerSet(symbols: string[], name: string): Promise<string> {
  return withClerkContext(DEMO_ORG_ID, DEMO_USER_ID, async (tx) => {
    const [row] = await tx
      .insert(peerSetsTable)
      .values({
        orgId: DEMO_ORG_ID,
        authorUserId: DEMO_USER_ID,
        name,
        description: 'Seeded by deck route integration test',
      })
      .returning()
    if (symbols.length > 0) {
      await tx.insert(peerSetMembersTable).values(
        symbols.map((symbol, i) => ({
          setId: row.id,
          orgId: DEMO_ORG_ID,
          symbol: symbol.toUpperCase(),
          position: i,
        })),
      )
    }
    return row.id as string
  })
}

async function deletePeerSet(setId: string) {
  // Ownership is enforced by the `peer_sets_delete` RLS policy; demo
  // user is the author by construction.
  await withClerkContext(DEMO_ORG_ID, DEMO_USER_ID, async (tx) => {
    await tx.delete(peerSetsTable).where(eq(peerSetsTable.id, setId))
  })
}

// Track every peer-set we create so we can nuke them on teardown — the
// dev DB is shared across tests and we don't want to leak rows.
const createdSetIds: string[] = []

before(async () => {
  // Sanity check: the auth-server demo principal must be active. If a
  // future change breaks `PLATFORM_OPEN_MODE`, fail with a clear message
  // before we accidentally call Clerk in CI.
  const { OPEN_MODE } = await import('../open-mode.ts')
  assert.equal(OPEN_MODE, true, 'PLATFORM_OPEN_MODE must be enabled for the route to resolve a demo principal')
  // Now (and only now — after mock.module ran at top level) load the
  // route handler; its `import { putMemo }` will resolve to the mock.
  deckRoute = await import('../../app/api/copilot/deck/route.ts')
})

after(async () => {
  for (const id of createdSetIds) {
    try { await deletePeerSet(id) } catch { /* best-effort cleanup */ }
  }
  restoreFetch()
})

// ── 7) Default-peers path ──────────────────────────────────────────────────

test('POST /api/copilot/deck (banker-pitch) returns a downloadable PPTX using the assembler default peer set', async () => {
  installFetchStub(buildDefaultFetchHandler())
  memoCalls.length = 0

  const req = buildDeckRequest({ template: 'banker-pitch', ticker: 'MSFT' })
  const res = await deckRoute.POST(req)
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${await res.clone().text()}`)
  const body = await res.json() as {
    template:    string
    fileId:      string
    filename:    string
    bytes:       number
    expiresAt:   number
    ticker:      string
    slideTitles: string[]
    downloadUrl: string
    rateLimit:   { remaining: number; resetAt: number }
  }

  // Response shape contract — the company-page UI relies on every one
  // of these fields.
  assert.equal(body.template, 'banker-pitch')
  assert.equal(body.ticker, 'MSFT')
  assert.match(body.filename, /^MSFT.*\.pptx$/)
  assert.ok(body.bytes > 5000, `expected non-trivial pptx bytes, got ${body.bytes}`)
  assert.match(body.fileId, /^test-fileid-/, 'fileId must be the one returned by the mocked memo store')
  assert.match(body.downloadUrl, /\/api\/copilot\/memo\/test-fileid-/, `downloadUrl must point at the memo download endpoint, got: ${body.downloadUrl}`)
  assert.ok(Array.isArray(body.slideTitles) && body.slideTitles.length >= 3,
    `expected slideTitles to enumerate at least cover + body + sources, got: ${JSON.stringify(body.slideTitles)}`)
  assert.match(body.slideTitles[0], /^MSFT · /, `cover slide must be first, got: ${body.slideTitles[0]}`)
  assert.equal(body.slideTitles[body.slideTitles.length - 1], 'Data Sources Used', 'sources slide must be last')

  // Rate-limit headers are present and decreasing
  assert.ok(res.headers.get('X-RateLimit-Limit'), 'X-RateLimit-Limit header should be set')
  assert.ok(Number(res.headers.get('X-RateLimit-Remaining')) >= 0)

  // The route must have handed a real PPTX buffer to putMemo
  assert.equal(memoCalls.length, 1, 'expected exactly one putMemo call')
  const stored = memoCalls[0]
  assert.ok(stored.buffer.subarray(0, 4).equals(PK_SIG),
    'memo store must receive a real PPTX buffer (PK zip signature)')
  assert.equal(stored.template, 'banker-pitch')
  assert.equal(stored.ticker, 'MSFT')
  assert.equal(stored.userId, DEMO_USER_ID, 'putMemo userId must be the demo principal')

  // Default-peer path: the assembler uses DEFAULT_PEERS['MSFT'] = AAPL/GOOGL/AMZN.
  // Confirm the fetch stub saw quote calls for at least one of them — that
  // proves the route forwarded "no peer override" rather than silently
  // skipping the peer fan-out.
  const defaultPeerHits = fetchedUrls.filter(u =>
    /\/api\/quote\?symbol=(AAPL|GOOGL|AMZN)\b/.test(u))
  assert.ok(defaultPeerHits.length >= 1,
    `expected default-peer quote fetches (AAPL/GOOGL/AMZN), saw: ${fetchedUrls.filter(u => u.includes('/api/quote')).slice(0, 10).join('\n')}`)
})

// ── 8) peerSetId path ──────────────────────────────────────────────────────

test('POST /api/copilot/deck resolves `peerSetId` via the database (RLS-scoped) and uses those tickers', async () => {
  installFetchStub(buildDefaultFetchHandler())
  memoCalls.length = 0

  // Seed a workspace peer set with a deliberately distinctive ticker
  // list so we can prove via the fetch stub that the route resolved
  // *this* set (not the assembler default).
  const distinctivePeers = ['ORCL', 'CRM', 'SAP']
  const setId = await seedPeerSet(distinctivePeers, `int-test-${randomUUID()}`)
  createdSetIds.push(setId)

  const req = buildDeckRequest({
    template:       'banker-pitch',
    ticker:         'MSFT',
    peerSetId:      setId,
    wacc:           0.10,
    terminalGrowth: 0.03,
  })
  const res = await deckRoute.POST(req)
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${await res.clone().text()}`)
  const body = await res.json() as { fileId: string; downloadUrl: string; ticker: string }
  assert.equal(body.ticker, 'MSFT')
  assert.match(body.downloadUrl, /\/api\/copilot\/memo\/test-fileid-/)

  // The route must have resolved the peerSetId → tickers and threaded
  // them into `assembleBankerPitch`. We assert by inspecting which
  // /api/quote calls the assembler issued.
  const peerHits = fetchedUrls
    .map(u => /\/api\/quote\?symbol=([A-Z0-9.\-]+)/i.exec(u)?.[1]?.toUpperCase())
    .filter((s): s is string => !!s && s !== 'MSFT')
  for (const expected of distinctivePeers) {
    assert.ok(peerHits.includes(expected),
      `expected peer-set ticker "${expected}" to be queried, saw quote fetches for: ${peerHits.join(', ')}`)
  }
  // And it must NOT have queried the default-peer fallback list.
  assert.ok(!peerHits.includes('AAPL'),
    `default-peer fallback (AAPL) leaked through despite peerSetId override; saw: ${peerHits.join(', ')}`)
  assert.ok(!peerHits.includes('GOOGL'),
    `default-peer fallback (GOOGL) leaked through despite peerSetId override; saw: ${peerHits.join(', ')}`)

  // Mocked memo store still received the real PPTX bytes.
  assert.equal(memoCalls.length, 1)
  assert.ok(memoCalls[0].buffer.subarray(0, 4).equals(PK_SIG))
})

// ── 9) Body-validation contract ────────────────────────────────────────────

test('POST /api/copilot/deck rejects an obviously bad ticker before doing any work', async () => {
  installFetchStub(buildDefaultFetchHandler())
  memoCalls.length = 0

  const res = await deckRoute.POST(buildDeckRequest({ template: 'banker-pitch', ticker: 'not-a-ticker!!!' }))
  assert.equal(res.status, 400)
  const body = await res.json() as { error: string }
  assert.match(body.error, /doesn't look like a US-listed ticker/)
  // Validation must short-circuit before the memo store is called.
  assert.equal(memoCalls.length, 0, 'memo store must not be invoked on a 400')
})

test('POST /api/copilot/deck rejects an unknown template name', async () => {
  installFetchStub(buildDefaultFetchHandler())
  memoCalls.length = 0

  const res = await deckRoute.POST(buildDeckRequest({ template: 'banker-pitch-v2', ticker: 'MSFT' }))
  assert.equal(res.status, 400)
  const body = await res.json() as { error: string }
  assert.match(body.error, /Unknown template/)
  assert.equal(memoCalls.length, 0)
})

// ── 10) peer-comparison: fetch stub ────────────────────────────────────────
//
// The peer-comparison assembler only calls /api/quote and /api/estimates
// per symbol (via `buildPeerRow` in `lib/peer-compare-core.ts`). We need
// a dedicated stub that handles those two endpoints for any ticker so we
// can exercise the peer-comparison route branch without hitting the network.

function buildPeerComparisonFetchHandler(): FetchHandler {
  return (url: string) => {
    if (url.includes('/api/quote?symbol=')) {
      const m = /symbol=([A-Za-z0-9.\-]+)/i.exec(url)
      const sym = m ? m[1].toUpperCase() : 'X'
      return jsonResp({
        symbol: sym, name: `${sym} Corp`, price: 150 + sym.length,
        marketCap: 1_500_000_000_000,
        pe: 25, ps: 6, evEbitda: 20,
        sharesOut: 5_000_000_000, revenue: 200_000_000_000,
      })
    }
    if (url.includes('/api/estimates?symbol=')) {
      return jsonResp({ symbol: 'X', estimatesAnnual: [] })
    }
    // Block external upstreams to catch regressions early.
    if (url.includes('financialmodelingprep.com')) return jsonResp([], 200)
    return jsonResp({}, 404)
  }
}

// ── 11) peer-comparison: explicit symbols[] path ────────────────────────────

test('POST /api/copilot/deck (peer-comparison) returns a downloadable PPTX for an explicit symbols list', async () => {
  installFetchStub(buildPeerComparisonFetchHandler())
  memoCalls.length = 0

  const req = buildDeckRequest({
    template: 'peer-comparison',
    symbols:  ['AAPL', 'MSFT', 'GOOGL'],
    setName:  'Mega-Cap Tech Test',
  })
  const res = await deckRoute.POST(req)
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${await res.clone().text()}`)
  const body = await res.json() as {
    template:    string
    fileId:      string
    filename:    string
    bytes:       number
    slideTitles: string[]
    downloadUrl: string
    rateLimit:   { remaining: number; resetAt: number }
  }

  // Response shape contract
  assert.equal(body.template, 'peer-comparison')
  assert.match(body.filename, /Peer Comparison\.pptx$/)
  assert.ok(body.bytes > 5000, `expected non-trivial pptx bytes, got ${body.bytes}`)
  assert.match(body.fileId, /^test-fileid-/, 'fileId must be the one returned by the mocked memo store')
  assert.match(body.downloadUrl, /\/api\/copilot\/memo\/test-fileid-/)

  // Slide titles contract: cover + at least peer table + sources
  assert.ok(Array.isArray(body.slideTitles) && body.slideTitles.length >= 3,
    `expected at least cover + peer table + sources; got: ${JSON.stringify(body.slideTitles)}`)
  assert.ok(body.slideTitles[0].includes('Mega-Cap Tech Test'),
    `cover slide must include the set name, got: ${body.slideTitles[0]}`)
  assert.equal(body.slideTitles[body.slideTitles.length - 1], 'Data Sources Used',
    'sources slide must be last')

  // Verify a real PPTX buffer landed in the memo store
  assert.equal(memoCalls.length, 1, 'expected exactly one putMemo call')
  assert.ok(memoCalls[0].buffer.subarray(0, 4).equals(PK_SIG),
    'memo store must receive a real PPTX buffer (PK zip signature)')
  assert.equal(memoCalls[0].template, 'peer-comparison')

  // Rate-limit headers are present
  assert.ok(res.headers.get('X-RateLimit-Limit'), 'X-RateLimit-Limit header should be set')
  assert.ok(Number(res.headers.get('X-RateLimit-Remaining')) >= 0)

  // Confirm quote fetches fired for all three symbols
  for (const sym of ['AAPL', 'MSFT', 'GOOGL']) {
    assert.ok(
      fetchedUrls.some(u => u.includes(`/api/quote?symbol=${sym}`)),
      `expected a /api/quote call for ${sym}, saw: ${fetchedUrls.filter(u => u.includes('/api/quote')).join(', ')}`,
    )
  }
})

// ── 12) peer-comparison: peerSetId path ─────────────────────────────────────

test('POST /api/copilot/deck (peer-comparison) resolves peerSetId from the database and fetches quotes', async () => {
  installFetchStub(buildPeerComparisonFetchHandler())
  memoCalls.length = 0

  const setSymbols = ['NVDA', 'AMD', 'INTC']
  const setId = await seedPeerSet(setSymbols, `peer-cmp-deck-test-${randomUUID()}`)
  createdSetIds.push(setId)

  const req = buildDeckRequest({
    template:  'peer-comparison',
    peerSetId: setId,
    subject:   'NVDA',
  })
  const res = await deckRoute.POST(req)
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${await res.clone().text()}`)
  const body = await res.json() as {
    template:    string
    fileId:      string
    filename:    string
    bytes:       number
    slideTitles: string[]
    downloadUrl: string
    ticker:      string
  }

  assert.equal(body.template, 'peer-comparison')
  assert.ok(body.bytes > 5000, `expected non-trivial pptx bytes, got ${body.bytes}`)
  assert.equal(body.slideTitles[body.slideTitles.length - 1], 'Data Sources Used',
    'sources slide must be last')
  // Subject (NVDA) propagates into `ticker` field of the response.
  assert.equal(body.ticker, 'NVDA',
    `expected ticker to reflect the subject ticker, got: ${body.ticker}`)
  // Full downloadable PPTX contract — same shape as the explicit-symbols path.
  assert.match(body.fileId, /^test-fileid-/,
    'fileId must be the one returned by the mocked memo store')
  assert.match(body.downloadUrl, /\/api\/copilot\/memo\/test-fileid-/,
    `downloadUrl must point at the memo download endpoint, got: ${body.downloadUrl}`)
  assert.match(body.filename, /Peer Comparison\.pptx$/)

  // Confirm that quote fetches were issued for every seeded symbol —
  // proving the route resolved the peerSetId → ticker list correctly.
  const quoteFetched = fetchedUrls
    .map(u => /\/api\/quote\?symbol=([A-Z0-9.\-]+)/i.exec(u)?.[1]?.toUpperCase())
    .filter((s): s is string => !!s)
  for (const sym of setSymbols) {
    assert.ok(quoteFetched.includes(sym),
      `expected quote fetch for seeded peer "${sym}", saw fetches for: ${quoteFetched.join(', ')}`)
  }

  assert.equal(memoCalls.length, 1)
  assert.ok(memoCalls[0].buffer.subarray(0, 4).equals(PK_SIG),
    'memo store must receive a real PPTX buffer')
})

// ── 13) peer-comparison: validation ─────────────────────────────────────────

test('POST /api/copilot/deck (peer-comparison) returns 400 when neither peerSetId nor symbols are provided', async () => {
  installFetchStub(buildPeerComparisonFetchHandler())
  memoCalls.length = 0

  const res = await deckRoute.POST(buildDeckRequest({ template: 'peer-comparison' }))
  assert.equal(res.status, 400, `expected 400 for missing symbols, got ${res.status}`)
  const body = await res.json() as { error: string }
  assert.match(body.error, /peerSetId|symbols/,
    `error message must mention peerSetId or symbols, got: "${body.error}"`)
  assert.equal(memoCalls.length, 0, 'memo store must not be called on a 400')
})

test('POST /api/copilot/deck (peer-comparison) returns 404 for a peerSetId that does not exist in the org', async () => {
  installFetchStub(buildPeerComparisonFetchHandler())
  memoCalls.length = 0

  const res = await deckRoute.POST(buildDeckRequest({
    template:  'peer-comparison',
    peerSetId: randomUUID(), // valid UUID format but not seeded
  }))
  assert.equal(res.status, 404, `expected 404 for unknown peer set, got ${res.status}`)
  const body = await res.json() as { error: string }
  assert.match(body.error, /[Pp]eer set/)
  assert.equal(memoCalls.length, 0, 'memo store must not be called on a 404')
})
