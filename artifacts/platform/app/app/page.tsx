'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { PageHero, NAV_ICONS, ACTION_ICONS, ICON_STROKE } from '@/components/ui'
import { useWatchlist } from '@/lib/use-watchlist'
import { useWorkspace } from '@/lib/workspace'
import WidgetGrid from '@/components/WidgetGrid'

/* ──────────────────────────────────────────────────────────────────────────
   Overview is a customizable widget board. The hero stays fixed; everything
   below is a draggable/resizable grid driven by the user's saved layout
   (lib/workspace.tsx + /api/dashboard-layout). New users get DEFAULT_HOME_LAYOUT
   which reproduces the original Overview order. Every widget renders LIVE data
   with source attribution — see components/widgets/overview-widgets.tsx.
   ──────────────────────────────────────────────────────────────────────── */

export default function OverviewPage() {
  const { user } = useUser()
  const { editMode, setEditMode } = useWorkspace()
  const greetingName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
    'there'

  const [time, setTime] = useState<Date | null>(null)
  useEffect(() => {
    setTime(new Date())
    const id = setInterval(() => setTime(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const { symbols, loading: watchlistLoading } = useWatchlist({ pollMs: 60_000 })
  const count = symbols.length
  const subtitle = useMemo(() => {
    if (watchlistLoading) return 'Bringing your morning into focus…'
    if (!count) return 'Add tickers to your watchlist to start the morning brief — Finsyt will track filings, news, and price action across them.'
    return `Finsyt is monitoring ${count} compan${count === 1 ? 'y' : 'ies'} on your watchlist. Customise this board — drag, resize, add or remove widgets.`
  }, [watchlistLoading, count])

  return (
    <div>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <PageHero
          eyebrow={time ? time.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '\u00A0'}
          title={`Your morning, market-ready, ${greetingName}.`}
          accentWord="market-ready"
          subtitle={subtitle}
          actions={
            <>
              <button
                onClick={() => setEditMode(!editMode)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
                  borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                  background: editMode ? 'var(--accent)' : 'transparent',
                  border: `1.5px solid ${editMode ? 'var(--accent)' : 'var(--border)'}`,
                  color: editMode ? '#fff' : 'var(--text-primary)', fontSize: 13, fontWeight: 700,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                {editMode ? 'Done editing' : 'Edit layout'}
              </button>
              <Link
                href="/app/models"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
                  borderRadius: 10, background: 'transparent', border: '1.5px solid var(--border)',
                  color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                }}
              >
                <NAV_ICONS.models width={14} height={14} strokeWidth={ICON_STROKE} />
                Model Builder
              </Link>
              <Link
                href="/app/research"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
                  borderRadius: 10, background: 'var(--gradient-brand)', border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                  boxShadow: '0 4px 14px var(--accent-dim)',
                }}
              >
                Open AI Research
                <ACTION_ICONS.arrowRight width={14} height={14} strokeWidth={ICON_STROKE} />
              </Link>
            </>
          }
        />
      </div>

      <div style={{ padding: '0 1.75rem 1.75rem', maxWidth: 1400, margin: '0 auto' }}>
        <WidgetGrid page="/app" />
      </div>
    </div>
  )
}
