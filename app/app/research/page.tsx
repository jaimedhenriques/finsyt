'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const SUGGESTED = [
  "What's driving NVDA's margin expansion vs AMD?",
  "Summarise AAPL Q1 2025 earnings vs consensus",
  "Bull vs bear case for META in 2025",
  "Compare MSFT and GOOGL cloud growth trajectories",
  "Key risks for LLY given GLP-1 competition",
  "What does JPM NII guidance imply for 2025?",
]

interface Msg { role: 'user'|'ai'; content: string; sources?: any[]; model?: string }

function ResearchInner() {
  const sp = useSearchParams()
  const [symbol, setSymbol] = useState(sp.get('symbol')||'')
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  async function submit(q?: string) {
    const fq = q || query
    if (!fq.trim() || loading) return
    setQuery('')
    setMessages(prev => [...prev, { role:'user', content:fq }])
    setLoading(true)
    try {
      const res = await fetch('/api/ai-research', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ query:fq, symbol:symbol||undefined }) })
      const d = await res.json()
      setMessages(prev => [...prev, { role:'ai', content:d.answer||'No response', sources:d.sources, model:d.model }])
    } catch {
      setMessages(prev => [...prev, { role:'ai', content:'Failed to get response. Please try again.' }])
    }
    setLoading(false)
  }

  function renderContent(content: string) {
    return content.split('\n').map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      if (line.startsWith('- ')) return <li key={i} style={{fontSize:13,color:'#3D4F6E',marginLeft:16,marginBottom:4}} dangerouslySetInnerHTML={{__html:bold.slice(2)}} />
      if (!line.trim()) return <div key={i} style={{marginBottom:8}} />
      return <p key={i} style={{fontSize:13,color:'#3D4F6E',marginBottom:6,lineHeight:1.6}} dangerouslySetInnerHTML={{__html:bold}} />
    })
  }

  return (
    <div className="page-content" style={{minHeight:'calc(100vh - 60px)',display:'flex',flexDirection:'column'}}>
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="page-title">AI Research Engine</h1><p className="text-sm mt-0.5" style={{color:'#7D8FA9'}}>Multi-source analysis with cited reasoning</p></div>
      </div>

      <div className="card p-4 mb-5" style={{display:'flex',alignItems:'center',gap:16}}>
        <span style={{fontSize:13,fontWeight:600,color:'#3D4F6E',flexShrink:0}}>Focus on ticker:</span>
        <input className="input" style={{maxWidth:160,height:36,textTransform:'uppercase'}} placeholder="e.g. NVDA" value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} />
        {symbol && <span className="badge badge-blue">{symbol} context active</span>}
        <span style={{marginLeft:'auto',fontSize:11,color:'#B0BCD0'}}>Leave blank for general research</span>
      </div>

      <div style={{flex:1,display:'flex',flexDirection:'column'}}>
        {messages.length===0 ? (
          <div>
            <div style={{textAlign:'center',padding:'2.5rem 0 1.5rem'}}>
              <div style={{width:56,height:56,borderRadius:16,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1rem',color:'#fff',fontWeight:900,fontSize:18}}>AI</div>
              <h2 style={{fontWeight:700,fontSize:'1.125rem',color:'#0A1628',marginBottom:8}}>Finsyt Research Engine</h2>
              <p style={{fontSize:13,color:'#7D8FA9'}}>Ask anything about companies, markets, deals, or macro</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12,marginBottom:24}}>
              {SUGGESTED.map((s,i) => (
                <button key={i} onClick={()=>submit(s)} className="card" style={{padding:16,textAlign:'left',cursor:'pointer',border:'1.5px solid #E2E8F2',background:'#fff',fontFamily:'inherit',borderRadius:12}}>
                  <p style={{fontSize:12,color:'#3D4F6E',lineHeight:1.5,margin:0}}>{s}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:16,marginBottom:16}}>
            {messages.map((msg,i) => (
              <div key={i} style={{display:'flex',gap:12,justifyContent:msg.role==='user'?'flex-end':'flex-start'}}>
                {msg.role==='ai' && <div style={{width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:900,fontSize:11,flexShrink:0,marginTop:2}}>AI</div>}
                <div style={{borderRadius:msg.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',padding:16,maxWidth:640,background:msg.role==='user'?'#1B4FFF':'#fff',border:msg.role==='ai'?'1.5px solid #E2E8F2':'none'}}>
                  {msg.role==='user' ? <p style={{fontSize:13,color:'#fff',fontWeight:500,margin:0}}>{msg.content}</p> : (
                    <div>
                      <ul style={{listStyle:'none',padding:0,margin:0}}>{renderContent(msg.content)}</ul>
                      {msg.sources?.length && <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12,paddingTop:12,borderTop:'1px solid #E2E8F2'}}>
                        <span style={{fontSize:12,fontWeight:600,color:'#7D8FA9'}}>Sources:</span>
                        {msg.sources.map((s,si)=><span key={si} className="badge badge-blue">{s.label}</span>)}
                      </div>}
                      {msg.model && <div style={{fontSize:11,color:'#B0BCD0',marginTop:8}}>Model: {msg.model}</div>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{display:'flex',gap:12}}>
                <div style={{width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:900,fontSize:11,flexShrink:0}}>AI</div>
                <div className="card" style={{padding:16}}>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:'#1B4FFF',animation:'bounce 1s infinite',animationDelay:`${i*0.15}s`}} />)}
                    <span style={{fontSize:12,color:'#7D8FA9',marginLeft:8}}>Analysing across sources...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="card" style={{padding:12,marginTop:16,position:'sticky',bottom:0,background:'#fff'}}>
        <div style={{display:'flex',gap:12}}>
          <textarea className="input" style={{flex:1,resize:'none',height:72}} rows={2}
            placeholder="Ask anything — 'What's driving NVDA margins?' or 'Compare AAPL vs MSFT growth'"
            value={query} onChange={e=>setQuery(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}}} />
          <button onClick={()=>submit()} disabled={!query.trim()||loading} className="btn btn-primary" style={{alignSelf:'flex-end',opacity:(!query.trim()||loading)?0.5:1}}>Ask →</button>
        </div>
        <p style={{fontSize:11,color:'#B0BCD0',marginTop:8}}>Powered by Alpha Vantage · SEC EDGAR · News Sentiment · Press Enter to send</p>
      </div>
    </div>
  )
}

export default function ResearchPage() {
  return <Suspense fallback={<div className="page-content">Loading...</div>}><ResearchInner /></Suspense>
}
