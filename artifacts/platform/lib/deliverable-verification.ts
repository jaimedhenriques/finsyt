/**
 * Deliverable verification engine.
 * ────────────────────────────────
 * A pure (no DB / no network) checker that runs over the structured
 * representation of a generated deliverable — a deck `DeckTemplate`, an
 * investment memo, or a research-matrix export — and emits a flat, typed list
 * of issues a reviewer should resolve before the artifact leaves the building.
 *
 * It catches the classes of defect that embarrass a research desk:
 *   - formula / reference errors      (a cell or model output that failed)
 *   - cross-slide numeric inconsistency (same metric, two different numbers)
 *   - chart-vs-data mismatch          (chart series that don't line up)
 *   - missing citations               (a data-bearing slide / cell with no source)
 *   - house-style deviations          (number format / banned terminology)
 *
 * Each issue carries a stable `location` so the pre-export review UI can offer
 * click-through to the exact slide / row / cell, and an `autoFix` descriptor
 * when the fix is deterministic and safe (number formatting). Judgment calls
 * (a missing citation, an inconsistent figure) are surfaced as flags only —
 * the engine never silently rewrites analyst content.
 *
 * The engine is intentionally decoupled from the renderers: callers pass the
 * already-assembled data structures, and the engine reads them structurally.
 */
import type {
  DeckTemplate,
  DeckSection,
  KpiTableData,
  ChartData,
} from './deck-service'
import type { MatrixExportData } from './matrix-pptx'
import {
  type HouseStyle,
  reformatNumberToHouseStyle,
  parseFormattedNumber,
  findBannedTerms,
} from './house-style'

// ── Public types ─────────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'info'

export type IssueCategory =
  | 'formula-error'
  | 'reference-error'
  | 'numeric-inconsistency'
  | 'chart-data-mismatch'
  | 'missing-citation'
  | 'house-style'

export interface IssueLocation {
  kind: 'slide' | 'cell' | 'row' | 'column' | 'section'
  /** Stable id for click-through (e.g. `"slide:3"`, `"cell:<row>:<col>"`). */
  ref: string
  /** Human label, e.g. "AAPL · Revenue growth". */
  label?: string
  /** 1-based slide index when `kind === 'slide'`. */
  slideIndex?: number
  /** Matrix coordinates when `kind === 'cell'`. */
  rowId?: string
  columnId?: string
}

export interface AutoFix {
  kind: 'number-format'
  description: string
  /** The compliant replacement value (number-format fixes only). */
  replacement?: string
}

export interface VerificationIssue {
  id: string
  severity: IssueSeverity
  category: IssueCategory
  title: string
  detail: string
  location: IssueLocation
  autoFixable: boolean
  autoFix?: AutoFix
}

export interface VerificationSummary {
  error: number
  warning: number
  info: number
  autoFixable: number
  total: number
}

export type DeliverableKind = 'deck' | 'memo' | 'matrix'

export interface VerificationReport {
  deliverable: DeliverableKind
  name: string
  checkedAt: string
  passed: boolean
  houseStyleApplied: boolean
  issues: VerificationIssue[]
  summary: VerificationSummary
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function summarize(issues: VerificationIssue[]): VerificationSummary {
  const s: VerificationSummary = { error: 0, warning: 0, info: 0, autoFixable: 0, total: issues.length }
  for (const i of issues) {
    s[i.severity] += 1
    if (i.autoFixable) s.autoFixable += 1
  }
  return s
}

function finalize(
  deliverable: DeliverableKind,
  name: string,
  issues: VerificationIssue[],
  houseStyleApplied: boolean,
): VerificationReport {
  const summary = summarize(issues)
  return {
    deliverable,
    name,
    checkedAt: new Date().toISOString(),
    passed: summary.error === 0,
    houseStyleApplied,
    issues,
    summary,
  }
}

/** Normalise a metric label so "Revenue Growth" and "revenue growth" collide. */
function normLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[:.]$/, '')
}

function sectionTitleOf(s: DeckSection): string {
  const d = (s as { data?: { title?: string } }).data
  return d?.title || s.type
}

// Section types that present quantitative data and therefore warrant a citation.
const CITED_SECTION_TYPES = new Set<DeckSection['type']>([
  'kpi-table',
  'chart',
  'peers-table',
  'transactions-table',
  'valuation-football-field',
  'peer-comparison',
])

// ── Deck verification ────────────────────────────────────────────────────────

export interface VerifyDeckOpts {
  houseStyle?: HouseStyle | null
}

/**
 * Verify a deck `DeckTemplate`. Slides are indexed as the renderer emits them:
 * slide 1 is the cover, sections start at slide 2.
 */
export function verifyDeck(template: DeckTemplate, opts: VerifyDeckOpts = {}): VerificationReport {
  const issues: VerificationIssue[] = []
  const hs = opts.houseStyle && opts.houseStyle.enabled ? opts.houseStyle : null
  const ctx = template.context
  const hasGlobalCitations = (ctx.globalCitations?.length ?? 0) > 0

  // Track (normalised label → [{value, slideIndex, label, raw}]) for the
  // cross-slide numeric-consistency check.
  const numericByLabel = new Map<string, { value: number; slideIndex: number; raw: string; sectionTitle: string }[]>()

  template.sections.forEach((section, idx) => {
    const slideIndex = idx + 2 // cover is slide 1
    const ref = `slide:${slideIndex}`
    const title = sectionTitleOf(section)

    // ── Missing-citation check ──────────────────────────────────────────────
    if (CITED_SECTION_TYPES.has(section.type)) {
      const sectionCitations = (section as { citations?: unknown[] }).citations
      const hasSectionCitations = Array.isArray(sectionCitations) && sectionCitations.length > 0
      // peer-comparison/football-field carry their own footnotes; honour those.
      const footnote = (section as { data?: { footnote?: string } }).data?.footnote
      const hasFootnote = typeof footnote === 'string' && footnote.trim().length > 0
      if (!hasSectionCitations && !hasGlobalCitations && !hasFootnote) {
        issues.push({
          id: `deck-cite-${slideIndex}`,
          severity: 'warning',
          category: 'missing-citation',
          title: 'Slide has no citation',
          detail: `"${title}" presents figures but carries no inline citation or source attribution.`,
          location: { kind: 'slide', ref, label: title, slideIndex },
          autoFixable: false,
        })
      }
    }

    // ── KPI-table checks (numeric consistency + house style) ─────────────────
    if (section.type === 'kpi-table') {
      const data = section.data as KpiTableData
      data.metrics.forEach((m, mIdx) => {
        const parsed = parseFormattedNumber(m.value)
        if (parsed) {
          const key = normLabel(m.label)
          const bucket = numericByLabel.get(key) ?? []
          bucket.push({ value: parsed.value, slideIndex, raw: m.value, sectionTitle: title })
          numericByLabel.set(key, bucket)
        }
        // House-style number formatting.
        if (hs) {
          const fixed = reformatNumberToHouseStyle(m.value, hs.config.numberFormat)
          if (fixed) {
            issues.push({
              id: `deck-fmt-${slideIndex}-${mIdx}`,
              severity: 'info',
              category: 'house-style',
              title: 'Number format off house style',
              detail: `"${m.label}" shows "${m.value}" — house style is "${fixed}".`,
              location: { kind: 'slide', ref, label: `${title} · ${m.label}`, slideIndex },
              autoFixable: true,
              autoFix: { kind: 'number-format', description: `Reformat to "${fixed}"`, replacement: fixed },
            })
          }
        }
      })
    }

    // ── Chart-vs-data structural check ───────────────────────────────────────
    if (section.type === 'chart') {
      const data = section.data as ChartData
      if (Array.isArray(data.xLabels) && data.xLabels.length > 0) {
        data.series.forEach((serie, sIdx) => {
          if (serie.values.length !== data.xLabels!.length) {
            issues.push({
              id: `deck-chart-${slideIndex}-${sIdx}`,
              severity: 'error',
              category: 'chart-data-mismatch',
              title: 'Chart series length mismatch',
              detail: `"${title}" — series "${serie.name}" has ${serie.values.length} point(s) but the chart has ${data.xLabels!.length} category label(s); bars/points will not line up with the axis.`,
              location: { kind: 'slide', ref, label: `${title} · ${serie.name}`, slideIndex },
              autoFixable: false,
            })
          }
        })
      }
    }
  })

  // ── Cross-slide numeric inconsistency ──────────────────────────────────────
  for (const [, occurrences] of numericByLabel) {
    if (occurrences.length < 2) continue
    const distinct = new Set(occurrences.map((o) => o.value))
    if (distinct.size < 2) continue
    const first = occurrences[0]
    const variants = occurrences.map((o) => `${o.raw} (slide ${o.slideIndex})`).join(', ')
    issues.push({
      id: `deck-incons-${normLabel(first.sectionTitle)}-${first.value}`,
      severity: 'error',
      category: 'numeric-inconsistency',
      title: 'Inconsistent figure across slides',
      detail: `"${occurrences[0] ? occurrences[0].raw : ''}" — the same metric appears with different values: ${variants}.`,
      location: { kind: 'slide', ref: `slide:${first.slideIndex}`, label: first.sectionTitle, slideIndex: first.slideIndex },
      autoFixable: false,
    })
  }

  return finalize('deck', ctx.cover.title || template.meta?.title || 'Deck', issues, !!hs)
}

// ── Matrix verification ──────────────────────────────────────────────────────

export interface VerifyMatrixOpts {
  houseStyle?: HouseStyle | null
}

// Cell states (from the matrix grid) that represent a *finished* answer and so
// should carry at least one citation.
const COMPLETED_CELL_STATES = new Set(['done', 'complete', 'ok'])
const ERRORED_CELL_STATES = new Set(['error', 'failed'])

/**
 * Verify a research-matrix export. Flags failed cells (formula/reference
 * errors), completed cells lacking citations, and house-style terminology
 * deviations in cell prose.
 */
export function verifyMatrix(data: MatrixExportData, opts: VerifyMatrixOpts = {}): VerificationReport {
  const issues: VerificationIssue[] = []
  const hs = opts.houseStyle && opts.houseStyle.enabled ? opts.houseStyle : null

  for (const row of data.rows) {
    const rowLabel = row.ticker ? `${row.ticker} · ${row.label}` : row.label
    for (const col of data.columns) {
      // Matrix cell keys are dot-joined (`<rowId>.<colId>`) — see `cellKey`
      // in the matrix grid and `matrix-pptx.ts`. Keep this in lockstep.
      const key = `${row.id}.${col.id}`
      const cell = data.cells[key]
      if (!cell) continue
      const cellLabel = `${rowLabel} · ${col.label}`
      const loc: IssueLocation = {
        kind: 'cell',
        ref: `cell:${row.id}.${col.id}`,
        label: cellLabel,
        rowId: row.id,
        columnId: col.id,
      }

      // Failed cell → formula/reference error.
      if (ERRORED_CELL_STATES.has(cell.state)) {
        issues.push({
          id: `matrix-err-${key}`,
          severity: 'error',
          category: 'formula-error',
          title: 'Cell failed to compute',
          detail: cell.error
            ? `${cellLabel}: ${cell.error.slice(0, 240)}`
            : `${cellLabel} returned an error and has no answer.`,
          location: loc,
          autoFixable: false,
        })
        continue
      }

      // Completed cell with content but no citation.
      const hasText = typeof cell.text === 'string' && cell.text.trim().length > 0
      const citationCount = Array.isArray(cell.citations) ? cell.citations.length : 0
      if (COMPLETED_CELL_STATES.has(cell.state) && hasText && citationCount === 0) {
        issues.push({
          id: `matrix-cite-${key}`,
          severity: 'warning',
          category: 'missing-citation',
          title: 'Answer has no citation',
          detail: `${cellLabel} has a completed answer but cites no source.`,
          location: loc,
          autoFixable: false,
        })
      }

      // House-style terminology / banned terms in cell prose.
      if (hs && hasText) {
        const banned = findBannedTerms(cell.text!, hs.config.bannedTerms)
        if (banned.length > 0) {
          issues.push({
            id: `matrix-banned-${key}`,
            severity: 'warning',
            category: 'house-style',
            title: 'Off-style terminology',
            detail: `${cellLabel} uses term(s) the desk avoids: ${banned.join(', ')}.`,
            location: loc,
            autoFixable: false,
          })
        }
      }
    }
  }

  return finalize('matrix', data.name, issues, !!hs)
}
