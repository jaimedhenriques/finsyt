'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { t } from '@/lib/i18n/translations'

interface ChatMsg { role: 'user' | 'ai'; content: string; bullets?: string[]; sources?: SourceRef[]; showSources?: boolean; modelUsed?: string; hasLiveData?: boolean }
interface SourceRef { title: string; type: 'filing' | 'transcript' | 'expert' | 'news'; symbol?: string; date?: string }

const SOURCE_COLORS: Record<string,string> = { filing:'#8B5CF6', transcript:'#059669', expert:'#1B4FFF', news:'#D97706' }
const SOURCE_LABELS: Record<string,string> = { filing:'Filing', transcript:'Transcript', expert:'Expert Call', news:'News' }

const PROMPT_LIBRARY = [
  { icon:'📊', label:'Earnings Preview',  cat:'Research',    prompt:'Run an earnings preview for {symbol}. Include: EPS & revenue consensus, prior beat/miss, key themes from last call, analyst sentiment, key risks.' },
  { icon:'🏢', label:'Company Profile',   cat:'Research',    prompt:'Comprehensive company profile for {symbol}: business model, revenue segments, competitive positioning, management team, recent developments.' },
  { icon:'⚖️', label:'Bull vs Bear',      cat:'Research',    prompt:'Bull case and bear case for {symbol} with 3 arguments each. Include valuation context, what needs to be true for each to play out.' },
  { icon:'📋', label:'Earnings Summary',  cat:'Transcripts', prompt:'Summarise the most recent earnings call for {symbol}: key management commentary, guidance updates, analyst Q&A, tone shifts vs prior quarter.' },
  { icon:'🔢', label:'Peer Comps',        cat:'Comps',       prompt:'Peer comparison for {symbol}: revenue growth, gross margin, EBITDA margin, P/E, EV/EBITDA vs closest competitors. Flag premium/discount.' },
  { icon:'💰', label:'Valuation',         cat:'Valuation',   prompt:'Valuation analysis for {symbol}: trading multiples vs history, DCF assumptions, EV/EBITDA comps, consensus price targets.' },
  { icon:'⚠️', label:'Risk Assessment',   cat:'Research',    prompt:'Top 5 risks for {symbol} across regulatory, competitive, operational, financial, and macro dimensions. Rate severity and likelihood.' },
  { icon:'🌍', label:'Macro Briefing',    cat:'Macro',       prompt:'Macro briefing: Fed rate path, key data releases this week, central bank divergence, USD outlook, top 3 macro themes for equities now.' },
  { icon:'📰', label:'News Run',          cat:'News',        prompt:'News run for {symbol}: 5 most important recent developments, market impact, analyst reactions, read-throughs for the stock thesis.' },
  { icon:'🏦', label:'Precedent Deals',   cat:'Deals',       prompt:'Precedent M&A transactions in the {symbol} sector: deal multiples, rationale, strategic fit. Median and range of multiples paid.' },
  { icon:'🎯', label:'Sector Outlook',    cat:'Macro',       prompt:'Sector outlook for the {symbol} industry: performance YTD, tailwinds/headwinds, consensus positioning, catalysts, names to watch.' },
  { icon:'📈', label:'Revenue Breakdown', cat:'Research',    prompt:'Revenue breakdown for {symbol} by segment and geography. YoY growth per segment, which are accelerating vs decelerating.' },
]

const STEPS = [
  'Identifying relevant sources',
  'Fetching real-time market data',
  'Searching earnings transcripts & filings',
  'Running AI analysis',
  'Synthesising with citations',
]

const SUGGESTED = [
  'Show me NVIDIA latest earnings results and guidance',
  'What are the top analyst questions on Tesla Q1 2026?',
  'Run a macro briefing — Fed, yields, and key themes',
  'Bull vs bear case for Microsoft — AI growth vs valuation',
]

function UserBubble({ content }: { content: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:20 }}>
      <div style={{ maxWidth:'70%', background:'#F0F4FF', borderRadius:'14px 14px 4px 14px', padding:'10px 14px', fontSize:13.5, color:'#0A1628', fontWeight:500, lineHeight:1.5 }}>{content}</div>
    </div>
  )
}

function AiBubble({ msg, onToggleSources }: { msg: ChatMsg; onToggleSources: () => void }) {
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <div style={{ width:22, height:22, borderRadius:6, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff' }}>F</div>
        <span style={{ fontSize:12, fontWeight:700, color:'#1B4FFF' }}>Finsyt Agent</span>
        {msg.hasLiveData && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:999, background:'#ECFDF5', color:'#059669', fontWeight:600 }}>● Live data</span>}
        {msg.modelUsed && <span style={{ fontSize:10, color:'#B0BCD0' }}>{msg.modelUsed}</span>}
      </div>
      {msg.content && !msg.bullets && <p style={{ fontSize:14, color:'#1C2B4A', lineHeight:1.7, marginBottom:14 }}>{msg.content}</p>}
      {msg.bullets && msg.bullets.length > 0 && (
        <div style={{ fontSize:14, color:'#1C2B4A', lineHeight:1.7, marginBottom:14 }}>
          {msg.content && <p style={{ marginBottom:10, fontWeight:500, color:'#3D4F6E' }}>{msg.content}</p>}
          <ul style={{ margin:0, padding:0, listStyle:'none' }}>
            {msg.bullets.map((b,i) => {
              const colonIdx = b.indexOf(':')
              const hasBold = b.startsWith('**') || (colonIdx > 0 && colonIdx < 40)
              const label = hasBold && colonIdx > 0 ? b.replace(/\*\*/g,'').slice(0, colonIdx) : null
              const rest  = hasBold && colonIdx > 0 ? b.replace(/\*\*/g,'').slice(colonIdx+1) : b.replace(/\*\*/g,'')
              return (
                <li key={i} style={{ display:'flex', gap:10, marginBottom:10 }}>
                  <span style={{ color:'#1B4FFF', fontSize:16, lineHeight:'1.5', flexShrink:0, marginTop:1 }}>·</span>
                  <span>{label && <strong style={{ color:'#0A1628' }}>{label}:</strong>}{rest}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button style={{ padding:'4px 2px', background:'none', border:'none', cursor:'pointer', color:'#B0BCD0', fontSize:14 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        </button>
        <button onClick={onToggleSources} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', background:msg.showSources?'#1B4FFF':'#F0F4FA', color:msg.showSources?'#fff':'#3D4F6E', border:'none', borderRadius:999, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all 0.12s' }}>
          Sources {msg.sources ? `(${msg.sources.length})` : ''}
        </button>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button style={{ background:'none', border:'none', cursor:'pointer', color:'#B0BCD0', padding:'4px 6px', borderRadius:6, fontSize:13 }}>👍</button>
          <button style={{ background:'none', border:'none', cursor:'pointer', color:'#B0BCD0', padding:'4px 6px', borderRadius:6, fontSize:13 }}>👎</button>
        </div>
      </div>
      {msg.showSources && msg.sources && (
        <div style={{ marginTop:10, borderTop:'1px solid #F0F4FA', paddingTop:10 }}>
          {msg.sources.map((s,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:i<msg.sources!.length-1?'1px solid #F5F7FB':'none' }}>
              <div style={{ width:28, height:28, borderRadius:7, background:SOURCE_COLORS[s.type]+'18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={SOURCE_COLORS[s.type]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12.5, fontWeight:600, color:'#1B4FFF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.title}</div>
                <div style={{ fontSize:11, color:'#B0BCD0', marginTop:1 }}>
                  {s.symbol && <span style={{ fontWeight:700, color:'#7D8FA9', marginRight:6 }}>{s.symbol}</span>}
                  <span style={{ padding:'0 5px', borderRadius:4, background:SOURCE_COLORS[s.type]+'18', color:SOURCE_COLORS[s.type], fontWeight:600, fontSize:10 }}>{SOURCE_LABELS[s.type]}</span>
                  {s.date && <span style={{ marginLeft:8 }}>{s.date}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ThinkingBubble({ step }: { step: number }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <div style={{ width:22, height:22, borderRadius:6, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff' }}>F</div>
        <span style={{ fontSize:12, fontWeight:700, color:'#1B4FFF' }}>Finsyt Agent</span>
      </div>
      {STEPS.map((s,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7, opacity:i<=step?1:0.2, transition:'opacity 0.3s' }}>
          <div style={{ width:16, height:16, borderRadius:'50%', flexShrink:0, background:i<step?'#059669':i===step?'#1B4FFF':'#E8EDF4', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {i<step&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3"/></svg>}
            {i===step&&<div style={{ width:5, height:5, borderRadius:'50%', background:'#fff', animation:'pulse 1s infinite' }} />}
          </div>
          <span style={{ fontSize:12, color:i<=step?'#1C2B4A':'#B0BCD0', fontWeight:i===step?600:400 }}>{s}</span>
        </div>
      ))}
    </div>
  )
}

function LibraryPanel({ onSelect }: { onSelect: (p: string) => void }) {
  const cats = [...new Set(PROMPT_LIBRARY.map(p => p.cat))]
  const [activeCat, setActiveCat] = useState('Research')
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid #E8EDF4' }}>
        <div style={{ fontSize:14, fontWeight:800, color:'#0A1628', marginBottom:4 }}>Prompt Library</div>
        <p style={{ fontSize:12, color:'#7D8FA9' }}>One-click analysis workflows — powered by live data</p>
      </div>
      <div style={{ display:'flex', gap:6, padding:'10px 16px', overflowX:'auto', borderBottom:'1px solid #E8EDF4' }}>
        {cats.map(c => (
          <button key={c} onClick={() => setActiveCat(c)} style={{ padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', fontFamily:'inherit', background:activeCat===c?'#1B4FFF':'#F0F4FA', color:activeCat===c?'#fff':'#7D8FA9', whiteSpace:'nowrap' }}>{c}</button>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
        {PROMPT_LIBRARY.filter(p => p.cat === activeCat).map((p, i) => (
          <button key={i} onClick={() => onSelect(p.prompt)}
            style={{ display:'flex', alignItems:'flex-start', gap:10, width:'100%', padding:'10px 18px', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit', transition:'background 0.1s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F7F9FC')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ fontSize:18, flexShrink:0, marginTop:1 }}>{p.icon}</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#0A1628', marginBottom:2 }}>{p.label}</div>
              <div style={{ fontSize:11.5, color:'#7D8FA9', lineHeight:1.45 }}>{p.prompt.slice(0, 80)}…</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ResearchPage() {
  const { locale } = useLocale()
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [thinkStep, setThinkStep] = useState(0)
  const [showLibrary, setShowLibrary] = useState(false)
  const [chatHistory, setChatHistory] = useState<string[]>([])
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs, thinking])

  async function sendMessage(q: string) {
    if (!q.trim() || thinking) return
    const userQ = q.trim()
    setInput('')
    setMsgs(prev => [...prev, { role:'user', content:userQ }])
    if (!chatHistory.includes(userQ.slice(0,40))) {
      setChatHistory(prev => [userQ.slice(0,40), ...prev.slice(0,19)])
      setActiveChat(userQ.slice(0,40))
    }
    setThinking(true)
    setThinkStep(0)

    // Animate steps while waiting for API
    const stepInterval = setInterval(() => {
      setThinkStep(prev => Math.min(prev + 1, STEPS.length - 1))
    }, 800)

    try {
      const res = await fetch('/api/ai-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userQ, messages: msgs }),
      })
      const data = await res.json()
      clearInterval(stepInterval)
      setThinking(false)
      setMsgs(prev => [...prev, {
        role: 'ai',
        content: data.content || '',
        bullets: data.bullets || [],
        sources: data.sources || [],
        showSources: false,
        modelUsed: data.modelUsed,
        hasLiveData: data.hasLiveData,
      }])
    } catch (e) {
      clearInterval(stepInterval)
      setThinking(false)
      setMsgs(prev => [...prev, { role:'ai', content:'Sorry, I encountered an error reaching the AI backend. Please try again.', bullets:[] }])
    }
  }

  function toggleSources(idx: number) {
    setMsgs(prev => prev.map((m, i) => i === idx ? { ...m, showSources: !m.showSources } : m))
  }

  return (
    <div style={{ display:'flex', height:'calc(100vh - 60px)', background:'#F7F9FC', overflow:'hidden' }}>
      {/* Sidebar */}
      <div style={{ width:220, flexShrink:0, background:'#fff', borderRight:'1px solid #E8EDF4', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 14px 10px', borderBottom:'1px solid #F5F7FB' }}>
          <button onClick={() => { setMsgs([]); setActiveChat(null) }} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 10px', background:'#F7F9FC', border:'1.5px solid #E8EDF4', borderRadius:9, fontSize:12, fontWeight:700, color:'#0A1628', cursor:'pointer', fontFamily:'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New chat
          </button>
        </div>
        <div style={{ padding:'10px 10px 4px', fontSize:10, fontWeight:700, color:'#B0BCD0', letterSpacing:'0.08em', textTransform:'uppercase' }}>Recent</div>
        <div style={{ flex:1, overflowY:'auto', padding:'0 8px 8px' }}>
          {chatHistory.length === 0 && <div style={{ padding:'10px 6px', fontSize:12, color:'#B0BCD0' }}>No recent chats</div>}
          {chatHistory.map((h, i) => (
            <button key={i} onClick={() => setActiveChat(h)} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 8px', borderRadius:8, fontSize:12, color:activeChat===h?'#1B4FFF':'#3D4F6E', background:activeChat===h?'#EEF3FF':'none', border:'none', cursor:'pointer', fontFamily:'inherit', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {h}…
            </button>
          ))}
        </div>
        <div style={{ borderTop:'1px solid #E8EDF4', padding:'10px 10px' }}>
          <button onClick={() => setShowLibrary(l => !l)} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 10px', background:showLibrary?'#EEF3FF':'#F7F9FC', border:`1.5px solid ${showLibrary?'#1B4FFF':'#E8EDF4'}`, borderRadius:9, fontSize:12, fontWeight:700, color:showLibrary?'#1B4FFF':'#0A1628', cursor:'pointer', fontFamily:'inherit' }}>
            <span style={{ fontSize:14 }}>📚</span> Prompt Library
          </button>
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #E8EDF4', background:'#fff', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:28, height:28, borderRadius:8, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:'#fff' }}>F</div>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:'#0A1628', letterSpacing:'-0.01em' }}>Finsyt AI Research</div>
            <div style={{ fontSize:11, color:'#7D8FA9', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:'#059669', display:'inline-block' }} />
              Live data · Groq · Perplexity · Finnhub · FMP · FRED
            </div>
          </div>
          <button style={{ marginLeft:'auto', padding:'5px 10px', background:'#F7F9FC', border:'1.5px solid #E8EDF4', borderRadius:7, fontSize:11, fontWeight:600, color:'#7D8FA9', cursor:'pointer', fontFamily:'inherit' }}>Legal Disclaimer</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
          {msgs.length === 0 && !thinking && (
            <div style={{ maxWidth:560, margin:'40px auto 0', textAlign:'center' }}>
              <div style={{ width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:22, fontWeight:900, color:'#fff' }}>F</div>
              <h2 style={{ fontSize:'1.25rem', fontWeight:800, color:'#0A1628', letterSpacing:'-0.02em', marginBottom:8 }}>Ask anything. Get institutional-grade answers.</h2>
              <p style={{ fontSize:13, color:'#7D8FA9', lineHeight:1.6, marginBottom:6 }}>Powered by live market data from Finnhub, FMP financials, FRED macro, earnings transcripts — synthesised by Groq AI and Perplexity.</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center', marginBottom:28 }}>
                {['Finnhub','FMP','FRED','Groq','Perplexity','Alpha Vantage','Databento'].map(s=>(
                  <span key={s} style={{ fontSize:10, padding:'2px 8px', borderRadius:999, background:'#EEF3FF', color:'#1B4FFF', fontWeight:600 }}>{s}</span>
                ))}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {SUGGESTED.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)} style={{ padding:'10px 16px', background:'#fff', border:'1.5px solid #E8EDF4', borderRadius:10, fontSize:13, color:'#1C2B4A', cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'all 0.12s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='#1B4FFF'; (e.currentTarget as HTMLButtonElement).style.color='#1B4FFF' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='#E8EDF4'; (e.currentTarget as HTMLButtonElement).style.color='#1C2B4A' }}
                  >{s}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            m.role === 'user'
              ? <UserBubble key={i} content={m.content} />
              : <AiBubble key={i} msg={m} onToggleSources={() => toggleSources(i)} />
          ))}
          {thinking && <ThinkingBubble step={thinkStep} />}
          <div ref={bottomRef} />
        </div>

        <div style={{ borderTop:'1px solid #E8EDF4', padding:'12px 20px', background:'#fff' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'#F7F9FC', border:'1.5px solid #E8EDF4', borderRadius:12, padding:'8px 12px', transition:'border-color 0.15s' }}
            onFocusCapture={e => (e.currentTarget.style.borderColor='#1B4FFF')}
            onBlurCapture={e => (e.currentTarget.style.borderColor='#E8EDF4')}
          >
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),sendMessage(input))}
              placeholder="Ask a question for a quick answer"
              style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:13.5, color:'#0A1628', fontFamily:'inherit' }} />
            <button style={{ background:'none', border:'none', cursor:'pointer', color:'#B0BCD0', display:'flex', alignItems:'center', justifyContent:'center', padding:4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>
            <button onClick={() => sendMessage(input)} disabled={!input.trim() || thinking} style={{ width:32, height:32, borderRadius:8, background:input.trim()&&!thinking?'#1B4FFF':'#E8EDF4', border:'none', cursor:input.trim()&&!thinking?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.12s', flexShrink:0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={input.trim()&&!thinking?'#fff':'#B0BCD0'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <p style={{ fontSize:10, color:'#B0BCD0', textAlign:'center', marginTop:6 }}>Finsyt may produce inaccuracies — always verify with primary sources. Powered by Groq & Perplexity.</p>
        </div>
      </div>

      {showLibrary && (
        <div style={{ width:300, flexShrink:0, background:'#fff', borderLeft:'1px solid #E8EDF4', overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <LibraryPanel onSelect={p => { setInput(p); setShowLibrary(false); inputRef.current?.focus() }} />
        </div>
      )}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  )
}
