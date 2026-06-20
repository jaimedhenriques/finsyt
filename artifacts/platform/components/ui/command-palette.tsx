'use client'
/**
 * CommandPalette — global cmdk-style palette opened via ⌘K.
 *
 * Replaces the legacy in-`AppShell` modal. Sources are pluggable so the
 * palette can show pages, recent companies, recent agent runs, saved
 * screens, and "Run an agent on…" actions side by side.
 */
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { ACTION_ICONS, ICON_SIZE_SM, ICON_STROKE } from './icons'
import { Kbd } from './index'

export interface PaletteAction {
  id: string
  group: string
  label: string
  hint?: string
  icon?: ReactNode
  /** Free-form keywords that participate in fuzzy match. */
  keywords?: string
  onRun: () => void
}

export function CommandPalette({
  open, onClose, actions, placeholder = 'Search pages, tickers, agent runs…',
}: {
  open: boolean
  onClose: () => void
  actions: PaletteAction[]
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open) {
      setQuery(''); setHighlight(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!query.trim()) return actions
    const q = query.toLowerCase()
    return actions.filter(a => {
      const hay = `${a.label} ${a.group} ${a.hint || ''} ${a.keywords || ''}`.toLowerCase()
      return q.split(/\s+/).every(t => hay.includes(t))
    })
  }, [actions, query])

  // Group preserving insertion order.
  const groups = useMemo(() => {
    const m = new Map<string, PaletteAction[]>()
    for (const a of filtered) {
      const arr = m.get(a.group) ?? []
      arr.push(a); m.set(a.group, arr)
    }
    return Array.from(m.entries())
  }, [filtered])
  const flatList = filtered

  useEffect(() => {
    if (highlight >= flatList.length) setHighlight(0)
  }, [flatList.length, highlight])

  useEffect(() => {
    const sel = listRef.current?.querySelector<HTMLElement>(`[data-cmd-idx="${highlight}"]`)
    sel?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  if (!open) return null

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(flatList.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(0, h - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const a = flatList[highlight]
      if (a) { a.onRun(); onClose() }
    } else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  const SearchIcon = ACTION_ICONS.search

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(8,14,26,0.45)', backdropFilter: 'blur(4px)',
          zIndex: 1200,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          position: 'fixed', top: '12vh', left: '50%', transform: 'translateX(-50%)',
          width: 'min(640px, 92vw)', maxHeight: '70vh',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
          zIndex: 1201, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <SearchIcon width={ICON_SIZE_SM + 2} height={ICON_SIZE_SM + 2} strokeWidth={ICON_STROKE} color="var(--text-muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlight(0) }}
            onKeyDown={onKey}
            placeholder={placeholder}
            aria-label="Search command palette"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'inherit', fontSize: 15, color: 'var(--text-primary)',
            }}
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {flatList.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No matches.
            </div>
          )}
          {(() => {
            let idx = -1
            return groups.map(([group, items]) => (
              <div key={group}>
                <div style={{
                  padding: '8px 16px 4px',
                  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
                  color: 'var(--text-muted)', textTransform: 'uppercase',
                }}>{group}</div>
                {items.map(a => {
                  idx += 1
                  const active = idx === highlight
                  const myIdx = idx
                  return (
                    <button
                      key={a.id}
                      data-cmd-idx={myIdx}
                      type="button"
                      onMouseEnter={() => setHighlight(myIdx)}
                      onClick={() => { a.onRun(); onClose() }}
                      style={{
                        width: '100%', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 16px',
                        border: 'none',
                        background: active ? 'var(--accent-dim)' : 'transparent',
                        color: 'var(--text-primary)', fontFamily: 'inherit',
                        cursor: 'pointer', fontSize: 13,
                      }}
                    >
                      {a.icon ? <span style={{ display: 'inline-flex', color: active ? 'var(--accent-text)' : 'var(--text-muted)', flexShrink: 0 }}>{a.icon}</span> : <span style={{ width: ICON_SIZE_SM, flexShrink: 0 }}/>}
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
                      {a.hint && <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 }}>{a.hint}</span>}
                    </button>
                  )
                })}
              </div>
            ))
          })()}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', borderTop: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate · <Kbd>↵</Kbd> Open
          </span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Kbd>⌘K</Kbd> toggle
          </span>
        </div>
      </div>
    </>
  )
}
