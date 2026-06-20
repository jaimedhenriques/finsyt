'use client'
/**
 * CommandInput — the persistent topbar command line.
 *
 * Bloomberg/terminal-style: type a ticker plus a function code (`AAPL DES`,
 * `NVDA FA`, `TSLA PEERS`) to jump straight to a company surface, or a bare
 * code (`MACRO`, `SCR`) to open a global workspace. As you type a ticker then
 * a space, the available function codes surface as an inline, keyboard-
 * navigable suggestion dropdown. Slash commands (`/peers …`) still route, and
 * any free-text question still falls through to the Finsyt Agent Ask flow so
 * nothing regresses.
 *
 * Visually reads as a slim field with a sparkle icon, an animated focus ring,
 * and `/` + `⌘J` kbd hints. Pressing `/` from anywhere outside an editable
 * field focuses it.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ACTION_ICONS, ICON_SIZE_SM, ICON_STROKE } from './icons'
import { Kbd } from './index'
import { dispatchAsk } from './contextual-ask-bar'
import {
  parseCommand, suggestCommands, type CommandResolution, type CommandSuggestion,
} from '@/lib/function-codes'

// Slash-command routing. Typing `/peers …` jumps to the Peers workspace; if
// extra text follows the keyword we hand it to the copilot pre-seeded with
// the peer-comparison framing so the agent calls compare_peers immediately.
const SLASH_COMMANDS: Record<string, { route?: string; askPrefix?: string }> = {
  peers: {
    route: '/app/peers',
    askPrefix: 'Compare my peers on ',
  },
}

export function CommandInput({
  placeholder = 'Ask Finsyt anything, or run a command — e.g. AAPL DES, NVDA FA, MACRO…',
  width = 480,
  onShowHelp,
}: { placeholder?: string; width?: number | string; onShowHelp?: () => void }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const ref = useRef<HTMLInputElement | null>(null)
  const router = useRouter()
  const Sparkle = ACTION_ICONS.sparkles

  const suggestions = useMemo<CommandSuggestion[]>(
    () => (focused ? suggestCommands(value) : []),
    [value, focused],
  )
  const showDropdown = focused && suggestions.length > 0

  useEffect(() => { setHighlight(0) }, [value])

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

  function execResolution(res: CommandResolution) {
    if (res.kind === 'route') router.push(res.route)
    else dispatchAsk({ prompt: res.prompt, autoSubmit: res.autoSubmit !== false })
  }

  function runSuggestion(s: CommandSuggestion) {
    execResolution(s.code.resolve(s.symbol))
    setValue('')
    ref.current?.blur()
  }

  function submit() {
    const v = value.trim()
    if (!v) return

    // Slash-command intercept: `/peers …` (and any future commands).
    if (v.startsWith('/')) {
      const space = v.indexOf(' ')
      const keyword = (space === -1 ? v.slice(1) : v.slice(1, space)).toLowerCase()
      const rest = space === -1 ? '' : v.slice(space + 1).trim()
      const cmd = SLASH_COMMANDS[keyword]
      if (cmd) {
        if (rest && cmd.askPrefix) {
          dispatchAsk({ prompt: cmd.askPrefix + rest, autoSubmit: true })
        } else if (cmd.route) {
          router.push(cmd.route)
        } else if (rest) {
          dispatchAsk({ prompt: rest, autoSubmit: true })
        }
        setValue('')
        ref.current?.blur()
        return
      }
    }

    // Function-code intercept: `AAPL FA`, `MACRO`, etc.
    const parsed = parseCommand(v)
    if (parsed.code) {
      execResolution(parsed.code.resolve(parsed.symbol))
      setValue('')
      ref.current?.blur()
      return
    }

    dispatchAsk({ prompt: v, autoSubmit: true })
    setValue('')
    ref.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showDropdown && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      setHighlight(h => (h + dir + suggestions.length) % suggestions.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (showDropdown && suggestions[highlight]) runSuggestion(suggestions[highlight])
      else submit()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setValue('')
      ref.current?.blur()
    }
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
        // Delay blur so a mousedown on a suggestion row can run first.
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Ask Finsyt or run a command"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        aria-controls="finsyt-command-suggestions"
        aria-activedescendant={showDropdown ? `finsyt-cmd-opt-${highlight}` : undefined}
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

      {showDropdown && (
        <div
          id="finsyt-command-suggestions"
          role="listbox"
          aria-label="Command suggestions"
          style={{
            position: 'absolute', top: '100%', marginTop: 6, left: 0, right: 0,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 8px 40px var(--hover-strong)',
            zIndex: 60, overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '8px 14px 4px', fontSize: 10.5, fontWeight: 700,
            letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase',
          }}>
            Function codes
          </div>
          {suggestions.map((s, i) => {
            const active = i === highlight
            return (
              <button
                key={s.id}
                id={`finsyt-cmd-opt-${i}`}
                role="option"
                aria-selected={active}
                type="button"
                onMouseDown={e => { e.preventDefault(); runSuggestion(s) }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 14px', border: 'none',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  color: 'var(--text-primary)', fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  flexShrink: 0, minWidth: 92,
                  fontSize: 12.5, fontWeight: 800,
                  color: active ? 'var(--accent-text)' : 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>{s.display}</span>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{s.code.label}</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{s.code.description}</span>
              </button>
            )
          })}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 14px', borderTop: '1px solid var(--border)',
            background: 'var(--bg-elevated)', fontSize: 11, color: 'var(--text-muted)',
          }}>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate · <Kbd>↵</Kbd> Run
            </span>
            {onShowHelp && (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); onShowHelp() }}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--accent-text)', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                }}
              >
                All commands
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
