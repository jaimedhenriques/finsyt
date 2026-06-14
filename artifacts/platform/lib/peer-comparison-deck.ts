/**
 * Peer-comparison deck assembler
 * ──────────────────────────────
 * Turns a workspace peer set (or an explicit ticker list) into the
 * `PeerComparisonDeckInput` consumed by `peerComparisonTemplate`. Reuses the
 * exact same row builder as `/api/peers/compare` (`lib/peer-compare-core.ts`)
 * so the exported deck mirrors the on-screen Selected Peers table — real
 * quote-derived comparables, real forward P/E where the estimates feed has a
 * consensus, and clearly-badged demo cells everywhere else.
 */
import {
  buildPeerRow,
  buildMetricsMeta,
  METRIC_LABELS,
  fmtMcap,
  fmtMult,
  type CompareRow,
} from './peer-compare-core'
import type {
  PeerComparisonColumn,
  PeerComparisonBodyRow,
  PeerComparisonSummaryRow,
  DataSourceUsed,
} from './deck-service'
import type { PeerComparisonDeckInput } from './deck-templates'

// Columns surfaced in the exported deck (a focused subset of the full table).
const DECK_COLUMNS = ['marketCap', 'pe', 'forwardPe', 'evEbitda', 'evEbitdaNtm', 'ps'] as const

function median(vals: number[]): number | null {
  if (vals.length === 0) return null
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
function mean(vals: number[]): number | null {
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}
function valuesFor(rows: CompareRow[], key: string): number[] {
  return rows
    .map((r) => r.cells[key]?.value)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
}
function fmtFor(key: string, v: number | null): string {
  if (v == null) return '—'
  return key === 'marketCap' ? fmtMcap(v) : fmtMult(v)
}

export interface AssemblePeerComparisonArgs {
  symbols:  string[]
  subject?: string | null
  setName?: string | null
}

export async function assemblePeerComparison(
  baseUrl: string,
  { symbols, subject, setName }: AssemblePeerComparisonArgs,
): Promise<PeerComparisonDeckInput> {
  const anchor = subject && symbols.includes(subject) ? subject : null
  const ordered = anchor ? [anchor, ...symbols.filter((s) => s !== anchor)] : symbols

  const rows = await Promise.all(ordered.map((s) => buildPeerRow(baseUrl, s)))

  // Column metadata (label / demo / ntm) reuses the shared helper so the deck
  // badges columns exactly as the on-screen table does.
  const meta = buildMetricsMeta(DECK_COLUMNS, rows)
  const columns: PeerComparisonColumn[] = meta.map((m) => ({
    key: m.key, label: m.label, demo: m.demo, ntm: m.ntm,
  }))

  const bodyRows: PeerComparisonBodyRow[] = rows.map((r) => ({
    symbol: r.symbol,
    name:   r.name,
    anchor: anchor ? r.symbol === anchor : false,
    cells:  Object.fromEntries(
      DECK_COLUMNS.map((key) => [key, { display: r.cells[key]?.display ?? '—', demo: r.cells[key]?.demo }]),
    ),
  }))

  const summary: PeerComparisonSummaryRow[] = (['median', 'mean'] as const).map((agg) => ({
    label: agg === 'median' ? 'Median' : 'Mean',
    cells: Object.fromEntries(
      DECK_COLUMNS.map((key) => {
        const vals = valuesFor(rows, key)
        const v = agg === 'median' ? median(vals) : mean(vals)
        return [key, fmtFor(key, v)]
      }),
    ),
  }))

  // Median valuation context tiles.
  const valuationTiles = (['pe', 'forwardPe', 'evEbitda', 'ps'] as const)
    .map((key) => ({ label: `Median ${METRIC_LABELS[key]}`, value: fmtFor(key, median(valuesFor(rows, key))) }))
    .filter((t) => t.value !== '—')

  const hasRealForwardPe    = rows.some((r) => r.cells.forwardPe    && r.cells.forwardPe.demo    !== true)
  const hasRealEvEbitdaNtm  = rows.some((r) => r.cells.evEbitdaNtm  && r.cells.evEbitdaNtm.demo  !== true)
  const hasRealOptionsItm   = rows.some((r) => r.cells.optionsItmPct && r.cells.optionsItmPct.demo !== true)
  const hasDemoCells = columns.some((c) => c.demo)

  const overviewBullets: string[] = [
    `Relative-value comparison across ${rows.length} compan${rows.length === 1 ? 'y' : 'ies'}${setName ? ` in the ${setName} basket` : ''}.`,
    anchor
      ? `${anchor} is the anchor; peers are benchmarked against it on market cap and trading multiples.`
      : 'Companies are benchmarked on market cap and trading multiples.',
    hasRealForwardPe
      ? 'Forward P/E is computed from analyst-consensus next-FY EPS where available.'
      : 'Forward P/E shown is an illustrative estimate (no consensus feed available).',
  ]

  const dataSources: DataSourceUsed[] = [
    { name: 'Financial Modeling Prep', category: 'provider', detail: 'Quotes, market cap & trailing multiples' },
  ]
  if (hasRealForwardPe || hasRealEvEbitdaNtm) {
    const detail = [
      hasRealForwardPe   ? 'Forward consensus EPS → forward P/E' : '',
      hasRealEvEbitdaNtm ? 'Forward consensus EBITDA + enterprise value → NTM EV/EBITDA' : '',
    ].filter(Boolean).join('; ')
    dataSources.push({ name: 'FMP analyst estimates', category: 'provider', detail })
  }
  if (hasRealOptionsItm) {
    dataSources.push({ name: 'FMP options chain', category: 'provider', detail: 'Live options contracts → % in-the-money' })
  }
  if (hasDemoCells) {
    const demoMetrics = [
      !hasRealForwardPe   ? 'fallback forward P/E' : '',
      !hasRealEvEbitdaNtm ? 'NTM EV/EBITDA' : '',
      !hasRealOptionsItm  ? '% options ITM' : '',
    ].filter(Boolean).join(', ')
    dataSources.push({ name: 'Finsyt estimate model', category: 'model', detail: `Illustrative demo cells (${demoMetrics})` })
  }

  const footnote = hasDemoCells
    ? 'Columns marked * use illustrative Finsyt estimates, not a paid feed. LTM = last twelve months; NTM = next twelve months.'
    : 'LTM = last twelve months; NTM = next twelve months.'

  return {
    setName:  setName || undefined,
    subject:  anchor || undefined,
    asOf:     new Date().toISOString().slice(0, 10),
    overviewBullets,
    valuationTiles,
    columns,
    rows: bodyRows,
    summary,
    footnote,
    dataSources,
  }
}
