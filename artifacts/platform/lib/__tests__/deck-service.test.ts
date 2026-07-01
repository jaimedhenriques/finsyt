/**
 * Snapshot / regression tests for the generalized deck service and the
 * 3 templates it ships (investment-memo, matrix-snapshot, banker-pitch).
 *
 * What we verify:
 *
 *   1. `deckSlideTitles(template)` for each of the 3 templates matches a
 *      stable snapshot. This catches accidental section reorders, missing
 *      cover/sources slides, and renamed section titles.
 *   2. `renderDeck(template)` produces a valid PPTX buffer (PK signature,
 *      non-trivial size) for each template — proves the pipeline still
 *      links cleanly end-to-end.
 *   3. The legacy `buildInvestmentMemoPptx` produces a deck whose slide
 *      titles list (cover + 6 memo slides + sources) exactly matches what
 *      `deckSlideTitles(investmentMemoTemplate(memo))` would emit. This
 *      pins the refactor: both code paths must enumerate identical decks.
 *
 * No network, no DB, no GCS — every fixture is hand-built.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'

import {
  renderDeck,
  deckSlideTitles,
  type DeckTemplate,
} from '../deck-service.ts'
import {
  bankerPitchTemplate,
  matrixSnapshotTemplate,
  investmentMemoTemplate,
  peerComparisonTemplate,
  type PeerComparisonDeckInput,
} from '../deck-templates.ts'
import type {
  PeerComparisonColumn,
  PeerComparisonBodyRow,
  PeerComparisonSummaryRow,
} from '../deck-service.ts'
import {
  buildInvestmentMemoPptx,
  memoSlideTitles,
  type InvestmentMemoData,
} from '../investment-memo-pptx.ts'
import {
  pitchFromAssembly,
  type ValuationBandsAssembly,
  type RecentCatalystsResult,
} from '../banker-pitch-data.ts'

// ── Fixtures ───────────────────────────────────────────────────────────────

const MEMO: InvestmentMemoData = {
  identity: {
    ticker: 'MSFT',
    name: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    sector: 'Technology',
    industry: 'Software — Infrastructure',
    country: 'USA',
  },
  asOf: 'May 2026',
  sourceLine: 'Sources: Financial Modeling Prep, Yahoo Finance, Finsyt DCF model.',
  overview: {
    description: 'Microsoft develops and supports software, services, devices, and solutions worldwide.',
    segments: ['Productivity & Business Processes — 32% of revenue', 'Intelligent Cloud — 43%', 'More Personal Computing — 25%'],
    geography: ['United States — 51%', 'International — 49%'],
    metrics: [
      { label: 'LTM Revenue',    value: '$261.8B' },
      { label: 'LTM EBITDA',     value: '$135.2B' },
      { label: 'EBITDA Margin',  value: '51.6%' },
      { label: 'Market Cap',     value: '$3.2T' },
      { label: 'Enterprise Val', value: '$3.1T' },
    ],
  },
  valuation: {
    current: [
      { label: 'EV / NTM Rev',    value: '11.0x' },
      { label: 'EV / NTM EBITDA', value: '20.4x' },
      { label: 'P / NTM E',       value: '32.5x' },
      { label: 'FCF Yield',       value: '2.7%' },
    ],
    historical: [
      { label: 'EV / NTM EBITDA', low: '13.2x', median: '17.6x', high: '23.1x' },
      { label: 'P / NTM E',       low: '24.0x', median: '29.0x', high: '38.0x' },
    ],
    summary: [
      { method: 'DCF',                       low: '$340.00', mid: '$398.00', high: '$455.00' },
      { method: 'Public peers (EV/EBITDA)',   low: '$310.00', mid: '$370.00', high: '$430.00' },
      { method: '52-week range',              low: '$290.00', mid: '$370.00', high: '$450.00' },
    ],
    forwardConsensus: {
      items: [
        { label: 'Sell-side price target',  value: '$425.00' },
        { label: 'NTM revenue (consensus)', value: '$285.4B' },
        { label: 'NTM EPS (consensus)',     value: '$13.85' },
      ],
    },
  },
  peers: [
    { ticker: 'GOOGL', name: 'Alphabet',  marketCap: '$2.1T',  revenueGrowth: '13.5%', ebitdaMargin: '34.2%', evRevenue: '6.4x', evEbitda: '18.6x', pe: '24.1x' },
    { ticker: 'AMZN',  name: 'Amazon',    marketCap: '$1.9T',  revenueGrowth: '11.0%', ebitdaMargin: '15.4%', evRevenue: '3.1x', evEbitda: '20.0x', pe: '46.0x' },
    { ticker: 'AAPL',  name: 'Apple',     marketCap: '$3.0T',  revenueGrowth: '4.5%',  ebitdaMargin: '32.7%', evRevenue: '7.6x', evEbitda: '23.0x', pe: '30.5x' },
  ],
  transactions: [
    { date: 'Mar 2024', acquirer: 'Cisco',    target: 'Splunk',       evMm: '$28.0B', evRevenue: '7.2x', evEbitda: '24.0x' },
    { date: 'Jan 2024', acquirer: 'Microsoft', target: 'Activision',  evMm: '$68.7B', evRevenue: '7.6x', evEbitda: '21.0x' },
  ],
  dcf: {
    assumptions: [
      { label: 'WACC',                value: '8.5%' },
      { label: 'Terminal growth',      value: '3.0%' },
      { label: 'Forecast horizon',     value: '5 years' },
    ],
    perShare: {
      enterpriseValue:    '$3,150B',
      equityValue:        '$3,000B',
      sharesOutstanding:  '7.43B',
      intrinsicPerShare:  '$398.00',
      currentPrice:       '$370.50',
      upsidePct:          '+7.4%',
    },
    yearTable: [
      { year: '2026E', fcf: '$76B',  growth: '+12%', pv: '$70B' },
      { year: '2027E', fcf: '$85B',  growth: '+12%', pv: '$72B' },
      { year: '2028E', fcf: '$94B',  growth: '+11%', pv: '$73B' },
      { year: '2029E', fcf: '$103B', growth: '+10%', pv: '$73B' },
      { year: '2030E', fcf: '$112B', growth: '+9%',  pv: '$73B' },
    ],
  },
  qualitative: {
    strengths: ['Cloud market leadership', 'Sticky enterprise base', 'Capital allocation discipline'],
    risks:     ['Regulatory scrutiny', 'AI capex cycle', 'FX exposure'],
    catalysts: ['Azure AI revenue inflection', 'Activision contribution', 'EPS guide reset'],
    esg:       ['Carbon-negative target', 'Supply-chain transparency'],
  },
}

const PK_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04])

// ── 1) Slide-title snapshots ────────────────────────────────────────────────

test('investment-memo template enumerates cover + 6 memo slides + sources', () => {
  const titles = deckSlideTitles(investmentMemoTemplate(MEMO))
  assert.deepEqual(titles, [
    'MSFT · Microsoft Corporation',     // cover
    'Company Overview',
    'Valuation Overview',
    'Peer Comparables',
    'Transaction Comparables',
    'Discounted Cash Flow',
    'Qualitative Factors',
    'Data Sources Used',
  ])
})

test('matrix-snapshot template builds intro + per-row narrative + metric tile slides', () => {
  const tpl = matrixSnapshotTemplate({
    matrixName: 'Project Alpha',
    subtitle: '12 documents × 5 columns',
    asOf: 'May 2026',
    rows: [
      {
        entity: 'FY2024 P&L',
        subtitle: 'Filings',
        bullets: ['Revenue $261B (+15% YoY)', 'EBITDA margin 51.6%', 'Cash conversion 95%'],
        metrics: [{ label: 'Revenue', value: '$261B' }, { label: 'EBITDA', value: '$135B' }],
      },
      {
        entity: 'Project Alpha CIM',
        subtitle: 'Marketing Materials',
        bullets: ['$3.2B asking price', 'EBITDA $410M', 'Process expected to close Q4'],
      },
    ],
  })
  const titles = deckSlideTitles(tpl)
  assert.deepEqual(titles, [
    'Project Alpha',                                      // cover
    'Matrix snapshot',                                    // intro
    'FY2024 P&L — Filings',                              // row 1 narrative
    'FY2024 P&L — Metrics',                              // row 1 metric tiles
    'Project Alpha CIM — Marketing Materials',           // row 2 narrative (no metrics)
    'Data Sources Used',
  ])
})

test('matrix-snapshot rows with no answered cells get a friendly placeholder + "0 of N answered" meta line', () => {
  const tpl = matrixSnapshotTemplate({
    matrixName: 'Project Beta',
    asOf: 'May 2026',
    rows: [
      // Fully empty row — was previously a wall of "(pending)" bullets.
      { entity: 'Pending Row', bullets: [], answeredCount: 0, totalCount: 4 },
      // Partially answered row — should keep only the real bullets and
      // append a single "X of Y columns answered" meta line.
      {
        entity: 'Partial Row',
        bullets: ['Revenue: $5B', 'Margin: 22%'],
        answeredCount: 2,
        totalCount: 5,
      },
    ],
  })
  // The first row's executive-summary section should carry exactly one
  // placeholder bullet plus the meta count line — never any "(pending)"
  // bullets.
  const rowSections = tpl.sections.filter(
    s => s.type === 'executive-summary' && s.data.title !== 'Matrix snapshot',
  ) as Array<Extract<typeof tpl.sections[number], { type: 'executive-summary' }>>
  assert.equal(rowSections.length, 2)

  const empty = rowSections[0].data.bullets
  assert.deepEqual(empty, [
    'No answers captured yet for this row.',
    '— 0 of 4 columns answered',
  ])
  assert.equal(empty.some(b => /pending/i.test(b)), false)

  const partial = rowSections[1].data.bullets
  assert.deepEqual(partial, [
    'Revenue: $5B',
    'Margin: 22%',
    '— 2 of 5 columns answered',
  ])
  assert.equal(partial.some(b => /pending/i.test(b)), false)
})

test('matrix-snapshot fully-answered row still renders bullets + matching count, no regression', () => {
  const tpl = matrixSnapshotTemplate({
    matrixName: 'Project Gamma',
    asOf: 'May 2026',
    rows: [
      {
        entity: 'Complete Row',
        bullets: ['A: 1', 'B: 2', 'C: 3'],
        answeredCount: 3,
        totalCount: 3,
      },
    ],
  })
  const rowSections = tpl.sections.filter(
    s => s.type === 'executive-summary' && s.data.title !== 'Matrix snapshot',
  ) as Array<Extract<typeof tpl.sections[number], { type: 'executive-summary' }>>
  assert.equal(rowSections.length, 1)
  assert.deepEqual(rowSections[0].data.bullets, [
    'A: 1', 'B: 2', 'C: 3',
    '— 3 of 3 columns answered',
  ])
})

test('matrix-snapshot row without count metadata stays back-compatible (no meta line appended)', () => {
  const tpl = matrixSnapshotTemplate({
    matrixName: 'Legacy caller',
    asOf: 'May 2026',
    rows: [{ entity: 'Row A', bullets: ['point 1', 'point 2'] }],
  })
  const rowSections = tpl.sections.filter(
    s => s.type === 'executive-summary' && s.data.title !== 'Matrix snapshot',
  ) as Array<Extract<typeof tpl.sections[number], { type: 'executive-summary' }>>
  assert.deepEqual(rowSections[0].data.bullets, ['point 1', 'point 2'])
})

test('banker-pitch template enumerates snapshot/valuation/peers/transactions/catalysts/appendix in order', () => {
  const tpl = bankerPitchTemplate({
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    sector: 'Technology',
    asOf: 'May 2026',
    snapshotBullets: ['Cloud leader', 'Sticky enterprise base'],
    snapshotMetrics: [{ label: 'LTM Revenue', value: '$261B' }],
    footballField: {
      bands: [
        { method: 'DCF (WACC ±2%)',        low: 340, mid: 398, high: 455 },
        { method: 'Public peers (EV/Rev)', low: 310, mid: 370, high: 430 },
      ],
      currentPrice: 370.5,
      weightedMid: 384,
      currency: '$',
    },
    peers: [
      { ticker: 'GOOGL', name: 'Alphabet', marketCap: '$2.1T', revenueGrowth: '13.5%', ebitdaMargin: '34.2%', evRevenue: '6.4x', evEbitda: '18.6x', pe: '24.1x' },
    ],
    transactions: [
      { date: 'Mar 2024', acquirer: 'Cisco',     target: 'Splunk',     evMm: '$28.0B', evRevenue: '7.2x', evEbitda: '24.0x' },
      { date: 'Jan 2024', acquirer: 'Microsoft', target: 'Activision', evMm: '$68.7B', evRevenue: '7.6x', evEbitda: '21.0x' },
    ],
    catalysts: ['Azure AI revenue inflection', 'EPS guide reset'],
    appendix: [
      { title: 'Risks',  bullets: ['Regulatory scrutiny', 'AI capex cycle'] },
    ],
  })
  const titles = deckSlideTitles(tpl)
  assert.deepEqual(titles, [
    'MSFT · Microsoft Corporation',     // cover
    'Company snapshot',
    'Snapshot metrics',
    'Valuation football field',
    'Public peer comparables',
    'Precedent M&A transactions',
    'Catalysts (next 12 months)',
    'Risks',
    'Data Sources Used',
  ])
})

test('banker-pitch template renders structured catalysts as separate "Recent news" + "Strategic themes" slides', () => {
  // Provenance-tagging contract: when the assembler hands us a
  // structured catalysts payload split by source, the deck must render
  // two distinct executive-summary slides — "Recent news (last 90
  // days)" for /api/news headlines and "Strategic themes (next 12
  // months)" for templated memo bullets — so analysts can tell at a
  // glance which group came from real news vs. a generic fallback.
  const tpl = bankerPitchTemplate({
    ticker: 'MSFT', companyName: 'Microsoft', asOf: 'May 2026',
    snapshotBullets: ['Cloud leader'],
    catalysts: {
      news:   ['2026-04-25 — Azure beats Street estimates · Reuters'],
      themes: ['Capital-allocation events (buybacks, M&A, dividends)'],
    },
  })
  const titles = deckSlideTitles(tpl)
  assert.ok(titles.includes('Recent news (last 90 days)'),
    `expected "Recent news" slide, got: ${titles.join(' | ')}`)
  assert.ok(titles.includes('Strategic themes (next 12 months)'),
    `expected "Strategic themes" slide, got: ${titles.join(' | ')}`)
  assert.ok(!titles.includes('Catalysts (next 12 months)'),
    `legacy combined-catalysts slide must NOT render when structured groups are supplied; got: ${titles.join(' | ')}`)
  // Order: news slide must precede themes slide so the most decision-
  // relevant content (real headlines) leads.
  assert.ok(titles.indexOf('Recent news (last 90 days)') < titles.indexOf('Strategic themes (next 12 months)'),
    `"Recent news" slide must precede "Strategic themes" slide; got: ${titles.join(' | ')}`)
})

test('banker-pitch template renders only the "Recent news" slide when structured catalysts has no themes', () => {
  // Tagged-news-only path: themes group absent (e.g. assembler chose
  // not to pad real headlines with templated bullets) — only the
  // "Recent news" slide should render.
  const tpl = bankerPitchTemplate({
    ticker: 'MSFT', companyName: 'Microsoft', asOf: 'May 2026',
    snapshotBullets: ['Cloud leader'],
    catalysts: { news: ['Headline only · Reuters'] },
  })
  const titles = deckSlideTitles(tpl)
  assert.ok(titles.includes('Recent news (last 90 days)'),
    `expected "Recent news" slide, got: ${titles.join(' | ')}`)
  assert.ok(!titles.includes('Strategic themes (next 12 months)'),
    `themes slide must NOT render when themes group is absent; got: ${titles.join(' | ')}`)
})

test('banker-pitch template renders only the "Strategic themes" slide when structured catalysts has no news (fallback-only path)', () => {
  // Fallback-only path: /api/news returned nothing, so the assembler
  // populated only the themes group. Only the "Strategic themes"
  // slide should render — the "Recent news" slide must be skipped so
  // the deck doesn't show an empty news section.
  const tpl = bankerPitchTemplate({
    ticker: 'BABA', companyName: 'Alibaba', asOf: 'May 2026',
    snapshotBullets: ['Non-US listing — limited /api/news coverage'],
    catalysts: { themes: ['Templated theme A', 'Templated theme B'] },
  })
  const titles = deckSlideTitles(tpl)
  assert.ok(titles.includes('Strategic themes (next 12 months)'),
    `expected "Strategic themes" slide, got: ${titles.join(' | ')}`)
  assert.ok(!titles.includes('Recent news (last 90 days)'),
    `news slide must NOT render when news group is absent; got: ${titles.join(' | ')}`)
})

test('banker-pitch template skips the transactions-table slide entirely when no precedents are supplied', () => {
  // Skip-logic contract: an empty / undefined `transactions` field must not
  // produce a placeholder transaction-comps slide. This protects analysts
  // who pitch a name with no recent M&A activity (#205-backed data absent)
  // from getting a blank table slide in their deck.
  const tpl = bankerPitchTemplate({
    ticker: 'XYZ', companyName: 'XYZ Inc', asOf: 'May 2026',
    snapshotBullets: ['Standalone snapshot only'],
    peers: [{ ticker: 'A', name: 'A', marketCap: '$1B', revenueGrowth: '0%', ebitdaMargin: '0%', evRevenue: '0x', evEbitda: '0x', pe: '0x' }],
  })
  const titles = deckSlideTitles(tpl)
  assert.ok(!titles.includes('Precedent M&A transactions'),
    `transactions-table slide must not render when transactions is empty; got titles: ${titles.join(' | ')}`)
})

test('banker-pitch template degrades to a placeholder slide when called with empty input', () => {
  const tpl = bankerPitchTemplate({
    ticker: 'XYZ', companyName: 'XYZ Inc', asOf: 'May 2026',
  })
  const titles = deckSlideTitles(tpl)
  assert.deepEqual(titles, [
    'XYZ · XYZ Inc',
    'Pitch deck',
    'Data Sources Used',
  ])
})

// ── 2) End-to-end PPTX bytes for each template ─────────────────────────────

async function assertValidPptx(template: DeckTemplate, label: string) {
  const buf = await renderDeck(template)
  assert.ok(buf.length > 5000, `${label}: expected non-trivial pptx buffer, got ${buf.length} bytes`)
  assert.ok(buf.subarray(0, 4).equals(PK_SIG), `${label}: expected PK zip signature at start, got ${[...buf.subarray(0, 4)].map(b => b.toString(16)).join(' ')}`)
}

test('renderDeck() produces valid pptx bytes for the investment-memo template', async () => {
  await assertValidPptx(investmentMemoTemplate(MEMO), 'investment-memo')
})

test('renderDeck() produces valid pptx bytes for the matrix-snapshot template', async () => {
  await assertValidPptx(matrixSnapshotTemplate({
    matrixName: 'Smoke matrix',
    asOf: 'May 2026',
    rows: [{ entity: 'Row A', bullets: ['point 1', 'point 2'], metrics: [{ label: 'X', value: '1' }] }],
  }), 'matrix-snapshot')
})

test('renderDeck() produces valid pptx bytes for the banker-pitch template', async () => {
  await assertValidPptx(bankerPitchTemplate({
    ticker: 'MSFT', companyName: 'Microsoft', asOf: 'May 2026',
    snapshotBullets: ['Cloud leader'],
    snapshotMetrics: [{ label: 'LTM Rev', value: '$261B' }],
    footballField: { bands: [{ method: 'DCF', low: 340, mid: 398, high: 455 }], currentPrice: 370 },
    transactions: [
      { date: 'Mar 2024', acquirer: 'Cisco',     target: 'Splunk',     evMm: '$28.0B', evRevenue: '7.2x', evEbitda: '24.0x' },
      { date: 'Jan 2024', acquirer: 'Microsoft', target: 'Activision', evMm: '$68.7B', evRevenue: '7.6x', evEbitda: '21.0x' },
    ],
    catalysts: ['Azure AI'],
  }), 'banker-pitch')
})

// ── 3) Memo regression — legacy builder still produces an 8-slide deck ─────

test('buildInvestmentMemoPptx produces an 8-slide pptx (cover + 6 + sources) with the same bytes shape', async () => {
  const buf = await buildInvestmentMemoPptx(MEMO)
  assert.ok(buf.subarray(0, 4).equals(PK_SIG), 'expected PK zip signature')
  assert.ok(buf.length > 10_000, `expected non-trivial pptx buffer, got ${buf.length} bytes`)

  // Pull the slide manifest out of the zip — pptxgenjs writes ppt/slides/slideN.xml
  // entries; counting the Override entries in the content-types manifest is the
  // most reliable way to count slides without unzipping.
  const text = buf.toString('binary')
  const slideMatches = text.match(/ppt\/slides\/slide\d+\.xml/g) || []
  // De-duplicate (each slide appears in multiple manifests). Build a Set of
  // unique slide file names referenced in the bundle.
  const unique = new Set(slideMatches)
  assert.equal(unique.size, 8, `expected 8 unique slide xml entries (cover + 6 + sources), got ${unique.size}`)
})

// ── 4) Memo unification — legacy and service paths produce the same deck ───

test('buildInvestmentMemoPptx is now a strict wrapper around renderDeck(investmentMemoTemplate(...))', async () => {
  // Golden-parity test for the refactor: the legacy entrypoint and the new
  // service path must enumerate the exact same slides, in the same order,
  // with byte buffers within ~5% of each other (PPTX zips include a tiny
  // amount of non-deterministic content like timestamps, so byte equality
  // would be brittle — slide-count + slide-title equivalence is what we
  // pin contractually).
  const legacy = await buildInvestmentMemoPptx(MEMO)
  const tpl    = investmentMemoTemplate(MEMO)
  const direct = await renderDeck(tpl)

  // Same slide count
  const legacyCount = new Set((legacy.toString('binary').match(/ppt\/slides\/slide\d+\.xml/g) || [])).size
  const directCount = new Set((direct.toString('binary').match(/ppt\/slides\/slide\d+\.xml/g) || [])).size
  assert.equal(legacyCount, directCount, 'legacy and service decks must contain the same number of slides')
  assert.equal(legacyCount, 8, 'expected 8 unique slide xml entries')

  // Same slide-title contract from both paths
  const titlesFromTemplate = deckSlideTitles(tpl)
  const titlesFromMemo     = memoSlideTitles(MEMO)
  assert.deepEqual(titlesFromTemplate, titlesFromMemo,
    'memoSlideTitles() must match deckSlideTitles(investmentMemoTemplate(memo))')

  // Buffers are within an order of magnitude of each other (safety net for
  // accidental duplicate-slide regressions).
  const ratio = Math.min(legacy.length, direct.length) / Math.max(legacy.length, direct.length)
  assert.ok(ratio > 0.85,
    `legacy/service buffer sizes differ too much: legacy=${legacy.length} direct=${direct.length} ratio=${ratio.toFixed(3)}`)
})

test('memoSlideTitles() is exactly the 8-entry deck shape the public memo APIs return', () => {
  assert.deepEqual(memoSlideTitles(MEMO), [
    'MSFT · Microsoft Corporation',     // cover
    'Company Overview',
    'Valuation Overview',
    'Peer Comparables',
    'Transaction Comparables',
    'Discounted Cash Flow',
    'Qualitative Factors',
    'Data Sources Used',
  ])
})

// ── 5) Banker-pitch degradation — upstream sources individually unavailable ─
//
// These tests pin the contract that the banker pitch deck assembler degrades
// gracefully when individual upstream providers (FMP peers, M&A feed, the
// internal DCF model, analyst estimates) return nothing. The combined
// behaviour is what keeps a partial outage from silently producing a broken
// deck in production: the assembler must drop the relevant sections, the
// template must skip the affected slides, and the trailing "Data Sources
// Used" slide must reflect only the providers that actually contributed.
//
// We exercise `pitchFromAssembly()` directly (no network) by handing it a
// memo fixture plus synthetic `vb` (valuation-bands assembly) and
// `catalystsResult` (recent-catalysts assembly) fixtures. This isolates the
// degradation contract from the live HTTP-backed `assembleValuationBands` /
// `assembleRecentCatalysts` orchestrators (which have their own targeted
// tests in `banker-pitch-data.test.ts`).

/** Build a memo where every section is populated. Mutating fields on the
 *  return value is the easy way to test "what if peers is unavailable?". */
function fullMemo(): InvestmentMemoData {
  return JSON.parse(JSON.stringify(MEMO)) as InvestmentMemoData
}

/** A "healthy" valuation-bands assembly — all sub-models contributed.
 *  Tests mutate fields on a clone to simulate one source going dark. */
function fullVb(): ValuationBandsAssembly {
  return {
    bands: [
      { method: '52-week trading range', low: 300, high: 450 },
      { method: 'Public peer comps · EV/EBITDA (IQR)', low: 320, high: 420 },
      { method: 'Precedent M&A · EV/EBITDA (IQR)',     low: 340, high: 430 },
      { method: 'DCF (WACC ±2 %)',                     low: 380, high: 460 },
    ],
    currentPrice: 370,
    weightedMid:  390,
    effectivePeers: ['GOOGL', 'AMZN', 'META'],
    dcfUsable:     true,
    txCompsUsable: true,
    peerQuotes:    [null, null, null],
  }
}

/** A "healthy" recent-catalysts result — sourced from /api/news. */
function fullCatalysts(): RecentCatalystsResult {
  return {
    news: ['2026-04-15 — Q3 earnings beat · WSJ', '2026-04-01 — New AI partnership · Reuters'],
    themes: [],
    source: 'news',
  }
}

test('banker-pitch assembly drops peers slide when memo.peers is unavailable and no opts.peers override', () => {
  const memo = fullMemo()
  memo.peers = { unavailable: true, reason: 'FMP peers feed returned no results' }
  // Mirror the empty-peers-feed scenario in vb: no effective peers means the
  // assembler couldn't fall back to a default set either (or the default was
  // also stripped). The pitch transform must drop the slide AND skip the
  // peer-set source attribution.
  const vb: ValuationBandsAssembly = { ...fullVb(), effectivePeers: [], peerQuotes: [] }
  const pitch = pitchFromAssembly({ memo, vb, catalystsResult: fullCatalysts() })

  assert.equal(pitch.peers, undefined,
    'pitch.peers must be undefined when memo.peers is unavailable and vb has no effective peers')
  const titles = deckSlideTitles(bankerPitchTemplate(pitch))
  assert.ok(!titles.includes('Public peer comparables'),
    `expected no peers slide, got titles: ${titles.join(' | ')}`)
  // Sources list must NOT advertise a peer set if no peers actually contributed
  assert.ok(!pitch.dataSources?.some(d => /peer set/i.test(d.name)),
    `dataSources must not list a peer set when peers were unavailable; got ${JSON.stringify(pitch.dataSources)}`)
})

test('banker-pitch assembly drops the transactions table + M&A source when memo.transactions is unavailable', () => {
  const memo = fullMemo()
  memo.transactions = { unavailable: true, reason: 'FMP M&A latest feed empty' }
  // When transactions are unavailable, the bands assembler also can't
  // produce a tx-comps band — mirror that in vb.
  const vb: ValuationBandsAssembly = { ...fullVb(), txCompsUsable: false }
  const pitch = pitchFromAssembly({ memo, vb, catalystsResult: fullCatalysts() })

  assert.equal(pitch.transactions, undefined,
    `pitch.transactions must be undefined when memo.transactions is unavailable, got ${JSON.stringify(pitch.transactions)}`)
  const titles = deckSlideTitles(bankerPitchTemplate(pitch))
  assert.ok(!titles.includes('Precedent M&A transactions'),
    `expected no precedent-transactions slide, got titles: ${titles.join(' | ')}`)
  assert.ok(!pitch.dataSources?.some(d => /m&a/i.test(d.name)),
    `dataSources must not list the M&A feed when transactions were unavailable; got ${JSON.stringify(pitch.dataSources)}`)
})

test('banker-pitch assembly drops the Finsyt DCF model source when vb.dcfUsable is false', () => {
  const memo = fullMemo()
  memo.dcf = { unavailable: true, reason: 'DCF model failed: no FCF history' }
  // When the DCF model fails, vb.dcfUsable goes false AND the DCF band is
  // not added to vb.bands. Mirror both.
  const vb: ValuationBandsAssembly = {
    ...fullVb(),
    dcfUsable: false,
    bands: fullVb().bands.filter(b => !/WACC/.test(b.method)),
  }
  const pitch = pitchFromAssembly({ memo, vb, catalystsResult: fullCatalysts() })

  // The DCF band is gone (because vb.bands is what feeds the football field)
  const modelBand = (pitch.footballField?.bands ?? []).find(b => /WACC/.test(b.method))
  assert.equal(modelBand, undefined,
    `expected no DCF-model band when vb.dcfUsable is false, got ${JSON.stringify(modelBand)}`)
  // Sources must not advertise the Finsyt DCF model if it didn't contribute
  assert.ok(!pitch.dataSources?.some(d => /Finsyt DCF model/i.test(d.name)),
    `dataSources must not list the Finsyt DCF model when it was unavailable; got ${JSON.stringify(pitch.dataSources)}`)
})

test('banker-pitch assembly drops the analyst-estimates source when forwardConsensus is missing', () => {
  const memo = fullMemo()
  // Strip only the consensus block; the rest of the valuation section stays.
  if (!('unavailable' in memo.valuation)) {
    memo.valuation.forwardConsensus = undefined
  }
  const pitch = pitchFromAssembly({
    memo,
    vb: fullVb(),
    catalystsResult: fullCatalysts(),
  })

  assert.ok(!pitch.dataSources?.some(d => /analyst estimates/i.test(d.name)),
    `dataSources must not list the analyst-estimates feed when consensus is missing; got ${JSON.stringify(pitch.dataSources)}`)
})

test('banker-pitch assembly drops the news-aggregator source when catalysts came from the memo fallback', () => {
  // Source attribution rule: the news aggregator only appears in dataSources
  // when catalystsResult.source === 'news'. The memo-fallback path keeps the
  // catalysts but does not advertise /api/news as a source.
  const pitch = pitchFromAssembly({
    memo: fullMemo(),
    vb: fullVb(),
    catalystsResult: { news: [], themes: ['Templated catalyst A', 'Templated catalyst B'], source: 'memo' },
  })
  assert.ok(!pitch.dataSources?.some(d => /news aggregator/i.test(d.name)),
    `dataSources must not list the news aggregator when catalysts source !== 'news'; got ${JSON.stringify(pitch.dataSources)}`)
})

test('banker-pitch assembly survives every optional upstream being unavailable at once', () => {
  // Simulate a "perfect storm" where peers, transactions, DCF, consensus, and
  // the news feed are all unavailable simultaneously. The deck must still
  // assemble, render, and emit a non-empty (but appropriately stripped-down)
  // sources list.
  const memo = fullMemo()
  memo.peers        = { unavailable: true }
  memo.transactions = { unavailable: true }
  memo.dcf          = { unavailable: true }
  if (!('unavailable' in memo.valuation)) memo.valuation.forwardConsensus = undefined
  const vb: ValuationBandsAssembly = {
    bands:          [],
    effectivePeers: [],
    dcfUsable:      false,
    txCompsUsable:  false,
    peerQuotes:     [],
  }
  const catalystsResult: RecentCatalystsResult = { news: [], themes: [], source: 'none' }
  const pitch = pitchFromAssembly({ memo, vb, catalystsResult })

  assert.equal(pitch.peers, undefined)
  assert.equal(pitch.transactions, undefined)
  // No DCF-model / sell-side / peer / tx-comp bands because vb.bands is empty.
  assert.equal(pitch.footballField, undefined,
    `expected no footballField when vb.bands is empty, got ${JSON.stringify(pitch.footballField)}`)

  // Sources only mention the always-available core provider — never the
  // optimistic "everything we could call" list.
  const names = (pitch.dataSources ?? []).map(d => d.name)
  assert.deepEqual(names, ['Financial Modeling Prep'],
    `expected only the always-on FMP provider in dataSources, got ${JSON.stringify(names)}`)

  // The deck must still render end-to-end with the degraded inputs.
  const titles = deckSlideTitles(bankerPitchTemplate(pitch))
  assert.ok(titles.length >= 3, `expected at least cover + 1 content + sources, got ${titles.length}`)
  assert.equal(titles[0], 'MSFT · Microsoft Corporation', 'cover title preserved')
  assert.equal(titles[titles.length - 1], 'Data Sources Used',
    'trailing sources slide is auto-injected even with degraded data')
})

// ── 6) renderDeck() emits a placeholder slide for an empty template ────────

test('renderDeck() emits the placeholder slide (not a crash) for a template with no usable inputs', async () => {
  // The banker-pitch template's empty-input fall-through is the canonical
  // "we have nothing to say" path. It must produce a real PPTX with a single
  // placeholder section so callers never get an empty-deck error.
  const tpl = bankerPitchTemplate({
    ticker: 'XYZ', companyName: 'XYZ Inc', asOf: 'May 2026',
  })
  const titles = deckSlideTitles(tpl)
  assert.deepEqual(titles, [
    'XYZ · XYZ Inc',        // cover
    'Pitch deck',           // placeholder section
    'Data Sources Used',    // trailing auto-appended sources
  ], `placeholder shape changed: ${titles.join(' | ')}`)

  // And it must actually render to valid PPTX bytes — not throw.
  const buf = await renderDeck(tpl)
  assert.ok(buf.length > 5000, `expected non-trivial pptx buffer for placeholder deck, got ${buf.length} bytes`)
  assert.ok(buf.subarray(0, 4).equals(PK_SIG), 'expected PK zip signature for placeholder deck')

  // 3 unique slide xml entries — cover + placeholder + sources.
  const unique = new Set(buf.toString('binary').match(/ppt\/slides\/slide\d+\.xml/g) || [])
  assert.equal(unique.size, 3,
    `expected 3 slides for the placeholder deck (cover + placeholder + sources), got ${unique.size}`)
})

// ── 7) "Data Sources Used" slide reflects only the actually-used sources ───

// ── 8) Peer-comparison template ────────────────────────────────────────────
//
// These tests pin the contract for `peerComparisonTemplate`:
//   • slide order (cover → Overview → Valuation context → Peer comparison →
//     Data Sources Used)
//   • renderDeck() produces a valid PPTX buffer
//   • demo-badged columns and cells are passed through unmodified so the
//     renderer can apply the amber badge treatment
//   • the anchor (subject) row is flagged correctly
//   • the template degrades gracefully when optional sections are omitted

const PEER_COLUMNS: PeerComparisonColumn[] = [
  { key: 'marketCap',   label: 'Market Cap',        demo: false            },
  { key: 'pe',          label: 'P/E',                demo: false            },
  { key: 'forwardPe',   label: 'P/E (Fwd)',          demo: true,  ntm: true },
  { key: 'evEbitda',    label: 'EV / EBITDA',        demo: false            },
  { key: 'evEbitdaNtm', label: 'EV / EBITDA (NTM)', demo: true,  ntm: true },
  { key: 'ps',          label: 'P/S',                demo: false            },
]

const PEER_ROWS: PeerComparisonBodyRow[] = [
  {
    symbol: 'MSFT',
    name:   'Microsoft',
    anchor: true,
    cells: {
      marketCap:   { display: '$3.20T'              },
      pe:          { display: '30.5x'               },
      forwardPe:   { display: '28.1x', demo: true   },
      evEbitda:    { display: '22.0x'               },
      evEbitdaNtm: { display: '19.5x', demo: true   },
      ps:          { display: '12.0x'               },
    },
  },
  {
    symbol: 'GOOGL',
    name:   'Alphabet',
    anchor: false,
    cells: {
      marketCap:   { display: '$2.10T'              },
      pe:          { display: '24.1x'               },
      forwardPe:   { display: '22.8x', demo: true   },
      evEbitda:    { display: '18.6x'               },
      evEbitdaNtm: { display: '16.0x', demo: true   },
      ps:          { display: '6.4x'                },
    },
  },
  {
    symbol: 'AMZN',
    name:   'Amazon',
    anchor: false,
    cells: {
      marketCap:   { display: '$1.90T'              },
      pe:          { display: '46.0x'               },
      forwardPe:   { display: '31.0x', demo: true   },
      evEbitda:    { display: '20.0x'               },
      evEbitdaNtm: { display: '18.2x', demo: true   },
      ps:          { display: '3.1x'                },
    },
  },
]

const PEER_SUMMARY: PeerComparisonSummaryRow[] = [
  {
    label: 'Median',
    cells: { marketCap: '$2.10T', pe: '30.5x', forwardPe: '28.1x', evEbitda: '20.0x', evEbitdaNtm: '18.2x', ps: '6.4x' },
  },
  {
    label: 'Mean',
    cells: { marketCap: '$2.40T', pe: '33.5x', forwardPe: '27.3x', evEbitda: '20.2x', evEbitdaNtm: '17.9x', ps: '7.2x' },
  },
]

const PEER_INPUT: PeerComparisonDeckInput = {
  setName:  'Mega-Cap Tech',
  subject:  'MSFT',
  asOf:     '2026-06-13',
  overviewBullets: [
    'Relative-value comparison across 3 companies in the Mega-Cap Tech basket.',
    'MSFT is the anchor; peers are benchmarked against it on market cap and trading multiples.',
    'Forward P/E shown is an illustrative estimate (no consensus feed available).',
  ],
  valuationTiles: [
    { label: 'Median P/E',        value: '30.5x' },
    { label: 'Median EV/EBITDA',  value: '20.0x' },
    { label: 'Median P/S',        value: '6.4x'  },
  ],
  columns: PEER_COLUMNS,
  rows:    PEER_ROWS,
  summary: PEER_SUMMARY,
  footnote: 'Columns marked * use illustrative Finsyt estimates. LTM = last twelve months; NTM = next twelve months.',
  dataSources: [
    { name: 'Financial Modeling Prep', category: 'provider', detail: 'Quotes, market cap & trailing multiples' },
    { name: 'Finsyt estimate model',   category: 'model',    detail: 'Illustrative demo cells (forward P/E, NTM EV/EBITDA)' },
  ],
}

test('peer-comparison template enumerates cover + overview + valuation-context + peer table + sources in order', () => {
  const titles = deckSlideTitles(peerComparisonTemplate(PEER_INPUT))
  assert.deepEqual(titles, [
    'MSFT · Mega-Cap Tech',                // cover — subject · setName
    'Overview',                            // overviewBullets → executive-summary
    'Valuation context (group medians)',   // valuationTiles → kpi-table
    'Peer comparison',                     // always-present peer-comparison table
    'Data Sources Used',                   // auto-appended by renderDeck()
  ])
})

test('peer-comparison template uses setName alone as cover title when no subject is provided', () => {
  const input: PeerComparisonDeckInput = {
    ...PEER_INPUT,
    subject: undefined,
    rows: PEER_ROWS.map(r => ({ ...r, anchor: false })),
  }
  const titles = deckSlideTitles(peerComparisonTemplate(input))
  assert.equal(titles[0], 'Mega-Cap Tech',
    `cover must be just the setName when no subject is set, got: ${titles[0]}`)
})

test('peer-comparison template skips overview and valuation-context slides when those sections are absent', () => {
  // Minimal valid input — only the peer table and data sources.
  const minimal: PeerComparisonDeckInput = {
    asOf:    '2026-06-13',
    columns: PEER_COLUMNS,
    rows:    PEER_ROWS,
  }
  const titles = deckSlideTitles(peerComparisonTemplate(minimal))
  assert.deepEqual(titles, [
    'Peer Comparison',   // cover — default title when no setName
    'Peer comparison',   // always-present table slide
    'Data Sources Used',
  ])
})

test('peer-comparison template passes demo flags through to columns and cells unmodified', () => {
  // This contract underpins the renderer's amber-badge treatment:
  // demo=true columns/cells must arrive in the template's section data
  // with the flag intact so the slide renderer can colour them distinctly.
  const tpl = peerComparisonTemplate(PEER_INPUT)
  const tableSection = tpl.sections.find(s => s.type === 'peer-comparison')
  assert.ok(tableSection, 'expected a peer-comparison section')

  const sectionData = (tableSection as Extract<typeof tpl.sections[number], { type: 'peer-comparison' }>).data

  // Demo columns (forwardPe, evEbitdaNtm) must carry demo:true.
  const demoCols = sectionData.columns.filter(c => c.demo)
  assert.ok(
    demoCols.map(c => c.key).includes('forwardPe'),
    `forwardPe column must be demo:true, got: ${JSON.stringify(demoCols.map(c => c.key))}`,
  )
  assert.ok(
    demoCols.map(c => c.key).includes('evEbitdaNtm'),
    `evEbitdaNtm column must be demo:true, got: ${JSON.stringify(demoCols.map(c => c.key))}`,
  )

  // Non-demo columns (marketCap, pe, evEbitda, ps) must NOT carry demo:true.
  const realColKeys = ['marketCap', 'pe', 'evEbitda', 'ps']
  for (const key of realColKeys) {
    const col = sectionData.columns.find(c => c.key === key)
    assert.ok(col, `expected column ${key} to be present`)
    assert.ok(!col!.demo,
      `${key} column must NOT be demo:true for real quote-derived data, got demo=${col!.demo}`)
  }

  // Demo cells in rows must carry demo:true; real cells must not.
  for (const row of sectionData.rows) {
    assert.ok(row.cells.forwardPe?.demo === true,
      `${row.symbol}.forwardPe cell must be demo:true`)
    assert.ok(row.cells.evEbitdaNtm?.demo === true,
      `${row.symbol}.evEbitdaNtm cell must be demo:true`)
    assert.ok(!row.cells.pe?.demo,
      `${row.symbol}.pe cell must NOT be demo:true (real quote-derived)`)
    assert.ok(!row.cells.marketCap?.demo,
      `${row.symbol}.marketCap cell must NOT be demo:true`)
  }
})

test('peer-comparison template marks the subject row as anchor, non-subject rows as non-anchor', () => {
  const tpl = peerComparisonTemplate(PEER_INPUT)
  const tableSection = tpl.sections.find(s => s.type === 'peer-comparison')
  assert.ok(tableSection)
  const sectionData = (tableSection as Extract<typeof tpl.sections[number], { type: 'peer-comparison' }>).data

  const msftRow = sectionData.rows.find(r => r.symbol === 'MSFT')
  const googlRow = sectionData.rows.find(r => r.symbol === 'GOOGL')
  const amznRow = sectionData.rows.find(r => r.symbol === 'AMZN')

  assert.ok(msftRow?.anchor === true,
    `MSFT (subject/anchor) must have anchor:true, got: ${msftRow?.anchor}`)
  assert.ok(!googlRow?.anchor,
    `GOOGL (non-subject) must NOT have anchor:true, got: ${googlRow?.anchor}`)
  assert.ok(!amznRow?.anchor,
    `AMZN (non-subject) must NOT have anchor:true, got: ${amznRow?.anchor}`)
})

test('renderDeck() produces valid pptx bytes for the peer-comparison template', async () => {
  await assertValidPptx(peerComparisonTemplate(PEER_INPUT), 'peer-comparison')
})

test('renderDeck() applies amber text color (B45309) to demo cells and not to real cells in slide XML', async () => {
  // The renderer uses DEMO_AMBER = 'B45309' for demo-cell text in
  // renderPeerComparison(). This test unzips the generated PPTX and
  // scans the slide XML to verify the amber colour is actually emitted
  // when demo cells are present — and is absent when all cells are real.
  // This is the render-level contract that guards against someone
  // accidentally removing the demo-cell colour branch in deck-service.ts.

  // ── Deck with demo cells (forwardPe, evEbitdaNtm are demo:true) ──────────
  const bufWithDemo = await renderDeck(peerComparisonTemplate(PEER_INPUT))
  const zipWithDemo = await JSZip.loadAsync(bufWithDemo)
  const slideXmlsWithDemo: string[] = []
  for (const [name, file] of Object.entries(zipWithDemo.files)) {
    if (/ppt\/slides\/slide\d+\.xml/.test(name)) {
      slideXmlsWithDemo.push(await file.async('string'))
    }
  }
  const demoSlideContent = slideXmlsWithDemo.join('\n')

  assert.ok(
    demoSlideContent.includes('B45309'),
    'expected DEMO_AMBER (B45309) in slide XML when demo cells are present — renderer must colour demo text amber',
  )

  // Demo column headers carry a " *" suffix so readers know the column
  // is estimated. Verify it appears in the XML as well.
  assert.ok(
    demoSlideContent.includes(' *'),
    'expected " *" suffix in slide XML for demo column headers',
  )

  // ── Deck with ALL real cells (no demo flags anywhere) ────────────────────
  const allRealRows: PeerComparisonBodyRow[] = PEER_ROWS.map((r) => ({
    ...r,
    cells: Object.fromEntries(
      Object.entries(r.cells).map(([k, v]) => [k, { display: v.display }]),
    ),
  }))
  const allRealInput: PeerComparisonDeckInput = {
    ...PEER_INPUT,
    columns: PEER_COLUMNS.map((c) => ({ ...c, demo: false })),
    rows: allRealRows,
  }
  const bufAllReal = await renderDeck(peerComparisonTemplate(allRealInput))
  const zipAllReal = await JSZip.loadAsync(bufAllReal)
  const slideXmlsAllReal: string[] = []
  for (const [name, file] of Object.entries(zipAllReal.files)) {
    if (/ppt\/slides\/slide\d+\.xml/.test(name)) {
      slideXmlsAllReal.push(await file.async('string'))
    }
  }
  const realSlideContent = slideXmlsAllReal.join('\n')

  assert.ok(
    !realSlideContent.includes('B45309'),
    'expected NO amber colour (B45309) in slide XML when all cells are real — only demo cells should render in amber',
  )
})

test('"Data Sources Used" slide lists ONLY the sources that contributed — not the optimistic full list', () => {
  // Healthy memo + healthy vb + news-sourced catalysts → all five dynamic
  // dataSources entries fire alongside the always-on core provider.
  const fullPitch = pitchFromAssembly({
    memo: fullMemo(),
    vb: fullVb(),
    catalystsResult: fullCatalysts(),
  })
  const fullSourceNames = (fullPitch.dataSources ?? []).map(d => d.name).sort()
  assert.deepEqual(fullSourceNames, [
    'Default peer set',
    'FMP M&A latest feed',
    'FMP analyst estimates feed',
    'Financial Modeling Prep',
    'Finsyt DCF model',
    'Finsyt news aggregator',
  ], `expected the full optimistic list when every upstream is healthy, got ${JSON.stringify(fullSourceNames)}`)

  // Now strip transactions + DCF and confirm those entries DISAPPEAR from
  // the dataSources list — the trailing slide must never advertise providers
  // that didn't actually produce data.
  const memo = fullMemo()
  memo.transactions = { unavailable: true }
  memo.dcf          = { unavailable: true }
  const partialPitch = pitchFromAssembly({
    memo,
    vb: { ...fullVb(), dcfUsable: false, txCompsUsable: false },
    catalystsResult: fullCatalysts(),
  })
  const partialNames = (partialPitch.dataSources ?? []).map(d => d.name).sort()
  assert.deepEqual(partialNames, [
    'Default peer set',
    'FMP analyst estimates feed',
    'Financial Modeling Prep',
    'Finsyt news aggregator',
  ], `dataSources must shrink to reflect only contributing providers; got ${JSON.stringify(partialNames)}`)

  // And the rendered deck's trailing sources slide is built from exactly that
  // (post-degradation) list — confirmed by checking the template context.
  const tpl = bankerPitchTemplate(partialPitch)
  const ctxNames = tpl.context.dataSources.map(d => d.name).sort()
  assert.deepEqual(ctxNames, partialNames,
    'template.context.dataSources must equal the degradation-aware pitch.dataSources')
})
