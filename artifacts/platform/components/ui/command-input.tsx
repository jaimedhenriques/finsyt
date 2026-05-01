'use client'
/**
 * CommandInput — the persistent topbar "Ask Finsyt" input.
 *
 * Visually reads as a slim search field with a sparkle icon, an animated
 * focus ring, and a `⌘J` kbd hint. Submitting fires the global ask event
 * so the AppShell drawer takes over with the prompt prefilled and
 * auto-submitted. Pressing `/` from anywhere outside an editable field
 * focuses it.
 */
import { useEffect, useRef, useState } from 'react'
import { ACTION_ICONS, ICON_SIZE_SM, ICON_STROKE } from './icons'
import { Kbd } from './index'
import { dispatchAsk } from './contextual-ask-bar'

export function CommandInput({
  placeholder = 'Ask Finsyt anything — earnings, filings, prices…',
  width = 480,
}: { placeholder?: string; width?: number | string }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLInputElement | null>(null)
  const Sparkle = ACTION_ICONS.sparkles

  // Focus on `/` when not in another editable field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/') return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return
      e.preventDefault()
      ref.current?.focus()
      ref.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function submit() {
    const v = value.trim()
    if (!v) return
    dispatchAsk({ prompt: v, autoSubmit: true })
    setValue('')
    ref.current?.blur()
  }

  return (
    <div style={{
      position: 'relative', flex: '1 1 auto', maxWidth: width, minWidth: 280,
    }}>
      <span style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: focused ? 'var(--accent-text)' : 'var(--text-muted)',
        pointerEvents: 'none',
      }}>
        <Sparkle width={ICON_SIZE_SM} height={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
      </span>
      <input
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          else if (e.key === 'Escape') { setValue(''); ref.current?.blur() }
        }}
        placeholder={placeholder}
        aria-label="Ask Finsyt"
        style={{
          width: '100%', boxSizing: 'border-box',
          height: 40,
          padding: '0 84px 0 36px',
          background: 'var(--bg-input)',
          border: '1.5px solid',
          borderColor: focused ? 'var(--accent)' : 'var(--border)',
          borderRadius: 10,
          fontSize: 13.5, color: 'var(--text-primary)',
          fontFamily: 'inherit', outline: 'none',
          boxShadow: focused ? '0 0 0 3px var(--accent-dim)' : 'none',
          transition: 'border-color .14s, box-shadow .14s',
        }}
      />
      <span style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        pointerEvents: 'none',
      }}>
        <Kbd>/</Kbd>
        <Kbd>⌘J</Kbd>
      </span>
    </div>
  )
}
