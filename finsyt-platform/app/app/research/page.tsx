'use client'
import { useState, useRef, useEffect } from 'react'

type Message = {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  ts?: number
}

const PROMPTS = [
  { label: '📊 Earnings Brief',   text: 'Give me a deep-dive earnings brief on NVDA — revenue drivers, margin trajectory, guidance vs consensus, and key risks.' },
  { label: '⚖️ Compare Stocks',   text: 'Compare MSFT and GOOGL on cloud growth, AI monetisation, and valuation. Which is better positioned for 2026?' },
  { label: '🏦 Macro Outlook',    text: 'What is the current macro outlook for the US economy? Summarise Fed policy, inflation trend, and recession risk.' },
  { label: '📈 Bull/Bear Case',   text: 'Give me the bull and bear case for META in 2026, including key catalysts and risks.' },
  { label: '📑 Valuation',        text: 'What is AAPL\'s current valuation vs historical and peers? Is it cheap or expensive on P/E, EV/EBITDA, and FCF yield?' },
  { label: '🔍 Sector Screen',    text: 'Which sectors are most attractive right now given the macro environment? Give me top 3 with conviction rationale.' },
]

function MarkdownLine({ text }: { text: string }) {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} style={{ color: '#0A1628' }}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

function AssistantMessage({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div style={{ fontSize: 13, color: '#3D4F6E', lineHeight: 1.7 }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 6 }} />
        if (line.startsWith('# '))  return <h2 key={i} style={{ fontSize: 16, fontWeight: 800, color: '#0A1628', margin: '12px 0 6px' }}>{line.slice(2)}</h2>
        if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: 14, fontWeight: 700, color: '#0A1628', margin: '10px 0 4px' }}>{line.slice(3)}</h3>
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
              <span style={{ color: '#1B4FFF', flexShrink: 0, marginTop: 2 }}>▸</span>
              <div><MarkdownLine text={line.slice(2)} /></div>
            </div>
          )
        }
        if (/^\d+\.\s/.test(line)) {
          const num = line.match(/^(\d+)\./)?.[1]
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
              <span style={{ color: '#1B4FFF', flexShrink: 0, fontWeight: 700, minWidth: 18 }}>{num}.</span>
              <div><MarkdownLine text={line.replace(/^\d+\.\s/, '')} /></div>
            </div>
          )
        }
        return <p key={i} style={{ margin: '4px 0' }}><MarkdownLine text={line} /></p>
      })}
    </div>
  )
}

export default function ResearchPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [symbol, setSymbol]     = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text?: string) {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setInput('')
    const userMsg: Message = { role: 'user', content: q, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res  = await fetch('/api/ai-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, symbol: symbol || undefined }),
      })
      const data = await res.json()
      const reply: Message = {
        role: 'assistant',
        content: data.response || data.answer || data.error || 'No response.',
        sources: data.sources,
        ts: Date.now(),
      }
      setMessages(prev => [...prev, reply])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.', ts: Date.now() }])
    }
    setLoading(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', background: '#F7F9FC' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E8EDF5', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>🧠 AI Analyst</h1>
          <p style={{ fontSize: 12, color: '#7D8FA9', marginTop: 2 }}>Institutional-grade research powered by real-time financial data</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="Context ticker (e.g. AAPL)"
            style={{ width: 160, height: 34, fontSize: 12, textTransform: 'uppercase' }}
            className="input"
          />
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="btn btn-ghost btn-sm">Clear chat</button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Welcome state */}
        {messages.length === 0 && !loading && (
          <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🧠</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0A1628', letterSpacing: '-0.02em', marginBottom: 8 }}>
                Finsyt AI Analyst
              </h2>
              <p style={{ fontSize: 14, color: '#7D8FA9', lineHeight: 1.6 }}>
                Ask anything about markets, companies, macro, or valuation.<br />
                I have access to real-time quotes, earnings, SEC filings, and macro data.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {PROMPTS.map(p => (
                <button key={p.label} onClick={() => send(p.text)} style={{
                  textAlign: 'left', background: '#fff', border: '1px solid #E8EDF5',
                  borderRadius: 12, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1628', marginBottom: 4 }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: '#7D8FA9', lineHeight: 1.4 }}>{p.text.slice(0, 80)}…</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '100%',
          }}>
            {m.role === 'user' ? (
              <div style={{
                background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)',
                color: '#fff', borderRadius: '16px 16px 4px 16px',
                padding: '10px 16px', maxWidth: 600, fontSize: 13, fontWeight: 600, lineHeight: 1.5,
              }}>
                {m.content}
              </div>
            ) : (
              <div style={{
                background: '#fff', border: '1px solid #E8EDF5',
                borderRadius: '4px 16px 16px 16px',
                padding: '16px 18px', maxWidth: 780, width: '100%',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 900 }}>F</div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1B4FFF' }}>Finsyt AI</span>
                </div>
                <AssistantMessage content={m.content} />
                {m.sources && m.sources.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #F1F5F9', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>Sources:</span>
                    {m.sources.map((s, si) => (
                      <span key={si} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#EEF2FF', color: '#1B4FFF', fontWeight: 600 }}>{s}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#C5CFDF', marginTop: 3, marginLeft: m.role === 'assistant' ? 4 : 0, marginRight: m.role === 'user' ? 4 : 0 }}>
              {m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
          </div>
        ))}

        {/* Loading bubble */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ background: '#fff', border: '1px solid #E8EDF5', borderRadius: '4px 16px 16px 16px', padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 900 }}>F</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1B4FFF' }}>Finsyt AI</span>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{
                    width: 7, height: 7, borderRadius: '50%', background: '#1B4FFF',
                    animation: 'pulse 1.2s ease-in-out infinite',
                    animationDelay: `${j * 0.2}s`, opacity: 0.7,
                  }} />
                ))}
                <span style={{ fontSize: 11, color: '#7D8FA9', marginLeft: 6 }}>Analysing…</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ background: '#fff', borderTop: '1px solid #E8EDF5', padding: '16px 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', maxWidth: 880, margin: '0 auto' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything — earnings, valuations, macro, M&A…  (Enter to send, Shift+Enter for new line)"
            rows={2}
            style={{
              flex: 1, resize: 'none', fontSize: 13, padding: '10px 14px',
              border: '1.5px solid #E8EDF5', borderRadius: 12, fontFamily: 'inherit',
              outline: 'none', transition: 'border-color 0.15s', lineHeight: 1.5,
              background: '#F7F9FC', color: '#0A1628',
            }}
            onFocus={e => { e.target.style.borderColor = '#1B4FFF'; e.target.style.background = '#fff' }}
            onBlur={e =>  { e.target.style.borderColor = '#E8EDF5'; e.target.style.background = '#F7F9FC' }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              height: 48, width: 48, borderRadius: 12, flexShrink: 0,
              background: input.trim() && !loading ? 'linear-gradient(135deg,#1B4FFF,#0D9FE8)' : '#E8EDF5',
              border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              transition: 'all 0.15s',
            }}
          >
            {loading ? '⏳' : '↑'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#C5CFDF', textAlign: 'center', marginTop: 8 }}>
          Powered by real-time EODHD data · SEC EDGAR · AI analysis
        </div>
      </div>
    </div>
  )
}
