'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Source { label: string; snippet?: string; url?: string; type?: string }
interface Msg {
  role: 'user' | 'ai' | 'trace'
  content: string
  sources?: Source[]
  traceSteps?: TraceStep[]
  workflowName?: string
  exports?: ExportFile[]
}
interface TraceStep { label: string; done: boolean; active: boolean }
interface ExportFile { name: string; type: 'pptx' | 'xlsx' | 'csv' | 'pdf' }
type MatrixCell = { value: string; loading: boolean; sources?: Source[] }
type ViewMode = 'chat' | 'matrix' | 'library'

// ─── Prompt Library ─────────────────────────────────────────────────────────
const PROMPT_LIBRARY = [
  { icon: '📊', label: 'Earnings Preview', category: 'Research', steps: ['Identifying company', 'Searching earnings transcripts', 'Retrieving consensus estimates', 'Analysing analyst sentiment', 'Finalising citations'], exports: [{name:'Earnings Preview.pptx',type:'pptx'},{name:'Estimates Backup.xlsx',type:'xlsx'}] as ExportFile[], prompt: 'Run an earnings preview for {symbol}. Include: consensus EPS & revenue estimates, prior quarter beat/miss, key themes from last earnings call, analyst sentiment, key risks and catalysts to watch.' },
  { icon: '🏢', label: 'Company Profile', category: 'Research', steps: ['Identifying company', 'Searching sources', 'Retrieving business overview', 'Analysing competitive position', 'Finalising citations'], exports: [{name:'Company Profile.pptx',type:'pptx'},{name:'Company Data.xlsx',type:'xlsx'}] as ExportFile[], prompt: 'Generate a comprehensive company profile for {symbol}. Cover: business model, revenue segments, key products/services, competitive positioning, management team highlights, recent strategic developments.' },
  { icon: '⚖️', label: 'Bull vs Bear Case', category: 'Research', steps: ['Identifying company', 'Searching sources', 'Building bull case', 'Building bear case', 'Finalising citations'], exports: [{name:'Bull Bear Analysis.pptx',type:'pptx'}] as ExportFile[], prompt: 'Lay out the bull case and bear case for {symbol} with 3 arguments each. Include valuation context, key risks, and what would need to be true for each scenario to play out.' },
  { icon: '🔢', label: 'Peer Comps Analysis', category: 'Comps', steps: ['Identifying companies', 'Searching sources', 'Retrieving company metrics', 'Creating table', 'Finalising citations'], exports: [{name:'Comps Table.xlsx',type:'xlsx'},{name:'Comps Deck.pptx',type:'pptx'}] as ExportFile[], prompt: 'Run a peer comparison for {symbol}. Compare against closest competitors across: revenue growth, gross margin, EBITDA margin, P/E, EV/Revenue, EV/EBITDA, and ROE. Flag where {symbol} is a premium or discount to peers.' },
  { icon: '📋', label: 'Earnings Call Summary', category: 'Transcripts', steps: ['Identifying company', 'Searching transcripts', 'Analysing management commentary', 'Extracting key themes', 'Finalising citations'], exports: [{name:'Earnings Summary.pptx',type:'pptx'}] as ExportFile[], prompt: 'Summarise the most recent earnings call for {symbol}. Cover: key management commentary, guidance updates, analyst questions and answers, tone shifts vs prior quarter, and any forward-looking signals.' },
  { icon: '🏦', label: 'Precedent Transactions', category: 'Deals', steps: ['Identifying companies', 'Searching sources', 'Retrieving transaction metrics', 'Creating table', 'Finalising citations'], exports: [{name:'Precedent Transactions.xlsx',type:'xlsx'},{name:'Deal Deck.pptx',type:'pptx'}] as ExportFile[], prompt: 'Analyse precedent M&A transactions in the {symbol} sector. Include deal multiples (EV/EBITDA, EV/Revenue), deal rationale, strategic fit, and key terms. Identify the median and range of multiples paid.' },
  { icon: '⚠️', label: 'Risk Assessment', category: 'Research', steps: ['Identifying company', 'Searching regulatory filings', 'Identifying risk factors', 'Rating severity', 'Finalising citations'], exports: [{name:'Risk Assessment.pptx',type:'pptx'}] as ExportFile[], prompt: 'Identify the top 5 risks for {symbol} across: regulatory, competitive, operational, financial, and macro dimensions. Rate severity and likelihood of each. Flag any recent developments that have changed the risk profile.' },
  { icon: '💰', label: 'Valuation Analysis', category: 'Valuation', steps: ['Identifying company', 'Searching sources', 'Retrieving multiples', 'Analysing peer benchmarks', 'Finalising citations'], exports: [{name:'Valuation Analysis.xlsx',type:'xlsx'},{name:'Valuation Deck.pptx',type:'pptx'}] as ExportFile[], prompt: 'Run a valuation analysis for {symbol}. Cover: current trading multiples vs historical averages, DCF implied value at different growth/discount rate assumptions, EV/EBITDA comps, and where consensus price targets sit.' },
  { icon: '📰', label: 'News Run', category: 'News', steps: ['Identifying company', 'Searching news sources', 'Filtering by relevance', 'Ranking by impact', 'Finalising citations'], exports: [{name:'News Summary.pptx',type:'pptx'}] as ExportFile[], prompt: 'Compile a news run for {symbol}. Summarise the 5 most important recent developments, their market impact, analyst reactions, and any read-throughs for the stock thesis.' },
  { icon: '🌍', label: 'Macro Briefing', category: 'Macro', steps: ['Searching macro sources', 'Analysing Fed signals', 'Reviewing economic data', 'Synthesising themes', 'Finalising citations'], exports: [{name:'Macro Briefing.pptx',type:'pptx'}] as ExportFile[], prompt: 'Provide a macro briefing covering: Fed rate path expectations, key economic data releases this week, global central bank divergence, US dollar outlook, and 3 macro themes most relevant to equities right now.' },
  { icon: '🎯', label: 'Sector Outlook', category: 'Macro', steps: ['Identifying sector', 'Searching sector sources', 'Analysing performance data', 'Ranking catalysts', 'Finalising citations'], exports: [{name:'Sector Outlook.pptx',type:'pptx'},{name:'Sector Data.xlsx',type:'xlsx'}] as ExportFile[], prompt: 'Give a sector outlook for the {symbol} industry. Cover: sector performance YTD, key tailwinds and headwinds, consensus positioning, upcoming catalysts, and top picks/names to watch.' },
  { icon: '📈', label: 'Revenue Breakdown', category: 'Research', steps: ['Identifying company', 'Searching filings', 'Retrieving segment data', 'Analysing trends', 'Finalising citations'], exports: [{name:'Revenue Breakdown.xlsx',type:'xlsx'}] as ExportFile[], prompt: 'Break down {symbol} revenue by segment and geography. Show YoY growth for each segment, margin profile if available, and which segments are accelerating vs decelerating.' },
]

// ─── Matrix columns ──────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
  { id: 'summary', label: 'Summary', question: 'What is the core business and investment thesis?' },
  { id: 'risks', label: 'Key Risks', question: 'What are the top 3 risks for this company?' },
  { id: 'catalyst', label: 'Catalysts', question: 'What are the key near-term catalysts?' },
  { id: 'valuation', label: 'Valuation', question: 'How is this company valued vs peers?' },
]
const PRESET_COLUMNS = [
  { id: 'earnings', label: 'Earnings Beat/Miss', question: 'Did they beat or miss consensus on EPS and revenue last quarter?' },
  { id: 'growth', label: 'Revenue Growth', question: 'What is the YoY revenue growth trend over the last 4 quarters?' },
  { id: 'margin', label: 'Margin Trend', question: 'Is gross margin expanding or contracting? What is driving the change?' },
  { id: 'guidance', label: 'Management Guidance', question: 'What guidance did management give for the next quarter or year?' },
  { id: 'sentiment', label: 'Analyst Sentiment', question: 'What is the analyst consensus rating and key debate?' },
  { id: 'moat', label: 'Competitive Moat', question: 'What is the competitive advantage and how durable is it?' },
  { id: 'macro', label: 'Macro Sensitivity', question: 'How sensitive is this business to interest rates, FX, or recession?' },
  { id: 'mgmt', label: 'Management Quality', question: 'What is the track record and credibility of the management team?' },
]

// ─── Inline citation renderer ────────────────────────────────────────────────
function CitationBadge({ num, source, onHover, activePin, setActivePin }: {
  num: number; source?: Source; onHover: boolean
  activePin: number | null; setActivePin: (n: number | null) => void
}) {
  const [hover, setHover] = useState(false)
  const isOpen = hover || activePin === num
  return (
    <span style={{ position: 'relative', display: 'inline-block', verticalAlign: 'super' }}>
      <span
        onClick={() => setActivePin(activePin === num ? null : num)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: 4, fontSize: 9, fontWeight: 800,
          background: isOpen ? '#1B4FFF' : '#EEF3FF', color: isOpen ? '#fff' : '#1B4FFF',
          cursor: 'pointer', border: '1px solid', borderColor: isOpen ? '#1B4FFF' : '#C7D7FF',
          transition: 'all 0.12s', lineHeight: 1, userSelect: 'none',
        }}>{num}</span>
      {isOpen && source && (
        <span style={{
          position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
          background: '#0A1628', color: '#fff', borderRadius: 10, padding: '10px 14px',
          fontSize: 11, width: 240, zIndex: 100, lineHeight: 1.5,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          whiteSpace: 'normal',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: '#7EB3FF' }}>{source.label}</div>
          {source.type && <div style={{ fontSize: 10, color: '#7D8FA9', marginBottom: 4 }}>{source.type}</div>}
          {source.snippet && <div style={{ color: '#C5D5F0' }}>"{source.snippet}"</div>}
          <span style={{
            position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
            width: 10, height: 10, background: '#0A1628', rotate: '45deg',
          }} />
        </span>
      )}
    </span>
  )
}

// ─── Content renderer with inline citations ──────────────────────────────────
function RenderContent({ content, sources }: { content: string; sources?: Source[] }) {
  const [activePin, setActivePin] = useState<number | null>(null)

  function parseLine(line: string, lineIdx: number) {
    // Replace [N] or ¹²³ style refs with inline badges
    const parts = line.split(/(\[\d+\])/g)
    let citIdx = 0
    return parts.map((part, pi) => {
      const m = part.match(/^\[(\d+)\]$/)
      if (m) {
        const num = parseInt(m[1])
        const src = sources?.[num - 1]
        citIdx++
        return <CitationBadge key={`${lineIdx}-${pi}`} num={num} source={src} onHover={false} activePin={activePin} setActivePin={setActivePin} />
      }
      const html = part.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
      return <span key={`${lineIdx}-${pi}`} dangerouslySetInnerHTML={{ __html: html }} />
    })
  }

  return (
    <div>
      {content.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <p key={i} style={{ fontWeight: 800, fontSize: 13, color: '#0A1628', marginTop: 12, marginBottom: 4 }}>{parseLine(line.slice(4), i)}</p>
        if (line.startsWith('## ')) return <p key={i} style={{ fontWeight: 800, fontSize: 14, color: '#0A1628', marginTop: 14, marginBottom: 6 }}>{parseLine(line.slice(3), i)}</p>
        if (line.startsWith('- ') || line.startsWith('• ')) return (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
            <span style={{ color: '#1B4FFF', flexShrink: 0, marginTop: 2, fontSize: 12 }}>•</span>
            <p style={{ fontSize: 13, color: '#3D4F6E', margin: 0, lineHeight: 1.65 }}>{parseLine(line.replace(/^[-•]\s/, ''), i)}</p>
          </div>
        )
        if (!line.trim()) return <div key={i} style={{ height: 6 }} />
        return <p key={i} style={{ fontSize: 13, color: '#3D4F6E', marginBottom: 5, lineHeight: 1.65 }}>{parseLine(line, i)}</p>
      })}
      {/* Sources footer */}
      {sources?.length ? (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #F0F4FA', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#B0BCD0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sources</span>
          {sources.map((s, si) => (
            <span key={si}
              onClick={() => setActivePin(activePin === si + 1 ? null : si + 1)}
              style={{
                fontSize: 11, color: activePin === si + 1 ? '#fff' : '#1B4FFF',
                background: activePin === si + 1 ? '#1B4FFF' : '#EEF3FF',
                padding: '2px 8px', borderRadius: 4, fontWeight: 600, cursor: 'pointer',
                border: '1px solid', borderColor: activePin === si + 1 ? '#1B4FFF' : '#C7D7FF',
                transition: 'all 0.12s',
              }}>
              [{si + 1}] {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ─── Agentic trace bubble ────────────────────────────────────────────────────
function TraceBubble({ steps, workflowName, exports, done }: {
  steps: TraceStep[]; workflowName: string; exports?: ExportFile[]; done: boolean
}) {
  const fileIcons: Record<string, string> = { pptx: '🟥', xlsx: '🟩', csv: '📄', pdf: '🔴' }
  return (
    <div style={{ borderRadius: '4px 16px 16px 16px', background: '#fff', border: '1.5px solid #E2E8F2', padding: '14px 18px', maxWidth: 420, boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
      {/* Workflow header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #F0F4FA' }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', fontWeight: 900 }}>⚡</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1628' }}>{workflowName}</div>
          <div style={{ fontSize: 11, color: done ? '#059669' : '#F59E0B', fontWeight: 600 }}>{done ? '✓ Completed' : 'Running workflow...'}</div>
        </div>
      </div>
      {/* Step trace */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {step.done ? (
              <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', fontSize: 13, fontWeight: 900 }}>✓</span>
            ) : step.active ? (
              <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="7" cy="7" r="5.5" fill="none" stroke="#E2E8F2" strokeWidth="2" />
                  <path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="#1B4FFF" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
            ) : (
              <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D1DAE8', fontSize: 13 }}>○</span>
            )}
            <span style={{ fontSize: 13, color: step.done ? '#3D4F6E' : step.active ? '#0A1628' : '#B0BCD0', fontWeight: step.active ? 600 : 400 }}>
              {step.label}{step.active ? '...' : ''}
            </span>
          </div>
        ))}
      </div>
      {/* Export files */}
      {done && exports?.length ? (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #F0F4FA' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B0BCD0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Exports ({exports.length})</div>
          {exports.map((f, fi) => (
            <div key={fi} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E2E8F2', marginBottom: 6, background: '#FAFBFD', cursor: 'pointer' }}
              onClick={() => alert(`Downloading ${f.name}…\n\n(In production this would generate and download the actual file.)`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{fileIcons[f.type] || '📄'}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0A1628' }}>{f.name}</span>
              </div>
              <span style={{ fontSize: 16, color: '#7D8FA9' }}>⬇</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
function ResearchInner() {
  const sp = useSearchParams()
  const [view, setView] = useState<ViewMode>('chat')
  const [symbol, setSymbol] = useState(sp.get('symbol') || '')
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(false)
  const [thinkingStep, setThinkingStep] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Matrix
  const [matrixSymbols, setMatrixSymbols] = useState<string[]>(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META'])
  const [newSymbol, setNewSymbol] = useState('')
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [matrixData, setMatrixData] = useState<Record<string, Record<string, MatrixCell>>>({})
  const [runningMatrix, setRunningMatrix] = useState(false)
  const [showColPicker, setShowColPicker] = useState(false)
  const [customColLabel, setCustomColLabel] = useState('')
  const [customColQ, setCustomColQ] = useState('')

  // Library
  const [libCategory, setLibCategory] = useState('All')
  const [libSymbol, setLibSymbol] = useState(symbol || 'AAPL')

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const THINKING_STEPS = [
    'Identifying relevant data sources...',
    'Scanning SEC filings and transcripts...',
    'Cross-referencing market data...',
    'Synthesising analyst estimates...',
    'Checking recent news signals...',
    'Finalising citations...',
  ]

  // ── Run workflow with animated trace ──
  async function runWorkflow(workflow: typeof PROMPT_LIBRARY[0], sym: string) {
    const filledPrompt = workflow.prompt.replace(/\{symbol\}/g, sym || 'the company')
    const traceMsg: Msg = {
      role: 'trace',
      content: '',
      workflowName: workflow.label,
      traceSteps: workflow.steps.map((s, i) => ({ label: s, done: false, active: i === 0 })),
      exports: workflow.exports,
    }
    setMessages(prev => [...prev, { role: 'user', content: `${workflow.icon} ${workflow.label}${sym ? ` — ${sym}` : ''}` }, traceMsg])
    setLoading(true)
    setView('chat')

    // Animate trace steps
    const stepCount = workflow.steps.length
    for (let i = 0; i < stepCount; i++) {
      await new Promise(r => setTimeout(r, 700 + Math.random() * 400))
      setMessages(prev => {
        const msgs = [...prev]
        const traceIdx = msgs.length - 1
        const steps = msgs[traceIdx].traceSteps!.map((s, si) => ({
          ...s,
          done: si < i + 1,
          active: si === i + 1,
        }))
        msgs[traceIdx] = { ...msgs[traceIdx], traceSteps: steps }
        return msgs
      })
    }

    // Fetch actual AI response
    try {
      const res = await fetch('/api/ai-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: filledPrompt, symbol: sym || undefined })
      })
      const d = await res.json()
      // Mark trace done + add AI response
      setMessages(prev => {
        const msgs = [...prev]
        const traceIdx = msgs.length - 1
        msgs[traceIdx] = {
          ...msgs[traceIdx],
          traceSteps: msgs[traceIdx].traceSteps!.map(s => ({ ...s, done: true, active: false })),
        }
        return [...msgs, { role: 'ai', content: d.answer || 'No response', sources: d.sources }]
      })
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: 'Failed to get a response. Please try again.' }])
    }
    setLoading(false)
  }

  // ── Regular chat submit ──
  async function submitChat(q?: string) {
    const fq = q || query
    if (!fq.trim() || loading) return
    setQuery('')
    setMessages(prev => [...prev, { role: 'user', content: fq }])
    setLoading(true)
    let stepIdx = 0
    setThinkingStep(THINKING_STEPS[0])
    const interval = setInterval(() => {
      stepIdx = (stepIdx + 1) % THINKING_STEPS.length
      setThinkingStep(THINKING_STEPS[stepIdx])
    }, 850)
    try {
      const res = await fetch('/api/ai-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: fq, symbol: symbol || undefined })
      })
      const d = await res.json()
      clearInterval(interval)
      setMessages(prev => [...prev, { role: 'ai', content: d.answer || 'No response', sources: d.sources }])
    } catch {
      clearInterval(interval)
      setMessages(prev => [...prev, { role: 'ai', content: 'Failed to get a response. Please try again.' }])
    }
    setThinkingStep('')
    setLoading(false)
  }

  // ── Matrix ──
  async function runMatrixCell(sym: string, col: typeof DEFAULT_COLUMNS[0]) {
    setMatrixData(prev => ({ ...prev, [sym]: { ...(prev[sym] || {}), [col.id]: { value: '', loading: true } } }))
    try {
      const res = await fetch('/api/ai-research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: col.question, symbol: sym }) })
      const d = await res.json()
      setMatrixData(prev => ({ ...prev, [sym]: { ...(prev[sym] || {}), [col.id]: { value: d.answer || '—', loading: false, sources: d.sources } } }))
    } catch {
      setMatrixData(prev => ({ ...prev, [sym]: { ...(prev[sym] || {}), [col.id]: { value: 'Error', loading: false } } }))
    }
  }

  async function runFullMatrix() {
    setRunningMatrix(true); setMatrixData({})
    await Promise.all(matrixSymbols.flatMap(sym => columns.map(col => runMatrixCell(sym, col))))
    setRunningMatrix(false)
  }

  function exportMatrixCSV() {
    const headers = ['Company', ...columns.map(c => c.label)].join(',')
    const rows = matrixSymbols.map(sym => [sym, ...columns.map(c => `"${(matrixData[sym]?.[c.id]?.value || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`)].join(','))
    const csv = [headers, ...rows].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'finsyt-matrix.csv'; a.click()
  }

  const categories = ['All', ...Array.from(new Set(PROMPT_LIBRARY.map(p => p.category)))]

  return (
    <div className="page-content" style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        @keyframes fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">AI Research</h1>
          <p style={{ fontSize: 13, color: '#7D8FA9', marginTop: 2 }}>Multi-agent financial analysis · Inline citations · Cited reasoning</p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#F0F4FA', borderRadius: 10, padding: 4 }}>
          {(['chat', 'matrix', 'library'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: view === v ? '#fff' : 'transparent', color: view === v ? '#0A1628' : '#7D8FA9', boxShadow: view === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s', fontFamily: 'inherit' }}>
              {v === 'chat' ? '◎ Chat' : v === 'matrix' ? '▦ Matrix' : '⚡ Workflows'}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════ CHAT VIEW ══════════════ */}
      {view === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* Ticker bar */}
          <div className="card" style={{ padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#7D8FA9', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Focus</span>
            <input className="input" style={{ width: 100, height: 32, textTransform: 'uppercase', fontSize: 13, fontWeight: 700 }} placeholder="Ticker" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
            {symbol && <span className="badge badge-blue">📌 {symbol} context active</span>}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {['AAPL', 'NVDA', 'MSFT', 'META', 'TSLA'].map(s => (
                <button key={s} onClick={() => setSymbol(s)} style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid', borderColor: symbol === s ? '#1B4FFF' : '#E2E8F2', background: symbol === s ? '#EEF3FF' : '#F8FAFD', color: symbol === s ? '#1B4FFF' : '#7D8FA9', fontFamily: 'inherit' }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1 }}>
            {messages.length === 0 ? (
              <div>
                <div style={{ textAlign: 'center', padding: '2rem 0 1.5rem' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#fff', fontWeight: 900, fontSize: 22 }}>◎</div>
                  <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0A1628', marginBottom: 6 }}>Finsyt Research Engine</h2>
                  <p style={{ fontSize: 13, color: '#7D8FA9' }}>Ask anything, or run a workflow below</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 10, marginBottom: 20 }}>
                  {[
                    { icon: '📊', q: 'Run an earnings preview for NVDA with consensus estimates and key themes' },
                    { icon: '⚖️', q: 'Give me the bull and bear case for META in 2025 with 3 arguments each' },
                    { icon: '🔢', q: 'Compare AAPL vs MSFT on revenue growth, margins, and valuation multiples' },
                    { icon: '🌍', q: 'Give me a macro briefing — Fed path, key data this week, equity implications' },
                    { icon: '⚠️', q: 'Top 5 risks for TSLA right now across regulatory, competitive, and macro' },
                    { icon: '🏦', q: 'Tariff impact on top manufacturing firms? Show revenue exposure by company' },
                  ].map((s, i) => (
                    <button key={i} onClick={() => submitChat(s.q)} className="card" style={{ padding: '12px 14px', textAlign: 'left', cursor: 'pointer', border: '1.5px solid #E2E8F2', background: '#fff', fontFamily: 'inherit', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
                      <p style={{ fontSize: 12, color: '#3D4F6E', lineHeight: 1.5, margin: 0 }}>{s.q}</p>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#B0BCD0', textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'center' }}>Quick workflows:</span>
                  {PROMPT_LIBRARY.slice(0, 5).map((p, i) => (
                    <button key={i} onClick={() => runWorkflow(p, symbol || libSymbol)} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid #E2E8F2', background: '#F8FAFD', color: '#3D4F6E', fontFamily: 'inherit' }}>
                      {p.icon} {p.label}
                    </button>
                  ))}
                  <button onClick={() => setView('library')} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid #1B4FFF', background: '#EEF3FF', color: '#1B4FFF', fontFamily: 'inherit' }}>View all →</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fadein 0.2s ease' }}>
                    {msg.role !== 'user' && (
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: msg.role === 'trace' ? 'linear-gradient(135deg,#7C3AED,#1B4FFF)' : 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 13, flexShrink: 0, marginTop: 2 }}>
                        {msg.role === 'trace' ? '⚡' : '◎'}
                      </div>
                    )}
                    <div style={{ maxWidth: msg.role === 'trace' ? 440 : 680 }}>
                      {msg.role === 'user' && (
                        <div style={{ background: '#1B4FFF', borderRadius: '16px 16px 4px 16px', padding: '10px 16px' }}>
                          <p style={{ fontSize: 13, color: '#fff', fontWeight: 500, margin: 0 }}>{msg.content}</p>
                        </div>
                      )}
                      {msg.role === 'trace' && (
                        <TraceBubble
                          steps={msg.traceSteps!}
                          workflowName={msg.workflowName!}
                          exports={msg.exports}
                          done={msg.traceSteps!.every(s => s.done)}
                        />
                      )}
                      {msg.role === 'ai' && (
                        <div style={{ background: '#fff', border: '1.5px solid #E2E8F2', borderRadius: '4px 16px 16px 16px', padding: '14px 16px', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                          <RenderContent content={msg.content} sources={msg.sources} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Thinking */}
                {loading && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 13, flexShrink: 0 }}>◎</div>
                    <div className="card" style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
                        {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#1B4FFF', animation: 'bounce 1s infinite', animationDelay: `${i*0.18}s` }} />)}
                        <span style={{ fontSize: 12, color: '#1B4FFF', fontWeight: 600, marginLeft: 6 }}>Thinking</span>
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
                <button onClick={() => submitChat()} disabled={!query.trim() || loading} className="btn btn-primary" style={{ opacity: (!query.trim() || loading) ? 0.4 : 1, height: 36 }}>Send →</button>
                <button onClick={() => { setMessages([]); setQuery('') }} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Clear</button>
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#B0BCD0', marginTop: 6 }}>⌨ Enter to send · Click [¹] citations to see sources · Sources cited on every response</p>
          </div>
        </div>
      )}

      {/* ══════════════ MATRIX VIEW ══════════════ */}
      {view === 'matrix' && (
        <div>
          <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7D8FA9', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Companies</span>
              {matrixSymbols.map(s => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: '#EEF3FF', border: '1.5px solid #C7D7FF', fontSize: 12, fontWeight: 700, color: '#1B4FFF' }}>
                  {s}
                  <button onClick={() => setMatrixSymbols(prev => prev.filter(x => x !== s))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7D8FA9', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" style={{ width: 90, height: 30, fontSize: 12, textTransform: 'uppercase' }} placeholder="Add ticker" value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') { if (newSymbol.trim() && !matrixSymbols.includes(newSymbol.trim())) { setMatrixSymbols(prev => [...prev, newSymbol.trim()]); setNewSymbol('') } } }} />
                <button onClick={() => { if (newSymbol.trim() && !matrixSymbols.includes(newSymbol.trim())) { setMatrixSymbols(prev => [...prev, newSymbol.trim()]); setNewSymbol('') } }} className="btn btn-outline btn-sm">+ Add</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowColPicker(!showColPicker)} className="btn btn-outline btn-sm">+ Column</button>
              <button onClick={exportMatrixCSV} className="btn btn-outline btn-sm">⬇ CSV</button>
              <button onClick={runFullMatrix} disabled={runningMatrix} className="btn btn-primary btn-sm" style={{ opacity: runningMatrix ? 0.6 : 1 }}>
                {runningMatrix ? '⟳ Running...' : '▶ Run Matrix'}
              </button>
            </div>
          </div>

          {showColPicker && (
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0A1628', marginBottom: 10 }}>Add Column</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {PRESET_COLUMNS.map(col => (
                  <button key={col.id} onClick={() => { if (!columns.find(c => c.id === col.id)) setColumns(prev => [...prev, col]) }}
                    style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid', borderColor: columns.find(c => c.id === col.id) ? '#059669' : '#E2E8F2', background: columns.find(c => c.id === col.id) ? '#ECFDF5' : '#F8FAFD', color: columns.find(c => c.id === col.id) ? '#059669' : '#3D4F6E', fontFamily: 'inherit' }}>
                    {columns.find(c => c.id === col.id) ? '✓ ' : '+ '}{col.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #F0F4FA', paddingTop: 12 }}>
                <input className="input" style={{ flex: 1, height: 32, fontSize: 12 }} placeholder="Column name" value={customColLabel} onChange={e => setCustomColLabel(e.target.value)} />
                <input className="input" style={{ flex: 3, height: 32, fontSize: 12 }} placeholder="Question to ask for each company..." value={customColQ} onChange={e => setCustomColQ(e.target.value)} />
                <button onClick={() => { if (customColLabel.trim() && customColQ.trim()) { setColumns(prev => [...prev, { id: `c_${Date.now()}`, label: customColLabel, question: customColQ }]); setCustomColLabel(''); setCustomColQ('') } }} className="btn btn-primary btn-sm">Add</button>
              </div>
            </div>
          )}

          <div className="card" style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F2' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#7D8FA9', textTransform: 'uppercase', letterSpacing: '0.05em', width: 100, background: '#F8FAFD', position: 'sticky', left: 0, zIndex: 2 }}>Company</th>
                  {columns.map(col => (
                    <th key={col.id} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#0A1628', minWidth: 220, background: '#F8FAFD' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{col.label}</span>
                        <button onClick={() => setColumns(prev => prev.filter(c => c.id !== col.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C5CFDF', fontSize: 14, padding: 0 }}>×</button>
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
                            <button onClick={() => runMatrixCell(sym, col)} style={{ fontSize: 11, color: '#B0BCD0', background: '#F8FAFD', border: '1px dashed #DDE3EE', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>Analyse →</button>
                          ) : cell.loading ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#1B4FFF', animation: 'bounce 1s infinite', animationDelay: `${i*0.18}s` }} />)}
                            </div>
                          ) : (
                            <div>
                              <p style={{ fontSize: 12, color: '#1C2B4A', lineHeight: 1.55, margin: 0 }}>{cell.value?.slice(0, 300)}{cell.value?.length > 300 ? '...' : ''}</p>
                              {cell.sources?.slice(0,2).map((s,si) => <span key={si} style={{ fontSize: 10, color: '#1B4FFF', background: '#EEF3FF', padding: '1px 6px', borderRadius: 4, fontWeight: 600, marginTop: 4, display: 'inline-block', marginRight: 4 }}>[{si+1}] {s.label}</span>)}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════ WORKFLOW LIBRARY ══════════════ */}
      {view === 'library' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, color: '#7D8FA9', flex: 1 }}>One-click finance workflows — each runs an agentic pipeline and exports to PowerPoint + Excel</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7D8FA9' }}>Ticker:</span>
              <input className="input" style={{ width: 100, height: 32, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }} placeholder="e.g. AAPL" value={libSymbol} onChange={e => setLibSymbol(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setLibCategory(cat)} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid', borderColor: libCategory === cat ? '#1B4FFF' : '#E2E8F2', background: libCategory === cat ? '#EEF3FF' : '#F8FAFD', color: libCategory === cat ? '#1B4FFF' : '#7D8FA9', fontFamily: 'inherit' }}>{cat}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {PROMPT_LIBRARY.filter(p => libCategory === 'All' || p.category === libCategory).map((p, i) => (
              <div key={i} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F0F4FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{p.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0A1628' }}>{p.label}</div>
                    <span style={{ fontSize: 11, color: '#7D8FA9', background: '#F0F4FA', padding: '1px 8px', borderRadius: 4, fontWeight: 600 }}>{p.category}</span>
                  </div>
                </div>
                {/* Step preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {p.steps.slice(0,4).map((s,si) => (
                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#F0F4FA', border: '1.5px solid #DDE3EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#B0BCD0', flexShrink: 0 }}>{si+1}</span>
                      <span style={{ fontSize: 11, color: '#7D8FA9' }}>{s}</span>
                    </div>
                  ))}
                </div>
                {/* Export badges */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {p.exports.map((f,fi) => (
                    <span key={fi} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: f.type === 'pptx' ? '#FEF2F2' : '#F0FDF4', color: f.type === 'pptx' ? '#DC2626' : '#16A34A', border: '1px solid', borderColor: f.type === 'pptx' ? '#FECACA' : '#BBF7D0' }}>
                      {f.type.toUpperCase()}
                    </span>
                  ))}
                </div>
                <button onClick={() => runWorkflow(p, libSymbol)} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>
                  ▶ Run with {libSymbol || '…'}
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
