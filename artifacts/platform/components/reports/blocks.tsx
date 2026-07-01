'use client'
/**
 * Report builder — block descriptors, default configs, and the inline
 * config editors rendered inside each block card on the canvas.
 *
 * Each block kind maps to a `BlockSpec`: its display label, a one-line
 * description for the palette, an emoji glyph, a factory for its default
 * config, and a small `Editor` component that mutates the block's config in
 * place. The same `kind` strings are the ones the API + `report-data.ts`
 * assembler understand, so they must stay in lockstep with
 * `REPORT_BLOCK_KINDS` in `lib/db/src/schema/reports.ts`.
 */
import type { ReactNode } from 'react'

export type BlockKind = 'kpi' | 'chart' | 'peers' | 'valuation' | 'text' | 'citations'

export const BLOCK_KINDS: BlockKind[] = ['kpi', 'chart', 'peers', 'valuation', 'text', 'citations']

export interface ReportBlock {
  /** Stable client-side key for DnD / list rendering (not persisted). */
  uid: string
  kind: BlockKind
  config: Record<string, unknown>
}

export interface BlockSpec {
  kind: BlockKind
  label: string
  glyph: string
  description: string
  defaultConfig: () => Record<string, unknown>
}

const CHART_METRICS = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'netIncome', label: 'Net income' },
  { value: 'eps', label: 'EPS' },
  { value: 'fcf', label: 'Free cash flow' },
  { value: 'ebitda', label: 'EBITDA' },
]

export const BLOCK_SPECS: Record<BlockKind, BlockSpec> = {
  kpi: {
    kind: 'kpi',
    label: 'KPI tiles',
    glyph: '📊',
    description: 'Live quote snapshot — price, change, market cap, P/E.',
    defaultConfig: () => ({ symbol: '', title: 'Key metrics' }),
  },
  chart: {
    kind: 'chart',
    label: 'Financial chart',
    glyph: '📈',
    description: 'Multi-year bar chart of a single financial metric.',
    defaultConfig: () => ({ symbol: '', metric: 'revenue', years: 5, title: '' }),
  },
  peers: {
    kind: 'peers',
    label: 'Peer comparison',
    glyph: '🏛️',
    description: 'Side-by-side multiples vs. a basket of peers.',
    defaultConfig: () => ({ symbols: [], subject: '', setName: '', title: 'Peer comparison' }),
  },
  valuation: {
    kind: 'valuation',
    label: 'Valuation (football field)',
    glyph: '🏈',
    description: 'Overlay of valuation ranges on a shared price axis.',
    defaultConfig: () => ({ symbol: '', title: 'Valuation' }),
  },
  text: {
    kind: 'text',
    label: 'Commentary',
    glyph: '✍️',
    description: 'Free-form heading + body for analyst commentary.',
    defaultConfig: () => ({ heading: '', body: '' }),
  },
  citations: {
    kind: 'citations',
    label: 'Sources & citations',
    glyph: '🔖',
    description: 'Auto-generated list of every data source the report touched.',
    defaultConfig: () => ({ title: 'Data sources used' }),
  },
}

// ── Shared field primitives ───────────────────────────────────────────────────

const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }
const labelCss: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.02em' }
const inputCss: React.CSSProperties = {
  padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-input, var(--bg-card))', color: 'var(--text-primary)', fontSize: 13, width: '100%',
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={fieldWrap}>
      <span style={labelCss}>{label}</span>
      {children}
    </label>
  )
}

function setField(block: ReportBlock, key: string, value: unknown): ReportBlock {
  return { ...block, config: { ...block.config, [key]: value } }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

// ── Per-kind editors ──────────────────────────────────────────────────────────

export function BlockEditor({
  block,
  onChange,
}: {
  block: ReportBlock
  onChange: (next: ReportBlock) => void
}) {
  const row: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }

  switch (block.kind) {
    case 'kpi':
      return (
        <div style={row}>
          <Field label="Ticker">
            <input style={inputCss} placeholder="e.g. AAPL" value={str(block.config.symbol)}
              onChange={(e) => onChange(setField(block, 'symbol', e.target.value.toUpperCase()))} />
          </Field>
          <Field label="Title">
            <input style={inputCss} placeholder="Key metrics" value={str(block.config.title)}
              onChange={(e) => onChange(setField(block, 'title', e.target.value))} />
          </Field>
        </div>
      )
    case 'chart':
      return (
        <div style={row}>
          <Field label="Ticker">
            <input style={inputCss} placeholder="e.g. AAPL" value={str(block.config.symbol)}
              onChange={(e) => onChange(setField(block, 'symbol', e.target.value.toUpperCase()))} />
          </Field>
          <Field label="Metric">
            <select style={inputCss} value={str(block.config.metric) || 'revenue'}
              onChange={(e) => onChange(setField(block, 'metric', e.target.value))}>
              {CHART_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Years">
            <input style={inputCss} type="number" min={2} max={10} value={Number(block.config.years) || 5}
              onChange={(e) => onChange(setField(block, 'years', Math.max(2, Math.min(10, Number(e.target.value) || 5))))} />
          </Field>
          <Field label="Title (optional)">
            <input style={inputCss} placeholder="Revenue trend" value={str(block.config.title)}
              onChange={(e) => onChange(setField(block, 'title', e.target.value))} />
          </Field>
        </div>
      )
    case 'peers':
      return (
        <div style={row}>
          <Field label="Subject ticker">
            <input style={inputCss} placeholder="e.g. NVDA" value={str(block.config.subject)}
              onChange={(e) => onChange(setField(block, 'subject', e.target.value.toUpperCase()))} />
          </Field>
          <Field label="Peer tickers (comma-separated)">
            <input style={inputCss} placeholder="AMD, INTC, AVGO"
              value={Array.isArray(block.config.symbols) ? (block.config.symbols as string[]).join(', ') : ''}
              onChange={(e) => onChange(setField(block, 'symbols',
                e.target.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)))} />
          </Field>
          <Field label="Title">
            <input style={inputCss} placeholder="Peer comparison" value={str(block.config.title)}
              onChange={(e) => onChange(setField(block, 'title', e.target.value))} />
          </Field>
        </div>
      )
    case 'valuation':
      return (
        <div style={row}>
          <Field label="Ticker">
            <input style={inputCss} placeholder="e.g. MSFT" value={str(block.config.symbol)}
              onChange={(e) => onChange(setField(block, 'symbol', e.target.value.toUpperCase()))} />
          </Field>
          <Field label="Title">
            <input style={inputCss} placeholder="Valuation" value={str(block.config.title)}
              onChange={(e) => onChange(setField(block, 'title', e.target.value))} />
          </Field>
        </div>
      )
    case 'text':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Heading">
            <input style={inputCss} placeholder="Investment thesis" value={str(block.config.heading)}
              onChange={(e) => onChange(setField(block, 'heading', e.target.value))} />
          </Field>
          <Field label="Body">
            <textarea style={{ ...inputCss, minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Write your commentary…" value={str(block.config.body)}
              onChange={(e) => onChange(setField(block, 'body', e.target.value))} />
          </Field>
        </div>
      )
    case 'citations':
      return (
        <div style={row}>
          <Field label="Title">
            <input style={inputCss} placeholder="Data sources used" value={str(block.config.title)}
              onChange={(e) => onChange(setField(block, 'title', e.target.value))} />
          </Field>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '22px 0 0', flexBasis: '100%' }}>
            This block auto-populates with every provider the report touched when exported. No configuration needed.
          </p>
        </div>
      )
    default:
      return null
  }
}

/** One-line summary of a block's current config, shown in the collapsed card header. */
export function blockSummary(block: ReportBlock): string {
  switch (block.kind) {
    case 'kpi':
      return str(block.config.symbol) || 'no ticker set'
    case 'chart': {
      const m = CHART_METRICS.find((x) => x.value === str(block.config.metric))?.label || 'Revenue'
      return `${str(block.config.symbol) || '—'} · ${m} · ${Number(block.config.years) || 5}y`
    }
    case 'peers': {
      const n = Array.isArray(block.config.symbols) ? (block.config.symbols as string[]).length : 0
      return `${str(block.config.subject) || '—'} vs ${n} peer${n === 1 ? '' : 's'}`
    }
    case 'valuation':
      return str(block.config.symbol) || 'no ticker set'
    case 'text':
      return str(block.config.heading) || 'untitled commentary'
    case 'citations':
      return 'auto-generated on export'
    default:
      return ''
  }
}
