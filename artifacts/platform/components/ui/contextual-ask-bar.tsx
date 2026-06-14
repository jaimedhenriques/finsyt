'use client'
/**
 * ContextualAskBar — inline AI affordance mounted on every primary page.
 *
 * Sits directly below the page header. Carries page-aware suggested-prompt
 * chips so the agent always starts grounded in what the user is looking at.
 * Submitting fires the same global "open the agent drawer with this prompt"
 * channel that the topbar `CommandInput` uses, so Behaviour stays uniform
 * regardless of where the user starts the question.
 */
import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react'
import { ACTION_ICONS, ICON_SIZE_MD, ICON_STROKE } from './icons'
import { Kbd } from './index'

export interface AskChip { label: string; prompt: string; icon?: ReactNode }

export interface ContextualAskBarProps {
  /**
   * Short label displayed inside the bar so the user knows the agent will
   * answer in the context of this page (e.g. "Watchlist context",
   * "Filings · NVDA Q4 2026").
   */
  context: string
  /**
   * Placeholder copy for the input. Should hint at the kind of question
   * this page is best at answering.
   */
  placeholder?: string
  /**
   * Page-tailored prompt chips shown to the right of the input. Selecting a
   * chip fills the prompt and fires `onAsk`.
   */
  chips?: AskChip[]
  /**
   * Optional context payload merged into the global ask event so the
   * downstream agent prompt can reference page state. Keep it small —
   * symbols, filters, date ranges, current row.
   */
  contextData?: Record<string, unknown>
  /**
   * Optional override for what happens on submit. Defaults to firing the
   * global `finsyt:ask` window event consumed by `AppShell`.
   */
  onAsk?: (prompt: string, contextData?: Record<string, unknown>) => void
  style?: CSSProperties
  dense?: boolean
}

/** Window event channel the AppShell listens on. */
export const FINSYT_ASK_EVENT = 'finsyt:ask'
export interface FinsytAskDetail { prompt: string; context?: Record<string, unknown>; autoSubmit?: boolean }

export function dispatchAsk(detail: FinsytAskDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<FinsytAskDetail>(FINSYT_ASK_EVENT, { detail }))
}

export function ContextualAskBar({
  context, placeholder = 'Ask the agent about anything on this page…', chips = [], contextData,
  onAsk, style, dense = false,
}: ContextualAskBarProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const Icon = ACTION_ICONS.sparkles
  const SendIcon = ACTION_ICONS.send

  function send(prompt: string) {
    const p = prompt.trim()
    if (!p) return
    if (onAsk) onAsk(p, contextData)
    else dispatchAsk({ prompt: p, context: contextData, autoSubmit: true })
    setValue('')
    inputRef.current?.blur()
  }

  return (
    <div
      role="search"
      aria-label="Contextual AI ask bar"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: dense ? '10px 14px' : '12px 16px',
        margin: dense ? '8px 28px 0' : '14px 28px 0',
        background: 'var(--bg-card)',
        border: '1.5px solid',
        borderColor: focused ? 'var(--accent)' : 'var(--accent-dim)',
        borderRadius: 12,
        boxShadow: focused ? '0 0 0 4px var(--accent-dim)' : 'none',
        transition: 'border-color .14s, box-shadow .14s',
        ...style,
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 8,
        background: 'var(--accent-dim)', color: 'var(--accent-text)', flexShrink: 0,
      }}>
        <Icon width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
      </span>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 1,
        minWidth: 120, marginRight: 4,
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Ask Finsyt</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{context}</span>
      </div>
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); send(value) }
        }}
        placeholder={placeholder}
        aria-label={`Ask Finsyt about ${context}`}
        style={{
          flex: 1, minWidth: 200,
          background: 'transparent', border: 'none', outline: 'none',
          fontFamily: 'inherit', fontSize: 13.5, color: 'var(--text-primary)',
        }}
      />
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {chips.map(c => (
            <button
              key={c.label}
              type="button"
              onClick={() => { setValue(c.prompt); send(c.prompt) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 999,
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all .12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-dim)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
            >
              {c.icon}
              {c.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => send(value)}
        disabled={!value.trim()}
        aria-label="Ask the agent"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          height: 32, padding: '0 12px', borderRadius: 8,
          border: 'none', background: value.trim() ? 'var(--accent)' : 'var(--hover)',
          color: value.trim() ? '#fff' : 'var(--text-muted)',
          fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          cursor: value.trim() ? 'pointer' : 'not-allowed',
          transition: 'background .12s',
          flexShrink: 0,
        }}
      >
        <SendIcon width={ICON_SIZE_SM_LOCAL} height={ICON_SIZE_SM_LOCAL} strokeWidth={ICON_STROKE} />
        Ask
        <Kbd>↵</Kbd>
      </button>
    </div>
  )
}

const ICON_SIZE_SM_LOCAL = 13
