/**
 * Report deck assembler
 * ─────────────────────
 * Turns a saved tearsheet (a `reports` row plus its ordered `report_blocks`)
 * into a `DeckTemplate` consumed by both the PPTX renderer (`renderDeck` in
 * `lib/deck-service.ts`) and the PDF renderer (`lib/report-pdf.ts`).
 *
 * Each block maps to zero-or-one `DeckSection`, fetched from the same internal
 * platform routes the builder UI previews from, so the exported artifact
 * mirrors what the analyst arranged on the canvas:
 *
 *   kpi        → /api/quote                → kpi-table
 *   chart      → /api/financials (batch)   → chart (bar)
 *   peers      → assemblePeerComparison    → kpi-table (medians) + peer-comparison
 *   valuation  → /api/dcf + /api/quote     → valuation-football-field
 *   text       → (no fetch)                → executive-summary
 *   citations  → (accumulated)             → sources-used
 *
 * Every provider touched is accumulated into a deduped `DataSourceUsed[]` so a
 * trailing citations / sources-used block reflects the real upstreams used.
 */
import { NextRequest } from 'next/server'
import { POST as internalDcfPost } from '@/app/api/dcf/route'
import { INTERNAL_BYPASS_HEADER, internalBypassHeaderValue } from './internal-auth'
import { assemblePeerComparison } from './peer-comparison-deck'
import { FINSYT_BRAND } from './deck-service'
import type {
  DeckSection,
  DeckTemplate,
  DataSourceUsed,
  FootballFieldBand,
} from './deck-service'

// ── Block / report shapes (mirror lib/db reports schema) ─────────────────────

export interface ReportBlockForDeck {
  kind: string
  config: Record<string, unknown>
  position?: number
}

export interface ReportForDeck {
  title: string
  subtitle?: string
  symbol?: string
  blocks: ReportBlockForDeck[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/
function ticker(v: unknown, fallback?: string): string | null {
  const raw = (str(v) ?? fallback ?? '').toUpperCase()
  return raw && TICKER_RE.test(raw) ? raw : null
}

async function safeJson<T = any>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

function fmtMoney(v: number | null): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toFixed(2)}`
}
function fmtMult(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}x`
}
function fmtPct(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`
}

// Dedupe data sources by name + detail.
class SourceTracker {
  private map = new Map<string, DataSourceUsed>()
  add(s: DataSourceUsed) {
    this.map.set(`${s.name}::${s.detail ?? ''}`, s)
  }
  list(): DataSourceUsed[] {
    return [...this.map.values()]
  }
}

// ── Per-block assemblers ─────────────────────────────────────────────────────

async function kpiSection(
  baseUrl: string,
  cfg: Record<string, unknown>,
  fallbackSymbol: string | undefined,
  sources: SourceTracker,
): Promise<DeckSection | null> {
  const sym = ticker(cfg.symbol, fallbackSymbol)
  if (!sym) return null
  const q = await safeJson<any>(`${baseUrl}/api/quote?symbol=${encodeURIComponent(sym)}`)
  if (!q || q.price == null) return null
  sources.add({ name: 'Financial Modeling Prep', category: 'provider', detail: 'Quote / pricing' })
  const metrics = [
    { label: 'Price', value: fmtMoney(num(q.price)) },
    { label: 'Market Cap', value: fmtMoney(num(q.marketCap)) },
    { label: 'P/E', value: fmtMult(num(q.pe)) },
    { label: '52W High', value: fmtMoney(num(q.yearHigh)) },
    { label: '52W Low', value: fmtMoney(num(q.yearLow)) },
    { label: 'EV/EBITDA', value: fmtMult(num(q.evEbitda)) },
  ]
  const title = str(cfg.title) ?? `${sym} · Key metrics`
  return { type: 'kpi-table', data: { title, metrics, layout: 'tiles' } }
}

const CHART_METRICS: Record<string, { fmpKey: string; label: string }> = {
  revenue: { fmpKey: 'iq_total_rev', label: 'Revenue' },
  ebitda: { fmpKey: 'iq_ebitda', label: 'EBITDA' },
  netIncome: { fmpKey: 'iq_net_inc', label: 'Net income' },
  freeCashFlow: { fmpKey: 'iq_free_cash_flow', label: 'Free cash flow' },
}

async function chartSection(
  baseUrl: string,
  cfg: Record<string, unknown>,
  fallbackSymbol: string | undefined,
  sources: SourceTracker,
): Promise<DeckSection | null> {
  const sym = ticker(cfg.symbol, fallbackSymbol)
  if (!sym) return null
  const metricKey = (str(cfg.metric) ?? 'revenue') as keyof typeof CHART_METRICS
  const metric = CHART_METRICS[metricKey] ?? CHART_METRICS.revenue
  const years = Math.min(Math.max(num(cfg.years) ?? 5, 2), 8)

  // Batch mode returns one period per offset, so pull each year separately and
  // assemble a chronological series.
  const fetches = await Promise.all(
    Array.from({ length: years }, (_, i) =>
      safeJson<any>(
        `${baseUrl}/api/financials?symbol=${encodeURIComponent(sym)}&metrics=${metric.fmpKey}&period=A&limit=1&offset=${i}`,
      ),
    ),
  )
  const points: { date: string; value: number }[] = []
  for (const r of fetches) {
    const cell = r?.[metric.fmpKey]
    const value = num(cell?.value)
    if (value == null) continue
    const date = str(cell?.date) ?? ''
    points.push({ date, value })
  }
  if (points.length < 2) return null
  // Returned newest-first; reverse to chronological for the bar chart.
  points.reverse()
  sources.add({ name: 'Financial Modeling Prep', category: 'provider', detail: 'Fundamentals' })
  const title = str(cfg.title) ?? `${sym} · ${metric.label} (annual)`
  return {
    type: 'chart',
    data: {
      title,
      chartType: 'bar',
      series: [{ name: metric.label, values: points.map((p) => p.value) }],
      xLabels: points.map((p) => (p.date ? p.date.slice(0, 4) : '')),
    },
  }
}

async function peersSections(
  baseUrl: string,
  cfg: Record<string, unknown>,
  fallbackSymbol: string | undefined,
  sources: SourceTracker,
): Promise<DeckSection[]> {
  const rawSymbols = Array.isArray(cfg.symbols)
    ? (cfg.symbols as unknown[]).map((s) => ticker(s)).filter((s): s is string => !!s)
    : []
  const subject = ticker(cfg.subject, fallbackSymbol)
  const symbols = [...new Set([...(subject ? [subject] : []), ...rawSymbols])]
  if (symbols.length < 2) return []
  const setName = str(cfg.setName) ?? 'Peer comparison'
  let input
  try {
    input = await assemblePeerComparison(baseUrl, { symbols, subject, setName })
  } catch {
    return []
  }
  if (!input?.rows?.length) return []
  sources.add({ name: 'Financial Modeling Prep', category: 'provider', detail: 'Quote-derived comparables' })
  sources.add({ name: 'Finsyt peer engine', category: 'model', detail: 'Comparable multiples' })
  const out: DeckSection[] = []
  if (input.valuationTiles?.length) {
    out.push({
      type: 'kpi-table',
      data: { title: 'Valuation context (group medians)', metrics: input.valuationTiles, layout: 'tiles' },
      citations: input.citations,
    })
  }
  out.push({
    type: 'peer-comparison',
    data: {
      title: str(cfg.title) ?? 'Peer comparison',
      columns: input.columns,
      rows: input.rows,
      summary: input.summary,
      footnote: input.footnote,
    },
    citations: input.citations,
  })
  return out
}

async function valuationSection(
  cfg: Record<string, unknown>,
  baseUrl: string,
  fallbackSymbol: string | undefined,
  sources: SourceTracker,
): Promise<DeckSection | null> {
  const sym = ticker(cfg.symbol, fallbackSymbol)
  if (!sym) return null

  const q = await safeJson<any>(`${baseUrl}/api/quote?symbol=${encodeURIComponent(sym)}`)
  const currentPrice = num(q?.price)
  const yearLow = num(q?.yearLow)
  const yearHigh = num(q?.yearHigh)

  // DCF via the internal handler with the per-process bypass token (no network
  // hop, no session-cookie loss) — mirrors lib/banker-pitch-data.ts.
  let dcf: any = null
  try {
    const req = new NextRequest('http://internal/api/dcf', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [INTERNAL_BYPASS_HEADER]: internalBypassHeaderValue(),
      },
      body: JSON.stringify({ symbol: sym, sensitivity: true }),
    })
    const res = await internalDcfPost(req)
    if (res.ok) {
      const txt = await res.text()
      dcf = txt ? JSON.parse(txt) : null
    }
  } catch {
    dcf = null
  }

  const bands: FootballFieldBand[] = []
  if (yearLow != null && yearHigh != null && yearHigh > yearLow) {
    bands.push({ method: '52-week range', low: yearLow, high: yearHigh })
    sources.add({ name: 'Financial Modeling Prep', category: 'provider', detail: 'Quote / pricing' })
  }
  if (dcf) {
    const grid: number[][] | undefined = dcf.sensitivity?.values
    const flat = Array.isArray(grid)
      ? grid.flat().map((v: unknown) => num(v)).filter((v): v is number => v != null && v > 0)
      : []
    const mid = num(dcf.intrinsicValuePerShare)
    if (flat.length >= 2) {
      bands.push({ method: 'DCF (WACC ±2% × g ±1%)', low: Math.min(...flat), mid: mid ?? undefined, high: Math.max(...flat) })
      sources.add({ name: 'Finsyt DCF model', category: 'model', detail: 'Multi-stage discounted cash flow' })
    } else if (mid != null && mid > 0) {
      bands.push({ method: 'DCF (intrinsic value)', low: mid * 0.85, mid, high: mid * 1.15 })
      sources.add({ name: 'Finsyt DCF model', category: 'model', detail: 'Multi-stage discounted cash flow' })
    }
  }

  if (bands.length === 0) return null
  const midpoints = bands.map((b) => b.mid ?? (b.low + b.high) / 2)
  const weightedMid = midpoints.reduce((a, b) => a + b, 0) / midpoints.length
  return {
    type: 'valuation-football-field',
    data: {
      title: str(cfg.title) ?? `${sym} · Valuation football field`,
      bands,
      currentPrice: currentPrice ?? undefined,
      weightedMid,
      currency: '$',
    },
  }
}

function textSection(cfg: Record<string, unknown>): DeckSection | null {
  const heading = str(cfg.heading) ?? str(cfg.title)
  const body = str(cfg.body) ?? str(cfg.text)
  if (!heading && !body) return null
  const bullets = body
    ? body
        .split(/\n+/)
        .map((l) => l.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean)
    : []
  return {
    type: 'executive-summary',
    data: { title: heading ?? 'Commentary', bullets: bullets.length ? bullets : [body ?? ''] },
  }
}

// ── Top-level assembler ───────────────────────────────────────────────────────

export async function assembleReportDeck(baseUrl: string, report: ReportForDeck): Promise<DeckTemplate> {
  const sources = new SourceTracker()
  const sections: DeckSection[] = []
  const fallbackSymbol = ticker(report.symbol) ?? undefined
  let hasCitationsBlock = false

  const ordered = [...report.blocks].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  )

  for (const block of ordered) {
    const cfg = (block.config && typeof block.config === 'object' ? block.config : {}) as Record<string, unknown>
    try {
      switch (block.kind) {
        case 'kpi': {
          const s = await kpiSection(baseUrl, cfg, fallbackSymbol, sources)
          if (s) sections.push(s)
          break
        }
        case 'chart': {
          const s = await chartSection(baseUrl, cfg, fallbackSymbol, sources)
          if (s) sections.push(s)
          break
        }
        case 'peers': {
          const ss = await peersSections(baseUrl, cfg, fallbackSymbol, sources)
          sections.push(...ss)
          break
        }
        case 'valuation': {
          const s = await valuationSection(cfg, baseUrl, fallbackSymbol, sources)
          if (s) sections.push(s)
          break
        }
        case 'text': {
          const s = textSection(cfg)
          if (s) sections.push(s)
          break
        }
        case 'citations': {
          hasCitationsBlock = true
          break
        }
        default:
          break
      }
    } catch {
      // A single block failing to assemble must never abort the whole export.
    }
  }

  if (hasCitationsBlock) {
    sections.push({
      type: 'sources-used',
      data: { title: 'Data sources used', sources: sources.list() },
    })
  }

  if (sections.length === 0) {
    sections.push({
      type: 'executive-summary',
      data: {
        title: report.title,
        bullets: ['This report has no populated blocks yet. Add KPI, chart, peer, valuation or commentary blocks and re-export.'],
      },
    })
  }

  const asOf = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const dataSources = sources.list()

  return {
    templateId: 'report',
    context: {
      brand: FINSYT_BRAND,
      cover: {
        eyebrow: 'Finsyt Research Report',
        title: report.title,
        subtitle: report.subtitle || (fallbackSymbol ?? undefined),
        asOf,
        presenter: 'Finsyt Research',
      },
      asOf,
      footerLine: 'Sources: Finsyt platform data.',
      identityLine: fallbackSymbol ?? undefined,
      dataSources: dataSources.length
        ? dataSources
        : [{ name: 'Finsyt platform data', category: 'provider', detail: 'Quote, peers, valuation' }],
    },
    sections,
    meta: { title: report.title, subject: `Generated ${asOf}` },
  }
}

export { fmtMoney as _fmtMoney, fmtMult as _fmtMult, fmtPct as _fmtPct }
