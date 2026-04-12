'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Zap, TrendingUp, FileText, Globe, BarChart2,
  Building, ArrowUpRight, RefreshCw, Copy, ExternalLink,
  ChevronDown, ChevronRight, StopCircle, Clock, Sparkles
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: string[]
  toolResults?: { tool: string; symbol?: string; status: string }[]
  model?: string
  ts: number
  isStreaming?: boolean
}

interface ToolEvent {
  event: string
  tools?: string[]
  tool?: string
  symbol?: string
  status?: string
  model?: string
  token?: string
  toolCount?: number
  message?: string
}

// ─── Prompt starters ─────────────────────────────────────────────────────────
const STARTERS = [
  { icon: '📊', label: 'Deep dive', text: 'Full deep dive on NVDA — revenue model, margins, valuation vs peers, catalysts, key risks, analyst consensus' },
  { icon: '📑', label: 'SEC filings', text: "Summarise AAPL's latest 10-K — business model, revenue drivers, risk factors and MD&A highlights" },
  { icon: '🌍', label: 'US macro', text: 'Give me the current US macro picture — GDP growth, CPI trend, unemployment, PMI readings, Fed outlook and yield curve' },
  { icon: '⚔️', label: 'Peer compare', text: 'Compare MSFT vs GOOGL vs AMZN on cloud revenue, growth rates, operating margins, and market position' },
  { icon: '🔍', label: 'Value screen', text: 'Screen for US value stocks: P/E under 15, revenue growth over 8%, positive FCF, market cap $1B+' },
  { icon: '💹', label: 'Insider buying', text: 'Which large-cap companies have seen the most significant insider buying in the past 30 days? Dollar amounts.' },
  { icon: '📅', label: 'Bull vs bear', text: 'Give me 3 bull and 3 bear arguments for TSLA with supporting data from recent filings and financials' },
  { icon: '🏗️', label: 'Private markets', text: 'Find AI infrastructure startups with $50M–$500M in funding raised since 2022 — founders, investors, traction signals' },
]

const TOOL_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  quote:      { label: 'Fetching market data',       icon: '📈', color: '#638bff' },
  news:       { label: 'Loading news & sentiment',   icon: '📰', color: '#10b981' },
  insider:    { label: 'Pulling insider transactions',icon: '👤', color: '#f59e0b' },
  macro:      { label: 'Querying FRED macro data',   icon: '🌍', color: '#a78bfa' },
  filings:    { label: 'Searching SEC EDGAR',        icon: '📑', color: '#0891b2' },
  transcript: { label: 'Loading earnings transcripts',icon: '🎙️', color: '#f472b6' },
  screener:   { label: 'Running stock screener',     icon: '🔍', color: '#ef4444' },
  general:    { label: 'Analysing query',            icon: '🧠', color: '#6366f1' },
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let key = 0
  let tableRows: string[][] = []
  let tableHeader: string[] = []
  let inTable = false

  const flushTable = () => {
    if (!inTable) return
    nodes.push(
      <div key={key++} style={{ overflowX: 'auto', margin: '12px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {tableHeader.map((h, i) => (
                <th key={i} style={{ padding: '7px 12px', background: 'rgba(99,139,255,0.12)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'left', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h.trim()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '7px 12px', border: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.78)', fontSize: 12 }}>{cell.trim()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    inTable = false; tableRows = []; tableHeader = []
  }

  const inline = (t: string): React.ReactNode => {
    const parts: React.ReactNode[] = []
    let rem = t; let k = 0
    while (rem.length > 0) {
      const bm = rem.match(/\*\*(.+?)\*\*/)
      const cm = rem.match(/`(.+?)`/)
      const lm = rem.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/)
      const idxB = bm ? rem.indexOf('**') : Infinity
      const idxC = cm ? rem.indexOf('`') : Infinity
      const idxL = lm ? rem.indexOf('[') : Infinity
      const first = Math.min(idxB, idxC, idxL)
      if (first === Infinity) { parts.push(rem); break }
      if (first > 0) parts.push(rem.slice(0, first))
      if (first === idxB && bm) {
        parts.push(<strong key={k++} style={{ color: '#fff', fontWeight: 700 }}>{bm[1]}</strong>)
        rem = rem.slice(idxB + bm[0].length)
      } else if (first === idxC && cm) {
        parts.push(<code key={k++} style={{ background: 'rgba(99,139,255,0.12)', border: '1px solid rgba(99,139,255,0.2)', borderRadius: 4, padding: '1px 5px', fontSize: 12, color: '#93b4ff', fontFamily: 'monospace' }}>{cm[1]}</code>)
        rem = rem.slice(idxC + cm[0].length)
      } else if (first === idxL && lm) {
        parts.push(<a key={k++} href={lm[2]} target="_blank" rel="noreferrer" style={{ color: '#638bff', textDecoration: 'none', borderBottom: '1px solid rgba(99,139,255,0.3)' }}>{lm[1]}</a>)
        rem = rem.slice(idxL + lm[0].length)
      } else break
    }
    return <>{parts}</>
  }

  lines.forEach(line => {
    if (line.startsWith('|')) {
      const cells = line.split('|').filter((_, i, a) => i > 0 && i < a.length - 1)
      if (!inTable) { inTable = true; tableHeader = cells }
      else if (/^[\s\-|]+$/.test(line)) { /* sep */ }
      else tableRows.push(cells)
      return
    } else flushTable()

    if (line.startsWith('### '))
      nodes.push(<h3 key={key++} style={{ fontSize: 12, fontWeight: 700, color: '#fff', margin: '16px 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 }}>{inline(line.slice(4))}</h3>)
    else if (line.startsWith('## '))
      nodes.push(<h2 key={key++} style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '20px 0 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 6 }}>{inline(line.slice(3))}</h2>)
    else if (line.startsWith('# '))
      nodes.push(<h1 key={key++} style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '16px 0 10px' }}>{inline(line.slice(2))}</h1>)
    else if (line.startsWith('- ') || line.startsWith('* '))
      nodes.push(<div key={key++} style={{ display: 'flex', gap: 8, marginBottom: 5, paddingLeft: 4 }}>
        <span style={{ color: '#638bff', marginTop: 2, flexShrink: 0, fontSize: 12 }}>•</span>
        <span style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.65, fontSize: 13 }}>{inline(line.slice(2))}</span>
      </div>)
    else if (/^\d+\. /.test(line)) {
      const m = line.match(/^(\d+)\. (.*)/)!
      nodes.push(<div key={key++} style={{ display: 'flex', gap: 8, marginBottom: 5, paddingLeft: 4 }}>
        <span style={{ color: '#638bff', fontWeight: 700, flexShrink: 0, width: 18, fontSize: 12 }}>{m[1]}.</span>
        <span style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.65, fontSize: 13 }}>{inline(m[2])}</span>
      </div>)
    } else if (line.startsWith('> '))
      nodes.push(<blockquote key={key++} style={{ borderLeft: '2px solid #638bff', paddingLeft: 12, margin: '8px 0', color: 'rgba(255,255,255,0.5)', fontSize: 12, fontStyle: 'italic' }}>{inline(line.slice(2))}</blockquote>)
    else if (line.trim() === '')
      nodes.push(<div key={key++} style={{ height: 6 }} />)
    else
      nodes.push(<p key={key++} style={{ marginBottom: 6, color: 'rgba(255,255,255,0.8)', lineHeight: 1.75, fontSize: 13 }}>{inline(line)}</p>)
  })
  flushTable()
  return nodes
}

// ─── Tool Call Status Component ────────────────────────────────────────────────
function ToolCallPanel({ tools, results }: { tools: string[]; results: { tool: string; symbol?: string; status: string }[] }) {
  const [expanded, setExpanded] = useState(false)
  const doneCount = results.filter(r => r.status === 'done').length
  const allDone = doneCount === tools.length

  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(99,139,255,0.08)', border: '1px solid rgba(99,139,255,0.15)', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 11, width: '100%' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: allDone ? '#10b981' : '#638bff', flexShrink: 0, animation: allDone ? 'none' : 'pulse 1.5s infinite' }} />
        <span style={{ fontWeight: 600, color: allDone ? '#10b981' : '#638bff' }}>
          {allDone ? `✓ ${doneCount} data sources loaded` : `Fetching data… (${doneCount}/${tools.length})`}
        </span>
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ marginTop: 6, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
          {tools.map((tool, i) => {
            const info = TOOL_LABELS[tool] || { label: tool, icon: '⚙️', color: '#638bff' }
            const result = results.find(r => r.tool === tool)
            const isDone = result?.status === 'done'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ fontSize: 12 }}>{info.icon}</span>
                <span style={{ fontSize: 11, color: isDone ? 'rgba(255,255,255,0.6)' : info.color, flex: 1 }}>
                  {info.label}{result?.symbol ? ` (${result.symbol})` : ''}
                </span>
                {isDone
                  ? <span style={{ fontSize: 10, color: '#10b981' }}>✓ Done</span>
                  : <div style={{ width: 12, height: 12, border: `2px solid ${info.color}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                }
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Message Component ─────────────────────────────────────────────────────────
function MessageBubble({ msg, onRerun }: { msg: Message; onRerun?: (text: string) => void }) {
  const [copied, setCopied] = useState(false)

  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <div style={{ maxWidth: '75%', background: 'linear-gradient(135deg, #1a56ff, #4f46e5)', borderRadius: '14px 14px 2px 14px', padding: '12px 16px' }}>
          <p style={{ color: '#fff', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{msg.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Tool calls panel */}
      {msg.toolCalls && msg.toolCalls.length > 0 && !msg.toolCalls.includes('general') && (
        <ToolCallPanel
          tools={msg.toolCalls}
          results={msg.toolResults || []}
        />
      )}

      {/* Content */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', position: 'relative' }}>
        {/* Model badge */}
        {msg.model && (
          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={11} style={{ color: '#638bff' }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Finsyt Intelligence · {msg.model}
            </span>
          </div>
        )}

        <div style={{ fontSize: 13, lineHeight: 1.75 }}>
          {msg.isStreaming && !msg.content
            ? <div style={{ display: 'flex', gap: 4, alignItems: 'center', color: 'rgba(255,255,255,0.4)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#638bff', animation: 'pulse 1s infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#638bff', animation: 'pulse 1s infinite 0.2s' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#638bff', animation: 'pulse 1s infinite 0.4s' }} />
              </div>
            : renderMarkdown(msg.content)
          }
          {msg.isStreaming && <span style={{ display: 'inline-block', width: 2, height: 14, background: '#638bff', marginLeft: 2, animation: 'blink 1s infinite', verticalAlign: 'text-bottom' }} />}
        </div>

        {/* Footer actions */}
        {!msg.isStreaming && msg.content && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button onClick={() => { navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>
              <Copy size={10} />{copied ? 'Copied!' : 'Copy'}
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.2)', alignSelf: 'center' }}>
              {new Date(msg.ts).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ResearchPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hasMessages = messages.length > 0

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submit = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return
    setQuery('')
    setIsLoading(true)

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text, ts: Date.now() }
    const assistantId = crypto.randomUUID()

    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      toolResults: [],
      ts: Date.now(),
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])

    abortRef.current = new AbortController()

    try {
      const chatHistory = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: text, chatHistory }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) throw new Error('API error: ' + res.status)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const chunk of lines) {
          if (!chunk.startsWith('data: ')) continue
          try {
            const evt: ToolEvent = JSON.parse(chunk.slice(6))

            if (evt.event === 'tool_calls') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, toolCalls: evt.tools || [] } : m
              ))
            } else if (evt.event === 'tool_result') {
              setMessages(prev => prev.map(m => {
                if (m.id !== assistantId) return m
                const existing = m.toolResults || []
                const updated = [...existing, { tool: evt.tool!, symbol: evt.symbol, status: evt.status! }]
                return { ...m, toolResults: updated }
              }))
            } else if (evt.event === 'stream_start') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, model: evt.model } : m
              ))
            } else if (evt.event === 'token') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + (evt.token || '') } : m
              ))
            } else if (evt.event === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, isStreaming: false } : m
              ))
            } else if (evt.event === 'error') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: `Error: ${evt.message}`, isStreaming: false } : m
              ))
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: 'Request failed. Check your API configuration.', isStreaming: false } : m
        ))
      }
    } finally {
      setIsLoading(false)
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, isStreaming: false } : m
      ))
    }
  }, [isLoading, messages])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(query) }
  }

  const stop = () => {
    abortRef.current?.abort()
    setIsLoading(false)
    setMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#060b18', color: '#e2e8f0' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        .starter-btn:hover { background: rgba(99,139,255,0.1) !important; border-color: rgba(99,139,255,0.3) !important; }
        .send-btn:hover { transform: scale(1.05); }
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding: '14px 24px', background: '#05090f', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#1a56ff,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={14} style={{ color: '#fff' }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Finsyt Intelligence</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Live data · EODHD · FMP · SEC EDGAR · FRED · Finnhub</div>
        </div>
        {hasMessages && (
          <button onClick={() => setMessages([])}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>
            <RefreshCw size={11} /> New chat
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: hasMessages ? '24px 10%' : '0', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>

        {/* Empty state */}
        {!hasMessages && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: '40px 10%', animation: 'fadeUp 0.5s ease' }}>
            {/* Hero */}
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#1a56ff,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: '0 0 40px rgba(26,86,255,0.3)' }}>
              <Sparkles size={26} style={{ color: '#fff' }} />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 8, letterSpacing: '-0.02em' }}>Finsyt Intelligence</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 460, lineHeight: 1.7, marginBottom: 40 }}>
              Ask about any public or private company, screen for stocks, analyse SEC filings, or get live macro data — all in one place.
            </p>

            {/* Starter grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, width: '100%', maxWidth: 740, marginBottom: 32 }}>
              {STARTERS.map((s, i) => (
                <button key={i} className="starter-btn" onClick={() => submit(s.text)}
                  style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>{s.text.slice(0, 50)}…</div>
                </button>
              ))}
            </div>

            {/* Data sources strip */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { name: 'EODHD', desc: 'Prices · Fundamentals · Technicals' },
                { name: 'FMP', desc: 'Financials · Transcripts' },
                { name: 'SEC EDGAR', desc: '18M+ Filings · Full Text' },
                { name: 'FRED', desc: 'Macro · Rates · GDP' },
                { name: 'Finnhub', desc: 'Real-time · Alt Data' },
              ].map(s => (
                <div key={s.name} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div style={{ padding: '16px 10%', background: '#05090f', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'flex-end', gap: 10, transition: 'border-color 0.2s', maxWidth: '100%' }}
          onFocus={() => {}} >
          <textarea
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={hasMessages ? 'Ask a follow-up — add a ticker, go deeper, compare…' : 'Ask about any company, market, filing or macro trend…'}
            rows={1}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit', resize: 'none', lineHeight: 1.6, maxHeight: 120, overflowY: 'auto' }}
            onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }}
          />

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {isLoading ? (
              <button onClick={stop}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#fca5a5', fontSize: 11, cursor: 'pointer' }}>
                <StopCircle size={12} /> Stop
              </button>
            ) : (
              <button onClick={() => submit(query)} disabled={!query.trim()} className="send-btn"
                style={{ width: 36, height: 36, background: query.trim() ? 'linear-gradient(135deg,#1a56ff,#4f46e5)' : 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 9, color: '#fff', cursor: query.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: query.trim() ? 1 : 0.4, transition: 'all 0.15s', boxShadow: query.trim() ? '0 2px 16px rgba(26,86,255,0.4)' : 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 7, fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>
          ↵ Send · Shift+Enter for new line · Real-time data from 5 sources
        </div>
      </div>
    </div>
  )
}
