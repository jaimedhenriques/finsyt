/**
 * Generalized Deck Generation Service
 * ───────────────────────────────────
 * One service, many decks. Callers describe a deck as a `DeckTemplate` —
 * an ordered list of typed `DeckSection` values plus a shared `DeckContext`
 * (brand, cover info, footer, citations, data sources used) — and ask
 * `renderDeck()` for an in-memory PPTX buffer.
 *
 * Every generated deck shares:
 *   - the Finsyt cover slide (eyebrow / title / subtitle / asOf)
 *   - the navy header bar + accent stripe + branding footer chrome
 *   - a per-slide citation footer when the section exposes citations
 *   - a trailing "Data sources used" slide listing providers / connectors
 *
 * Section types are a discriminated union so each renderer can have a
 * narrow data shape; an `extension` slot is provided for one-off custom
 * layouts (used by the investment-memo template to keep the existing
 * memo slide layouts byte-equivalent during the refactor).
 *
 * No network. No DB. Pure layout — assemblers feed it formatted strings.
 */
import PptxGenJS from 'pptxgenjs'

// ── Brand ───────────────────────────────────────────────────────────────────
export const FINSYT_BRAND = {
  navy:      '0B1B3D',
  ink:       '0E1A33',
  body:      '4A5568',
  muted:     '6B7280',
  accent:    '4F7CFF',
  accentDim: 'EAF1FF',
  positive:  '0EA371',
  negative:  'D9434E',
  divider:   'E2E8F0',
  paper:     'FFFFFF',
  surface:   'F7F9FC',
} as const
export type DeckBrand = typeof FINSYT_BRAND

// ── Page geometry (16:9 wide layout) ────────────────────────────────────────
export const DECK_W = 10
export const DECK_H = 5.625
export const HEADER_H  = 0.55
export const FOOTER_H  = 0.35
export const MARGIN_X  = 0.45
export const CONTENT_TOP    = HEADER_H + 0.18
export const CONTENT_BOTTOM = DECK_H - FOOTER_H - 0.15
export const CONTENT_W      = DECK_W - MARGIN_X * 2
export const CONTENT_H      = CONTENT_BOTTOM - CONTENT_TOP

// ── Shared text styles (every deck uses these) ─────────────────────────────
export const TEXT_STYLES = {
  slideTitle:   { fontFace: 'Inter', fontSize: 22, bold: true, color: FINSYT_BRAND.paper },
  ticker:       { fontFace: 'Inter', fontSize: 11, color: 'D7E0F5' },
  sectionLabel: { fontFace: 'Inter', fontSize: 9.5, bold: true, color: FINSYT_BRAND.muted, charSpacing: 1.5 },
  body:         { fontFace: 'Inter', fontSize: 11, color: FINSYT_BRAND.ink },
  bodyDim:      { fontFace: 'Inter', fontSize: 10.5, color: FINSYT_BRAND.body },
  metricLabel:  { fontFace: 'Inter', fontSize: 9.5, color: FINSYT_BRAND.muted, charSpacing: 1 },
  metricValue:  { fontFace: 'Inter', fontSize: 18, bold: true, color: FINSYT_BRAND.ink },
  th:           { fontFace: 'Inter', fontSize: 9.5, bold: true, color: FINSYT_BRAND.paper, fill: { color: FINSYT_BRAND.navy }, align: 'left', valign: 'middle' },
  td:           { fontFace: 'Inter', fontSize: 10, color: FINSYT_BRAND.ink, align: 'left', valign: 'middle' },
  tdNum:        { fontFace: 'Inter', fontSize: 10, color: FINSYT_BRAND.ink, align: 'right', valign: 'middle' },
  footer:       { fontFace: 'Inter', fontSize: 8.5, color: FINSYT_BRAND.muted },
  citation:     { fontFace: 'Inter', fontSize: 7.5, color: FINSYT_BRAND.muted, italic: true },
} as const

// ── Public types ────────────────────────────────────────────────────────────

/** A single inline citation that appears in the per-slide citation footer. */
export interface DeckCitation {
  label:  string                 // "MSFT 10-K (FY24), p.32"
  source?: string                // optional provider tag, e.g. "SEC EDGAR"
  url?:    string                // optional anchor link (rendered as text only)
}

/** A provider, connector, or model referenced while assembling the deck. */
export interface DataSourceUsed {
  name:     string                                          // "S&P Capital IQ"
  category:
    | 'provider'                                            // Pricing / fundamentals provider (FMP, EODHD, …)
    | 'connector'                                           // Workspace connector op (REST/MCP)
    | 'model'                                               // Internal model (DCF, comp engine, peer ranker)
    | 'document'                                            // Ingested user document / filing
    | 'feed'                                                // Real-time feed (M&A, transactions, estimates)
    | 'insider'                                             // Insider trading feed (Capitol Trades, FMP Form 4, …)
    | 'people'                                              // People & culture sentiment (Glassdoor, …)
    | 'signals'                                             // Filing intelligence / scoring (SEC EDGAR Intel, …)
  detail?:  string                                          // "Fundamentals (income / balance / cash-flow)"
}

export interface DeckCoverInfo {
  eyebrow?:  string              // "Finsyt Investment Memo"
  title:     string              // "MSFT · Microsoft Corporation"
  subtitle?: string              // "NASDAQ · Software & Services"
  asOf?:     string              // "May 2026"
  presenter?: string             // "Finsyt Research"
}

export interface DeckContext {
  brand:        DeckBrand
  cover:        DeckCoverInfo
  asOf:         string           // appears in every footer
  footerLine:   string           // primary source attribution shown on every slide
  /** Identity line shown in the header (right-aligned ticker · name · exchange). */
  identityLine?: string
  /** Trailing "Data sources used" slide population. May be empty. */
  dataSources:  DataSourceUsed[]
  /** Optional global citations folded into every section's footer. */
  globalCitations?: DeckCitation[]
}

// ── Section data shapes ─────────────────────────────────────────────────────

export interface KpiTableData {
  title?: string
  metrics: { label: string; value: string }[]
  layout?: 'tiles' | 'grid'      // default tiles
}

export interface ExecutiveSummaryData {
  title?: string
  bullets: string[]
}

export interface ChartData {
  title?: string
  chartType: 'bar' | 'line'
  series:   { name: string; values: number[] }[]
  xLabels?: string[]
}

export interface CitationListData {
  title?: string
  citations: DeckCitation[]
}

export interface TranscriptExcerptData {
  title?:       string
  speaker?:     string           // "Satya Nadella, CEO"
  quote:        string
  attribution?: string           // "MSFT FY24 Q4 earnings call · Aug 2024"
}

export interface PeersTableRow {
  ticker:        string
  name:          string
  marketCap:     string
  revenueGrowth: string
  ebitdaMargin:  string
  evRevenue:     string
  evEbitda:      string
  pe:            string
}
export interface PeersTableData {
  title?: string
  rows:   PeersTableRow[]
}

export interface TransactionsTableRow {
  date:       string         // "Mar 2024" or ISO date
  acquirer:   string
  target:     string
  evMm:       string         // formatted enterprise value, e.g. "$28.0B"
  evRevenue:  string         // "7.2x" or "—"
  evEbitda:   string         // "24.0x" or "—"
  /** Optional one-line rationale or sector descriptor */
  note?:      string
}
export interface TransactionsTableData {
  title?: string
  rows:   TransactionsTableRow[]
}

export interface FootballFieldBand {
  method: string                 // "DCF (WACC ±2%)"
  low:    number
  mid?:   number
  high:   number
}
export interface FootballFieldData {
  title?:       string
  bands:        FootballFieldBand[]
  currentPrice?: number
  currency?:    string           // default "$"
  /** Optional weighted average tick (mean of band midpoints) */
  weightedMid?: number
}

export interface SourcesUsedData {
  title?:  string
  sources: DataSourceUsed[]
}

/** One column header in a peer-comparison table. `demo` columns are rendered
 *  in amber (matching the platform's "demo cell" badge); `ntm` columns get an
 *  "NTM" sub-label (vs. "LTM" for trailing metrics). */
export interface PeerComparisonColumn {
  key:    string
  label:  string
  demo?:  boolean
  ntm?:   boolean
}
export interface PeerComparisonCell {
  display: string
  demo?:   boolean
}
export interface PeerComparisonBodyRow {
  symbol:  string
  name:    string
  /** Anchor (subject) row — bolded and pinned at the top. */
  anchor?: boolean
  cells:   Record<string, PeerComparisonCell>
}
/** Summary statistic row (e.g. Median / Mean) under the body. */
export interface PeerComparisonSummaryRow {
  label: string
  cells: Record<string, string>
}
export interface PeerComparisonData {
  title?:    string
  columns:   PeerComparisonColumn[]
  rows:      PeerComparisonBodyRow[]
  summary?:  PeerComparisonSummaryRow[]
  /** Small print under the table (e.g. demo-cell disclosure, LTM/NTM legend). */
  footnote?: string
}

/**
 * Every section is an object with a discriminated `type` and a `data` shape
 * whose fields the renderer for that type knows how to lay out. Each section
 * may also expose `citations` that get folded into the slide's footer.
 */
export type DeckSection =
  | { type: 'title';                  data: { title: string; subtitle?: string; eyebrow?: string };           citations?: DeckCitation[]; suppressChrome?: boolean }
  | { type: 'executive-summary';      data: ExecutiveSummaryData;                                              citations?: DeckCitation[] }
  | { type: 'kpi-table';              data: KpiTableData;                                                       citations?: DeckCitation[] }
  | { type: 'chart';                  data: ChartData;                                                          citations?: DeckCitation[] }
  | { type: 'citation-list';          data: CitationListData }
  | { type: 'transcript-excerpt';     data: TranscriptExcerptData;                                              citations?: DeckCitation[] }
  | { type: 'peers-table';            data: PeersTableData;                                                     citations?: DeckCitation[] }
  | { type: 'transactions-table';     data: TransactionsTableData;                                              citations?: DeckCitation[] }
  | { type: 'valuation-football-field'; data: FootballFieldData;                                                citations?: DeckCitation[] }
  | { type: 'peer-comparison';        data: PeerComparisonData;                                                 citations?: DeckCitation[] }
  | { type: 'sources-used';           data: SourcesUsedData }
  | {
      /** Escape hatch for one-off layouts. Two modes:
       *
       *   - `render`:  invoked AFTER the standard chrome is applied. Should
       *     draw inside the CONTENT_TOP/CONTENT_BOTTOM box only.
       *   - `renderOwn`: takes ownership of the slide (and its chrome). Used
       *     by the memo template to wrap its existing 6 highly-customised
       *     slide builders, which already paint identical Finsyt chrome.
       *     `renderDeck()` will NOT call `pptx.addSlide()` for these — the
       *     callback must do so itself. */
      type: 'extension'
      data: {
        title: string
        render?:    (slide: PptxGenJS.Slide, ctx: DeckContext) => void
        renderOwn?: (pptx: PptxGenJS, ctx: DeckContext, page: number, total: number) => void
      }
      citations?: DeckCitation[]
    }

export interface DeckTemplate {
  templateId: 'investment-memo' | 'matrix-snapshot' | 'banker-pitch' | string
  context:    DeckContext
  sections:   DeckSection[]
  /** Optional override; defaults to the asOf year + ticker + author=Finsyt Agent. */
  meta?: {
    title?:    string
    subject?:  string
    author?:   string
    company?:  string
  }
}

// ── Chrome ──────────────────────────────────────────────────────────────────

/** Title shown in the header bar for a section. Used for both rendering and
 *  for the deck file's outline / progress reporting. */
export function sectionTitle(s: DeckSection): string {
  switch (s.type) {
    case 'title':                  return s.data.title
    case 'executive-summary':      return s.data.title || 'Executive Summary'
    case 'kpi-table':              return s.data.title || 'Key Metrics'
    case 'chart':                  return s.data.title || 'Chart'
    case 'citation-list':          return s.data.title || 'Citations'
    case 'transcript-excerpt':     return s.data.title || 'Transcript Excerpt'
    case 'peers-table':            return s.data.title || 'Peer Comparables'
    case 'transactions-table':     return s.data.title || 'Transaction Comparables'
    case 'valuation-football-field': return s.data.title || 'Valuation Football Field'
    case 'peer-comparison':        return s.data.title || 'Peer Comparison'
    case 'sources-used':           return s.data.title || 'Data Sources Used'
    case 'extension':              return s.data.title
  }
}

function applyChrome(
  slide: PptxGenJS.Slide,
  ctx: DeckContext,
  title: string,
  page: number,
  total: number,
  citations?: DeckCitation[],
) {
  const B = ctx.brand
  // Header bar + accent stripe
  slide.addShape('rect', { x: 0, y: 0, w: DECK_W, h: HEADER_H, fill: { color: B.navy }, line: { color: B.navy } })
  slide.addShape('rect', { x: 0, y: HEADER_H, w: DECK_W, h: 0.04, fill: { color: B.accent }, line: { color: B.accent } })

  slide.addText(title, { x: MARGIN_X, y: 0.07, w: CONTENT_W * 0.7, h: HEADER_H - 0.14, ...TEXT_STYLES.slideTitle })
  if (ctx.identityLine) {
    slide.addText(ctx.identityLine, { x: DECK_W - MARGIN_X - 4.2, y: 0.16, w: 4.2, h: HEADER_H - 0.20, ...TEXT_STYLES.ticker, align: 'right' })
  }

  // Footer divider
  slide.addShape('rect', { x: 0, y: DECK_H - FOOTER_H, w: DECK_W, h: 0.02, fill: { color: B.divider }, line: { color: B.divider } })

  // Source line (left) — fold per-section citations + global citations into
  // the footer when present so attribution is unmissable on every slide.
  const allCitations = [...(citations ?? []), ...(ctx.globalCitations ?? [])]
  const citationFooter = allCitations.length > 0
    ? `${ctx.footerLine}  ·  Citations: ${allCitations.map(c => c.label).slice(0, 3).join('  ;  ')}${allCitations.length > 3 ? '  …' : ''}`
    : ctx.footerLine
  slide.addText(citationFooter, {
    x: MARGIN_X, y: DECK_H - FOOTER_H + 0.05, w: CONTENT_W - 1.6, h: FOOTER_H - 0.08,
    ...(allCitations.length > 0 ? TEXT_STYLES.citation : TEXT_STYLES.footer),
    align: 'left', valign: 'top',
  })

  // Branding + page number (right)
  slide.addText(`Finsyt · ${ctx.asOf} · ${page} / ${total}`, {
    x: DECK_W - MARGIN_X - 3.6, y: DECK_H - FOOTER_H + 0.08, w: 3.6, h: FOOTER_H - 0.10,
    ...TEXT_STYLES.footer, align: 'right',
  })
}

// ── Cover slide ─────────────────────────────────────────────────────────────
export function buildDeckCoverSlide(pptx: PptxGenJS, ctx: DeckContext, total: number) {
  return buildCoverSlide(pptx, ctx, total)
}
function buildCoverSlide(pptx: PptxGenJS, ctx: DeckContext, total: number) {
  const slide = pptx.addSlide()
  const B = ctx.brand
  // Full-bleed navy backdrop with a brighter accent triangle sweep
  slide.addShape('rect', { x: 0, y: 0, w: DECK_W, h: DECK_H, fill: { color: B.navy }, line: { color: B.navy } })
  slide.addShape('rect', { x: 0, y: DECK_H * 0.78, w: DECK_W, h: 0.06, fill: { color: B.accent }, line: { color: B.accent } })
  // Decorative gradient stripe (single-colour rect; pptxgenjs keeps shape simple)
  slide.addShape('rect', { x: DECK_W * 0.65, y: 0, w: DECK_W * 0.40, h: DECK_H, fill: { color: '13245E' }, line: { color: '13245E' } })

  if (ctx.cover.eyebrow) {
    slide.addText(ctx.cover.eyebrow.toUpperCase(), {
      x: MARGIN_X, y: 1.2, w: CONTENT_W, h: 0.32,
      fontFace: 'Inter', fontSize: 11, bold: true, color: '8FB3FF', charSpacing: 3,
    })
  }
  slide.addText(ctx.cover.title, {
    x: MARGIN_X, y: 1.55, w: CONTENT_W * 0.85, h: 1.2,
    fontFace: 'Inter', fontSize: 36, bold: true, color: B.paper,
  })
  if (ctx.cover.subtitle) {
    slide.addText(ctx.cover.subtitle, {
      x: MARGIN_X, y: 2.85, w: CONTENT_W * 0.85, h: 0.50,
      fontFace: 'Inter', fontSize: 14, color: 'D7E0F5',
    })
  }

  // Footer block — presenter on the left, asOf on the right
  slide.addText(ctx.cover.presenter || 'Finsyt Research', {
    x: MARGIN_X, y: DECK_H - 0.85, w: CONTENT_W * 0.5, h: 0.30,
    fontFace: 'Inter', fontSize: 11, bold: true, color: B.paper,
  })
  slide.addText(`As of ${ctx.cover.asOf || ctx.asOf}`, {
    x: MARGIN_X, y: DECK_H - 0.55, w: CONTENT_W * 0.5, h: 0.30,
    fontFace: 'Inter', fontSize: 10, color: '8FB3FF',
  })
  slide.addText(`1 / ${total}`, {
    x: DECK_W - MARGIN_X - 1.0, y: DECK_H - 0.55, w: 1.0, h: 0.30,
    fontFace: 'Inter', fontSize: 10, color: '8FB3FF', align: 'right',
  })
}

// ── Section renderers ───────────────────────────────────────────────────────

function renderTitle(slide: PptxGenJS.Slide, ctx: DeckContext, d: { title: string; subtitle?: string; eyebrow?: string }) {
  const B = ctx.brand
  const cy = (CONTENT_TOP + CONTENT_BOTTOM) / 2
  if (d.eyebrow) {
    slide.addText(d.eyebrow.toUpperCase(), {
      x: MARGIN_X, y: cy - 0.85, w: CONTENT_W, h: 0.30,
      fontFace: 'Inter', fontSize: 11, bold: true, color: B.muted, charSpacing: 2,
    })
  }
  slide.addText(d.title, {
    x: MARGIN_X, y: cy - 0.45, w: CONTENT_W, h: 0.75,
    fontFace: 'Inter', fontSize: 28, bold: true, color: B.ink,
  })
  if (d.subtitle) {
    slide.addText(d.subtitle, {
      x: MARGIN_X, y: cy + 0.30, w: CONTENT_W, h: 0.50,
      fontFace: 'Inter', fontSize: 14, color: B.body,
    })
  }
}

function renderExecutiveSummary(slide: PptxGenJS.Slide, ctx: DeckContext, d: ExecutiveSummaryData) {
  const items = (d.bullets.length ? d.bullets : ['No summary points available']).slice(0, 8)
  slide.addText(items.map(s => ({ text: s, options: { bullet: { code: '25AA' } } })), {
    x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W, h: CONTENT_H,
    ...TEXT_STYLES.body, valign: 'top', paraSpaceAfter: 8,
  })
}

function renderKpiTable(slide: PptxGenJS.Slide, ctx: DeckContext, d: KpiTableData) {
  const B = ctx.brand
  const metrics = d.metrics.slice(0, 8)
  if (metrics.length === 0) return
  const layout = d.layout ?? 'tiles'
  if (layout === 'tiles') {
    // Up to 4 across, 2 rows
    const cols = Math.min(4, metrics.length)
    const rows = Math.ceil(metrics.length / cols)
    const tileW = (CONTENT_W - (cols - 1) * 0.16) / cols
    const tileH = (CONTENT_H - (rows - 1) * 0.16) / rows
    metrics.forEach((m, i) => {
      const row = Math.floor(i / cols)
      const col = i % cols
      const x = MARGIN_X + col * (tileW + 0.16)
      const y = CONTENT_TOP + row * (tileH + 0.16)
      slide.addShape('roundRect', {
        x, y, w: tileW, h: tileH,
        fill: { color: B.accentDim }, line: { color: B.accent }, rectRadius: 0.06,
      })
      slide.addText(m.label.toUpperCase(), { x: x + 0.16, y: y + 0.14, w: tileW - 0.30, h: 0.24, ...TEXT_STYLES.metricLabel, color: '3056DA' })
      slide.addText(m.value || '—',         { x: x + 0.16, y: y + 0.42, w: tileW - 0.30, h: tileH - 0.55, ...TEXT_STYLES.metricValue, valign: 'middle' })
    })
  } else {
    // Two-column "label : value" grid
    const tableRows: PptxGenJS.TableRow[] = metrics.map((m, i) => {
      const fill = { color: i % 2 ? B.surface : B.paper }
      return [
        { text: m.label, options: { ...TEXT_STYLES.td, fill } },
        { text: m.value || '—', options: { ...TEXT_STYLES.tdNum, fill, bold: true } },
      ]
    })
    slide.addTable(tableRows, {
      x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W,
      colW: [CONTENT_W * 0.55, CONTENT_W * 0.45], rowH: 0.32,
      border: { type: 'solid', pt: 0.5, color: B.divider },
    })
  }
}

function renderChart(slide: PptxGenJS.Slide, ctx: DeckContext, d: ChartData) {
  // pptxgenjs supports native charts. We render either a clustered bar or a
  // multi-series line chart inside the content box.
  if (!d.series.length) return
  const labels = d.xLabels ?? d.series[0].values.map((_, i) => `${i + 1}`)
  const data = d.series.map(s => ({ name: s.name, labels, values: s.values }))
  const chartType = d.chartType === 'line'
    ? (PptxGenJS as unknown as { ChartType: { line: string } }).ChartType?.line ?? 'line'
    : (PptxGenJS as unknown as { ChartType: { bar: string } }).ChartType?.bar ?? 'bar'
  slide.addChart(chartType as PptxGenJS.CHART_NAME, data, {
    x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W, h: CONTENT_H,
    catAxisLabelFontFace: 'Inter', catAxisLabelFontSize: 9,
    valAxisLabelFontFace: 'Inter', valAxisLabelFontSize: 9,
    chartColors: [ctx.brand.accent, ctx.brand.positive, ctx.brand.negative, '8B5CF6', 'F59E0B'],
    showLegend: d.series.length > 1,
    legendPos: 'b',
  })
}

function renderCitationList(slide: PptxGenJS.Slide, ctx: DeckContext, d: CitationListData) {
  const B = ctx.brand
  const items = d.citations.slice(0, 12).map(c => {
    const tag = c.source ? ` — ${c.source}` : ''
    return { text: `${c.label}${tag}`, options: { bullet: { code: '25AA' } } }
  })
  if (!items.length) {
    slide.addText('No citations recorded for this section.', {
      x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W, h: 0.5,
      ...TEXT_STYLES.bodyDim, italic: true,
    })
    return
  }
  slide.addText(items, {
    x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W, h: CONTENT_H,
    ...TEXT_STYLES.bodyDim, valign: 'top', paraSpaceAfter: 6,
  })
}

function renderTranscriptExcerpt(slide: PptxGenJS.Slide, ctx: DeckContext, d: TranscriptExcerptData) {
  const B = ctx.brand
  // Quote panel
  slide.addShape('roundRect', {
    x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W, h: CONTENT_H * 0.78,
    fill: { color: B.surface }, line: { color: B.divider }, rectRadius: 0.10,
  })
  slide.addText('"', {
    x: MARGIN_X + 0.20, y: CONTENT_TOP + 0.05, w: 0.6, h: 0.6,
    fontFace: 'Georgia', fontSize: 56, bold: true, color: B.accent,
  })
  slide.addText(d.quote, {
    x: MARGIN_X + 0.55, y: CONTENT_TOP + 0.30, w: CONTENT_W - 0.85, h: CONTENT_H * 0.78 - 0.40,
    fontFace: 'Inter', fontSize: 14, color: B.ink, italic: true, valign: 'top',
  })
  if (d.speaker || d.attribution) {
    const parts = [d.speaker, d.attribution].filter(Boolean)
    slide.addText(`— ${parts.join(' · ')}`, {
      x: MARGIN_X, y: CONTENT_TOP + CONTENT_H * 0.82, w: CONTENT_W, h: 0.30,
      fontFace: 'Inter', fontSize: 11, bold: true, color: B.muted,
    })
  }
}

function renderPeersTable(slide: PptxGenJS.Slide, ctx: DeckContext, d: PeersTableData) {
  const B = ctx.brand
  const cols = ['Ticker', 'Company', 'Mkt Cap', 'Rev Growth', 'EBITDA Mgn', 'EV/Rev', 'EV/EBITDA', 'P/E']
  const colW = [
    CONTENT_W * 0.08, CONTENT_W * 0.26, CONTENT_W * 0.10,
    CONTENT_W * 0.11, CONTENT_W * 0.11, CONTENT_W * 0.11,
    CONTENT_W * 0.12, CONTENT_W * 0.11,
  ]
  const header: PptxGenJS.TableRow = cols.map((c, i) => ({
    text: c, options: { ...TEXT_STYLES.th, align: i <= 1 ? 'left' : 'right' },
  })) as PptxGenJS.TableRow
  const body: PptxGenJS.TableRow[] = d.rows.slice(0, 9).map((p, i) => {
    const fill = { color: i % 2 ? B.surface : B.paper }
    const td = { ...TEXT_STYLES.td, fill }
    const tdNum = { ...TEXT_STYLES.tdNum, fill }
    return [
      { text: p.ticker,        options: { ...td, bold: true, color: B.accent } },
      { text: p.name,          options: td },
      { text: p.marketCap,     options: tdNum },
      { text: p.revenueGrowth, options: tdNum },
      { text: p.ebitdaMargin,  options: tdNum },
      { text: p.evRevenue,     options: tdNum },
      { text: p.evEbitda,      options: tdNum },
      { text: p.pe,            options: tdNum },
    ]
  })
  slide.addTable([header, ...body], {
    x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W,
    colW, rowH: 0.30, border: { type: 'solid', pt: 0.5, color: B.divider },
  })
}

function renderTransactionsTable(slide: PptxGenJS.Slide, ctx: DeckContext, d: TransactionsTableData) {
  const B = ctx.brand
  const hasNotes = d.rows.some(r => r.note && r.note.trim().length > 0)
  const cols = hasNotes
    ? ['Date', 'Acquirer', 'Target', 'EV ($mm)', 'EV/Rev', 'EV/EBITDA', 'Note']
    : ['Date', 'Acquirer', 'Target', 'EV ($mm)', 'EV/Rev', 'EV/EBITDA']
  const colW = hasNotes
    ? [CONTENT_W * 0.10, CONTENT_W * 0.18, CONTENT_W * 0.18, CONTENT_W * 0.12, CONTENT_W * 0.10, CONTENT_W * 0.12, CONTENT_W * 0.20]
    : [CONTENT_W * 0.12, CONTENT_W * 0.22, CONTENT_W * 0.22, CONTENT_W * 0.14, CONTENT_W * 0.13, CONTENT_W * 0.17]
  const header: PptxGenJS.TableRow = cols.map((c, i) => ({
    text: c, options: { ...TEXT_STYLES.th, align: i <= 2 || (hasNotes && i === 6) ? 'left' : 'right' },
  })) as PptxGenJS.TableRow
  const body: PptxGenJS.TableRow[] = d.rows.slice(0, 9).map((t, i) => {
    const fill = { color: i % 2 ? B.surface : B.paper }
    const td = { ...TEXT_STYLES.td, fill }
    const tdNum = { ...TEXT_STYLES.tdNum, fill }
    const cells: PptxGenJS.TableCell[] = [
      { text: t.date,      options: td },
      { text: t.acquirer,  options: { ...td, bold: true } },
      { text: t.target,    options: td },
      { text: t.evMm,      options: tdNum },
      { text: t.evRevenue, options: tdNum },
      { text: t.evEbitda,  options: tdNum },
    ]
    if (hasNotes) cells.push({ text: t.note || '', options: { ...td, color: B.muted, fontSize: 10 } })
    return cells
  })
  slide.addTable([header, ...body], {
    x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W,
    colW, rowH: 0.30, border: { type: 'solid', pt: 0.5, color: B.divider },
  })
}

function renderFootballField(slide: PptxGenJS.Slide, ctx: DeckContext, d: FootballFieldData) {
  const B = ctx.brand
  const bands = d.bands.slice(0, 8)
  if (!bands.length) return

  const cur = d.currency || '$'
  const allLow  = Math.min(...bands.map(b => b.low),  d.currentPrice ?? Infinity, d.weightedMid ?? Infinity)
  const allHigh = Math.max(...bands.map(b => b.high), d.currentPrice ?? -Infinity, d.weightedMid ?? -Infinity)
  // 6 % padding either side so end caps don't touch the gutter
  const span = Math.max(1e-6, allHigh - allLow) * 1.06
  const left = allLow - (allHigh - allLow) * 0.03
  const xFor = (v: number) => MARGIN_X + 1.6 + ((v - left) / span) * (CONTENT_W - 1.7)

  // Axis line at the bottom of the chart area
  const axisY = CONTENT_BOTTOM - 0.30
  const rowsTop = CONTENT_TOP + 0.10
  const rowH = (axisY - rowsTop - 0.20) / bands.length

  // Method labels on the left + horizontal range bars
  bands.forEach((b, i) => {
    const y = rowsTop + i * rowH + 0.04
    slide.addText(b.method, {
      x: MARGIN_X, y: y + (rowH - 0.32) / 2, w: 1.55, h: 0.32,
      fontFace: 'Inter', fontSize: 10, bold: true, color: B.ink, valign: 'middle',
    })
    const x1 = xFor(b.low)
    const x2 = xFor(b.high)
    slide.addShape('roundRect', {
      x: x1, y: y + (rowH - 0.30) / 2, w: Math.max(0.05, x2 - x1), h: 0.30,
      fill: { color: B.accentDim }, line: { color: B.accent }, rectRadius: 0.06,
    })
    if (typeof b.mid === 'number') {
      const xm = xFor(b.mid) - 0.015
      slide.addShape('rect', {
        x: xm, y: y + (rowH - 0.40) / 2, w: 0.03, h: 0.40,
        fill: { color: B.accent }, line: { color: B.accent },
      })
    }
    slide.addText(`${cur}${b.low.toFixed(0)}`, {
      x: x1 - 0.55, y: y + (rowH - 0.24) / 2, w: 0.55, h: 0.24,
      fontFace: 'Inter', fontSize: 8, color: B.muted, align: 'right', valign: 'middle',
    })
    slide.addText(`${cur}${b.high.toFixed(0)}`, {
      x: x2 + 0.05, y: y + (rowH - 0.24) / 2, w: 0.55, h: 0.24,
      fontFace: 'Inter', fontSize: 8, color: B.muted, align: 'left', valign: 'middle',
    })
  })

  // Vertical line at current price
  if (typeof d.currentPrice === 'number') {
    const x = xFor(d.currentPrice)
    slide.addShape('rect', {
      x: x - 0.01, y: rowsTop, w: 0.02, h: axisY - rowsTop,
      fill: { color: B.negative }, line: { color: B.negative },
    })
    slide.addText(`Current ${cur}${d.currentPrice.toFixed(2)}`, {
      x: x - 0.6, y: axisY + 0.03, w: 1.2, h: 0.22,
      fontFace: 'Inter', fontSize: 8.5, bold: true, color: B.negative, align: 'center',
    })
  }
  if (typeof d.weightedMid === 'number') {
    const x = xFor(d.weightedMid)
    slide.addShape('rect', {
      x: x - 0.01, y: rowsTop, w: 0.02, h: axisY - rowsTop,
      fill: { color: B.positive }, line: { color: B.positive },
    })
    slide.addText(`Weighted ${cur}${d.weightedMid.toFixed(2)}`, {
      x: x - 0.7, y: axisY + 0.20, w: 1.4, h: 0.22,
      fontFace: 'Inter', fontSize: 8.5, bold: true, color: B.positive, align: 'center',
    })
  }
  // Axis baseline
  slide.addShape('rect', {
    x: MARGIN_X + 1.55, y: axisY, w: CONTENT_W - 1.55, h: 0.015,
    fill: { color: B.divider }, line: { color: B.divider },
  })
}

const DEMO_AMBER = 'B45309'

function renderPeerComparison(slide: PptxGenJS.Slide, ctx: DeckContext, d: PeerComparisonData) {
  const B = ctx.brand
  // Cap columns so the table stays readable on a 16:9 slide.
  const cols = d.columns.slice(0, 7)
  const hasFootnote = !!(d.footnote && d.footnote.trim().length > 0)

  const compW = CONTENT_W * 0.26
  const metricW = (CONTENT_W - compW) / Math.max(1, cols.length)
  const colW = [compW, ...cols.map(() => metricW)]

  // Header row — company label left, metric labels right (amber when demo).
  const header: PptxGenJS.TableRow = [
    { text: 'Company', options: { ...TEXT_STYLES.th, align: 'left' } },
    ...cols.map((c) => ({
      text: `${c.label}${c.ntm ? '  ·  NTM' : ''}${c.demo ? ' *' : ''}`,
      options: { ...TEXT_STYLES.th, align: 'right' as const },
    })),
  ] as PptxGenJS.TableRow

  // Body rows — anchor row bolded; demo cells in amber.
  const body: PptxGenJS.TableRow[] = d.rows.slice(0, 9).map((r, i) => {
    const fill = { color: i % 2 ? B.surface : B.paper }
    const nameCell: PptxGenJS.TableCell = {
      text: `${r.name} (${r.symbol})`,
      options: { ...TEXT_STYLES.td, fill, bold: !!r.anchor, color: r.anchor ? B.accent : B.ink },
    }
    const cells: PptxGenJS.TableCell[] = cols.map((c) => {
      const cell = r.cells[c.key]
      return {
        text: cell?.display ?? '—',
        options: { ...TEXT_STYLES.tdNum, fill, bold: !!r.anchor, color: cell?.demo ? DEMO_AMBER : B.ink },
      }
    })
    return [nameCell, ...cells]
  })

  // Summary rows (Median / Mean) — accent-tinted, bold.
  const summary: PptxGenJS.TableRow[] = (d.summary ?? []).slice(0, 4).map((s) => {
    const fill = { color: B.accentDim }
    return [
      { text: s.label, options: { ...TEXT_STYLES.td, fill, bold: true } },
      ...cols.map((c) => ({
        text: s.cells[c.key] ?? '—',
        options: { ...TEXT_STYLES.tdNum, fill, bold: true },
      })),
    ] as PptxGenJS.TableRow
  })

  slide.addTable([header, ...body, ...summary], {
    x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W,
    colW, rowH: 0.28, border: { type: 'solid', pt: 0.5, color: B.divider },
    autoPage: false,
  })

  if (hasFootnote) {
    slide.addText(d.footnote!, {
      x: MARGIN_X, y: CONTENT_BOTTOM - 0.26, w: CONTENT_W, h: 0.24,
      ...TEXT_STYLES.citation, align: 'left',
    })
  }
}

/**
 * Public helper: append a "Data Sources Used" slide (with full chrome) to an
 * already-running pptx instance. Used by the memo PPTX builder so it can
 * compose the deck-service cover + sources slides around its own legacy
 * inner-slide layouts.
 */
export function appendSourcesUsedSlide(
  pptx: PptxGenJS,
  ctx: DeckContext,
  page: number,
  total: number,
) {
  const slide = pptx.addSlide()
  applyChrome(slide, ctx, 'Data Sources Used', page, total)
  renderSourcesUsed(slide, ctx, { sources: ctx.dataSources })
}

function renderSourcesUsed(slide: PptxGenJS.Slide, ctx: DeckContext, d: SourcesUsedData) {
  const B = ctx.brand
  const sources = d.sources.length ? d.sources : ctx.dataSources
  // Group by category for a cleaner read
  const groups: Record<string, DataSourceUsed[]> = {}
  for (const s of sources) {
    (groups[s.category] = groups[s.category] || []).push(s)
  }
  const categoryOrder: DataSourceUsed['category'][] = [
    'provider', 'feed', 'insider', 'people', 'signals', 'connector', 'document', 'model',
  ]
  const categoryLabels: Record<DataSourceUsed['category'], string> = {
    provider:  'Data providers',
    feed:      'Real-time feeds',
    insider:   'Insider activity',
    people:    'People & culture',
    signals:   'Filing signals',
    connector: 'Workspace connectors',
    document:  'Documents read',
    model:     'Models & calculations',
  }
  if (sources.length === 0) {
    slide.addText('No external data sources were touched assembling this deck.', {
      x: MARGIN_X, y: CONTENT_TOP + 0.5, w: CONTENT_W, h: 0.6,
      ...TEXT_STYLES.bodyDim, italic: true, align: 'center',
    })
    return
  }
  let y = CONTENT_TOP
  for (const cat of categoryOrder) {
    const items = groups[cat]
    if (!items?.length) continue
    if (y > CONTENT_BOTTOM - 0.6) break
    slide.addText(categoryLabels[cat].toUpperCase(), {
      x: MARGIN_X, y, w: CONTENT_W, h: 0.22, ...TEXT_STYLES.sectionLabel,
    })
    y += 0.26
    const lines = items.slice(0, 6).map(it => ({
      text: `${it.name}${it.detail ? ` — ${it.detail}` : ''}`,
      options: { bullet: { code: '25AA' } },
    }))
    const blockH = Math.min(CONTENT_BOTTOM - y, 0.24 * lines.length + 0.10)
    slide.addText(lines, {
      x: MARGIN_X + 0.05, y, w: CONTENT_W - 0.10, h: blockH,
      ...TEXT_STYLES.bodyDim, valign: 'top', paraSpaceAfter: 2,
    })
    y += blockH + 0.10
  }
  // Footer note
  slide.addText('Generated from the agent run trace assembled while building this deck.', {
    x: MARGIN_X, y: CONTENT_BOTTOM - 0.30, w: CONTENT_W, h: 0.22,
    ...TEXT_STYLES.citation, align: 'left',
  })
}

function renderSection(slide: PptxGenJS.Slide, ctx: DeckContext, s: DeckSection) {
  switch (s.type) {
    case 'title':                  return renderTitle(slide, ctx, s.data)
    case 'executive-summary':      return renderExecutiveSummary(slide, ctx, s.data)
    case 'kpi-table':              return renderKpiTable(slide, ctx, s.data)
    case 'chart':                  return renderChart(slide, ctx, s.data)
    case 'citation-list':          return renderCitationList(slide, ctx, s.data)
    case 'transcript-excerpt':     return renderTranscriptExcerpt(slide, ctx, s.data)
    case 'peers-table':            return renderPeersTable(slide, ctx, s.data)
    case 'transactions-table':     return renderTransactionsTable(slide, ctx, s.data)
    case 'valuation-football-field': return renderFootballField(slide, ctx, s.data)
    case 'peer-comparison':        return renderPeerComparison(slide, ctx, s.data)
    case 'sources-used':           return renderSourcesUsed(slide, ctx, s.data)
    case 'extension':              return s.data.render?.(slide, ctx)
  }
}

// ── Top-level renderer ──────────────────────────────────────────────────────

/**
 * Render a deck. Always emits, in order:
 *   1. Cover slide
 *   2. Each `template.sections[i]` as one slide (with chrome)
 *   3. A trailing "Data sources used" slide (if `dataSources` is non-empty
 *      AND the template did not already include one).
 */
export async function renderDeck(template: DeckTemplate): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'LAYOUT_FINSYT', width: DECK_W, height: DECK_H })
  pptx.layout  = 'LAYOUT_FINSYT'
  pptx.author  = template.meta?.author  ?? 'Finsyt Agent'
  pptx.company = template.meta?.company ?? 'Finsyt'
  pptx.title   = template.meta?.title   ?? template.context.cover.title
  pptx.subject = template.meta?.subject ?? `Finsyt deck · ${template.context.asOf}`

  const sections = [...template.sections]
  const alreadyHasSources = sections.some(s => s.type === 'sources-used')
  const includeTrailingSources = !alreadyHasSources && template.context.dataSources.length > 0
  const total = 1 + sections.length + (includeTrailingSources ? 1 : 0)

  // 1) Cover
  buildCoverSlide(pptx, template.context, total)

  // 2) Sections
  sections.forEach((s, idx) => {
    const page = idx + 2
    if (s.type === 'extension' && s.data.renderOwn) {
      // Self-managed slide — callback owns addSlide() + chrome.
      s.data.renderOwn(pptx, template.context, page, total)
      return
    }
    const slide = pptx.addSlide()
    if (s.type === 'title' && (s as { suppressChrome?: boolean }).suppressChrome) {
      // Title slide can opt out of the standard chrome (used for chapter
      // dividers inside larger decks). Render the title body only.
      renderSection(slide, template.context, s)
    } else {
      applyChrome(slide, template.context, sectionTitle(s), page, total, s.type === 'sources-used' ? undefined : (s as { citations?: DeckCitation[] }).citations)
      renderSection(slide, template.context, s)
    }
  })

  // 3) Trailing sources-used slide (auto-injected when not already present)
  if (includeTrailingSources) {
    const slide = pptx.addSlide()
    applyChrome(slide, template.context, 'Data Sources Used', total, total)
    renderSourcesUsed(slide, template.context, { sources: template.context.dataSources })
  }

  const out = await pptx.write({ outputType: 'nodebuffer' })
  if (Buffer.isBuffer(out)) return out
  if (out instanceof Uint8Array) return Buffer.from(out)
  if (typeof out === 'string') return Buffer.from(out, 'binary')
  if (out instanceof ArrayBuffer) return Buffer.from(out)
  if (typeof (globalThis as { Blob?: unknown }).Blob !== 'undefined' && out instanceof (globalThis as { Blob: typeof Blob }).Blob) {
    const ab = await (out as Blob).arrayBuffer()
    return Buffer.from(ab)
  }
  throw new Error('renderDeck: unexpected pptxgenjs output type')
}

// ── Convenience: list the slide titles a template will emit ─────────────────
export function deckSlideTitles(template: DeckTemplate): string[] {
  const titles: string[] = [template.context.cover.title]
  template.sections.forEach(s => titles.push(sectionTitle(s)))
  const hasSources = template.sections.some(s => s.type === 'sources-used')
  if (!hasSources && template.context.dataSources.length > 0) {
    titles.push('Data Sources Used')
  }
  return titles
}
