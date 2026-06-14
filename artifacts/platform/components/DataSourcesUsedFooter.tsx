'use client'
import { useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import {
  type ProviderTrace,
  ROLE_COLORS,
  dedupeTrace,
} from '@/lib/data-sources-trace'

interface Props {
  /** Provider/connector trace rows for the answer. */
  trace: ProviderTrace[]
  /** Optional caption shown above the rows, e.g. "Generated in 3.2s · 5 sources". */
  caption?: string
  /** Compact variant — used inside Matrix cell drawer where space is tight. */
  compact?: boolean
  /**
   * When provided, each row becomes clickable and calls back with the
   * tool_result id (`ProviderTrace.id`) so the caller can open the
   * underlying snippet/record (not just the provider label).
   */
  onOpenSource?: (traceId: string) => void
  /**
   * Render an "answer still gathering sources" placeholder when the answer
   * is mid-flight and no trace rows have arrived yet.
   */
  loading?: boolean
}

/**
 * "Data sources used" footer rendered below every Finsyt agent answer.
 *
 * Behaviour:
 * - Hidden entirely when the workspace setting `dataSourcesFooterEnabled`
 *   is off (default on).
 * - Persists its open/closed state per-user via the workspace context, so
 *   users who collapse it stay collapsed across runs.
 * - Each row is clickable (calls `onRowClick`) and also links to the
 *   Connector Hub deep link so users can audit the provider that fed the answer.
 */
export default function DataSourcesUsedFooter({ trace, caption, compact, onOpenSource, loading }: Props) {
  const { dataSourcesFooterEnabled, dataSourcesFooterCollapsed, setDataSourcesFooterCollapsed } = useWorkspace()
  // Per-instance open state seeded from the workspace pref. Lets users
  // expand a single answer's footer without losing their default.
  const [localOpen, setLocalOpen] = useState<boolean | null>(null)
  if (!dataSourcesFooterEnabled) return null
  const items = dedupeTrace(trace)
  if (items.length === 0) {
    // Always-on panel: show a status line rather than vanishing, so users
    // know whether sources are still arriving or genuinely absent.
    return (
      <section
        aria-label="Data sources used"
        style={{
          marginTop: compact ? 12 : 16,
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--bg-card, var(--row-stripe))',
          padding: compact ? '8px 12px' : '10px 14px',
          fontSize: compact ? 11 : 11.5,
          display: 'flex', alignItems: 'center', gap: 8,
          color: 'var(--text-muted)',
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: 5,
          background: 'var(--accent-dim)', color: 'var(--accent-text)',
          fontSize: 10, fontWeight: 800,
        }} aria-hidden>◧</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: 'var(--text-muted)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>Data sources used</span>
        <span style={{ fontWeight: 500 }}>
          {loading ? '· Gathering sources…' : '· No external sources were used for this answer'}
        </span>
      </section>
    )
  }

  const open = localOpen ?? !dataSourcesFooterCollapsed

  function toggle() {
    const next = !open
    setLocalOpen(next)
    // Persist the workspace-wide collapse default so the next answer
    // matches the user's choice. Local override still wins for already-
    // rendered footers.
    setDataSourcesFooterCollapsed(!next)
  }

  const totalCitations = items.reduce((s, x) => s + (x.citationCount || 0), 0)
  const slowestMs = items.reduce((s, x) => Math.max(s, x.responseMs || 0), 0)
  const headerCaption = caption
    || `${items.length} source${items.length === 1 ? '' : 's'}`
    + (totalCitations ? ` · ${totalCitations} citation${totalCitations === 1 ? '' : 's'}` : '')
    + (slowestMs ? ` · ${formatMs(slowestMs)} slowest hop` : '')

  return (
    <section
      aria-label="Data sources used"
      style={{
        marginTop: compact ? 12 : 16,
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--bg-card, var(--row-stripe))',
        overflow: 'hidden',
        fontSize: compact ? 11 : 11.5,
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: compact ? '8px 12px' : '10px 14px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', fontFamily: 'inherit',
          fontSize: 'inherit', fontWeight: 600, textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: 5,
          background: 'var(--accent-dim)', color: 'var(--accent-text)',
          fontSize: 10, fontWeight: 800,
        }} aria-hidden>◧</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: 'var(--text-muted)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>Data sources used</span>
        <span style={{ flex: 1, color: 'var(--text-secondary)', fontWeight: 500 }}>
          · {headerCaption}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
          {open ? 'Hide ▴' : 'Show ▾'}
        </span>
      </button>

      {open && (
        <ul style={{
          listStyle: 'none', margin: 0, padding: 0,
          borderTop: '1px solid var(--border)',
        }}>
          {items.map(row => {
            const role = ROLE_COLORS[row.role]
            const isClickable = !!onOpenSource
            return (
              <li key={row.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: compact ? '7px 12px' : '9px 14px',
                borderTop: '1px solid var(--border)',
                cursor: isClickable ? 'pointer' : 'default',
                transition: 'background 0.12s',
              }}
              onClick={isClickable ? () => onOpenSource!(row.id) : undefined}
              onMouseEnter={e => { if (isClickable) (e.currentTarget as HTMLElement).style.background = 'var(--row-hover)' }}
              onMouseLeave={e => { if (isClickable) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '2px 8px', borderRadius: 5,
                  background: role.bg, color: role.fg,
                  border: `1px solid ${role.border}`,
                  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em',
                  textTransform: 'uppercase', flexShrink: 0,
                }}>{role.label}</span>
                {onOpenSource ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenSource(row.id) }}
                    title="Open source snippet"
                    style={{
                      minWidth: 0, flex: 1, textAlign: 'left', cursor: 'pointer',
                      background: 'none', border: 'none', padding: 0, font: 'inherit',
                    }}
                  >
                    <div style={{
                      fontSize: compact ? 12 : 12.5, fontWeight: 700,
                      color: 'var(--accent-text)', lineHeight: 1.3,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      textDecoration: 'underline', textDecorationStyle: 'dotted',
                      textUnderlineOffset: 3,
                    }}>{row.label}</div>
                    {row.detail && (
                      <div style={{
                        fontSize: 10.5, color: 'var(--text-muted)',
                        lineHeight: 1.3, marginTop: 1,
                      }}>{row.detail}</div>
                    )}
                  </button>
                ) : (
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: compact ? 12 : 12.5, fontWeight: 700,
                      color: 'var(--text-primary)', lineHeight: 1.3,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{row.label}</div>
                    {row.detail && (
                      <div style={{
                        fontSize: 10.5, color: 'var(--text-muted)',
                        lineHeight: 1.3, marginTop: 1,
                      }}>{row.detail}</div>
                    )}
                  </div>
                )}
                {typeof row.responseMs === 'number' && (
                  <span style={{
                    fontSize: 10.5, color: 'var(--text-secondary)',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                  }} title="Tool round-trip time">{formatMs(row.responseMs)}</span>
                )}
                {typeof row.citationCount === 'number' && row.citationCount > 0 && (
                  <span style={{
                    fontSize: 10, color: 'var(--text-secondary)',
                    fontWeight: 700, flexShrink: 0,
                  }} title={`${row.citationCount} citation${row.citationCount === 1 ? '' : 's'}`}>
                    {row.citationCount} cite{row.citationCount === 1 ? '' : 's'}
                  </span>
                )}
                <a
                  href={row.connectorHubHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{
                    fontSize: 10.5, fontWeight: 700,
                    color: 'var(--accent-text)', textDecoration: 'none',
                    padding: '3px 8px', borderRadius: 5,
                    background: 'var(--accent-dim)', border: '1px solid var(--accent-dim)',
                    flexShrink: 0,
                  }}
                  title="Open in Connector Hub"
                >Connector ↗</a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}
