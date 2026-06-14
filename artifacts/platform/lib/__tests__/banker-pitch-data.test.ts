/**
 * Unit tests for `lib/banker-pitch-data.ts`.
 *
 * Validates the live-data adapters introduced for Task #235:
 *
 *   1. The football-field assembler builds bands from real per-share
 *      data (52-week range, peer-comp IQR per multiple, DCF sensitivity)
 *      mirroring the Valuations page logic.
 *   2. Catalysts are pulled from `/api/news` and formatted with
 *      "<date> — <headline> · <source>".
 *   3. Workspace overrides (`peers`, `wacc`, `terminalGrowth`) are
 *      threaded through and reflected in the resulting bands and the
 *      data-sources list.
 *
 * No real network calls — `globalThis.fetch` is replaced with a per-test
 * stub that intercepts the platform's internal endpoints and returns
 * canned responses.
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  assembleValuationBands,
  assembleRecentCatalysts,
  assembleBankerPitch,
  type DcfFetcher,
} from '../banker-pitch-data.ts'
import type { InvestmentMemoData } from '../investment-memo-pptx.ts'

// ── DCF fetcher stubs ─────────────────────────────────────────────────────
//
// `assembleValuationBands` accepts an injectable `dcfFetcher` option so
// tests don't need to mock the in-process `/api/dcf` handler (which would
// otherwise hit live financials providers). Production code uses
// `defaultDcfFetcher` which composes a NextRequest with the per-process
// internal-bypass token — see `lib/banker-pitch-data.ts`.
const dcfFetcherFactory = (payload: any | null): DcfFetcher => {
  return async () => payload
}

const BASE = 'http://test.local'

// ── Memo fixture used by `assembleValuationBands` & catalyst fallback ──────
const MEMO: InvestmentMemoData = {
  identity: { ticker: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', sector: 'Technology', industry: 'Software', country: 'US' },
  asOf: 'May 2026',
  sourceLine: 'Sources: test',
  overview: {
    description: 'Microsoft develops software.',
    segments: ['Cloud — 43%'],
    geography: ['US — 51%'],
    metrics: [
      { label: 'LTM Revenue', value: '$260.0B' },
      { label: 'LTM EBITDA',  value: '$130.0B' },
      { label: 'LTM EBITDA Margin', value: '50.0%' },
    ],
  },
  valuation: { current: [], historical: [], summary: [] },
  peers: [],
  transactions: [
    { date: '2024-03-01', acquirer: 'A', target: 'T1', evMm: '$10B', evRevenue: '6.0x', evEbitda: '20.0x' },
    { date: '2024-02-01', acquirer: 'B', target: 'T2', evMm: '$8B',  evRevenue: '4.0x', evEbitda: '15.0x' },
    { date: '2024-01-01', acquirer: 'C', target: 'T3', evMm: '$12B', evRevenue: '8.0x', evEbitda: '25.0x' },
  ],
  dcf: {
    assumptions: [], perShare: {
      enterpriseValue: '$3T', equityValue: '$3T', sharesOutstanding: '7.5B',
      intrinsicPerShare: '$400.00', currentPrice: '$370.00', upsidePct: '+8.1%',
    }, yearTable: [],
  },
  qualitative: {
    strengths: ['Cloud leadership'],
    risks: ['Regulatory'],
    catalysts: ['Templated catalyst A', 'Templated catalyst B'],
    esg: ['ESG note'],
  },
}

// ── Fetch stubbing harness ─────────────────────────────────────────────────
type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>
let originalFetch: typeof globalThis.fetch
function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
function installFetchStub(handler: FetchHandler) {
  originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : (input?.url || '')
    return await handler(String(url), init)
  }) as typeof globalThis.fetch
}

beforeEach(() => { /* per-test installs its own */ })
afterEach(() => { if (originalFetch) globalThis.fetch = originalFetch })

// ── 1) Football-field bands ────────────────────────────────────────────────

test('assembleValuationBands emits 52w + peer-comp + DCF bands in per-share scale', async () => {
  installFetchStub((url) => {
    // Subject quote
    if (url.includes('/api/quote?symbol=MSFT')) {
      return jsonResp({
        symbol: 'MSFT', price: 400, yearLow: 350, yearHigh: 450,
        pe: 32, ps: 12, evEbitda: 22, sharesOut: 7_500_000_000,
        totalDebt: 100_000_000_000, cash: 50_000_000_000,
      })
    }
    // Peer quotes
    if (url.includes('/api/quote?symbol=GOOGL')) return jsonResp({ symbol: 'GOOGL', price: 150, pe: 24, ps: 6, evEbitda: 18 })
    if (url.includes('/api/quote?symbol=AMZN'))  return jsonResp({ symbol: 'AMZN',  price: 180, pe: 46, ps: 3, evEbitda: 20 })
    if (url.includes('/api/quote?symbol=AAPL'))  return jsonResp({ symbol: 'AAPL',  price: 200, pe: 30, ps: 8, evEbitda: 24 })
    // key-metrics + ratios — return empty rows so the augmented loader
    // falls through to the quote-derived multiples we already provided.
    if (url.includes('/api/financials/statements')) return jsonResp({ rows: [] })
    return jsonResp({}, 404)
  })

  const out = await assembleValuationBands(BASE, 'MSFT', MEMO, {
    peers: ['GOOGL', 'AMZN', 'AAPL'],
    wacc: 0.085,
    terminalGrowth: 0.025,
    dcfFetcher: dcfFetcherFactory({
      intrinsicValuePerShare: 420,
      sensitivity: { values: [[380, 400, 420], [400, 420, 440], [420, 440, 460]] },
    }),
  })

  assert.equal(out.currentPrice, 400, 'subject price flows through')
  assert.equal(out.effectivePeers.length, 3)
  // 52-week band present
  const fiftyTwo = out.bands.find(b => b.method === '52-week stock price')
  assert.ok(fiftyTwo, '52w band should be present')
  assert.equal(fiftyTwo!.low, 350)
  assert.equal(fiftyTwo!.high, 450)
  // Peer-comp bands present (at least EV/EBITDA + P/E from supplied multiples)
  const peerBands = out.bands.filter(b => b.method.startsWith('Peer comps'))
  assert.ok(peerBands.length >= 2, `expected ≥2 peer-comp bands, got ${peerBands.length}: ${peerBands.map(b => b.method).join(', ')}`)
  // DCF band uses sensitivity min/max
  const dcfBand = out.bands.find(b => b.method.startsWith('DCF'))
  assert.ok(dcfBand, 'DCF band should be present')
  assert.equal(dcfBand!.low, 380)
  assert.equal(dcfBand!.high, 460)
  assert.ok(dcfBand!.method.includes('8.50% WACC'), `expected WACC label in band method, got "${dcfBand!.method}"`)
  assert.equal(out.dcfUsable, true)
  // Weighted mid is the mean of band midpoints
  assert.ok(out.weightedMid && out.weightedMid > 0, 'weightedMid should be positive')
})

test('assembleValuationBands incorporates transaction-comp IQR when memo carries deals', async () => {
  installFetchStub((url) => {
    if (url.includes('/api/quote?symbol=MSFT')) return jsonResp({
      symbol: 'MSFT', price: 400, yearLow: 350, yearHigh: 450,
      pe: 30, ps: 12, evEbitda: 22, sharesOut: 7_500_000_000,
      totalDebt: 100_000_000_000, cash: 50_000_000_000,
    })
    if (url.includes('/api/quote?symbol=')) return jsonResp({ symbol: 'X', price: 100, pe: 25, ps: 5, evEbitda: 20 })
    if (url.includes('/api/financials/statements')) return jsonResp({ rows: [] })
    return jsonResp({}, 404)
  })

  const out = await assembleValuationBands(BASE, 'MSFT', MEMO, {
    peers: ['GOOGL', 'AMZN', 'AAPL'],
    dcfFetcher: dcfFetcherFactory({ intrinsicValuePerShare: 410 }),
  })
  const txBands = out.bands.filter(b => b.method.startsWith('Precedent M&A'))
  assert.ok(txBands.length >= 1, `expected at least one transaction-comp band, got: ${out.bands.map(b => b.method).join(', ')}`)
  // EV/Revenue band: IQR of [4, 6, 8] is q1=5, q3=7. Subject revenue $260B,
  // so band EV is $1300B–$1820B. Net debt = $50B; shares = 7.5B → per-share
  // ≈ $166–$236.
  const evRev = txBands.find(b => b.method.includes('EV/Revenue'))
  if (evRev) {
    assert.ok(evRev.low > 100 && evRev.low < 200, `EV/Rev low out of expected range: ${evRev.low}`)
    assert.ok(evRev.high > evRev.low, 'EV/Rev high should exceed low')
  }
})

test('assembleValuationBands yields a DCF band with default ±15% even when sensitivity is absent', async () => {
  installFetchStub((url) => {
    if (url.includes('/api/quote?symbol=MSFT')) return jsonResp({ symbol: 'MSFT', price: 400, yearLow: 350, yearHigh: 450 })
    if (url.includes('/api/quote?symbol=')) return jsonResp({ symbol: 'X', price: 100, pe: 25 })
    if (url.includes('/api/financials/statements')) return jsonResp({ rows: [] })
    return jsonResp({}, 404)
  })
  const out = await assembleValuationBands(BASE, 'MSFT', MEMO, {
    peers: ['A', 'B', 'C'],
    dcfFetcher: dcfFetcherFactory({ intrinsicValuePerShare: 420 }),
  })
  const dcf = out.bands.find(b => b.method.startsWith('DCF'))
  assert.ok(dcf)
  assert.ok(Math.abs(dcf!.low  - 420 * 0.85) < 0.001, `expected DCF low = 357, got ${dcf!.low}`)
  assert.ok(Math.abs(dcf!.high - 420 * 1.15) < 0.001, `expected DCF high = 483, got ${dcf!.high}`)
})

// ── 2) Catalysts via /api/news ────────────────────────────────────────────

test('assembleRecentCatalysts pulls from /api/news and formats as date — title · source', async () => {
  installFetchStub((url) => {
    if (url.includes('/api/news')) {
      return jsonResp({
        articles: [
          { title: 'MSFT beats Q3 earnings, raises FY guidance', publishedAt: '2026-04-25T13:00:00Z', source: 'Reuters', sentiment: 'positive' },
          { title: 'Azure revenue accelerates to 32%',           publishedAt: '2026-04-20T09:00:00Z', source: 'Bloomberg' },
          { title: 'CFO announces $80B buyback',                 publishedAt: '2026-04-15T15:00:00Z', source: 'WSJ' },
        ],
      })
    }
    return jsonResp({}, 404)
  })

  const result = await assembleRecentCatalysts(BASE, 'MSFT', MEMO, 3)
  assert.equal(result.source, 'news', 'expected source tag = news when /api/news returned articles')
  assert.equal(result.themes.length, 0, 'themes must be empty when news has bullets — we do not pad real headlines with templated bullets')
  assert.equal(result.news.length, 3, `expected 3 news lines, got ${result.news.length}`)
  assert.match(result.news[0], /^2026-04-25 — MSFT beats Q3 earnings/, `unexpected first line format: ${result.news[0]}`)
  assert.match(result.news[0], /Reuters/, 'source should be appended')
  assert.match(result.news[0], /\(positive\)/, 'sentiment tag should appear when present')
})

test('assembleRecentCatalysts falls back to memo qualitative catalysts when /api/news is empty, tagging source=memo', async () => {
  installFetchStub((url) => {
    if (url.includes('/api/news')) return jsonResp({ articles: [] })
    return jsonResp({}, 404)
  })
  const result = await assembleRecentCatalysts(BASE, 'MSFT', MEMO, 4)
  assert.equal(result.source, 'memo', 'expected source tag = memo when /api/news was empty')
  assert.equal(result.news.length, 0, 'news must be empty when /api/news returned nothing')
  assert.deepEqual(result.themes, ['Templated catalyst A', 'Templated catalyst B'])
})

test('assembleRecentCatalysts returns empty groups + source=none when neither news nor memo themes are available', async () => {
  // Non-US ticker / fresh listing edge case: /api/news returned nothing
  // AND the memo carries no qualitative catalysts. The deck should be
  // able to skip the catalyst slides entirely without a placeholder.
  installFetchStub((url) => {
    if (url.includes('/api/news')) return jsonResp({ articles: [] })
    return jsonResp({}, 404)
  })
  const memoNoQualitative: InvestmentMemoData = {
    ...MEMO,
    qualitative: { strengths: [], risks: [], catalysts: [], esg: [] },
  }
  const result = await assembleRecentCatalysts(BASE, 'MSFT', memoNoQualitative, 4)
  assert.equal(result.source, 'none')
  assert.equal(result.news.length, 0)
  assert.equal(result.themes.length, 0)
})

test('assembleBankerPitch tags news catalysts as a "Recent news" group and attributes the news aggregator', async () => {
  // Tagged-news contract: when /api/news returns headlines, the deck
  // must (a) split them into a structured `news` group on the pitch so
  // the template can render a clearly-labelled "Recent news" slide,
  // (b) leave the templated `themes` group empty (no padding), and
  // (c) attribute the news aggregator on the data-sources slide.
  installFetchStub((url) => {
    if (url.includes('/api/quote?symbol=MSFT')) return jsonResp({
      symbol: 'MSFT', name: 'Microsoft', price: 400, yearLow: 350, yearHigh: 450,
      pe: 30, ps: 12, evEbitda: 22, sharesOut: 7_500_000_000,
      marketCap: 3_000_000_000_000, revenue: 260_000_000_000,
    })
    if (url.includes('/api/quote?symbol=')) return jsonResp({ symbol: 'X', price: 100, pe: 25, ps: 5, evEbitda: 20 })
    if (url.includes('/api/financials/statements')) return jsonResp({ rows: [] })
    if (url.includes('/api/news')) return jsonResp({ articles: [
      { title: 'Azure beats Street estimates', publishedAt: '2026-04-25T00:00:00Z', source: 'Reuters' },
      { title: 'Buyback expanded to $80B',     publishedAt: '2026-04-20T00:00:00Z', source: 'WSJ' },
    ] })
    return jsonResp({}, 404)
  })
  const { pitch } = await assembleBankerPitch(BASE, 'MSFT', {
    peers: ['GOOGL', 'AMZN'],
    dcfFetcher: dcfFetcherFactory({ intrinsicValuePerShare: 410 }),
  })
  // catalysts is structured, not a flat string[]
  assert.ok(pitch.catalysts && !Array.isArray(pitch.catalysts),
    `pitch.catalysts must be structured ({news, themes}), got: ${JSON.stringify(pitch.catalysts)}`)
  const groups = pitch.catalysts as { news?: string[]; themes?: string[] }
  assert.ok(groups.news && groups.news.length > 0, 'news group must be populated when /api/news returned headlines')
  assert.ok(groups.news!.some(l => l.includes('Azure beats')), `expected real headline in news group, got: ${JSON.stringify(groups.news)}`)
  assert.ok(!groups.themes || groups.themes.length === 0,
    `themes group must be empty / absent when news has bullets so we don't pad real headlines with templated ones; got: ${JSON.stringify(groups.themes)}`)

  const ds = pitch.dataSources || []
  assert.ok(ds.some(d => d.name === 'Finsyt news aggregator'),
    `news aggregator must be attributed when news bullets render; got: ${ds.map(d => d.name).join(', ')}`)
  assert.ok(!ds.some(d => d.name === 'Templated catalyst themes'),
    `templated-themes source must NOT be attributed when no themes group rendered; got: ${ds.map(d => d.name).join(', ')}`)
})

test('assembleBankerPitch tags fallback catalysts as a "Strategic themes" group and clearly attributes them as templated, not news', async () => {
  // Fallback-only contract: when /api/news returns nothing, the deck
  // must (a) put memo.qualitative.catalysts into a structured `themes`
  // group (not the `news` group) so the template renders a clearly-
  // labelled "Strategic themes" slide instead of an unmarked
  // "Catalysts" slide, (b) leave the `news` group empty, and (c)
  // attribute "Templated catalyst themes" on the data-sources slide
  // without listing the news aggregator.
  installFetchStub((url) => {
    if (url.includes('/api/quote?symbol=MSFT')) return jsonResp({
      symbol: 'MSFT', name: 'Microsoft', price: 400, yearLow: 350, yearHigh: 450,
      pe: 30, ps: 12, evEbitda: 22, sharesOut: 7_500_000_000,
      marketCap: 3_000_000_000_000, revenue: 260_000_000_000,
    })
    if (url.includes('/api/quote?symbol=')) return jsonResp({ symbol: 'X', price: 100, pe: 25, ps: 5, evEbitda: 20 })
    if (url.includes('/api/financials/statements')) return jsonResp({ rows: [] })
    if (url.includes('/api/news')) return jsonResp({ articles: [] }) // forces memo fallback
    return jsonResp({}, 404)
  })
  const { pitch } = await assembleBankerPitch(BASE, 'MSFT', {
    peers: ['GOOGL', 'AMZN'],
    dcfFetcher: dcfFetcherFactory({ intrinsicValuePerShare: 410 }),
  })
  assert.ok(pitch.catalysts && !Array.isArray(pitch.catalysts),
    `pitch.catalysts must be structured ({news, themes}), got: ${JSON.stringify(pitch.catalysts)}`)
  const groups = pitch.catalysts as { news?: string[]; themes?: string[] }
  assert.ok(!groups.news || groups.news.length === 0,
    `news group must be empty when /api/news returned nothing; got: ${JSON.stringify(groups.news)}`)
  // The memo's qualitative builder produces its own templated bullets
  // (sector / earnings / capital-allocation themes) when no real data
  // is available — assert the themes group is non-empty and looks like
  // generic memo themes rather than asserting exact strings the test
  // didn't author.
  assert.ok(groups.themes && groups.themes.length > 0,
    `themes group must mirror memo.qualitative.catalysts (non-empty); got: ${JSON.stringify(groups.themes)}`)

  const ds = pitch.dataSources || []
  assert.ok(!ds.some(d => d.name === 'Finsyt news aggregator'),
    `news aggregator must NOT be attributed when catalysts came from memo fallback; got: ${ds.map(d => d.name).join(', ')}`)
  const themesSrc = ds.find(d => d.name === 'Templated catalyst themes')
  assert.ok(themesSrc,
    `templated-themes source must be attributed when themes group renders; got: ${ds.map(d => d.name).join(', ')}`)
  assert.match(themesSrc!.detail || '', /\/api\/news returned no headlines/,
    `templated-themes detail should explain the fallback reason; got: "${themesSrc!.detail}"`)
})

// ── 3) End-to-end overrides ────────────────────────────────────────────────

test('assembleBankerPitch threads workspace overrides into the football-field DCF band & data sources', async () => {
  // The base assembler invokes assembleInvestmentMemoData, which fans out
  // many internal calls. We stub them all; missing routes return empty
  // shapes so the assembler degrades gracefully and we can still inspect
  // the football-field overrides.
  installFetchStub((url) => {
    if (url.includes('/api/quote?symbol=MSFT')) return jsonResp({
      symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', sector: 'Technology',
      price: 400, yearLow: 350, yearHigh: 450,
      pe: 30, ps: 12, evEbitda: 22, sharesOut: 7_500_000_000,
      marketCap: 3_000_000_000_000, revenue: 260_000_000_000,
      description: 'Microsoft develops software.',
    })
    if (url.includes('/api/quote?symbol=')) return jsonResp({ symbol: 'X', price: 100, pe: 25, ps: 5, evEbitda: 20 })
    if (url.includes('/api/financials/statements')) {
      // Provide a minimal income row so LTM helpers don't divide by zero.
      if (url.includes('income-statement') && url.includes('quarter')) {
        return jsonResp({ rows: [
          { revenue: 65e9, operatingIncome: 30e9, depreciationAndAmortization: 2e9 },
          { revenue: 64e9, operatingIncome: 29e9, depreciationAndAmortization: 2e9 },
          { revenue: 63e9, operatingIncome: 28e9, depreciationAndAmortization: 2e9 },
          { revenue: 62e9, operatingIncome: 27e9, depreciationAndAmortization: 2e9 },
        ] })
      }
      return jsonResp({ rows: [] })
    }
    if (url.includes('/api/financials/segments')) return jsonResp({})
    if (url.includes('/api/estimates')) return jsonResp({ symbol: 'MSFT', quarterly: [] })
    if (url.includes('/api/news')) return jsonResp({ articles: [
      { title: 'Headline A', publishedAt: '2026-04-25T00:00:00Z', source: 'Reuters' },
    ] })
    return jsonResp({}, 404)
  })

  const { pitch } = await assembleBankerPitch(BASE, 'MSFT', {
    peers: ['GOOGL', 'AMZN', 'AAPL'],
    wacc: 0.10,
    terminalGrowth: 0.03,
    dcfFetcher: dcfFetcherFactory({
      intrinsicValuePerShare: 410,
      sensitivity: { values: [[390, 410, 430]] },
    }),
  })

  assert.equal(pitch.ticker, 'MSFT')
  // Football field carries a DCF band labelled with the override values.
  const dcf = pitch.footballField?.bands.find(b => b.method.startsWith('DCF'))
  assert.ok(dcf, 'pitch should carry a DCF band')
  assert.match(dcf!.method, /10(\.\d+)?% WACC/,        `unexpected WACC label: ${dcf!.method}`)
  assert.match(dcf!.method, /3(\.\d+)?% terminal/,     `unexpected terminal label: ${dcf!.method}`)
  // 52-week band present
  assert.ok(pitch.footballField?.bands.some(b => b.method === '52-week stock price'),
    'pitch should carry a 52-week band')
  // Catalysts are split — the headline lands in the structured `news`
  // group (rendered as a "Recent news" slide), not the templated
  // `themes` group, so the analyst can tell at a glance it's a real
  // headline rather than a generic bullet.
  assert.ok(pitch.catalysts && !Array.isArray(pitch.catalysts),
    `pitch.catalysts must be the structured shape; got: ${JSON.stringify(pitch.catalysts)}`)
  const groups = pitch.catalysts as { news?: string[]; themes?: string[] }
  assert.ok(groups.news && groups.news[0].includes('Headline A'),
    `expected news headline in news group, got: ${JSON.stringify(groups.news)}`)
  // Data-sources section discloses the override + DCF assumption set
  const ds = pitch.dataSources || []
  assert.ok(ds.some(d => d.name === 'Workspace peer set'),
    `expected workspace peer set disclosure, got: ${ds.map(d => d.name).join(', ')}`)
  assert.ok(ds.some(d => /10% WACC/.test(d.detail || '')),
    `expected WACC override disclosed in DCF source, got: ${ds.map(d => d.detail).join(' | ')}`)
  assert.ok(ds.some(d => d.name === 'Finsyt news aggregator'),
    'expected news aggregator disclosed when catalysts came from /api/news')
})

// ── 4) Override determinism + transactions table contract ─────────────────

test('assembleBankerPitch peers table membership matches the override list, even when memo.peers returned a different set', async () => {
  // The FMP stock-peers fallback path (used by `assembleInvestmentMemoData`)
  // is intentionally given a DIFFERENT peer set ('FOO', 'BAR') than the
  // workspace override the analyst pinned ('GOOGL', 'AMZN', 'AAPL'). The
  // deck's peer table must reflect the override — not the memo fallback.
  installFetchStub((url) => {
    if (url.includes('financialmodelingprep.com/stable/stock-peers')) {
      // Memo path: FMP returns FOO/BAR. These should NOT appear in the deck.
      return jsonResp([{ symbol: 'MSFT', peersList: ['FOO', 'BAR'] }])
    }
    // Subject + augmented peer quotes (the override list).
    if (url.includes('/api/quote?symbol=MSFT')) return jsonResp({
      symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', sector: 'Technology',
      price: 400, yearLow: 350, yearHigh: 450,
      pe: 30, ps: 12, evEbitda: 22, sharesOut: 7_500_000_000,
      marketCap: 3_000_000_000_000, revenue: 260_000_000_000,
    })
    if (url.includes('/api/quote?symbol=GOOGL')) return jsonResp({ symbol: 'GOOGL', name: 'Alphabet', price: 150, marketCap: 2_000_000_000_000, pe: 24, ps: 6, evEbitda: 18 })
    if (url.includes('/api/quote?symbol=AMZN'))  return jsonResp({ symbol: 'AMZN',  name: 'Amazon',   price: 180, marketCap: 1_900_000_000_000, pe: 46, ps: 3, evEbitda: 20 })
    if (url.includes('/api/quote?symbol=AAPL'))  return jsonResp({ symbol: 'AAPL',  name: 'Apple',    price: 200, marketCap: 3_100_000_000_000, pe: 30, ps: 8, evEbitda: 24 })
    if (url.includes('/api/quote?symbol=FOO'))   return jsonResp({ symbol: 'FOO', price: 1, marketCap: 0 })
    if (url.includes('/api/quote?symbol=BAR'))   return jsonResp({ symbol: 'BAR', price: 1, marketCap: 0 })
    if (url.includes('/api/financials/statements')) {
      if (url.includes('income-statement') && url.includes('quarter')) {
        return jsonResp({ rows: [
          { revenue: 65e9, operatingIncome: 30e9, depreciationAndAmortization: 2e9 },
          { revenue: 64e9, operatingIncome: 29e9, depreciationAndAmortization: 2e9 },
          { revenue: 63e9, operatingIncome: 28e9, depreciationAndAmortization: 2e9 },
          { revenue: 62e9, operatingIncome: 27e9, depreciationAndAmortization: 2e9 },
        ] })
      }
      return jsonResp({ rows: [] })
    }
    if (url.includes('/api/financials/segments')) return jsonResp({})
    if (url.includes('/api/estimates')) return jsonResp({ symbol: 'MSFT', quarterly: [] })
    if (url.includes('/api/news')) return jsonResp({ articles: [] })
    return jsonResp({}, 404)
  })

  const { pitch } = await assembleBankerPitch(BASE, 'MSFT', {
    peers: ['GOOGL', 'AMZN', 'AAPL'],
    dcfFetcher: dcfFetcherFactory({ intrinsicValuePerShare: 410 }),
  })

  assert.ok(pitch.peers && pitch.peers.length > 0, 'pitch.peers must be populated when override is supplied')
  const tickersInDeck = pitch.peers!.map(p => p.ticker.toUpperCase()).sort()
  assert.deepEqual(tickersInDeck, ['AAPL', 'AMZN', 'GOOGL'],
    `deck peer table must contain exactly the override tickers, got: ${tickersInDeck.join(', ')}`)
  assert.ok(!tickersInDeck.includes('FOO') && !tickersInDeck.includes('BAR'),
    'memo fallback tickers (FOO/BAR) must not leak into the deck when override is supplied')
  // The augmented quote drove the rows — multiples must be formatted.
  const goog = pitch.peers!.find(p => p.ticker.toUpperCase() === 'GOOGL')!
  assert.match(goog.pe, /^[\d.]+x$/, `expected formatted P/E for GOOGL, got "${goog.pe}"`)
  assert.match(goog.evEbitda, /^[\d.]+x$/, `expected formatted EV/EBITDA for GOOGL, got "${goog.evEbitda}"`)
})

test('assembleBankerPitch surfaces a transactions table when memo.transactions has data, and skips it otherwise', async () => {
  // Two scenarios driven by the same stub:
  //
  //   (a) Memo path returns precedents → deck has a `transactions` field
  //       that the template will render as a dedicated table slide.
  //   (b) Memo path returns no precedents → deck's `transactions` is
  //       undefined and the template skips the slide entirely.
  //
  // Toggling this is awkward because the M&A endpoint is hit inside
  // `assembleInvestmentMemoData`. We control which scenario fires by
  // returning either an array of M&A rows or an empty array.
  let withDeals = true
  installFetchStub((url) => {
    if (url.includes('financialmodelingprep.com/stable/mergers-acquisitions-latest')) {
      return jsonResp(withDeals
        ? [
            { transactionDate: '2024-03-01', companyName: 'Cisco',     targetedCompanyName: 'Splunk',     symbol: 'CSCO' },
            { transactionDate: '2024-02-01', companyName: 'Microsoft', targetedCompanyName: 'Activision', symbol: 'MSFT' },
            { transactionDate: '2024-01-01', companyName: 'Adobe',     targetedCompanyName: 'Figma',      symbol: 'ADBE' },
          ]
        : [])
    }
    if (url.includes('/api/quote?symbol=MSFT')) return jsonResp({
      symbol: 'MSFT', name: 'Microsoft', price: 400, yearLow: 350, yearHigh: 450,
      pe: 30, ps: 12, evEbitda: 22, sharesOut: 7_500_000_000,
      marketCap: 3_000_000_000_000, revenue: 260_000_000_000,
    })
    if (url.includes('/api/quote?symbol=')) return jsonResp({ symbol: 'X', price: 100, pe: 25, ps: 5, evEbitda: 20 })
    if (url.includes('/api/financials/statements')) return jsonResp({ rows: [] })
    if (url.includes('/api/news')) return jsonResp({ articles: [] })
    return jsonResp({}, 404)
  })
  const dcfStub = dcfFetcherFactory({ intrinsicValuePerShare: 400 })

  // Scenario (a): deck must surface a transactions array
  withDeals = true
  const a = await assembleBankerPitch(BASE, 'MSFT', { peers: ['GOOGL', 'AMZN'], dcfFetcher: dcfStub })
  // memo.transactions should be populated; pitch.transactions should mirror
  // the same rows (length-bounded to 9). The exact length depends on how
  // many M&A rows survive the memo's filtering, so we just assert presence.
  assert.ok(Array.isArray(a.pitch.transactions) && a.pitch.transactions!.length > 0,
    'pitch.transactions must be a non-empty array when memo.transactions has data')
  // Each row must have the required table columns.
  for (const r of a.pitch.transactions!) {
    assert.ok(r.date && r.acquirer && r.target, `tx row missing required fields: ${JSON.stringify(r)}`)
  }

  // Scenario (b): no precedents → no transactions field on the pitch
  withDeals = false
  const b = await assembleBankerPitch(BASE, 'MSFT', { peers: ['GOOGL', 'AMZN'], dcfFetcher: dcfStub })
  assert.equal(b.pitch.transactions, undefined,
    'pitch.transactions must be undefined when memo.transactions has no rows (skip-logic contract)')
})
