'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import DataSourcesUsedFooter from '@/components/DataSourcesUsedFooter'
import { traceFromToolResult, type ProviderTrace } from '@/lib/data-sources-trace'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// Map agent tool names to deep-link tabs on the company page so citations
// jump the user straight to the underlying source view.
function tabForTool(tool: string): string | null {
  const t = tool.toLowerCase()
  if (t.includes('filing') || t.includes('sec') || t.includes('10k') || t.includes('10-k')) return 'filings'
  if (t.includes('transcript') || t.includes('call') || t.includes('earning'))              return 'transcripts'
  if (t.includes('news') || t.includes('headline') || t.includes('press'))                  return 'news'
  if (t.includes('estimate') || t.includes('analyst'))                                      return 'estimates'
  if (t.includes('insider') || t.includes('holder') || t.includes('ownership'))             return 'ownership'
  if (t.includes('financial') || t.includes('income') || t.includes('balance') || t.includes('cash')) return 'financials'
  return null
}

interface PinnedBrief {
  id?: string
  symbol: string
  title: string
  body: string
  ts: number
  synced?: boolean
}

const KEY = (sym: string) => `finsyt:notebook:${sym}`

function loadPins(sym: string): PinnedBrief[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY(sym)) || '[]') } catch { return [] }
}
function savePins(sym: string, items: PinnedBrief[]) {
  try { localStorage.setItem(KEY(sym), JSON.stringify(items.slice(0, 30))) } catch {}
}

export default function AIAnalysisTab({ symbol, companyName, onCitation, onJumpTab }: {
  onJumpTab?: (tab: string) => void
  symbol: string
  companyName: string
  onCitation?: (label: string, body: string) => void
}) {
  const [text, setText] = useState('')
  const [tools, setTools] = useState<{ name: string; summary: string }[]>([])
  // Provider/connector trace for the "Data sources used" footer.
  const [trace, setTrace] = useState<ProviderTrace[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pins, setPins] = useState<PinnedBrief[]>([])
  const [pinned, setPinned] = useState(false)
  const fired = useRef<string | null>(null)
  const router = useRouter()
  // onJumpTab is preferred (in-page state update); router fallback keeps deep-link working when callback is absent

  useEffect(() => { setPins(loadPins(symbol)); setPinned(false); setText(''); setTools([]) }, [symbol])

  async function generate() {
    setText(''); setTools([]); setTrace([]); setError(null); setRunning(true); setPinned(false)
    try {
      const r = await fetch(`${BASE}/api/agent/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question:
            `Write an institutional-quality executive memo on ${companyName} (${symbol}). ` +
            `Structure: 1) THESIS (2 sentences), 2) KEY DRIVERS (bulleted, with figures), ` +
            `3) RISKS (bulleted), 4) RECENT CATALYSTS (last 30-60 days, with dates), ` +
            `5) WHAT TO WATCH NEXT (3 items with rough dates). ` +
            `Use real fetched data via your tools — quote, financials, news, estimates, transcripts. ` +
            `Cite each fact inline like [src: tool_name]. Keep under 350 words.`,
          symbols: [symbol],
        }),
      })
      if (!r.ok || !r.body) { setError(`Agent error ${r.status}`); setRunning(false); return }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const blocks = buf.split('\n\n'); buf = blocks.pop() || ''
        for (const block of blocks) {
          let evtName = 'message'; let dataLine = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) evtName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim()
          }
          if (!dataLine) continue
          let p: any = {}
          try { p = JSON.parse(dataLine) } catch {}
          if (evtName === 'tool_result') {
            setTools(t => [...t, { name: p.name, summary: p.summary }])
            const row = traceFromToolResult(p, p.ok ? 1 : 0)
            if (row) setTrace(t => [...t, row])
          }
          else if (evtName === 'answer_chunk') setText(s => s + (p.text || ''))
          else if (evtName === 'error') setError(p.message || 'agent error')
        }
      }
    } catch (e: any) { setError(e?.message || String(e)) }
    finally { setRunning(false) }
  }

  async function pinToNotebook() {
    if (!text.trim()) return
    const title = `${companyName} brief — ${new Date().toLocaleDateString()}`
    const body  = `# AI Brief — ${symbol}\n_${new Date().toISOString()}_\n\n${text}\n\n---\nSources: ${tools.map(t=>t.name).join(', ') || 'n/a'}`
    // Try the workspace notebook first; fall back to localStorage if no workspace.
    try {
      const r = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, title, body }),
      })
      if (r.ok) {
        const j = await r.json()
        const item: PinnedBrief = { id: j.note?.id, symbol, title, body, ts: j.note?.ts || Date.now(), synced: true }
        const next = [item, ...pins]
        setPins(next); savePins(symbol, next); setPinned(true)
        return
      }
    } catch {}
    const item: PinnedBrief = { symbol, title, body, ts: Date.now() }
    const next = [item, ...pins]
    setPins(next); savePins(symbol, next); setPinned(true)
  }

  async function removePin(ts: number) {
    const item = pins.find(p => p.ts === ts)
    if (item?.id) {
      try { await fetch(`/api/notes?id=${item.id}`, { method: 'DELETE' }) } catch {}
    }
    const next = pins.filter(p => p.ts !== ts)
    setPins(next); savePins(symbol, next)
  }

  useEffect(() => {
    if (!symbol || fired.current === symbol) return
    fired.current = symbol
    generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
      <div>
        <div className="card" style={{ padding: 18, borderColor: 'var(--accent-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18 }}>◎</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Executive Memo · {symbol}</span>
            <span style={{ padding: '2px 8px', borderRadius: 6, background: '#7C3AED15', color: '#7C3AED', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>LIVE AGENT</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {running ? 'Generating…' : (text ? `${tools.length} sources` : '')}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={generate} disabled={running}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1, fontFamily: 'inherit' }}>
                {running ? 'Working…' : 'Regenerate'}
              </button>
              <button onClick={pinToNotebook} disabled={!text.trim() || running}
                style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: pinned ? 'var(--pos)' : 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: text.trim() && !running ? 'pointer' : 'not-allowed', opacity: text.trim() && !running ? 1 : 0.5, fontFamily: 'inherit' }}>
                {pinned ? '✓ Pinned' : '📌 Pin to notebook'}
              </button>
            </div>
          </div>

          {tools.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Sources</span>
              {tools.map((t, i) => {
                const deepTab = tabForTool(t.name)
                return (
                  <button key={i}
                    onClick={() => {
                      onCitation?.(t.name, t.summary)
                      if (deepTab) {
                        if (onJumpTab) onJumpTab(deepTab)
                        else {
                          const url = new URL(window.location.href)
                          url.searchParams.set('tab', deepTab)
                          router.push(url.pathname + '?' + url.searchParams.toString())
                        }
                      }
                    }}
                    style={{ fontSize: 10.5, padding: '3px 10px', borderRadius: 99, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', border: 'none', cursor: 'pointer' }}
                    title={deepTab ? `Open ${deepTab} tab` : 'View source preview'}>
                    {t.name}{deepTab ? ' ↗' : ''}
                  </button>
                )
              })}
            </div>
          )}

          {text ? (
            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
              {text}{running && <span style={{ opacity: 0.5 }}>▍</span>}
            </div>
          ) : running ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array(8).fill(0).map((_, i) => (
                <span key={i} className="skeleton" style={{ height: 12, width: `${70 + (i % 3) * 10}%` }} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Click <strong>Regenerate</strong> to produce a fresh executive memo using live data.
            </div>
          )}

          {error && (
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.08)', fontSize: 12, color: '#ef4444' }}>{error}</div>
          )}

          {/* Same "Data sources used" footer that ships in Research; surfaces
              role + response time + Connector Hub deep link. The chip strip
              above is kept for in-page deep-link navigation between tabs. */}
          {trace.length > 0 && (
            <DataSourcesUsedFooter trace={trace} />
          )}
        </div>
      </div>

      <aside>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>Research Notebook</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pins.length} pinned</span>
          </div>
          {pins.length ? pins.map(p => (
            <div key={p.ts} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{new Date(p.ts).toLocaleString()}</span>
                <button onClick={() => removePin(p.ts)} aria-label="Remove pin"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{p.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.body}</div>
            </div>
          )) : (
            <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              No pinned briefs yet. Generate a memo and click <strong>Pin to notebook</strong>.
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
