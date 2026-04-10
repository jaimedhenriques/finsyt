'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── Prompt Library (Rogo-style one-click workflows) ───────────────────────
const PROMPT_LIBRARY = [
  { icon: '📊', label: 'Earnings Preview', category: 'Research', prompt: 'Run an earnings preview for {symbol}. Include: consensus EPS & revenue estimates, prior quarter beat/miss, key themes from last earnings call, analyst sentiment, key risks and catalysts to watch.' },
  { icon: '🏢', label: 'Company Profile', category: 'Research', prompt: 'Generate a comprehensive company profile for {symbol}. Cover: business model, revenue segments, key products/services, competitive positioning, management team highlights, recent strategic developments.' },
  { icon: '⚖️', label: 'Bull vs Bear Case', category: 'Research', prompt: 'Lay out the bull case and bear case for {symbol} with 3 arguments each. Include valuation context, key risks, and what would need to be true for each scenario to play out.' },
  { icon: '🔢', label: 'Peer Comps Analysis', category: 'Comps', prompt: 'Run a peer comparison for {symbol}. Compare against closest competitors across: revenue growth, gross margin, EBITDA margin, P/E, EV/Revenue, EV/EBITDA, and ROE. Flag where {symbol} is a premium or discount to peers.' },
  { icon: '📈', label: 'Revenue Segment Breakdown', category: 'Research', prompt: 'Break down {symbol} revenue by segment and geography. Show YoY growth for each segment, margin profile if available, and which segments are accelerating vs decelerating.' },
  { icon: '📋', label: 'Earnings Call Summary', category: 'Transcripts', prompt: 'Summarise the most recent earnings call for {symbol}. Cover: key management commentary, guidance updates, analyst questions and answers, tone shifts vs prior quarter, and any forward-looking signals.' },
  { icon: '🏦', label: 'M&A Deal Analysis', category: 'Deals', prompt: 'Analyse recent M&A activity involving {symbol}. Include: deal rationale, valuation multiple paid, strategic fit, integration risks, market reaction, and comparable transaction precedents.' },
  { icon: '⚠️', label: 'Risk Assessment', category: 'Research', prompt: 'Identify the top 5 risks for {symbol} across: regulatory, competitive, operational, financial, and macro dimensions. Rate severity and likelihood of each. Flag any recent developments that have changed the risk profile.' },
  { icon: '💰', label: 'Valuation Analysis', category: 'Valuation', prompt: 'Run a valuation analysis for {symbol}. Cover: current trading multiples vs historical averages, DCF implied value at different growth/discount rate assumptions, EV/EBITDA comps, and where consensus price targets sit.' },
  { icon: '📰', label: 'News Run', category: 'News', prompt: 'Compile a news run for {symbol}. Summarise the 5 most important recent developments, their market impact, analyst reactions, and any read-throughs for the stock thesis.' },
  { icon: '🌍', label: 'Macro Briefing', category: 'Macro', prompt: 'Provide a macro briefing covering: Fed rate path expectations, key economic data releases this week, global central bank divergence, US dollar outlook, and 3 macro themes most relevant to equities right now.' },
  { icon: '🎯', label: 'Sector Outlook', category: 'Macro', prompt: 'Give a sector outlook for the {symbol} industry. Cover: sector performance YTD, key tailwinds and headwinds, consensus positioning, upcoming catalysts, and top picks/names to watch.' },
]

// ─── Matrix columns ────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
  { id: 'summary', label: 'Summary', question: 'What is the core business and investment thesis?' },
  { id: 'risks', label: 'Key Risks', question: 'What are the top 3 risks for this company?' },
  { id: 'catalyst', label: 'Catalysts', question: 'What are the key near-term catalysts?' },
  { id: 'valuation', label: 'Valuation', question: 'How is this company valued vs peers?' },
]

const PRESET_COLUMNS = [
  { id: 'earnings', label: 'Earnings Beat/Miss', question: 'Did they beat or miss consensus on EPS and revenue in the last quarter?' },
  { id: 'growth', label: 'Revenue Growth', question: 'What is the YoY revenue growth trend over the last 4 quarters?' },
  { id: 'margin', label: 'Margin Trend', question: 'Is gross margin expanding or contracting? What is driving the change?' },
  { id: 'guidance', label: 'Management Guidance', question: 'What guidance did management give for the next quarter or year?' },
  { id: 'sentiment', label: 'Analyst Sentiment', question: 'What is the analyst consensus rating and key debate?' },
  { id: 'moat', label: 'Competitive Moat', question: 'What is the competitive advantage and how durable is it?' },
  { id: 'macro', label: 'Macro Sensitivity', question: 'How sensitive is this business to interest rates, FX, or recession?' },
  { id: 'mgmt', label: 'Management Quality', question: 'What is the track record and credibility of the management team?' },
]

type ViewMode = 'chat' | 'matrix' | 'library'
type MatrixCell = { value: string; loading: boolean; sources?: string[] }
type MatrixRow = { symbol: string; cells: Record<string, MatrixCell> }

interface Msg { role: 'user' | 'ai'; content: string; sources?: any[]; thinking?: string[] }

function ResearchInner() {
  const sp = useSearchParams()
  const [view, setView] = useState<ViewMode>('chat')

  // ── Chat state ──
  const [symbol, setSymbol] = useState(sp.get('symbol') || '')
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(false)
  const [thinkingStep, setThinkingStep] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  // ── Matrix state ──
  const [matrixSymbols, setMatrixSymbols] = useState<string[]>(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META'])
  const [newSymbol, setNewSymbol] = useState('')
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [matrixData, setMatrixData] = useState<Record<string, Record<string, MatrixCell>>>({})
  const [runningMatrix, setRunningMatrix] = useState(false)
  const [showColPicker, setShowColPicker] = useState(false)
  const [customColLabel, setCustomColLabel] = useState('')
  const [customColQ, setCustomColQ] = useState('')

  // ── Library state ──
  const [libCategory, setLibCategory] = useState('All')
  const [libSymbol, setLibSymbol] = useState(symbol || 'AAPL')

  const THINKING_STEPS = [
    'Identifying relevant data sources...',
    'Scanning SEC filings and transcripts...',
    'Cross-referencing market data...',
    'Synthesising analyst estimates...',
    'Checking recent news signals...',
    'Generating cited response...',
  ]

  async function submitChat(q?: string) {
    const fq = q || query
    if (!fq.trim() || loading) return
    setQuery('')
    setMessages(prev => [...prev, { role: 'user', content: fq }])
    setLoading(true)

    // Animate thinking steps
    let stepIdx = 0
    setThinkingStep(THINKING_STEPS[0])
    const interval = setInterval(() => {
      stepIdx = (stepIdx + 1) % THINKING_STEPS.length
      setThinkingStep(THINKING_STEPS[stepIdx])
    }, 900)

    try {
      const res = await fetch('/api/ai-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: fq, symbol: symbol || undefined })
      })
      const d = await res.json()
      clearInterval(interval)
      setMessages(prev => [...prev, {
        role: 'ai',
        content: d.answer || 'No response',
        sources: d.sources,
      }])
    } catch {
      clearInterval(interval)
      setMessages(prev => [...prev, { role: 'ai', content: 'Failed to get a response. Please try again.' }])
    }
    setThinkingStep('')
    setLoading(false)
  }

  function runPrompt(p: { prompt: string; label: string }) {
    const filled = p.prompt.replace(/\{symbol\}/g, libSymbol || symbol || 'the company')
    setView('chat')
    setTimeout(() => submitChat(filled), 100)
  }

  async function runMatrixCell(sym: string, col: typeof DEFAULT_COLUMNS[0]) {
    setMatrixData(prev => ({
      ...prev,
      [sym]: { ...(prev[sym] || {}), [col.id]: { value: '', loading: true } }
    }))
    try {
      const res = await fetch('/api/ai-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: col.question, symbol: sym })
      })
      const d = await res.json()
      setMatrixData(prev => ({
        ...prev,
        [sym]: { ...(prev[sym] || {}), [col.id]: { value: d.answer || '—', loading: false, sources: d.sources?.map((s: any) => s.label) } }
      }))
    } catch {
      setMatrixData(prev => ({
        ...prev,
        [sym]: { ...(prev[sym] || {}), [col.id]: { value: 'Error fetching data', loading: false } }
      }))
    }
  }

  async function runFullMatrix() {
    setRunningMatrix(true)
    setMatrixData({})
    // Run all cells in parallel
    const promises = matrixSymbols.flatMap(sym => columns.map(col => runMatrixCell(sym, col)))
    await Promise.all(promises)
    setRunningMatrix(false)
  }

  function addColumn(col: typeof DEFAULT_COLUMNS[0]) {
    if (columns.find(c => c.id === col.id)) return
    setColumns(prev => [...prev, col])
  }

  function addCustomColumn() {
    if (!customColLabel.trim() || !customColQ.trim()) return
    const newCol = { id: `custom_${Date.now()}`, label: customColLabel, question: customColQ }
    setColumns(prev => [...prev, newCol])
    setCustomColLabel('')
    setCustomColQ('')
  }

  function removeColumn(id: string) {
    setColumns(prev => prev.filter(c => c.id !== id))
  }

  function addSymbol() {
    const s = newSymbol.trim().toUpperCase()
    if (!s || matrixSymbols.includes(s)) return
    setMatrixSymbols(prev => [...prev, s])
    setNewSymbol('')
  }

  function renderContent(content: string) {
    const lines = content.split('\n')
    return lines.map((line, i) => {
      const html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
      if (line.startsWith('### ')) return <p key={i} style={{ fontWeight: 800, fontSize: 13, color: '#0A1628', marginTop: 12, marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: html.slice(4) }} />
      if (line.startsWith('## ')) return <p key={i} style={{ fontWeight: 800, fontSize: 14, color: '#0A1628', marginTop: 14, marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: html.slice(3) }} />
      if (line.startsWith('- ') || line.startsWith('• ')) return <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}><span style={{ color: '#1B4FFF', flexShrink: 0, marginTop: 2 }}>•</span><p style={{ fontSize: 13, color: '#3D4F6E', margin: 0, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: html.replace(/^[-•]\s/, '') }} /></div>
      if (!line.trim()) return <div key={i} style={{ height: 6 }} />
      return <p key={i} style={{ fontSize: 13, color: '#3D4F6E', marginBottom: 5, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: html }} />
    })
  }

  const categories = ['All', ...Array.from(new Set(PROMPT_LIBRARY.map(p => p.category)))]

  return (
    <div className="page-content" style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">AI Research</h1>
          <p style={{ fontSize: 13, color: '#7D8FA9', marginTop: 2 }}>Multi-agent financial analysis with cited reasoning</p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#F0F4FA', borderRadius: 10, padding: 4 }}>
          {([['chat', '◎ Chat'], ['matrix', '▦ Matrix'], ['library', '⚡ Workflows']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: view === v ? '#fff' : 'transparent', color: view === v ? '#0A1628' : '#7D8FA9', boxShadow: view === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════ CHAT VIEW ═══════════════════════ */}
      {view === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* Ticker focus bar */}
          <div className="card" style={{ padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#7D8FA9', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Focus</span>
            <input className="input" style={{ width: 120, height: 32, textTransform: 'uppercase', fontSize: 13, fontWeight: 700 }} placeholder="Ticker" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
            {symbol && <span className="badge badge-blue">📌 {symbol} context active</span>}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {['AAPL', 'NVDA', 'MSFT', 'META', 'TSLA'].map(s => (
                <button key={s} onClick={() => setSymbol(s)}
                  style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid', borderColor: symbol === s ? '#1B4FFF' : '#E2E8F2', background: symbol === s ? '#EEF3FF' : '#F8FAFD', color: symbol === s ? '#1B4FFF' : '#7D8FA9' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {messages.length === 0 ? (
              <div>
                <div style={{ textAlign: 'center', padding: '2rem 0 1.5rem' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#fff', fontWeight: 900, fontSize: 22 }}>◎</div>
                  <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0A1628', marginBottom: 6 }}>Finsyt Research Engine</h2>
                  <p style={{ fontSize: 13, color: '#7D8FA9' }}>Ask anything about companies, earnings, deals, or macro — or try a workflow below</p>
                </div>

                {/* Suggested prompts */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10, marginBottom: 20 }}>
                  {[
                    { icon: '📊', q: 'Run an earnings preview for NVDA with consensus estimates and key themes' },
                    { icon: '⚖️', q: 'Give me the bull and bear case for META in 2025 with 3 arguments each' },
                    { icon: '🔢', q: 'Compare AAPL vs MSFT on revenue growth, margins, and valuation multiples' },
                    { icon: '🌍', q: 'Give me a macro briefing — Fed path, key data this week, equity implications' },
                    { icon: '⚠️', q: 'What are the top 5 risks for TSLA right now across regulatory, competitive, and macro?' },
                    { icon: '💰', q: 'Walk me through NVDA valuation — multiples, DCF, and where consensus sits' },
                  ].map((s, i) => (
                    <button key={i} onClick={() => submitChat(s.q)} className="card"
                      style={{ padding: '12px 14px', textAlign: 'left', cursor: 'pointer', border: '1.5px solid #E2E8F2', background: '#fff', fontFamily: 'inherit', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
                      <p style={{ fontSize: 12, color: '#3D4F6E', lineHeight: 1.5, margin: 0 }}>{s.q}</p>
                    </button>
                  ))}
                </div>

                {/* Quick workflow buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#B0BCD0', textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'center' }}>Quick run:</span>
                  {PROMPT_LIBRARY.slice(0, 5).map((p, i) => (
                    <button key={i} onClick={() => runPrompt(p)}
                      style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid #E2E8F2', background: '#F8FAFD', color: '#3D4F6E', fontFamily: 'inherit' }}>
                      {p.icon} {p.label}
                    </button>
                  ))}
                  <button onClick={() => setView('library')} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid #1B4FFF', background: '#EEF3FF', color: '#1B4FFF', fontFamily: 'inherit' }}>
                    View all workflows →
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {msg.role === 'ai' && (
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 13, flexShrink: 0, marginTop: 2 }}>◎</div>
                    )}
                    <div style={{ borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px', padding: '12px 16px', maxWidth: 680, background: msg.role === 'user' ? '#1B4FFF' : '#fff', border: msg.role === 'ai' ? '1.5px solid #E2E8F2' : 'none', boxShadow: msg.role === 'ai' ? '0 1px 6px rgba(0,0,0,0.04)' : 'none' }}>
                      {msg.role === 'user'
                        ? <p style={{ fontSize: 13, color: '#fff', fontWeight: 500, margin: 0 }}>{msg.content}</p>
                        : (
                          <div>
                            {renderContent(msg.content)}
                            {msg.sources?.length ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid #F0F4FA' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#B0BCD0', textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'center' }}>Sources</span>
                                {msg.sources.map((s, si) => <span key={si} className="badge badge-blue" style={{ fontSize: 11 }}>{s.label}</span>)}
                              </div>
                            ) : null}
                          </div>
                        )}
                    </div>
                  </div>
                ))}

                {/* Thinking animation */}
                {loading && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 13, flexShrink: 0 }}>◎</div>
                    <div className="card" style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#1B4FFF', animation: 'bounce 1s infinite', animationDelay: `${i * 0.18}s` }} />)}
                        </div>
                        <span style={{ fontSize: 12, color: '#1B4FFF', fontWeight: 600 }}>Thinking</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#7D8FA9', margin: 0 }}>{thinkingStep}</p>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="card" style={{ padding: 12, marginTop: 12, position: 'sticky', bottom: 0 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <textarea className="input" style={{ flex: 1, resize: 'none', height: 68, fontSize: 13 }} rows={2}
                placeholder={`Ask anything${symbol ? ` about ${symbol}` : ''} — earnings, comps, valuation, macro...`}
                value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitChat() } }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={() => submitChat()} disabled={!query.trim() || loading} className="btn btn-primary"
                  style={{ opacity: (!query.trim() || loading) ? 0.4 : 1, height: 36 }}>Send →</button>
                <button onClick={() => { setMessages([]); setQuery('') }} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Clear</button>
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#B0BCD0', marginTop: 6 }}>⌨ Enter to send · Shift+Enter for new line · Sources cited on every response</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════ MATRIX VIEW ═══════════════════════ */}
      {view === 'matrix' && (
        <div>
          {/* Matrix toolbar */}
          <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7D8FA9', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Companies</span>
              {matrixSymbols.map(s => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: '#EEF3FF', border: '1.5px solid #C7D7FF', fontSize: 12, fontWeight: 700, color: '#1B4FFF' }}>
                  {s}
                  <button onClick={() => setMatrixSymbols(prev => prev.filter(x => x !== s))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7D8FA9', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" style={{ width: 90, height: 30, fontSize: 12, textTransform: 'uppercase' }} placeholder="Add ticker" value={newSymbol}
                  onChange={e => setNewSymbol(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && addSymbol()} />
                <button onClick={addSymbol} className="btn btn-outline btn-sm">+ Add</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowColPicker(!showColPicker)} className="btn btn-outline btn-sm">+ Column</button>
              <button onClick={runFullMatrix} disabled={runningMatrix} className="btn btn-primary btn-sm"
                style={{ opacity: runningMatrix ? 0.6 : 1 }}>
                {runningMatrix ? '⟳ Running...' : '▶ Run Matrix'}
              </button>
            </div>
          </div>

          {/* Column picker */}
          {showColPicker && (
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0A1628', marginBottom: 12 }}>Add Analysis Column</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {PRESET_COLUMNS.map(col => (
                  <button key={col.id} onClick={() => addColumn(col)}
                    style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid', borderColor: columns.find(c => c.id === col.id) ? '#059669' : '#E2E8F2', background: columns.find(c => c.id === col.id) ? '#ECFDF5' : '#F8FAFD', color: columns.find(c => c.id === col.id) ? '#059669' : '#3D4F6E', fontFamily: 'inherit' }}>
                    {columns.find(c => c.id === col.id) ? '✓ ' : '+ '}{col.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #F0F4FA', paddingTop: 12 }}>
                <input className="input" style={{ flex: 1, height: 32, fontSize: 12 }} placeholder="Column name" value={customColLabel} onChange={e => setCustomColLabel(e.target.value)} />
                <input className="input" style={{ flex: 3, height: 32, fontSize: 12 }} placeholder="Question to ask for each company..." value={customColQ} onChange={e => setCustomColQ(e.target.value)} />
                <button onClick={addCustomColumn} className="btn btn-primary btn-sm">Add</button>
              </div>
            </div>
          )}

          {/* Matrix grid */}
          <div className="card" style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F2' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#7D8FA9', textTransform: 'uppercase', letterSpacing: '0.05em', width: 100, background: '#F8FAFD', position: 'sticky', left: 0, zIndex: 2 }}>Company</th>
                  {columns.map(col => (
                    <th key={col.id} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#0A1628', minWidth: 220, background: '#F8FAFD' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span>{col.label}</span>
                        <button onClick={() => removeColumn(col.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C5CFDF', fontSize: 13, padding: 0 }} title="Remove column">×</button>
                      </div>
                      <div style={{ fontSize: 10, color: '#B0BCD0', fontWeight: 400, marginTop: 2, textTransform: 'none' }}>{col.question}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixSymbols.map((sym, ri) => (
                  <tr key={sym} style={{ borderBottom: '1px solid #F0F4FA', background: ri % 2 === 0 ? '#fff' : '#FAFBFD' }}>
                    <td style={{ padding: '10px 16px', position: 'sticky', left: 0, background: ri % 2 === 0 ? '#fff' : '#FAFBFD', zIndex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 900, flexShrink: 0 }}>{sym[0]}</div>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#0A1628' }}>{sym}</span>
                      </div>
                    </td>
                    {columns.map(col => {
                      const cell = matrixData[sym]?.[col.id]
                      return (
                        <td key={col.id} style={{ padding: '10px 16px', verticalAlign: 'top' }}>
                          {!cell ? (
                            <button onClick={() => runMatrixCell(sym, col)}
                              style={{ fontSize: 11, color: '#B0BCD0', background: '#F8FAFD', border: '1px dashed #DDE3EE', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                              Click to analyse →
                            </button>
                          ) : cell.loading ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#1B4FFF', animation: 'bounce 1s infinite', animationDelay: `${i * 0.18}s` }} />)}
                              <span style={{ fontSize: 11, color: '#7D8FA9' }}>Analysing...</span>
                            </div>
                          ) : (
                            <div>
                              <p style={{ fontSize: 12, color: '#1C2B4A', lineHeight: 1.55, margin: 0 }}>{cell.value?.slice(0, 280)}{cell.value?.length > 280 ? '...' : ''}</p>
                              {cell.sources?.length ? (
                                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                                  {cell.sources.slice(0, 2).map((s, si) => <span key={si} style={{ fontSize: 10, color: '#1B4FFF', background: '#EEF3FF', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>{s}</span>)}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {matrixSymbols.length === 0 && (
              <div style={{ padding: 48, textAlign: 'center', color: '#7D8FA9' }}>Add companies above to start your analysis</div>
            )}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <p style={{ fontSize: 11, color: '#B0BCD0', alignSelf: 'center' }}>Click any cell to run individually, or Run Matrix to fill all at once</p>
            <button className="btn btn-outline btn-sm">⬇ Export CSV</button>
            <button className="btn btn-outline btn-sm">📊 Export to Deck</button>
          </div>
        </div>
      )}

      {/* ═══════════════════════ PROMPT LIBRARY VIEW ═══════════════════════ */}
      {view === 'library' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, color: '#7D8FA9' }}>One-click finance workflows — pick a template and run it instantly</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7D8FA9' }}>Ticker:</span>
              <input className="input" style={{ width: 100, height: 32, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}
                placeholder="e.g. AAPL" value={libSymbol} onChange={e => setLibSymbol(e.target.value.toUpperCase())} />
            </div>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setLibCategory(cat)}
                style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid', borderColor: libCategory === cat ? '#1B4FFF' : '#E2E8F2', background: libCategory === cat ? '#EEF3FF' : '#F8FAFD', color: libCategory === cat ? '#1B4FFF' : '#7D8FA9', fontFamily: 'inherit' }}>
                {cat}
              </button>
            ))}
          </div>

          {/* Workflow cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {PROMPT_LIBRARY.filter(p => libCategory === 'All' || p.category === libCategory).map((p, i) => (
              <div key={i} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F0F4FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{p.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0A1628' }}>{p.label}</div>
                    <span style={{ fontSize: 11, color: '#7D8FA9', background: '#F0F4FA', padding: '1px 8px', borderRadius: 4, fontWeight: 600 }}>{p.category}</span>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: '#7D8FA9', lineHeight: 1.55, margin: 0 }}>
                  {p.prompt.replace(/\{symbol\}/g, libSymbol || '…').slice(0, 120)}...
                </p>
                <button onClick={() => runPrompt(p)} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>
                  ▶ Run with {libSymbol || 'ticker'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ResearchPage() {
  return <Suspense fallback={<div className="page-content">Loading...</div>}><ResearchInner /></Suspense>
}
