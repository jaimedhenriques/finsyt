/**
 * Deck templates
 * ──────────────
 * Three concrete templates the platform ships on top of `deck-service.ts`:
 *
 *   1. `investmentMemoTemplate`  — the existing 6-slide memo. Wraps the
 *      well-tested layouts in `investment-memo-pptx.ts` as `extension`
 *      sections so the output stays byte-equivalent for the inner slides.
 *      The deck service adds the cover and trailing sources-used slide
 *      around them.
 *   2. `matrixSnapshotTemplate`  — one KPI/summary slide per Matrix row
 *      (Theme A export). Renders a per-row snapshot with executive bullets
 *      and the row's metric tiles.
 *   3. `bankerPitchTemplate`     — a banker-style pitch deck assembled
 *      from a company snapshot, valuation football field, peer comp set,
 *      catalysts list, and an appendix.
 *
 * All three share the same chrome/branding/footer/sources-used trailing
 * slide because they all flow through `renderDeck()`.
 */

import {
  isUnavailable,
  investmentMemoTemplate as investmentMemoTemplateImpl,
  type InvestmentMemoData,
} from './investment-memo-pptx'
import {
  FINSYT_BRAND,
  type DeckCitation,
  type DataSourceUsed,
  type DeckSection,
  type DeckTemplate,
  type PeersTableRow,
  type TransactionsTableRow,
  type FootballFieldBand,
} from './deck-service'

// Re-export the canonical investment-memo template that lives next to the
// memo PPTX builders. Keeping the implementation in `investment-memo-pptx.ts`
// avoids a circular import (the memo module needs `renderDeck` and would
// otherwise need to import this file too).
export const investmentMemoTemplate = investmentMemoTemplateImpl

// ── Investment memo template ────────────────────────────────────────────────

/**
 * Inspect the assembled memo data and infer which providers / models / feeds
 * were touched. This does not reach back into the agent run trace — the memo
 * data shape reliably tells us which sections produced real content, and each
 * section maps to a known provider. Future deck callers can override this by
 * supplying their own list when constructing the template.
 */
export function inferMemoDataSources(memo: InvestmentMemoData): DataSourceUsed[] {
  const out: DataSourceUsed[] = []
  // Quote / fundamentals are the core upstream
  out.push({ name: 'Financial Modeling Prep', category: 'provider', detail: 'Quote, income / balance / cash-flow statements, key metrics, segments' })
  if (!isUnavailable(memo.peers))         out.push({ name: 'FMP stock-peers + ratios feed', category: 'feed', detail: `${memo.peers.length} peer profiles + TTM ratios` })
  if (!isUnavailable(memo.transactions))  out.push({ name: 'FMP M&A latest feed',           category: 'feed', detail: `${memo.transactions.length} recent precedent transactions` })
  if (!isUnavailable(memo.valuation) && memo.valuation.forwardConsensus) {
    out.push({ name: 'FMP analyst estimates feed', category: 'feed', detail: 'Forward NTM revenue / EPS / price targets' })
  }
  if (!isUnavailable(memo.dcf)) out.push({ name: 'Finsyt DCF model', category: 'model', detail: '2-stage DCF with CAPM-derived discount rate' })
  out.push({ name: 'Yahoo Finance public endpoints', category: 'provider', detail: 'Backup quote feed' })
  return out
}

// (investmentMemoTemplate is re-exported above from `investment-memo-pptx.ts`
// — the canonical implementation lives there to avoid a circular import
// with the deck service.)

// ── Matrix snapshot template ────────────────────────────────────────────────

export interface MatrixSnapshotRow {
  /** Required identity for the row, shown as section title. */
  entity: string                                   // "MSFT" or "Project Alpha — FY24 P&L"
  subtitle?: string                                // "Microsoft Corporation"
  /** Headline takeaway bullets (rendered as the slide body). */
  bullets: string[]
  /** Optional KPI tiles below the bullets. */
  metrics?: { label: string; value: string }[]
  citations?: DeckCitation[]
  /** Number of columns that produced an answered cell for this row. When
   *  paired with `totalCount` the row slide appends a meta line like
   *  "— 3 of 5 columns answered" so analysts can tell at a glance how
   *  much of the matrix has been computed. */
  answeredCount?: number
  /** Total number of columns considered for this row (answered + pending). */
  totalCount?: number
}

export interface MatrixSnapshotInput {
  /** What the matrix is about — drives the cover title. */
  matrixName: string
  /** Subtitle on cover, e.g. "Project Alpha · 12 documents × 5 columns". */
  subtitle?: string
  rows: MatrixSnapshotRow[]
  asOf: string
  footerLine?: string
  dataSources?: DataSourceUsed[]
}

export function matrixSnapshotTemplate(input: MatrixSnapshotInput): DeckTemplate {
  // Bullets-per-row are interleaved with KPI tile slides so analysts see
  // narrative + numbers together, one row at a time.
  const sections: DeckSection[] = []
  if (input.rows.length === 0) {
    sections.push({
      type: 'executive-summary',
      data: { title: 'Matrix snapshot', bullets: ['No rows are visible in this matrix view.'] },
    })
  } else {
    sections.push({
      type: 'executive-summary',
      data: {
        title: 'Matrix snapshot',
        bullets: [
          `${input.rows.length} row${input.rows.length === 1 ? '' : 's'} captured from this matrix as of ${input.asOf}.`,
          ...(input.subtitle ? [input.subtitle] : []),
          'Each subsequent slide is one matrix row with its top takeaways and metric tiles.',
          'Citations preserved per row in the slide footer.',
        ],
      },
    })
    input.rows.forEach((row) => {
      // Decide the body bullets:
      //   - If the caller supplied any bullets, use them as-is.
      //   - Otherwise show a friendly placeholder. Earlier we surfaced
      //     "(pending — not yet run)" per column here, but unanswered
      //     matrix rows produced walls of pending bullets that made the
      //     deck unshareable; one placeholder is much cleaner.
      const bodyBullets = row.bullets.length
        ? [...row.bullets]
        : ['No answers captured yet for this row.']
      // When the caller has counted answered/total columns, append a
      // subtle meta line so the slide is honest about how much of the
      // row was computed (e.g. "— 3 of 5 columns answered"). The
      // em-dash prefix sets it apart from the substantive bullets above.
      if (
        typeof row.answeredCount === 'number' &&
        typeof row.totalCount === 'number' &&
        row.totalCount > 0
      ) {
        bodyBullets.push(
          `— ${row.answeredCount} of ${row.totalCount} column${row.totalCount === 1 ? '' : 's'} answered`,
        )
      }
      sections.push({
        type: 'executive-summary',
        data: {
          title: `${row.entity}${row.subtitle ? ' — ' + row.subtitle : ''}`,
          bullets: bodyBullets,
        },
        citations: row.citations,
      })
      if (row.metrics && row.metrics.length > 0) {
        sections.push({
          type: 'kpi-table',
          data: {
            title: `${row.entity} — Metrics`,
            metrics: row.metrics,
            layout: 'tiles',
          },
          citations: row.citations,
        })
      }
    })
  }

  return {
    templateId: 'matrix-snapshot',
    context: {
      brand: FINSYT_BRAND,
      cover: {
        eyebrow:  'Finsyt Matrix Snapshot',
        title:    input.matrixName,
        subtitle: input.subtitle || `${input.rows.length} rows`,
        asOf:     input.asOf,
        presenter: 'Finsyt Research',
      },
      asOf:        input.asOf,
      footerLine:  input.footerLine || 'Sources: Finsyt Matrix research run.',
      dataSources: input.dataSources || [
        { name: 'Finsyt Matrix research run', category: 'model', detail: 'Per-cell agent outputs' },
      ],
    },
    sections,
    meta: { title: `${input.matrixName} — Matrix Snapshot`, subject: `Generated ${input.asOf}` },
  }
}

// ── Banker pitch template ───────────────────────────────────────────────────

export interface BankerPitchInput {
  ticker:      string
  companyName: string
  exchange?:   string
  sector?:     string
  asOf:        string
  footerLine?: string

  /** "Company snapshot" KPI tiles (price, market cap, LTM rev, etc.) */
  snapshotMetrics?: { label: string; value: string }[]
  /** Top-of-mind narrative bullets for the snapshot slide. */
  snapshotBullets?: string[]

  /** Football field bands for the valuation slide. Each band represents a
   *  valuation method (DCF, Public peers, Precedent M&A, 52-week range, etc.) */
  footballField?: {
    bands:        FootballFieldBand[]
    currentPrice?: number
    weightedMid?: number
    currency?:    string
  }

  /** Peer comp set rendered as a table. */
  peers?: PeersTableRow[]

  /** Recent precedent M&A transactions rendered as a comparison table. */
  transactions?: TransactionsTableRow[]

  /** Catalysts / next-12-months drivers, split by provenance so the
   *  deck can clearly distinguish real recent headlines from generic
   *  templated bullets. Rendered as up to two separate slides:
   *
   *    • `news`   → "Recent news (last 90 days)"
   *    • `themes` → "Strategic themes (next 12 months)"
   *
   *  Either group may be omitted. The legacy `string[]` shape is also
   *  accepted for back-compat with callers that haven't yet split
   *  their bullets — those are rendered as a single combined slide
   *  titled "Catalysts (next 12 months)".
   */
  catalysts?: string[] | { news?: string[]; themes?: string[] }

  /** Optional appendix items (each turned into an executive-summary slide). */
  appendix?: { title: string; bullets: string[] }[]

  citations?:    DeckCitation[]
  dataSources?:  DataSourceUsed[]
}

export function bankerPitchTemplate(input: BankerPitchInput): DeckTemplate {
  const identityLine = `${input.ticker}${input.companyName ? ' · ' + input.companyName : ''}${input.exchange ? ' · ' + input.exchange : ''}`
  const sections: DeckSection[] = []

  // 1) Company snapshot — bullets if present, then KPI tiles
  if (input.snapshotBullets?.length) {
    sections.push({
      type: 'executive-summary',
      data: {
        title:   'Company snapshot',
        bullets: input.snapshotBullets,
      },
      citations: input.citations,
    })
  }
  if (input.snapshotMetrics?.length) {
    sections.push({
      type: 'kpi-table',
      data: { title: 'Snapshot metrics', metrics: input.snapshotMetrics, layout: 'tiles' },
      citations: input.citations,
    })
  }

  // 2) Valuation football field
  if (input.footballField && input.footballField.bands.length) {
    sections.push({
      type: 'valuation-football-field',
      data: {
        title:        'Valuation football field',
        bands:        input.footballField.bands,
        currentPrice: input.footballField.currentPrice,
        currency:     input.footballField.currency,
        weightedMid:  input.footballField.weightedMid,
      },
      citations: input.citations,
    })
  }

  // 3) Peers
  if (input.peers && input.peers.length) {
    sections.push({
      type: 'peers-table',
      data: { title: 'Public peer comparables', rows: input.peers },
      citations: input.citations,
    })
  }

  // 4) Transaction comparables — rendered as a dedicated table slide,
  //    skipped entirely when no precedent transactions are available so
  //    the deck doesn't show an empty section. The same data also feeds
  //    the football-field "Precedent M&A" band(s).
  if (input.transactions && input.transactions.length) {
    sections.push({
      type: 'transactions-table',
      data: { title: 'Precedent M&A transactions', rows: input.transactions },
      citations: input.citations,
    })
  }

  // 5) Catalysts — split into "Recent news" and "Strategic themes" so
  //    analysts can tell at a glance whether a bullet came from a real
  //    /api/news headline or the templated next-12-months fallback. The
  //    legacy `string[]` shape (used by older callers / unit tests) is
  //    still rendered as a single combined slide.
  if (Array.isArray(input.catalysts)) {
    if (input.catalysts.length) {
      sections.push({
        type: 'executive-summary',
        data: { title: 'Catalysts (next 12 months)', bullets: input.catalysts },
        citations: input.citations,
      })
    }
  } else if (input.catalysts) {
    if (input.catalysts.news?.length) {
      sections.push({
        type: 'executive-summary',
        data: { title: 'Recent news (last 90 days)', bullets: input.catalysts.news },
        citations: input.citations,
      })
    }
    if (input.catalysts.themes?.length) {
      sections.push({
        type: 'executive-summary',
        data: { title: 'Strategic themes (next 12 months)', bullets: input.catalysts.themes },
        citations: input.citations,
      })
    }
  }

  // 5) Appendix items
  for (const ap of input.appendix ?? []) {
    sections.push({
      type: 'executive-summary',
      data: { title: ap.title, bullets: ap.bullets },
      citations: input.citations,
    })
  }

  // Default fallback when caller passed almost nothing — at least give the
  // analyst a placeholder slide rather than an empty deck.
  if (sections.length === 0) {
    sections.push({
      type: 'executive-summary',
      data: {
        title:   'Pitch deck',
        bullets: [
          `Pitch deck for ${input.ticker} is awaiting populated inputs (company snapshot, valuation, peers).`,
          'Wire Football Field, Peers, and Transaction Comps via /api/copilot/deck.',
        ],
      },
    })
  }

  return {
    templateId: 'banker-pitch',
    context: {
      brand: FINSYT_BRAND,
      cover: {
        eyebrow:  'Finsyt Banker Pitch',
        title:    `${input.ticker} · ${input.companyName}`,
        subtitle: [input.exchange, input.sector].filter(Boolean).join(' · '),
        asOf:     input.asOf,
        presenter: 'Finsyt Research',
      },
      asOf:         input.asOf,
      footerLine:   input.footerLine || 'Sources: Finsyt platform data.',
      identityLine,
      dataSources:  input.dataSources || [
        { name: 'Finsyt platform data', category: 'provider', detail: 'Quote, peers, valuation' },
      ],
      globalCitations: input.citations,
    },
    sections,
    meta: { title: `${input.ticker} Banker Pitch`, subject: `Generated ${input.asOf}` },
  }
}
