'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

interface Message { role:'user'|'assistant'; content:string; sources?:string[]; ts:Date }

const PROMPTS = [
  { label:'Company deep dive',  text:'Give me a deep dive on NVDA including financials, competitive positioning, and key risks' },
  { label:'Earnings analysis',  text:'Analyze the most recent Apple earnings report. What surprised the market?' },
  { label:'Sector comparison',  text:'Compare the margins and growth rates of top 5 cloud companies (MSFT, AMZN, GOOGL, ORCL, CRM)' },
  { label:'10-K risk factors',  text:'What are the key risk factors in Tesla\'s latest 10-K filing?' },
  { label:'Macro outlook',      text:'What is the current Fed policy stance and how does it affect growth stocks?' },
  { label:'Valuation screen',   text:'Find technology companies with P/E under 20 and revenue growth over 15%' },
]

function ResearchInner() {
  const params    = useSearchParams()
  const [msgs, setMsgs]     = useState<Message[]>([])
  const [input, setInput]   = useState(params?.get('q') || '')
  const [loading, setLoading] = useState(false)
  const [model, setModel]   = useState<'fast'|'deep'>('fast')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs])
  useEffect(() => { if(params?.get('q')) handleSend(params.get('q')!) }, [])

  async function handleSend(overrideText?: string) {
    const text = overrideText ?? input
    if (!text.trim() || loading) return
    setInput('')
    const userMsg: Message = { role:'user', content:text, ts:new Date() }
    setMsgs(prev => [...prev, userMsg])
    setLoading(true)
    try {
      const res = await fetch('/api/ai-research', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ query:text, history: msgs.slice(-6), model }),
      })
      const data = await res.json()
      setMsgs(prev => [...prev, { role:'assistant', content:data.answer||data.text||'Sorry, I could not generate a response.', sources:data.sources||[], ts:new Date() }])
    } catch {
      setMsgs(prev => [...prev, { role:'assistant', content:'Connection error. Please try again.', ts:new Date() }])
    }
    setLoading(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 52px)',background:'#F5F7FB'}}>
      {/* Header */}
      <div style={{background:'#fff',borderBottom:'1px solid #E2E8F2',padding:'16px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div>
          <h1 style={{fontSize:'1.125rem',fontWeight:800,color:'#0A1628',letterSpacing:'-0.02em'}}>AI Research</h1>
          <p style={{fontSize:12,color:'#9BAFC8',marginTop:2}}>Powered by Finsyt Intelligence · Grounded in live market data</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:12,color:'#9BAFC8'}}>Mode:</span>
          {(['fast','deep'] as const).map(m => (
            <button key={m} onClick={()=>setModel(m)}
              style={{padding:'5px 12px',borderRadius:6,fontSize:12,fontWeight:600,border:'1.5px solid',cursor:'pointer',
                background:model===m?'#1B4FFF':'#fff',color:model===m?'#fff':'#7D8FA9',borderColor:model===m?'#1B4FFF':'#E2E8F2',transition:'all 0.14s'}}>
              {m==='fast'?'⚡ Fast':'🔍 Deep'}
            </button>
          ))}
          <button onClick={()=>setMsgs([])} className="btn btn-outline btn-sm">Clear</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:'auto',padding:'24px',display:'flex',flexDirection:'column',gap:16}}>
        {msgs.length===0 ? (
          <div style={{maxWidth:680,margin:'0 auto',width:'100%'}}>
            <div style={{textAlign:'center',marginBottom:32}}>
              <div style={{width:56,height:56,borderRadius:16,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,margin:'0 auto 16px'}}>◎</div>
              <h2 style={{fontSize:'1.25rem',fontWeight:800,color:'#0A1628',marginBottom:8}}>What would you like to research?</h2>
              <p style={{fontSize:14,color:'#9BAFC8',lineHeight:1.6}}>Ask about companies, financials, filings, macro trends, or anything in finance. Finsyt grounds answers in live data.</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {PROMPTS.map(p=>(
                <button key={p.label} onClick={()=>handleSend(p.text)}
                  style={{padding:'14px 16px',borderRadius:12,border:'1.5px solid #E2E8F2',background:'#fff',cursor:'pointer',textAlign:'left',transition:'all 0.14s'}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#1B4FFF';(e.currentTarget as HTMLElement).style.background='#F5F8FF'}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#E2E8F2';(e.currentTarget as HTMLElement).style.background='#fff'}}>
                  <div style={{fontSize:12,fontWeight:700,color:'#1C2B4A',marginBottom:4}}>{p.label}</div>
                  <div style={{fontSize:11,color:'#9BAFC8',lineHeight:1.4}}>{p.text.slice(0,80)}…</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m,i) => (
            <div key={i} style={{maxWidth:720,width:'100%',margin:m.role==='user'?'0 0 0 auto':'0 auto 0 0'}}>
              {m.role==='user' ? (
                <div style={{background:'#1B4FFF',borderRadius:'16px 16px 4px 16px',padding:'12px 16px',color:'#fff',fontSize:14,lineHeight:1.6}}>{m.content}</div>
              ) : (
                <div style={{background:'#fff',border:'1px solid #E2E8F2',borderRadius:'4px 16px 16px 16px',padding:'16px 20px'}}>
                  <div style={{fontSize:14,color:'#1C2B4A',lineHeight:1.75,whiteSpace:'pre-wrap'}}>{m.content}</div>
                  {m.sources && m.sources.length > 0 && (
                    <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #F0F4FA'}}>
                      <div style={{fontSize:11,fontWeight:600,color:'#9BAFC8',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Sources</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                        {m.sources.map((s,si)=>(
                          <span key={si} className="badge badge-blue" style={{fontSize:11}}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{fontSize:11,color:'#C0CEDF',marginTop:8}}>{m.ts.toLocaleTimeString()}</div>
                </div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div style={{maxWidth:720,width:'100%'}}>
            <div style={{background:'#fff',border:'1px solid #E2E8F2',borderRadius:'4px 16px 16px 16px',padding:'16px 20px',display:'flex',gap:6,alignItems:'center'}}>
              {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:'#1B4FFF',animation:`bounce 1.2s ${i*0.2}s infinite`}}/>)}
              <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0.7);opacity:0.5}40%{transform:scale(1);opacity:1}}`}</style>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div style={{background:'#fff',borderTop:'1px solid #E2E8F2',padding:'16px 24px',flexShrink:0}}>
        <div style={{maxWidth:720,margin:'0 auto',display:'flex',gap:10,alignItems:'flex-end'}}>
          <textarea
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about any company, filing, metric, or market trend... (Enter to send)"
            rows={2}
            style={{flex:1,resize:'none',background:'#F5F7FB',border:'1.5px solid #E2E8F2',borderRadius:12,padding:'12px 16px',fontSize:14,fontFamily:'inherit',color:'#0A1628',outline:'none',lineHeight:1.5,transition:'border-color 0.14s'}}
            onFocus={e=>{(e.target as HTMLTextAreaElement).style.borderColor='#1B4FFF';(e.target as HTMLTextAreaElement).style.background='#fff'}}
            onBlur={e=>{(e.target as HTMLTextAreaElement).style.borderColor='#E2E8F2';(e.target as HTMLTextAreaElement).style.background='#F5F7FB'}}
          />
          <button onClick={()=>handleSend()} disabled={!input.trim()||loading}
            style={{height:48,padding:'0 20px',borderRadius:12,background:'#1B4FFF',color:'#fff',border:'none',cursor:'pointer',fontSize:14,fontWeight:700,flexShrink:0,opacity:(!input.trim()||loading)?0.5:1,transition:'all 0.14s'}}>
            {loading ? '...' : 'Send ↑'}
          </button>
        </div>
        <div style={{maxWidth:720,margin:'8px auto 0',fontSize:11,color:'#C0CEDF',textAlign:'center'}}>
          Finsyt AI can make mistakes. Verify important financial data before acting.
        </div>
      </div>
    </div>
  )
}

export default function ResearchPage() {
  return <Suspense fallback={<div style={{padding:32,color:'#9BAFC8'}}>Loading...</div>}><ResearchInner/></Suspense>
}
