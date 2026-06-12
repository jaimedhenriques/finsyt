/**
 * Investment Memo PPTX builder
 * ─────────────────────────────
 * Pure server-side library that, given a typed `InvestmentMemoData` object,
 * produces an in-memory .pptx buffer using pptxgenjs.
 *
 * Each slide layout has its own builder so the six layouts are
 * independently testable. The top-level `buildInvestmentMemoPptx(data)`
 * composes them and applies the Finsyt brand: navy header bar, gradient
 * accent stripe, footer with source attribution + page number, and a
 * consistent typographic hierarchy.
 *
 * This module never touches the network or the database — slide
 * builders consume only formatted strings/numbers from the assembler.
 */
import PptxGenJS from 'pptxgenjs'
import {
  renderDeck,
  FINSYT_BRAND,
  type DeckContext,
  type DataSourceUsed,
  type DeckSection,
  type DeckTemplate,
} from './deck-service'

// ─── Branding ───────────────────────────────────────────────────────────────
export const BRAND = {
  navy:    '0B1B3D',
  ink:     '0E1A33',
  body:    '4A5568',
  muted:   '6B7280',
  accent:  '4F7CFF',
  accentDim: 'EAF1FF',
  positive: '0EA371',
  negative: 'D9434E',
  divider:  'E2E8F0',
  paper:    'FFFFFF',
  surface:  'F7F9FC',
} as const

// The appendix slide is ALWAYS appended by the deck-service wrapper —
// when `data.dataSources` is empty the slide renders an "unavailable"
// placeholder rather than being skipped, so the deck shape (cover + 6
// memo + sources = 8 slides) stays predictable regardless of which
// providers fired. Contract is locked in
// `__tests__/data-sources-appendix.test.ts` and `__tests__/deck-service.test.ts`.
// APPENDIX_TITLE intentionally lives outside the canonical SLIDE_TITLES
// list because the agent UI's "rendering N slides" hint counts memo
// content slides (6) only — the appendix is bookkeeping.
export const APPENDIX_TITLE = 'Appendix · Data sources used' as const

export const SLIDE_TITLES = [
  'Company Overview',
  'Valuation Overview',
  'Peer Comparables',
  'Transaction Comparables',
  'Discounted Cash Flow',
  'Qualitative Factors',
] as const

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Marker the assembler emits when a section's data is genuinely
 * unavailable (e.g. an upstream provider returned empty). Slide builders
 * render this as a clean "Data unavailable" placeholder instead of a
 * broken table.
 */
export interface SectionUnavailable { unavailable: true; reason?: string }
export function isUnavailable<T>(x: T | SectionUnavailable): x is SectionUnavailable {
  return !!x && typeof x === 'object' && (x as SectionUnavailable).unavailable === true
}

export interface CompanyIdentity {
  ticker: string
  name: string
  exchange?: string
  sector?: string
  industry?: string
  country?: string
}

export interface OverviewSection {
  description: string
  segments: string[]            // pre-formatted segment lines, e.g. "Productivity & Business Processes — 32% of revenue"
  geography: string[]           // pre-formatted geography lines
  metrics: {
    label: string               // "LTM Revenue"
    value: string               // "$261.8B"
  }[]
}

export interface ValuationSection {
  current: { label: string; value: string }[]   // "EV / NTM EBITDA: 18.4x"
  historical: { label: string; low: string; median: string; high: string }[] // 5y range
  summary: { method: string; low: string; mid: string; high: string }[]      // valuation table rows
  // Optional forward Street consensus block — populated from /api/estimates.
  // Renders as a compact info-strip when present; omitted entirely otherwise.
  forwardConsensus?: {
    items: { label: string; value: string }[]
    note?: string
  }
}

export interface PeerRow {
  ticker: string
  name: string
  marketCap: string
  revenueGrowth: string
  ebitdaMargin: string
  evRevenue: string
  evEbitda: string
  pe: string
}

export interface TransactionRow {
  date: string                   // "Mar 2025"
  acquirer: string
  target: string
  evMm: string                   // "$3.4B"
  evRevenue: string
  evEbitda: string
}

export interface DcfSection {
  assumptions: { label: string; value: string }[]
  perShare: {
    enterpriseValue: string
    equityValue: string
    sharesOutstanding: string
    intrinsicPerShare: string
    currentPrice: string
    upsidePct: string
  }
  yearTable: { year: string; fcf: string; growth: string; pv: string }[]
}

export interface QualitativeSection {
  strengths: string[]
  risks: string[]
  catalysts: string[]
  esg: string[]
}

/**
 * Provider/connector usage trace mirrored from the agent SSE stream so the
 * deck can render the same "Data sources used" appendix the chat surfaces.
 * Kept structurally identical to `ProviderTrace` in `lib/data-sources-trace`
 * so call sites can pass values through without any massaging.
 */
export interface DataSourceEntry {
  label:       string                              // "Financial Modeling Prep"
  role:        'primary' | 'fallback' | 'citation'
  responseMs?: number                              // tool round-trip ms
  citationCount?: number                           // citations contributed
  detail?:     string                              // e.g. "Real-time quote"
  hubHref?:    string                              // Connector Hub deep link (rendered as URL text)
}

export interface InvestmentMemoData {
  identity: CompanyIdentity
  asOf: string                   // "May 2026"
  sourceLine: string             // "Sources: S&P Capital IQ Fundamentals."
  overview:    OverviewSection    | SectionUnavailable
  valuation:   ValuationSection   | SectionUnavailable
  peers:       PeerRow[]          | SectionUnavailable
  transactions: TransactionRow[]  | SectionUnavailable
  dcf:         DcfSection         | SectionUnavailable
  qualitative: QualitativeSection | SectionUnavailable
  /**
   * Per-provider trace shown in the always-appended "Data Sources Used"
   * appendix slide. When omitted/empty the appendix still renders, with
   * an "unavailable" placeholder instead of the table.
   */
  dataSources?: DataSourceEntry[]
}

// ─── Page geometry ──────────────────────────────────────────────────────────
// Slide is 10in × 5.625in (16:9). Header bar 0.55in, footer 0.35in.
const W = 10
const H = 5.625
const HEADER_H = 0.55
const FOOTER_H = 0.35
const MARGIN_X = 0.45
const CONTENT_TOP = HEADER_H + 0.18
const CONTENT_BOTTOM = H - FOOTER_H - 0.15
const CONTENT_W = W - MARGIN_X * 2
const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP

// Common text styles
const T = {
  slideTitle: { fontFace: 'Inter', fontSize: 22, bold: true, color: BRAND.paper },
  ticker:     { fontFace: 'Inter', fontSize: 11, color: 'D7E0F5' },
  sectionLabel: { fontFace: 'Inter', fontSize: 9.5, bold: true, color: BRAND.muted, charSpacing: 1.5 },
  body:       { fontFace: 'Inter', fontSize: 11, color: BRAND.ink },
  bodyDim:    { fontFace: 'Inter', fontSize: 10.5, color: BRAND.body },
  metricLabel:{ fontFace: 'Inter', fontSize: 9.5, color: BRAND.muted, charSpacing: 1 },
  metricValue:{ fontFace: 'Inter', fontSize: 18, bold: true, color: BRAND.ink },
  th:         { fontFace: 'Inter', fontSize: 9.5, bold: true, color: BRAND.paper, fill: { color: BRAND.navy }, align: 'left', valign: 'middle' },
  td:         { fontFace: 'Inter', fontSize: 10, color: BRAND.ink, align: 'left', valign: 'middle' },
  tdNum:      { fontFace: 'Inter', fontSize: 10, color: BRAND.ink, align: 'right', valign: 'middle' },
  footer:     { fontFace: 'Inter', fontSize: 8.5, color: BRAND.muted },
} as const

// ─── Chrome (header / footer) ────────────────────────────────────────────────
function applyChrome(
  slide: PptxGenJS.Slide,
  data: InvestmentMemoData,
  title: string,
  page: number,
  total: number,
) {
  // Navy header bar
  slide.addShape('rect', { x: 0, y: 0, w: W, h: HEADER_H, fill: { color: BRAND.navy }, line: { color: BRAND.navy } })
  // Accent stripe
  slide.addShape('rect', { x: 0, y: HEADER_H, w: W, h: 0.04, fill: { color: BRAND.accent }, line: { color: BRAND.accent } })

  // Title (centred vertically)
  slide.addText(title, { x: MARGIN_X, y: 0.07, w: CONTENT_W * 0.7, h: HEADER_H - 0.14, ...T.slideTitle })
  // Ticker / company name on the right
  const idLine = `${data.identity.ticker}${data.identity.name ? ' · ' + data.identity.name : ''}${data.identity.exchange ? ' · ' + data.identity.exchange : ''}`
  slide.addText(idLine, { x: W - MARGIN_X - 4.2, y: 0.16, w: 4.2, h: HEADER_H - 0.20, ...T.ticker, align: 'right' })

  // Footer
  slide.addShape('rect', { x: 0, y: H - FOOTER_H, w: W, h: 0.02, fill: { color: BRAND.divider }, line: { color: BRAND.divider } })
  slide.addText(data.sourceLine || 'Sources: Finsyt platform data.', {
    x: MARGIN_X, y: H - FOOTER_H + 0.08, w: CONTENT_W - 1.2, h: FOOTER_H - 0.10, ...T.footer, align: 'left',
  })
  slide.addText(`Finsyt Investment Memo · ${data.asOf} · ${page} / ${total}`, {
    x: W - MARGIN_X - 3.6, y: H - FOOTER_H + 0.08, w: 3.6, h: FOOTER_H - 0.10, ...T.footer, align: 'right',
  })
}

function unavailableBlock(slide: PptxGenJS.Slide, reason?: string) {
  slide.addShape('roundRect', {
    x: MARGIN_X, y: CONTENT_TOP + CONTENT_H * 0.30, w: CONTENT_W, h: CONTENT_H * 0.40,
    fill: { color: BRAND.surface }, line: { color: BRAND.divider }, rectRadius: 0.12,
  })
  slide.addText('Data unavailable', {
    x: MARGIN_X, y: CONTENT_TOP + CONTENT_H * 0.34, w: CONTENT_W, h: 0.5,
    fontFace: 'Inter', fontSize: 16, bold: true, color: BRAND.body, align: 'center',
  })
  slide.addText(reason || 'No upstream data could be resolved for this section.', {
    x: MARGIN_X + 1, y: CONTENT_TOP + CONTENT_H * 0.50, w: CONTENT_W - 2, h: 0.6,
    fontFace: 'Inter', fontSize: 11, color: BRAND.muted, align: 'center',
  })
}

function sectionLabel(slide: PptxGenJS.Slide, text: string, x: number, y: number, w: number) {
  slide.addText(text.toUpperCase(), { x, y, w, h: 0.20, ...T.sectionLabel })
}

// ─── Slide 1: Company Overview ───────────────────────────────────────────────
export function buildOverviewSlide(pptx: PptxGenJS, data: InvestmentMemoData, page: number, total: number) {
  const slide = pptx.addSlide()
  applyChrome(slide, data, SLIDE_TITLES[0], page, total)
  if (isUnavailable(data.overview)) { unavailableBlock(slide, data.overview.reason); return }
  const o = data.overview

  // Left column: description + segments + geography
  const leftW = CONTENT_W * 0.58
  let y = CONTENT_TOP

  sectionLabel(slide, 'Business description', MARGIN_X, y, leftW); y += 0.22
  slide.addText(o.description || '—', {
    x: MARGIN_X, y, w: leftW, h: 1.4, ...T.body, valign: 'top',
  })
  y += 1.5

  sectionLabel(slide, 'Operating segments', MARGIN_X, y, leftW); y += 0.22
  const segLines = (o.segments.length ? o.segments : ['Segment data unavailable']).slice(0, 5)
  slide.addText(segLines.map(s => ({ text: s, options: { bullet: { code: '25AA' } } })), {
    x: MARGIN_X, y, w: leftW, h: 1.0, ...T.bodyDim, valign: 'top', paraSpaceAfter: 3,
  })
  y += 1.05

  sectionLabel(slide, 'Geographic footprint', MARGIN_X, y, leftW); y += 0.22
  const geoLines = (o.geography.length ? o.geography : ['Geographic split unavailable']).slice(0, 4)
  slide.addText(geoLines.map(s => ({ text: s, options: { bullet: { code: '25AA' } } })), {
    x: MARGIN_X, y, w: leftW, h: 0.9, ...T.bodyDim, valign: 'top', paraSpaceAfter: 3,
  })

  // Right column: key metric tiles
  const rightX = MARGIN_X + leftW + 0.25
  const rightW = CONTENT_W - leftW - 0.25
  sectionLabel(slide, 'Key financial metrics', rightX, CONTENT_TOP, rightW)
  const metrics = o.metrics.slice(0, 5)
  const tileH = (CONTENT_H - 0.30) / Math.max(metrics.length, 1)
  metrics.forEach((m, i) => {
    const ty = CONTENT_TOP + 0.30 + i * tileH
    slide.addShape('roundRect', {
      x: rightX, y: ty + 0.04, w: rightW, h: tileH - 0.10,
      fill: { color: BRAND.surface }, line: { color: BRAND.divider }, rectRadius: 0.06,
    })
    slide.addText(m.label.toUpperCase(), { x: rightX + 0.18, y: ty + 0.10, w: rightW - 0.30, h: 0.22, ...T.metricLabel })
    slide.addText(m.value || '—', { x: rightX + 0.18, y: ty + 0.30, w: rightW - 0.30, h: tileH - 0.40, ...T.metricValue, valign: 'middle' })
  })
}

// ─── Slide 2: Valuation Overview ─────────────────────────────────────────────
export function buildValuationSlide(pptx: PptxGenJS, data: InvestmentMemoData, page: number, total: number) {
  const slide = pptx.addSlide()
  applyChrome(slide, data, SLIDE_TITLES[1], page, total)
  if (isUnavailable(data.valuation)) { unavailableBlock(slide, data.valuation.reason); return }
  const v = data.valuation

  // Top row: current trading multiples as tiles
  const top = CONTENT_TOP
  const cur = v.current.slice(0, 5)
  sectionLabel(slide, 'Current trading multiples', MARGIN_X, top, CONTENT_W); 
  const tileW = (CONTENT_W - (cur.length - 1) * 0.12) / Math.max(cur.length, 1)
  const tileY = top + 0.26
  const tileH = 0.85
  cur.forEach((c, i) => {
    const x = MARGIN_X + i * (tileW + 0.12)
    slide.addShape('roundRect', { x, y: tileY, w: tileW, h: tileH, fill: { color: BRAND.accentDim }, line: { color: BRAND.accent }, rectRadius: 0.06 })
    slide.addText(c.label.toUpperCase(), { x: x + 0.10, y: tileY + 0.08, w: tileW - 0.20, h: 0.22, ...T.metricLabel, color: '3056DA' })
    slide.addText(c.value || '—', { x: x + 0.10, y: tileY + 0.30, w: tileW - 0.20, h: tileH - 0.40, ...T.metricValue, valign: 'middle' })
  })

  // Optional: forward Street consensus strip (price target, NTM revenue, NTM EPS)
  let nextY = tileY + tileH + 0.30
  if (v.forwardConsensus && v.forwardConsensus.items.length > 0) {
    const fc = v.forwardConsensus
    const stripH = 0.62
    sectionLabel(slide, 'Forward Street consensus', MARGIN_X, nextY, CONTENT_W)
    const fcTop = nextY + 0.26
    const items = fc.items.slice(0, 5)
    const fcW = (CONTENT_W - (items.length - 1) * 0.10) / Math.max(items.length, 1)
    items.forEach((it, i) => {
      const x = MARGIN_X + i * (fcW + 0.10)
      slide.addShape('roundRect', { x, y: fcTop, w: fcW, h: stripH, fill: { color: BRAND.surface }, line: { color: BRAND.divider }, rectRadius: 0.05 })
      slide.addText(it.label.toUpperCase(), { x: x + 0.08, y: fcTop + 0.06, w: fcW - 0.16, h: 0.20, ...T.metricLabel })
      slide.addText(it.value || '—',         { x: x + 0.08, y: fcTop + 0.24, w: fcW - 0.16, h: stripH - 0.30, ...T.metricValue, valign: 'middle' })
    })
    nextY = fcTop + stripH + 0.22
  }

  // Middle: historical multiple ranges
  const histY = nextY
  sectionLabel(slide, '5-year multiple range (low / median / high)', MARGIN_X, histY, CONTENT_W)
  const histRows = v.historical.slice(0, 4)
  if (histRows.length) {
    const rows: PptxGenJS.TableRow[] = [
      [
        { text: 'Multiple',  options: T.th },
        { text: '5y Low',    options: { ...T.th, align: 'right' } },
        { text: '5y Median', options: { ...T.th, align: 'right' } },
        { text: '5y High',   options: { ...T.th, align: 'right' } },
      ],
      ...histRows.map((r, i): PptxGenJS.TableRow => [
        { text: r.label,  options: { ...T.td, fill: { color: i % 2 ? BRAND.surface : BRAND.paper } } },
        { text: r.low,    options: { ...T.tdNum, fill: { color: i % 2 ? BRAND.surface : BRAND.paper } } },
        { text: r.median, options: { ...T.tdNum, fill: { color: i % 2 ? BRAND.surface : BRAND.paper } } },
        { text: r.high,   options: { ...T.tdNum, fill: { color: i % 2 ? BRAND.surface : BRAND.paper } } },
      ]),
    ]
    slide.addTable(rows, {
      x: MARGIN_X, y: histY + 0.26, w: CONTENT_W,
      colW: [CONTENT_W * 0.40, CONTENT_W * 0.20, CONTENT_W * 0.20, CONTENT_W * 0.20],
      rowH: 0.30, border: { type: 'solid', pt: 0.5, color: BRAND.divider },
    })
  }

  // Bottom: summary valuation table
  const sumY = histY + 0.26 + Math.max(histRows.length + 1, 2) * 0.30 + 0.25
  sectionLabel(slide, 'Summary valuation', MARGIN_X, sumY, CONTENT_W)
  const sumRows = v.summary.slice(0, 4)
  if (sumRows.length) {
    const rows: PptxGenJS.TableRow[] = [
      [
        { text: 'Method', options: T.th },
        { text: 'Low',    options: { ...T.th, align: 'right' } },
        { text: 'Mid',    options: { ...T.th, align: 'right' } },
        { text: 'High',   options: { ...T.th, align: 'right' } },
      ],
      ...sumRows.map((r, i): PptxGenJS.TableRow => [
        { text: r.method, options: { ...T.td, fill: { color: i % 2 ? BRAND.surface : BRAND.paper } } },
        { text: r.low,    options: { ...T.tdNum, fill: { color: i % 2 ? BRAND.surface : BRAND.paper } } },
        { text: r.mid,    options: { ...T.tdNum, fill: { color: i % 2 ? BRAND.surface : BRAND.paper } } },
        { text: r.high,   options: { ...T.tdNum, fill: { color: i % 2 ? BRAND.surface : BRAND.paper } } },
      ]),
    ]
    slide.addTable(rows, {
      x: MARGIN_X, y: sumY + 0.26, w: CONTENT_W,
      colW: [CONTENT_W * 0.40, CONTENT_W * 0.20, CONTENT_W * 0.20, CONTENT_W * 0.20],
      rowH: 0.30, border: { type: 'solid', pt: 0.5, color: BRAND.divider },
    })
  }
}

// ─── Slide 3: Peer Comparables ───────────────────────────────────────────────
export function buildPeerComparablesSlide(pptx: PptxGenJS, data: InvestmentMemoData, page: number, total: number) {
  const slide = pptx.addSlide()
  applyChrome(slide, data, SLIDE_TITLES[2], page, total)
  if (isUnavailable(data.peers)) { unavailableBlock(slide, data.peers.reason); return }
  const peers = data.peers
  if (peers.length === 0) { unavailableBlock(slide, 'No peers resolved for this ticker.'); return }

  sectionLabel(slide, 'Public peer set — size, growth, margin and multiples', MARGIN_X, CONTENT_TOP, CONTENT_W)
  const cols = ['Ticker', 'Company', 'Mkt Cap', 'Rev Growth', 'EBITDA Mgn', 'EV/Rev', 'EV/EBITDA', 'P/E']
  const colW: number[] = [
    CONTENT_W * 0.08,
    CONTENT_W * 0.26,
    CONTENT_W * 0.10,
    CONTENT_W * 0.11,
    CONTENT_W * 0.11,
    CONTENT_W * 0.11,
    CONTENT_W * 0.12,
    CONTENT_W * 0.11,
  ]
  const header: PptxGenJS.TableRow = cols.map((c, i): PptxGenJS.TableCell => ({
    text: c, options: { ...T.th, align: i <= 1 ? 'left' : 'right' },
  }))
  const body: PptxGenJS.TableRow[] = peers.slice(0, 9).map((p, i): PptxGenJS.TableRow => {
    const fill = { color: i % 2 ? BRAND.surface : BRAND.paper }
    const rowTd = { ...T.td, fill }
    const rowTdNum = { ...T.tdNum, fill }
    return [
      { text: p.ticker,        options: { ...rowTd, bold: true, color: BRAND.accent } },
      { text: p.name,          options: rowTd },
      { text: p.marketCap,     options: rowTdNum },
      { text: p.revenueGrowth, options: rowTdNum },
      { text: p.ebitdaMargin,  options: rowTdNum },
      { text: p.evRevenue,     options: rowTdNum },
      { text: p.evEbitda,      options: rowTdNum },
      { text: p.pe,            options: rowTdNum },
    ]
  })
  slide.addTable([header, ...body], {
    x: MARGIN_X, y: CONTENT_TOP + 0.26, w: CONTENT_W,
    colW, rowH: 0.30, border: { type: 'solid', pt: 0.5, color: BRAND.divider },
  })
}

// ─── Slide 4: Transaction Comparables ────────────────────────────────────────
export function buildTransactionComparablesSlide(pptx: PptxGenJS, data: InvestmentMemoData, page: number, total: number) {
  const slide = pptx.addSlide()
  applyChrome(slide, data, SLIDE_TITLES[3], page, total)
  if (isUnavailable(data.transactions)) { unavailableBlock(slide, data.transactions.reason); return }
  const tx = data.transactions
  if (tx.length === 0) { unavailableBlock(slide, 'No precedent transactions found in this sector.'); return }

  sectionLabel(slide, 'Recent precedent M&A transactions in the sector', MARGIN_X, CONTENT_TOP, CONTENT_W)
  const cols = ['Announced', 'Acquirer', 'Target', 'Deal EV', 'EV/Rev', 'EV/EBITDA']
  const colW: number[] = [
    CONTENT_W * 0.13,
    CONTENT_W * 0.26,
    CONTENT_W * 0.26,
    CONTENT_W * 0.13,
    CONTENT_W * 0.11,
    CONTENT_W * 0.11,
  ]
  const header: PptxGenJS.TableRow = cols.map((c, i): PptxGenJS.TableCell => ({
    text: c, options: { ...T.th, align: i <= 2 ? 'left' : 'right' },
  }))
  const body: PptxGenJS.TableRow[] = tx.slice(0, 8).map((r, i): PptxGenJS.TableRow => {
    const fill = { color: i % 2 ? BRAND.surface : BRAND.paper }
    return [
      { text: r.date,      options: { ...T.td, fill } },
      { text: r.acquirer,  options: { ...T.td, fill } },
      { text: r.target,    options: { ...T.td, fill, bold: true, color: BRAND.ink } },
      { text: r.evMm,      options: { ...T.tdNum, fill } },
      { text: r.evRevenue, options: { ...T.tdNum, fill } },
      { text: r.evEbitda,  options: { ...T.tdNum, fill } },
    ]
  })
  slide.addTable([header, ...body], {
    x: MARGIN_X, y: CONTENT_TOP + 0.26, w: CONTENT_W,
    colW, rowH: 0.32, border: { type: 'solid', pt: 0.5, color: BRAND.divider },
  })
}

// ─── Slide 5: Discounted Cash Flow ───────────────────────────────────────────
export function buildDcfSlide(pptx: PptxGenJS, data: InvestmentMemoData, page: number, total: number) {
  const slide = pptx.addSlide()
  applyChrome(slide, data, SLIDE_TITLES[4], page, total)
  if (isUnavailable(data.dcf)) { unavailableBlock(slide, data.dcf.reason); return }
  const dcf = data.dcf

  // Left: assumptions
  const leftW = CONTENT_W * 0.34
  sectionLabel(slide, 'Key assumptions', MARGIN_X, CONTENT_TOP, leftW)
  const aRows: PptxGenJS.TableRow[] = dcf.assumptions.map((a, i) => {
    const fill = { color: i % 2 ? BRAND.surface : BRAND.paper }
    return [
      { text: a.label, options: { ...T.td, fill } },
      { text: a.value, options: { ...T.tdNum, fill, bold: true } },
    ]
  })
  slide.addTable(aRows, {
    x: MARGIN_X, y: CONTENT_TOP + 0.26, w: leftW,
    colW: [leftW * 0.62, leftW * 0.38], rowH: 0.28,
    border: { type: 'solid', pt: 0.5, color: BRAND.divider },
  })

  // Right: per-share callout + projection table
  const rightX = MARGIN_X + leftW + 0.25
  const rightW = CONTENT_W - leftW - 0.25
  sectionLabel(slide, 'Per-share value', rightX, CONTENT_TOP, rightW)

  // Two big tiles: intrinsic vs market
  const tileH = 1.0
  const tileW = (rightW - 0.18) / 2
  slide.addShape('roundRect', { x: rightX, y: CONTENT_TOP + 0.26, w: tileW, h: tileH, fill: { color: BRAND.navy }, line: { color: BRAND.navy }, rectRadius: 0.08 })
  slide.addText('INTRINSIC / SHARE', { x: rightX + 0.16, y: CONTENT_TOP + 0.32, w: tileW - 0.30, h: 0.22, fontFace: 'Inter', fontSize: 9.5, bold: true, color: 'D7E0F5', charSpacing: 1 })
  slide.addText(dcf.perShare.intrinsicPerShare, { x: rightX + 0.16, y: CONTENT_TOP + 0.52, w: tileW - 0.30, h: tileH - 0.40, fontFace: 'Inter', fontSize: 22, bold: true, color: BRAND.paper, valign: 'middle' })

  const upsideNum = parseFloat(dcf.perShare.upsidePct.replace(/[^0-9.\-]/g, ''))
  const upsideColor = isFinite(upsideNum) && upsideNum >= 0 ? BRAND.positive : BRAND.negative
  const tile2X = rightX + tileW + 0.18
  slide.addShape('roundRect', { x: tile2X, y: CONTENT_TOP + 0.26, w: tileW, h: tileH, fill: { color: BRAND.surface }, line: { color: BRAND.divider }, rectRadius: 0.08 })
  slide.addText('MARKET / UPSIDE', { x: tile2X + 0.16, y: CONTENT_TOP + 0.32, w: tileW - 0.30, h: 0.22, ...T.metricLabel })
  slide.addText(`${dcf.perShare.currentPrice} → ${dcf.perShare.upsidePct}`, { x: tile2X + 0.16, y: CONTENT_TOP + 0.52, w: tileW - 0.30, h: tileH - 0.40, fontFace: 'Inter', fontSize: 18, bold: true, color: upsideColor, valign: 'middle' })

  // Projection table
  const projY = CONTENT_TOP + 0.26 + tileH + 0.25
  sectionLabel(slide, 'Free cash flow projection', rightX, projY, rightW)
  const yrRows = dcf.yearTable.slice(0, 8)
  if (yrRows.length) {
    const rows: PptxGenJS.TableRow[] = [
      [
        { text: 'Year',   options: T.th },
        { text: 'FCF ($M)', options: { ...T.th, align: 'right' } },
        { text: 'Growth', options: { ...T.th, align: 'right' } },
        { text: 'PV ($M)', options: { ...T.th, align: 'right' } },
      ],
      ...yrRows.map((r, i): PptxGenJS.TableRow => {
        const fill = { color: i % 2 ? BRAND.surface : BRAND.paper }
        return [
          { text: r.year,   options: { ...T.td, fill, bold: true } },
          { text: r.fcf,    options: { ...T.tdNum, fill } },
          { text: r.growth, options: { ...T.tdNum, fill } },
          { text: r.pv,     options: { ...T.tdNum, fill } },
        ]
      }),
    ]
    slide.addTable(rows, {
      x: rightX, y: projY + 0.26, w: rightW,
      colW: [rightW * 0.18, rightW * 0.28, rightW * 0.24, rightW * 0.30],
      rowH: 0.26, border: { type: 'solid', pt: 0.5, color: BRAND.divider },
    })
  }
}

// ─── Slide 6: Qualitative Factors ────────────────────────────────────────────
export function buildQualitativeSlide(pptx: PptxGenJS, data: InvestmentMemoData, page: number, total: number) {
  const slide = pptx.addSlide()
  applyChrome(slide, data, SLIDE_TITLES[5], page, total)
  if (isUnavailable(data.qualitative)) { unavailableBlock(slide, data.qualitative.reason); return }
  const q = data.qualitative

  const colW = (CONTENT_W - 0.30) / 2
  const rowH = (CONTENT_H - 0.30) / 2

  function quad(title: string, items: string[], col: number, row: number, accent: string) {
    const x = MARGIN_X + col * (colW + 0.30)
    const y = CONTENT_TOP + row * (rowH + 0.30)
    slide.addShape('roundRect', {
      x, y, w: colW, h: rowH,
      fill: { color: BRAND.paper }, line: { color: BRAND.divider }, rectRadius: 0.08,
    })
    // Coloured top stripe
    slide.addShape('rect', { x, y, w: colW, h: 0.10, fill: { color: accent }, line: { color: accent } })
    slide.addText(title.toUpperCase(), { x: x + 0.18, y: y + 0.18, w: colW - 0.30, h: 0.24, ...T.sectionLabel, color: BRAND.ink })
    const list = items.length ? items.slice(0, 5) : ['No items captured']
    slide.addText(list.map(s => ({ text: s, options: { bullet: { code: '25AA' } } })), {
      x: x + 0.18, y: y + 0.46, w: colW - 0.30, h: rowH - 0.56,
      ...T.bodyDim, valign: 'top', paraSpaceAfter: 4,
    })
  }

  quad('Strengths',  q.strengths,  0, 0, BRAND.positive)
  quad('Risks',      q.risks,      1, 0, BRAND.negative)
  quad('Catalysts',  q.catalysts,  0, 1, BRAND.accent)
  quad('ESG considerations', q.esg, 1, 1, '8B5CF6')
}

// ─── Slide 8: Appendix · Data sources used ───────────────────────────────────
/**
 * Renders the same "Data sources used" trace the chat surfaces, as a
 * standalone appendix slide. ALWAYS rendered when invoked: when
 * `data.dataSources` is empty the slide shows the
 * "No provider trace was recorded" placeholder rather than being
 * skipped, so the canonical 8-slide deck shape (cover + 6 memo +
 * sources) stays stable regardless of which providers fired.
 * Contract locked in `__tests__/data-sources-appendix.test.ts`.
 */
export function buildDataSourcesAppendixSlide(
  pptx: PptxGenJS,
  data: InvestmentMemoData,
  page: number,
  total: number,
) {
  const slide = pptx.addSlide()
  applyChrome(slide, data, APPENDIX_TITLE, page, total)
  const rows = data.dataSources || []
  if (!rows.length) {
    unavailableBlock(slide, 'No provider trace was recorded for this run.')
    return
  }

  // Intro caption
  slide.addText(
    'Every figure in this deck was sourced via the providers below. Roles match the agent answer footer; response times reflect tool round-trips at generation time.',
    { x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W, h: 0.42, ...T.bodyDim },
  )

  // Header row + data rows
  const tableY = CONTENT_TOP + 0.55
  const rowCols = [
    { key: 'role',          label: 'Role',          w: 0.95, align: 'left'  as const },
    { key: 'label',         label: 'Provider',      w: 2.85, align: 'left'  as const },
    { key: 'detail',        label: 'Used for',      w: 2.55, align: 'left'  as const },
    { key: 'responseMs',    label: 'Response',      w: 1.05, align: 'right' as const },
    { key: 'citationCount', label: 'Citations',     w: 0.95, align: 'right' as const },
    { key: 'hubHref',       label: 'Connector Hub', w: CONTENT_W - 0.95 - 2.85 - 2.55 - 1.05 - 0.95, align: 'left' as const },
  ]
  const rowH = 0.28
  let x = MARGIN_X
  for (const c of rowCols) {
    slide.addText(c.label, {
      x, y: tableY, w: c.w, h: rowH,
      ...T.th, align: c.align,
    })
    x += c.w
  }

  rows.slice(0, 14).forEach((r, i) => {
    const y = tableY + rowH + i * rowH
    if (i % 2 === 1) {
      slide.addShape('rect', {
        x: MARGIN_X, y, w: CONTENT_W, h: rowH,
        fill: { color: BRAND.surface }, line: { color: BRAND.surface },
      })
    }
    let cx = MARGIN_X
    const roleColor =
      r.role === 'primary'  ? BRAND.accent  :
      r.role === 'fallback' ? 'B45309'      :
      /* citation */          '7C3AED'
    const roleLabel = r.role.charAt(0).toUpperCase() + r.role.slice(1)
    slide.addText(roleLabel, {
      x: cx + 0.04, y: y + 0.03, w: rowCols[0].w - 0.08, h: rowH - 0.06,
      fontFace: 'Inter', fontSize: 9, bold: true, color: roleColor, align: 'left', valign: 'middle',
    })
    cx += rowCols[0].w
    slide.addText(r.label, {
      x: cx + 0.04, y, w: rowCols[1].w - 0.08, h: rowH,
      ...T.td, fontSize: 9.5, bold: true,
    })
    cx += rowCols[1].w
    slide.addText(r.detail || '—', {
      x: cx + 0.04, y, w: rowCols[2].w - 0.08, h: rowH,
      ...T.td, fontSize: 9, color: BRAND.body,
    })
    cx += rowCols[2].w
    slide.addText(typeof r.responseMs === 'number' ? formatMs(r.responseMs) : '—', {
      x: cx + 0.04, y, w: rowCols[3].w - 0.08, h: rowH,
      ...T.tdNum, fontSize: 9,
    })
    cx += rowCols[3].w
    slide.addText(typeof r.citationCount === 'number' && r.citationCount > 0 ? String(r.citationCount) : '—', {
      x: cx + 0.04, y, w: rowCols[4].w - 0.08, h: rowH,
      ...T.tdNum, fontSize: 9,
    })
    cx += rowCols[4].w
    if (r.hubHref) {
      slide.addText(
        [{ text: r.hubHref, options: { hyperlink: { url: r.hubHref, tooltip: 'Open Connector Hub' } } }],
        {
          x: cx + 0.04, y, w: rowCols[5].w - 0.08, h: rowH,
          fontFace: 'Inter', fontSize: 8.5, color: BRAND.accent, align: 'left', valign: 'middle',
        },
      )
    } else {
      slide.addText('—', { x: cx + 0.04, y, w: rowCols[5].w - 0.08, h: rowH, ...T.td, fontSize: 9, color: BRAND.muted })
    }
  })

  if (rows.length > 14) {
    slide.addText(
      `+${rows.length - 14} additional source${rows.length - 14 === 1 ? '' : 's'} omitted for layout`,
      { x: MARGIN_X, y: CONTENT_BOTTOM - 0.30, w: CONTENT_W, h: 0.22, ...T.footer, italic: true },
    )
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

// ─── Top-level composer ──────────────────────────────────────────────────────
/**
 * Infer which providers / models / feeds were touched while assembling this
 * memo. Mirrors `inferMemoDataSources` in `deck-templates.ts` (kept here as
 * a forward-compatible default in case `buildInvestmentMemoPptx` is called
 * standalone without the template wrapper).
 */
function defaultMemoDataSources(data: InvestmentMemoData): DataSourceUsed[] {
  const out: DataSourceUsed[] = []
  out.push({ name: 'Financial Modeling Prep', category: 'provider', detail: 'Quote, income / balance / cash-flow statements, key metrics, segments' })
  if (!isUnavailable(data.peers))        out.push({ name: 'FMP stock-peers + ratios feed', category: 'feed', detail: `${(data.peers as PeerRow[]).length} peer profiles + TTM ratios` })
  if (!isUnavailable(data.transactions)) out.push({ name: 'FMP M&A latest feed',           category: 'feed', detail: `${(data.transactions as TransactionRow[]).length} recent precedent transactions` })
  if (!isUnavailable(data.valuation) && (data.valuation as ValuationSection).forwardConsensus) {
    out.push({ name: 'FMP analyst estimates feed', category: 'feed', detail: 'Forward NTM revenue / EPS / price targets' })
  }
  if (!isUnavailable(data.dcf)) out.push({ name: 'Finsyt DCF model', category: 'model', detail: '2-stage DCF with CAPM-derived discount rate' })
  out.push({ name: 'Yahoo Finance public endpoints', category: 'provider', detail: 'Backup quote feed' })
  return out
}

/**
 * Build the deck-service `DeckTemplate` for the investment memo. This is the
 * single source of truth for the memo's deck shape — the legacy
 * `buildInvestmentMemoPptx` exporter is now a thin wrapper around
 * `renderDeck(investmentMemoTemplate(...))`, and the public deck route
 * calls the same function. Lives here (not in `deck-templates.ts`) so the
 * memo module can call it without a circular import.
 */
export function investmentMemoTemplate(
  data: InvestmentMemoData,
  options?: { dataSources?: DataSourceUsed[] },
): DeckTemplate {
  const dataSources = options?.dataSources ?? defaultMemoDataSources(data)
  const identityLine = `${data.identity.ticker}${data.identity.name ? ' · ' + data.identity.name : ''}${data.identity.exchange ? ' · ' + data.identity.exchange : ''}`

  // The 6 highly-customised inner slides re-use the existing slide builders
  // verbatim via the deck-service `extension` section — page / total are
  // injected by `renderDeck` so the chrome stays consistent with the cover
  // and sources slides.
  const memoBuilders = [
    buildOverviewSlide,
    buildValuationSlide,
    buildPeerComparablesSlide,
    buildTransactionComparablesSlide,
    buildDcfSlide,
    buildQualitativeSlide,
  ] as const

  const sections: DeckSection[] = SLIDE_TITLES.map((title, i) => ({
    type: 'extension',
    data: {
      title,
      renderOwn: (pptx, _ctx, page, total) => memoBuilders[i](pptx, data, page, total),
    },
  }))

  return {
    templateId: 'investment-memo',
    context: {
      brand: FINSYT_BRAND,
      cover: {
        eyebrow:  'Finsyt Investment Memo',
        title:    `${data.identity.ticker} · ${data.identity.name}`,
        subtitle: [data.identity.exchange, data.identity.sector].filter(Boolean).join(' · '),
        asOf:     data.asOf,
        presenter: 'Finsyt Research',
      },
      asOf:        data.asOf,
      footerLine:  data.sourceLine || 'Sources: Finsyt platform data.',
      identityLine,
      dataSources,
    } satisfies DeckContext,
    sections,
    meta: {
      title:   `${data.identity.ticker} Investment Memo`,
      subject: `Generated ${data.asOf}`,
      author:  'Finsyt Agent',
      company: 'Finsyt',
    },
  }
}

/**
 * Public memo entry point — strict wrapper around
 * `renderDeck(investmentMemoTemplate(data))`. Kept for backward compat with
 * the existing `/api/copilot/memo` route, the agent/ask SSE stream, and any
 * direct importers; the deck route uses the same code path.
 */
export async function buildInvestmentMemoPptx(
  data: InvestmentMemoData,
  options?: { dataSources?: DataSourceUsed[] },
): Promise<Buffer> {
  return renderDeck(investmentMemoTemplate(data, options))
}

/**
 * Slide-title list exposed by this module. Returns the full deck shape
 * (cover + 6 memo slides + "Data Sources Used") so consumers can keep
 * their slide-count metadata aligned with what `buildInvestmentMemoPptx`
 * actually emits. Pure / synchronous.
 */
export function memoSlideTitles(data: InvestmentMemoData): string[] {
  return [
    `${data.identity.ticker} · ${data.identity.name}`,
    ...SLIDE_TITLES,
    'Data Sources Used',
  ]
}

/**
 * Render lightweight SVG thumbnails of each slide based purely on the
 * `InvestmentMemoData` so callers don't need a headless renderer. Returned
 * as data: URLs so the chat card can drop them straight into <img src=…>.
 */
export function buildSlideThumbnails(data: InvestmentMemoData): { title: string; svg: string }[] {
  const palette = [BRAND.navy, '1E3A8A', '0EA371', '8B5CF6', '4F7CFF', 'D9434E']
  return SLIDE_TITLES.map((title, i) => {
    const accent = palette[i % palette.length]
    const subtitle = data.identity.ticker
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
  <defs>
    <linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#${BRAND.navy}"/>
      <stop offset="100%" stop-color="#${accent}"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="white" stroke="#E2E8F0" />
  <rect width="320" height="32" fill="url(#g${i})" />
  <rect y="32" width="320" height="2" fill="#${BRAND.accent}" />
  <text x="14" y="22" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="700" fill="white">${escapeXml(title)}</text>
  <text x="306" y="22" font-family="Inter,Arial,sans-serif" font-size="10" fill="#D7E0F5" text-anchor="end">${escapeXml(subtitle)}</text>
  <text x="14" y="64" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="700" letter-spacing="1" fill="#6B7280">SLIDE ${i + 1} OF ${SLIDE_TITLES.length}</text>
  <rect x="14" y="76" width="${260 - i * 4}" height="6" rx="2" fill="#${accent}" opacity="0.85"/>
  <rect x="14" y="92" width="${220 - i * 6}" height="4" rx="2" fill="#E2E8F0"/>
  <rect x="14" y="104" width="${190 - i * 4}" height="4" rx="2" fill="#E2E8F0"/>
  <rect x="14" y="116" width="${240 - i * 5}" height="4" rx="2" fill="#E2E8F0"/>
  <rect x="14" y="148" width="292" height="1" fill="#E2E8F0"/>
  <text x="14" y="166" font-family="Inter,Arial,sans-serif" font-size="8" fill="#6B7280">Finsyt · ${escapeXml(data.asOf)}</text>
  <text x="306" y="166" font-family="Inter,Arial,sans-serif" font-size="8" fill="#6B7280" text-anchor="end">${i + 1} / ${SLIDE_TITLES.length}</text>
</svg>`.trim()
    return { title, svg: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }
  })
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!))
}
