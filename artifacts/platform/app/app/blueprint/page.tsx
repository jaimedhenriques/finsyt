'use client'
import { useEffect, useRef, useState } from 'react'
import { Card, PageHero, ContextualAskBar } from '@/components/ui'
import DataSourcesUsedFooter from '@/components/DataSourcesUsedFooter'
import { traceFromToolResult, type ProviderTrace } from '@/lib/data-sources-trace'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface BlueprintSection {
  /** Stable section id used for keys / retry targeting. */
  id: 'thesis' | 'drivers' | 'risks' | 'catalysts' | 'watch'
  /** Section heading shown above the streamed body. */
  title: string
  /** One-line description used as the eyebrow above the card body. */
  hint: string
  /** Prompt template; receives `{name}` and `{symbol}` placeholders. */
  prompt: (name: string, symbol: string) => string
}

const SECTIONS: BlueprintSection[] = [
  {
    id: 'thesis',
    title: 'Investment thesis',
    hint: 'Two-sentence directional view',
    prompt: (n, s) =>
      `Write a two-sentence investment thesis for ${n} (${s}). ` +
      `Use real fetched data via your tools — quote, financials, news. ` +
      `Cite each fact inline like [src: tool_name]. Be decisive about the directional view.`,
  },
  {
    id: 'drivers',
    title: 'Key drivers',
    hint: '3–4 bullets with figures',
    prompt: (n, s) =>
      `List 3-4 key revenue / earnings drivers for ${n} (${s}) as bullets. ` +
      `Each bullet must include a figure (growth %, $ amount, or unit count) ` +
      `and inline cite the source [src: tool_name]. Use get_financials, get_estimates, get_news.`,
  },
  {
    id: 'risks',
    title: 'Risks',
    hint: 'Top 3 — quantify when possible',
    prompt: (n, s) =>
      `List the top 3 risks to the ${n} (${s}) thesis. Quantify exposure when possible ` +
      `(e.g. "X% of revenue from China"). Use get_filings (10-K risk factors), get_news, ` +
      `and get_transcripts. Cite each fact inline like [src: tool_name].`,
  },
  {
    id: 'catalysts',
    title: 'Catalysts (next 3–6 months)',
    hint: 'Dated events that could move the stock',
    prompt: (n, s) =>
      `List dated catalysts in the next 3-6 months for ${n} (${s}): earnings dates, ` +
      `product launches, regulatory decisions, conferences. Pull from get_news, ` +
      `get_filings (8-Ks), and get_transcripts. Cite each one [src: tool_name].`,
  },
  {
    id: 'watch',
    title: 'What to watch next',
    hint: '3 monitorable signals',
    prompt: (n, s) =>
      `List 3 specific signals to monitor for ${n} (${s}) — KPIs, peer prints, macro releases. ` +
      `Each item should describe what would change the thesis if it moved. ` +
      `Use get_estimates, get_macro, get_news. Cite [src: tool_name].`,
  },
]

interface SectionState {
  text: string
  trace: ProviderTrace[]
  running: boolean
  error: string | null
  startedAt: number | null
  finishedAt: number | null
}

const EMPTY_SECTION: SectionState = {
  text: '', trace: [], running: false, error: null, startedAt: null, finishedAt: null,
}

const POPULAR = [
  { sym: 'NVDA',  name: 'NVIDIA Corp.' },
  { sym: 'MSFT',  name: 'Microsoft Corp.' },
  { sym: 'AAPL',  name: 'Apple Inc.' },
  { sym: 'GOOGL', name: 'Alphabet Inc.' },
  { sym: 'META',  name: 'Meta Platforms' },
  { sym: 'AMZN',  name: 'Amazon.com Inc.' },
  { sym: 'TSLA',  name: 'Tesla Inc.' },
  { sym: 'NFLX',  name: 'Netflix Inc.' },
]

export default function BlueprintPage() {
  // Locked-in subject of the active blueprint (frozen at "Generate" time so
  // edits to the input don't desync streaming sections from their header).
  const [subject, setSubject] = useState<{ symbol: string; name: string } | null>(null)
  const [input, setInput] = useState('')
  const [name, setName] = useState('')
  const [sections, setSections] = useState<Record<string, SectionState>>({})
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  function pickPreset(sym: string, n: string) {
    setInput(sym); setName(n)
  }

  async function runSection(section: BlueprintSection, sym: string, n: string) {
    setSections(prev => ({ ...prev, [section.id]: { ...EMPTY_SECTION, running: true, startedAt: Date.now() } }))
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const r = await fetch(`${BASE}/api/agent/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          question: section.prompt(n, sym),
          symbols: [sym],
          context: { surface: 'blueprint', section: section.id },
        }),
      })
      if (!r.ok || !r.body) {
        setSections(prev => ({ ...prev, [section.id]: { ...EMPTY_SECTION, error: `Agent error ${r.status}` } }))
        return
      }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let text = ''
      const trace: ProviderTrace[] = []
      const flush = () => setSections(prev => ({
        ...prev,
        [section.id]: {
          ...(prev[section.id] || EMPTY_SECTION),
          text, trace: [...trace], running: true,
        },
      }))
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
          try { p = JSON.parse(dataLine) } catch { continue }
          if (evtName === 'tool_result' && p.ok) {
            const row = traceFromToolResult(p, 1)
            if (row) trace.push(row)
            flush()
          } else if (evtName === 'answer_chunk') {
            text += p.text || ''
            flush()
          } else if (evtName === 'error') {
            setSections(prev => ({
              ...prev,
              [section.id]: { ...(prev[section.id] || EMPTY_SECTION), error: p.message || 'agent error', running: false },
            }))
          }
        }
      }
      setSections(prev => ({
        ...prev,
        [section.id]: {
          ...(prev[section.id] || EMPTY_SECTION),
          text, trace, running: false, finishedAt: Date.now(),
        },
      }))
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setSections(prev => ({
        ...prev,
        [section.id]: { ...EMPTY_SECTION, error: e?.message || String(e) },
      }))
    }
  }

  async function generateAll() {
    const sym = input.trim().toUpperCase()
    if (!sym) return
    const subj = { symbol: sym, name: name.trim() || sym }
    setSubject(subj)
    setSections({})
    // Sequential generation keeps each section's trace cleanly scoped to the
    // tools that section actually used. It also avoids hammering the agent
    // route in parallel from a single tab.
    for (const section of SECTIONS) {
      await runSection(section, subj.symbol, subj.name)
    }
  }

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <PageHero
        eyebrow="Investment Blueprint"
        title="Build a thesis Blueprint"
        accentWord="Blueprint"
        subtitle="Generate a structured, source-cited investment thesis section-by-section. Each section keeps its own data-sources footer so you can audit which providers fed the answer."
      />

      <div style={{ padding: '0 1.75rem 2.5rem', display: 'grid', gap: 18, maxWidth: 980 }}>
        <ContextualAskBar
          context="Blueprint"
          contextData={{ page: 'blueprint', symbol: subject?.symbol }}
          chips={[
            { label: 'Explain Blueprint',     prompt: 'Explain how the Blueprint surface differs from AI Research and the executive memo on the company page.' },
            { label: 'How are sources scored?', prompt: 'How does Finsyt decide which provider is "primary" vs "fallback" in the Data sources used footer?' },
          ]}
          placeholder="Ask Finsyt about the Blueprint methodology…"
          style={{ margin: '0 0 8px' }}
        />

        <Card padding="22px 24px">
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Subject company
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              placeholder="Ticker (e.g. NVDA)"
              aria-label="Ticker"
              style={{
                width: 160, padding: '11px 14px', borderRadius: 10,
                border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Company name (optional)"
              aria-label="Company name"
              style={{
                flex: 1, minWidth: 220, padding: '11px 14px', borderRadius: 10,
                border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              onClick={generateAll}
              disabled={!input.trim() || Object.values(sections).some(s => s.running)}
              style={{
                padding: '11px 18px', borderRadius: 10,
                background: 'var(--accent)', color: '#fff', border: 'none',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                opacity: (!input.trim() || Object.values(sections).some(s => s.running)) ? 0.5 : 1,
                fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              {Object.values(sections).some(s => s.running) ? 'Generating…' : 'Generate Blueprint'}
            </button>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'center', marginRight: 4 }}>Popular</span>
            {POPULAR.map(p => (
              <button key={p.sym} onClick={() => pickPreset(p.sym, p.name)}
                style={{
                  padding: '4px 10px', borderRadius: 99, border: '1px solid var(--border)',
                  background: input === p.sym ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  color: input === p.sym ? 'var(--accent-text)' : 'var(--text-secondary)',
                  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                {p.sym}
              </button>
            ))}
          </div>
        </Card>

        {!subject && (
          <Card padding="32px 24px" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>◧</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Pick a ticker and generate a Blueprint
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto', lineHeight: 1.5 }}>
              Each of the five sections (thesis, drivers, risks, catalysts, watch list) streams in
              with its own &quot;Data sources used&quot; footer below it.
            </div>
          </Card>
        )}

        {subject && SECTIONS.map(section => {
          const st = sections[section.id] || EMPTY_SECTION
          const elapsed = st.startedAt
            ? `${(((st.finishedAt ?? Date.now()) - st.startedAt) / 1000).toFixed(1)}s`
            : null
          return (
            <Card key={section.id} padding="0">
              <div style={{ padding: '16px 20px 12px', borderBottom: st.text || st.running ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {section.hint}
                  </span>
                  {st.running && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent-text)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 5, letterSpacing: '0.04em' }}>
                      STREAMING
                    </span>
                  )}
                  {elapsed && !st.running && (
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {elapsed}
                    </span>
                  )}
                  <button
                    onClick={() => subject && runSection(section, subject.symbol, subject.name)}
                    disabled={st.running}
                    style={{
                      marginLeft: 'auto', padding: '4px 10px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700,
                      cursor: st.running ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      opacity: st.running ? 0.5 : 1,
                    }}>
                    {st.text ? 'Regenerate' : 'Run'}
                  </button>
                </div>
                <h2 style={{
                  margin: '6px 0 0', fontSize: 18, fontWeight: 700,
                  color: 'var(--text-primary)', letterSpacing: '-0.01em',
                }}>{section.title}</h2>
              </div>

              {(st.text || st.running) && (
                <div style={{ padding: '14px 20px 4px' }}>
                  {st.text ? (
                    <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {st.text}{st.running && <span style={{ opacity: 0.5 }}>▍</span>}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Array(4).fill(0).map((_, i) => (
                        <span key={i} className="skeleton" style={{ height: 12, width: `${72 + (i % 3) * 8}%` }} />
                      ))}
                    </div>
                  )}
                  {st.error && (
                    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.08)', fontSize: 12, color: '#ef4444' }}>
                      {st.error}
                    </div>
                  )}
                </div>
              )}

              {/* Per-section "Data sources used" footer. Hidden entirely when
                  the workspace toggle is off (handled inside the component);
                  honours the per-user collapse default. */}
              {st.trace.length > 0 && (
                <div style={{ padding: '0 20px 16px' }}>
                  <DataSourcesUsedFooter trace={st.trace} />
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
