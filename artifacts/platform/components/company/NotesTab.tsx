'use client'
import { useEffect, useRef, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface Note {
  id: string
  body: string
  ts: number
  pins?: { label: string; value: string }[]
  local?: boolean
}

const KEY = (sym: string) => `finsyt:notes:${sym}`

function loadLocal(sym: string): Note[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY(sym)) || '[]') } catch { return [] }
}
function saveLocal(sym: string, notes: Note[]) {
  try { localStorage.setItem(KEY(sym), JSON.stringify(notes.slice(0, 200))) } catch {}
}

const SUGGESTIONS = [
  '@revenue', '@grossMargin', '@ebitda', '@fcf', '@eps', '@pe', '@evEbitda', '@marketCap', '@price',
]

function deserialize(rawBody: string): { body: string; pins?: Note['pins'] } {
  const m = rawBody.match(/\n?<<PINS>>([\s\S]*?)<<\/PINS>>$/)
  if (!m) return { body: rawBody }
  try {
    const pins = JSON.parse(m[1])
    const body = rawBody.replace(m[0], '').trim()
    return { body, pins }
  } catch { return { body: rawBody } }
}
function serialize(body: string, pins?: Note['pins']): string {
  if (!pins?.length) return body
  return `${body}\n<<PINS>>${JSON.stringify(pins)}<</PINS>>`
}

export default function NotesTab({ symbol, snapshot }: { symbol: string; snapshot?: Record<string, any> }) {
  const [notes, setNotes]       = useState<Note[]>([])
  const [draft, setDraft]       = useState('')
  const [synced, setSynced]     = useState(false)
  const [reason, setReason]     = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [showMentions, setShowMentions] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}/api/notes?symbol=${symbol}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.synced) {
          setSynced(true); setReason(null)
          setNotes((d.notes || []).map((n: any) => {
            const { body, pins } = deserialize(n.body)
            return { id: n.id, ts: n.ts, body, pins, mine: n.mine !== false, authorUserId: n.authorUserId }
          }))
        } else {
          setSynced(false); setReason(d.reason || 'unauthenticated')
          setNotes(loadLocal(symbol))
        }
      })
      .catch(() => { setSynced(false); setReason('offline'); setNotes(loadLocal(symbol)) })
    return () => { cancelled = true }
  }, [symbol])

  async function add() {
    const text = draft.trim()
    if (!text || busy) return
    const pins: { label: string; value: string }[] = []
    text.replace(/@(\w+)/g, (_, key) => {
      const v = snapshot?.[key]
      if (v != null) {
        const display = typeof v === 'number'
          ? (v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B'
            : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M'
            : Number(v).toLocaleString())
          : String(v)
        pins.push({ label: '@' + key, value: display })
      }
      return ''
    })

    if (synced) {
      setBusy(true)
      try {
        const res = await fetch(`${BASE}/api/notes`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, body: serialize(text, pins) }),
        })
        if (res.ok) {
          const d = await res.json()
          const { body, pins: parsedPins } = deserialize(d.note.body)
          setNotes(n => [{ id: d.note.id, ts: d.note.ts, body, pins: parsedPins, mine: true }, ...n])
          setDraft(''); setShowMentions(false)
        }
      } finally { setBusy(false) }
    } else {
      const note: Note = { id: String(Date.now()), body: text, ts: Date.now(), pins: pins.length ? pins : undefined, local: true }
      const next = [note, ...notes]
      setNotes(next); saveLocal(symbol, next); setDraft(''); setShowMentions(false)
    }
  }

  async function remove(id: string) {
    // Server-backed notes: only remove from local state once the DELETE
    // succeeds (so non-author attempts surface a 403 instead of looking
    // successful). Local-only notes (numeric ids) just clear locally.
    if (synced && !id.match(/^\d+$/)) {
      try {
        const res = await fetch(`${BASE}/api/notes?id=${id}`, { method: 'DELETE' })
        if (!res.ok) {
          if (res.status === 403) alert('Only the note author can delete this note.')
          return
        }
      } catch { return }
    }
    const next = notes.filter(n => n.id !== id)
    setNotes(next)
    if (!synced) saveLocal(symbol, next)
  }

  function exportMd() {
    const md = notes.map(n => {
      const date = new Date(n.ts).toLocaleString()
      const pinLine = n.pins?.length ? '\n_' + n.pins.map(p => `${p.label} = ${p.value}`).join(' · ') + '_' : ''
      return `### ${date}\n\n${n.body}${pinLine}\n`
    }).join('\n---\n\n')
    const blob = new Blob([`# ${symbol} Research Notes\n\n${md}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${symbol}-notes.md`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 20 }}>
      <div>
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>New note for {symbol}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: synced ? 'var(--pos)' : 'var(--text-muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: synced ? 'var(--pos)' : 'var(--text-muted)' }} />
              {synced ? 'Synced to workspace' : reason === 'no_workspace' ? 'Local only — join a workspace to sync' : 'Local only'}
            </span>
          </div>
          <textarea
            ref={taRef}
            value={draft}
            onChange={e => { setDraft(e.target.value); setShowMentions(/@\w*$/.test(e.target.value)) }}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder={`Thesis, catalysts, things to watch on ${symbol}…  (Cmd/Ctrl + Enter to save · type @ to pin a live value)`}
            rows={5}
            style={{
              width: '100%', resize: 'vertical', padding: 12, borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          {showMentions && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SUGGESTIONS.filter(s => snapshot?.[s.slice(1)] != null).slice(0, 8).map(s => (
                <button key={s} type="button" onClick={() => {
                  setDraft(d => d.replace(/@\w*$/, s + ' '))
                  setShowMentions(false)
                  taRef.current?.focus()
                }}
                  style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'var(--accent-dim)', color: 'var(--accent)', border: 'none', cursor: 'pointer' }}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={add} disabled={!draft.trim() || busy}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: draft.trim() && !busy ? 'pointer' : 'not-allowed', opacity: draft.trim() && !busy ? 1 : 0.5 }}>
              {busy ? 'Saving…' : 'Save note'}
            </button>
            <button onClick={exportMd} disabled={!notes.length}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: notes.length ? 'pointer' : 'not-allowed', opacity: notes.length ? 1 : 0.5 }}>
              Export .md
            </button>
          </div>
        </div>

        {notes.length ? notes.map(n => (
          <div key={n.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{new Date(n.ts).toLocaleString()}</span>
              <button onClick={() => remove(n.id)} aria-label="Delete note"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{n.body}</div>
            {n.pins?.length ? (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {n.pins.map((p, i) => (
                  <span key={i} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                    {p.label} <span style={{ opacity: 0.7, fontWeight: 600 }}>= {p.value}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )) : (
          <div className="card" style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No notes yet. Capture your thesis above.
          </div>
        )}
      </div>

      <aside>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>How notes work</div>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li>Notes are scoped to {symbol} and persisted to your workspace once you join one.</li>
            <li>Type <code>@</code> to pin a live data value — it&apos;s captured at write-time so the note stays auditable.</li>
            <li>Export to Markdown to share outside the platform.</li>
            <li>Cmd/Ctrl + Enter to save.</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
