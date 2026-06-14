'use client'
/**
 * InlineAgentMenu — "✨ Ask about this" popover for selectable rows / cells.
 *
 * Renders a small trigger that, when activated, opens a compact menu of
 * page-aware actions ("Summarise this", "Compare with peers", "Pull recent
 * news", etc.). Selecting any action dispatches the global `finsyt:ask`
 * event so the same drawer surface answers regardless of origin.
 */
import { ReactNode, useEffect, useRef, useState, CSSProperties } from 'react'
import { ACTION_ICONS, ICON_SIZE_SM, ICON_STROKE } from './icons'
import { dispatchAsk } from './contextual-ask-bar'

export interface InlineAgentMenuProps {
  /** Short label such as "AAPL", "Q4 2026 NVDA call", "10-K · MSFT". */
  subject: string
  /** Promptable actions rendered inside the menu. */
  actions: { label: string; prompt: string; icon?: ReactNode }[]
  /** Context object merged into the dispatched ask event. */
  contextData?: Record<string, unknown>
  /** Visual variant. `chip` shows a label, `icon` shows just the sparkle. */
  variant?: 'chip' | 'icon'
  align?: 'left' | 'right'
  style?: CSSProperties
}

export function InlineAgentMenu({
  subject, actions, contextData, variant = 'chip', align = 'right', style,
}: InlineAgentMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const Sparkle = ACTION_ICONS.sparkles

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  function fire(prompt: string) {
    dispatchAsk({ prompt, context: contextData, autoSubmit: true })
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', ...style }} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Ask the agent about ${subject}`}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: variant === 'icon' ? 5 : '4px 9px',
          height: variant === 'icon' ? 24 : 24,
          borderRadius: variant === 'icon' ? 6 : 999,
          border: '1px solid', borderColor: open ? 'var(--accent)' : 'transparent',
          background: open ? 'var(--accent-dim)' : 'transparent',
          color: open ? 'var(--accent-text)' : 'var(--text-secondary)',
          fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
          cursor: 'pointer',
          transition: 'all .12s',
        }}
        onMouseEnter={e => { if (!open) { (e.currentTarget as HTMLElement).style.background = 'var(--hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-text)' } }}
        onMouseLeave={e => { if (!open) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' } }}
      >
        <Sparkle width={ICON_SIZE_SM} height={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
        {variant === 'chip' && 'Ask'}
      </button>
      {open && (
        <div role="menu" style={{
          position: 'absolute', top: 'calc(100% + 6px)',
          [align === 'right' ? 'right' : 'left']: 0,
          minWidth: 240, maxWidth: 320,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 12px 36px rgba(0,0,0,0.16)',
          zIndex: 60, overflow: 'hidden',
        }}>
          <div style={{
            padding: '9px 12px 7px', borderBottom: '1px solid var(--border)',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
            color: 'var(--text-muted)', textTransform: 'uppercase',
          }}>Ask about <span style={{ color: 'var(--accent-text)', textTransform: 'none', letterSpacing: 0 }}>{subject}</span></div>
          {actions.map(a => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={() => fire(a.prompt)}
              style={{
                width: '100%', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: 'inherit',
                color: 'var(--text-primary)', fontSize: 12.5,
                transition: 'background .1s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              {a.icon ? <span style={{ display: 'inline-flex', color: 'var(--accent-text)', flexShrink: 0 }}>{a.icon}</span> : null}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
