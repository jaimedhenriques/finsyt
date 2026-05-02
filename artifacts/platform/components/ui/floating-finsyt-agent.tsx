'use client'
/**
 * FloatingFinsytAgent — fixed bottom-right affordance present on every
 * authenticated page. Clicking it (or pressing ⌘J) opens the same Ask AI
 * drawer surface; the AppShell owns the actual drawer.
 *
 * Variants:
 *  - "floating" (default): pill button anchored bottom-right.
 *  - "docked":              compact rail-style button users can pin to keep
 *                           the agent affordance permanently visible
 *                           alongside content (e.g. for analysts who want
 *                           the sparkle in their peripheral vision while
 *                           reading research). Persists across reloads.
 *
 * The pin preference migrated from the previous storage key, so any users
 * who pinned the older affordance keep their pin on first load.
 */
import { useEffect, useState } from 'react'
import { ACTION_ICONS, ICON_SIZE_LG, ICON_STROKE } from './icons'
import { Kbd } from './index'

const PIN_KEY = 'finsyt:agent-pinned'
// Migration: users who pinned the previous affordance had their preference
// stored under this lowercase identifier. Lowercase `copilot` deliberately
// kept here so the original storage key keeps resolving on first load.
const LEGACY_PIN_KEY = 'finsyt:copilot-pinned'

export function FloatingFinsytAgent({ onOpen, hint = 'Ask Finsyt' }: { onOpen: () => void; hint?: string }) {
  const Sparkle = ACTION_ICONS.sparkles
  const Pin = ACTION_ICONS.pin
  const [pinned, setPinned] = useState(false)
  const [hover, setHover]   = useState(false)

  useEffect(() => {
    try {
      const v = localStorage.getItem(PIN_KEY) ?? localStorage.getItem(LEGACY_PIN_KEY)
      setPinned(v === '1')
    } catch { /* SSR / privacy mode */ }
  }, [])

  function togglePin(e: React.MouseEvent) {
    e.stopPropagation()
    setPinned(p => {
      const next = !p
      try { localStorage.setItem(PIN_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  // Docked variant — slim vertical rail anchored to right edge centre.
  if (pinned) {
    return (
      <div
        style={{
          position: 'fixed', right: 14, top: '50%', transform: 'translateY(-50%)',
          zIndex: 1050,
          display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch',
          padding: 6,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.10)',
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <button
          type="button"
          aria-label="Open Finsyt Agent"
          title={`${hint} (⌘J)`}
          onClick={onOpen}
          style={{
            width: 38, height: 38, borderRadius: 10,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--gradient-brand)', color: '#fff', border: 'none',
            cursor: 'pointer', boxShadow: '0 6px 18px var(--accent-dim)',
          }}
        >
          <Sparkle width={ICON_SIZE_LG} height={ICON_SIZE_LG} strokeWidth={ICON_STROKE} />
        </button>
        <button
          type="button"
          aria-label="Unpin Finsyt Agent"
          title="Unpin (return to floating)"
          onClick={togglePin}
          style={{
            width: 38, height: 26, borderRadius: 8,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-dim)', color: 'var(--accent-text)',
            border: '1px solid var(--accent)',
            cursor: 'pointer', fontSize: 11,
          }}
        >
          <Pin width={14} height={14} strokeWidth={ICON_STROKE} />
        </button>
        {hover && (
          <span style={{
            position: 'absolute', right: 'calc(100% + 8px)', top: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '4px 8px', fontSize: 11, color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}>{hint} · ⌘J</span>
        )}
      </div>
    )
  }

  // Floating variant.
  return (
    <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 1050, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        aria-label="Pin Finsyt Agent to side rail"
        title="Pin Finsyt Agent"
        onClick={togglePin}
        style={{
          width: 30, height: 30, borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-card)', color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
          cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}
      >
        <Pin width={14} height={14} strokeWidth={ICON_STROKE} />
      </button>
      <button
        type="button"
        aria-label="Open Finsyt Agent"
        title={`${hint} (⌘J)`}
        onClick={onOpen}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '12px 18px',
          borderRadius: 999,
          background: 'var(--gradient-brand)', color: '#fff',
          border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 13, fontWeight: 700, letterSpacing: '-0.005em',
          boxShadow: '0 12px 32px var(--accent-dim), 0 2px 8px rgba(0,0,0,0.18)',
          transition: 'transform .14s, box-shadow .14s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 16px 40px var(--accent-dim), 0 4px 12px rgba(0,0,0,0.22)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px var(--accent-dim), 0 2px 8px rgba(0,0,0,0.18)' }}
      >
        <Sparkle width={ICON_SIZE_LG} height={ICON_SIZE_LG} strokeWidth={ICON_STROKE} />
        <span>Finsyt Agent</span>
        <Kbd style={{ background: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.28)', color: 'rgba(255,255,255,0.9)' }}>⌘J</Kbd>
      </button>
    </div>
  )
}

