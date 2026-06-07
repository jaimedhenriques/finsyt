'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Card, Badge, EmptyState, ContextualAskBar, InlineAgentMenu } from '@/components/ui'

interface Article { title:string; source:string; publishedAt:string; url:string; summary?:string; tickers?:string[]; theme?:string }

const CATEGORIES = ['All','Markets','Economy','Technology','Healthcare','Energy','Earnings']

export default function NewsPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading]   = useState(true)
  const [cat, setCat]           = useState('All')
  const [activeTheme, setActiveTheme] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/news?limit=30')
      .then(r => r.json())
      .then(n => { if (Array.isArray(n.articles)) setArticles(n.articles) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const displayNews = articles

  // Compute trending themes from current articles
  const trendingThemes = useMemo(() => {
    const counts = new Map<string, number>()
    displayNews.forEach(a => { if (a.theme) counts.set(a.theme, (counts.get(a.theme) || 0) + 1) })
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8)
  }, [displayNews])

  const trendingTickers = useMemo(() => {
    const counts = new Map<string, number>()
    displayNews.forEach(a => a.tickers?.forEach(t => counts.set(t, (counts.get(t) || 0) + 1)))
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7)
  }, [displayNews])

  const filtered = useMemo(() => displayNews.filter(a => {
    if (activeTheme && a.theme !== activeTheme) return false
    if (cat === 'All') return true
    return (a.title + ' ' + (a.summary || '') + ' ' + (a.theme || '')).toLowerCase().includes(cat.toLowerCase())
  }), [displayNews, cat, activeTheme])

  return (
    <div style={{padding:'1.5rem 1.75rem',maxWidth:1500,margin:'0 auto'}}>
      <div style={{marginBottom:18,display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 className="page-title">News & Signals</h1>
          <p style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>Live market news with trending themes across your watchlist universe</p>
        </div>
        <Link href="/app/calendar" className="btn btn-outline btn-sm">Open Earnings Calendar →</Link>
      </div>

      <ContextualAskBar
        context="News & Signals"
        contextData={{ page: 'news', category: cat, theme: activeTheme }}
        chips={[
          { label: 'Top market-movers',  prompt: "What are today's top market-moving stories ranked by potential P&L impact on a diversified portfolio?" },
          { label: 'Sentiment by sector',prompt: 'Score today\'s news sentiment by sector and tell me which sectors are net positive vs negative.' },
          { label: 'Cluster headlines',  prompt: 'Cluster the last 24 hours of headlines into themes and summarise each cluster in one sentence.' },
          { label: 'What to ignore',     prompt: 'Tell me which stories today are noise versus genuinely actionable for institutional investors.' },
        ]}
        placeholder="Ask Finsyt about today's news…"
        style={{ margin: '0 0 16px' }}
      />

      {/* Category chips */}
      <div style={{display:'flex',gap:6,marginBottom:18,flexWrap:'wrap'}}>
        {CATEGORIES.map(c=>(
          <button key={c} onClick={()=>setCat(c)} style={chip(cat===c)}>{c}</button>
        ))}
        {activeTheme && (
          <button onClick={()=>setActiveTheme(null)} style={{...chip(true),background:'var(--neg-dim)',color:'var(--neg)',borderColor:'var(--neg-dim)'}}>
            Theme: {activeTheme} ✕
          </button>
        )}
      </div>

      {/* 2-column: feed + trending rail */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:18,alignItems:'start'}}>
        {/* Feed */}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {loading ? (
            <Card>
              <EmptyState title="Loading news…" hint="Pulling the latest stories from connected providers." />
            </Card>
          ) : displayNews.length === 0 ? (
            <Card>
              <EmptyState title="No live news available." hint="The news provider returned no stories. Check connected sources in Settings → Data." />
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <EmptyState title="No stories match these filters." hint="Try clearing the category or theme filter." />
            </Card>
          ) : filtered.map((a,i)=>(
            <Card key={i} padding="16px 18px">
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,fontSize:11,color:'var(--text-secondary)'}}>
                <span style={{fontWeight:700,color:'var(--text-primary)'}}>{a.source}</span>
                <span>·</span>
                <span>{a.publishedAt}</span>
                {a.theme && (
                  <>
                    <span>·</span>
                    <button onClick={()=>setActiveTheme(a.theme!)} style={{background:'var(--accent-dim)',border:'none',color:'var(--accent-text)',fontWeight:700,fontSize:11,padding:'2px 8px',borderRadius:6,cursor:'pointer'}}>
                      {a.theme}
                    </button>
                  </>
                )}
              </div>
              <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:a.summary?6:8}}>
                <a href={a.url||'#'} target="_blank" rel="noreferrer"
                  style={{flex:1,fontSize:15,fontWeight:700,color:'var(--text-primary)',textDecoration:'none',lineHeight:1.45}}>
                  {a.title}
                </a>
                <InlineAgentMenu
                  subject={a.title.slice(0, 60)}
                  variant="icon"
                  align="right"
                  contextData={{ page:'news', headline:a.title, source:a.source, theme:a.theme, tickers:a.tickers, publishedAt:a.publishedAt, url:a.url }}
                  actions={[
                    { label:'Summarise this story',          prompt:`Summarise this headline and tell me what it means for any ticker in my watchlist: "${a.title}" (${a.source}).` },
                    { label:'Why does this matter to me?',   prompt:`Given this headline — "${a.title}" — explain why it matters to my watchlist + portfolio and which positions are most exposed.` },
                    { label:'Pull related coverage',         prompt:`Pull the latest 5 related stories and analyst notes that build on this headline: "${a.title}".` },
                    { label:'Quantify the impact',           prompt:`Quantify the likely revenue/EPS/multiple impact of this story for the affected names: "${a.title}".` },
                  ]}
                />
              </div>
              {a.summary && <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.55,margin:'0 0 10px'}}>{a.summary}</p>}
              {a.tickers && a.tickers.length>0 && (
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {a.tickers.map(t=>(
                    <Link key={t} href={`/app/company/${t}`} style={{textDecoration:'none'}}>
                      <Badge tone="blue">{t}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Trending themes rail */}
        <aside style={{display:'flex',flexDirection:'column',gap:14,position:'sticky',top:16}}>
          <Card padding={0} style={{overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontSize:13,fontWeight:700,color:'var(--text-primary)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span>🔥 Trending Themes</span>
              <span style={{fontSize:11,fontWeight:500,color:'var(--text-secondary)'}}>last 24h</span>
            </div>
            {trendingThemes.length === 0 ? (
              <div style={{padding:16,fontSize:12,color:'var(--text-secondary)'}}>No themes yet.</div>
            ) : trendingThemes.map(([theme,count],i)=>{
              const isActive = activeTheme === theme
              return (
                <button key={theme} onClick={()=>setActiveTheme(isActive?null:theme)}
                  style={{
                    display:'flex',alignItems:'center',gap:12,padding:'10px 16px',width:'100%',
                    borderBottom:'1px solid var(--border)',cursor:'pointer',
                    background:isActive?'var(--accent-dim)':'transparent',
                    color:'var(--text-primary)',border:'none',fontFamily:'inherit',textAlign:'left'
                  }}>
                  <span style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',width:18}}>#{i+1}</span>
                  <span style={{fontSize:13,fontWeight:700,flex:1}}>{theme}</span>
                  <span style={{fontSize:11,fontWeight:700,color:'var(--accent-text)'}}>{count} stor{count===1?'y':'ies'}</span>
                </button>
              )
            })}
          </Card>

          <Card padding={0} style={{overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>Trending Tickers</div>
            {trendingTickers.length === 0 ? (
              <div style={{padding:16,fontSize:12,color:'var(--text-secondary)'}}>No tickers yet.</div>
            ) : trendingTickers.map(([sym,count],i)=>(
              <Link key={sym} href={`/app/company/${sym}`}
                style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom:'1px solid var(--border)',textDecoration:'none',color:'var(--text-primary)'}}>
                <span style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',width:18}}>#{i+1}</span>
                <span style={{fontSize:13,fontWeight:700,flex:1}}>{sym}</span>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>{count} mention{count===1?'':'s'}</span>
              </Link>
            ))}
          </Card>

          <Card padding={16}>
            <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:8}}>AI Research</div>
            <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12,lineHeight:1.55}}>Ask Finsyt AI to analyze a theme or news story in depth.</p>
            <Link href="/app/research" className="btn btn-primary btn-sm" style={{display:'block',textAlign:'center'}}>Open AI Research →</Link>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function chip(active:boolean): React.CSSProperties {
  return {
    padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',
    border:'1.5px solid',transition:'all 0.12s',
    background: active ? 'var(--accent)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text-secondary)',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    fontFamily: 'inherit'
  }
}
