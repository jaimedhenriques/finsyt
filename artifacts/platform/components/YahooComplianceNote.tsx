'use client'

/**
 * Small, reusable compliance footnote shown wherever keyless-Yahoo
 * (`source: 'yahoo'`) data is surfaced in the platform UI.
 *
 * Yahoo's public finance endpoints are intended for *personal use only* and
 * `yfinance` (the open-source library these calls are modelled on) is NOT
 * endorsed by Yahoo. We always render this note next to Yahoo-sourced data so
 * users understand the provenance and the usage constraint.
 */
export default function YahooComplianceNote({
  compact = false,
  style,
}: {
  compact?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        fontSize: compact ? 10 : 11,
        lineHeight: 1.45,
        color: 'var(--text-muted)',
        fontStyle: 'italic',
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          flex: '0 0 auto',
          fontStyle: 'normal',
          fontWeight: 700,
          color: 'var(--text-muted)',
        }}
      >
        ⚠
      </span>
      <span>
        Source: Yahoo Finance (public endpoint). Supplementary data, intended
        for personal use only; <code style={{ fontStyle: 'normal' }}>yfinance</code>{' '}
        is not affiliated with or endorsed by Yahoo. Treat as best-effort and
        verify against a primary provider before relying on it.
      </span>
    </div>
  )
}
