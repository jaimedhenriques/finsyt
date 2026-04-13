'use client'
import { useEffect, useState } from 'react'

const TOPICS = [
  {id:'financial_markets',label:'Markets'},{id:'earnings',label:'Earnings'},
  {id:'mergers_and_acquisitions',label:'M&A'},{id:'ipo',label:'IPO'},
  {id:'technology',label:'Technology'},{id:'economy_macro',label:'Macro'},
]

export default function NewsPage() {
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState('financial_markets')
  const [symFilter, setSymFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = symFilter ? `symbol=${symFilter}&limit=20` : `topics=${topic}&limit=20`
    fetch('/api/news?'+params).then(r=>r.json()).then(d=>{setArticles(d.articles||[]);setLoading(false)}).catch(()=>setLoading(false))
  }, [topic, symFilter])

  const sc = (s:string) => !s?'#7D8FA9':s.includes('Bullish')?'#059669':s.includes('Bearish')?'#DC2626':'#D97706'
  const sb = (s:string) => !s?'badge-gray':s.includes('Bullish')?'badge-green':s.includes('Bearish')?'badge-red':'badge-amber'

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="page-title">News & Signals</h1><p className="text-sm mt-0.5" style={{color:'#7D8FA9'}}>Real-time news with AI sentiment</p></div>
      </div>
      <div className="card p-4 mb-5" style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <div className="tab-bar" style={{borderBottom:'none',marginBottom:0}}>
          {TOPICS.map(t=><button key={t.id} className={`tab-btn ${topic===t.id&&!symFilter?'active':''}`} onClick={()=>{setTopic(t.id);setSymFilter('')}}>{t.label}</button>)}
        </div>
        <input className="input" style={{width:160,height:36,marginLeft:'auto'}} placeholder="Filter by ticker..." value={symFilter} onChange={e=>setSymFilter(e.target.value.toUpperCase())} />
      </div>
      {loading ? (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:16}}>
          {[...Array(6)].map((_,i)=><div key={i} className="card" style={{padding:20}}><div className="skeleton" style={{height:14,width:'75%',marginBottom:12}} /><div className="skeleton" style={{height:12,width:'100%',marginBottom:8}} /><div className="skeleton" style={{height:12,width:'60%'}} /></div>)}
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:16}}>
          {articles.map((n,i)=>(
            <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="card" style={{display:'block',padding:20,textDecoration:'none',transition:'box-shadow 0.14s'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
                    <span style={{fontWeight:700,fontSize:12,color:'#1B4FFF'}}>{n.source}</span>
                    <span className={`badge ${sb(n.sentiment)}`}>{n.sentiment?.replace(/_/g,' ')}</span>
                    {n.tickers?.slice(0,3).map((t:string)=><span key={t} className="badge badge-gray">{t}</span>)}
                  </div>
                  <h3 style={{fontWeight:600,fontSize:13,color:'#0A1628',marginBottom:8,lineHeight:1.4}}>{n.title}</h3>
                  <p style={{fontSize:12,color:'#7D8FA9',lineHeight:1.5}}>{n.summary?.slice(0,140)}...</p>
                </div>
                {n.banner && <img src={n.banner} alt="" style={{width:72,height:52,borderRadius:8,objectFit:'cover',flexShrink:0}} onError={e=>(e.currentTarget.style.display='none')} />}
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12,paddingTop:12,borderTop:'1px solid #F0F4FA'}}>
                <span style={{fontSize:11,color:'#B0BCD0'}}>{n.publishedAt?.slice(0,10)}</span>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:sc(n.sentiment)}} />
                  <span style={{fontSize:11,fontWeight:600,color:sc(n.sentiment)}}>Score: {n.sentimentScore?.toFixed(2)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
