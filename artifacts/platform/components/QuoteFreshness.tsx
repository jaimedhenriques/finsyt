'use client'
import { useEffect, useState } from 'react'
import { providerLabel } from '@/lib/provider-labels'

/** Render a self-ticking "Updated Ns ago" relative time. */
function relTime(asOfMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.round((nowMs - asOfMs) / 1000))
  if (sec < 5)  return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24)  return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

/**
 * Freshness + source attribution chip for live quote surfaces.
 *
 * Shows a pulsing dot, a live-updating "Updated Ns ago" relative time, and
 * the resolved data source (e.g. "Financial Modeling Prep"). The relative
 * time re-renders once per second so it stays honest between quote polls.
 * Renders nothing until a real `asOf` timestamp is supplied so the page
 * never displays a fabricated freshness value.
 */
export function QuoteFreshness({
  asOf,
  source,
  align = 'right',
}: {
  asOf?: number | string | null
  source?: string | null
  align?: 'left' | 'right'
}) {
  const asOfMs = typeof asOf === 'string' ? new Date(asOf).getTime() : asOf ?? null
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!asOfMs) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [asOfMs])

  if (!asOfMs || !Number.isFinite(asOfMs)) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        fontSize: 11,
        color: 'var(--text-muted)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--pos)',
          flexShrink: 0,
          animation: 'finsytQuotePulse 2s infinite',
        }}
      />
      <span>Updated {relTime(asOfMs, now)}</span>
      {source && (
        <>
          <span aria-hidden>·</span>
          <span title="Data source">{providerLabel(source)}</span>
        </>
      )}
      <style>{`@keyframes finsytQuotePulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 5px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}`}</style>
    </div>
  )
}

export default QuoteFreshness
