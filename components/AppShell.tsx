'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { section: null, items: [
    { href: '/app', label: 'Overview', icon: '⊞' },
    { href: '/app/watchlist', label: 'Watchlist', icon: '◈' },
    { href: '/app/alerts', label: 'Alerts', icon: '◉', badge: '3' },
  ]},
  { section: 'Research', items: [
    { href: '/app/research', label: 'AI Research', icon: '◎' },
    { href: '/app/screener', label: 'Screener', icon: '▤' },
    { href: '/app/news', label: 'News & Signals', icon: '◻' },
    { href: '/app/filings', label: 'Filings', icon: '▣' },
  ]},
  { section: 'Data', items: [
    { href: '/app/markets', label: 'Markets', icon: '◲' },
    { href: '/app/deals', label: 'Deals & M&A', icon: '◳' },
    { href: '/app/macro', label: 'Macro', icon: '◷' },
  ]},
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  async function handleSearch(val: string) {
    setSearch(val)
    if (val.length < 2) { setSearchResults([]); return }
    try {
      const res = await fetch('/api/search?q=' + encodeURIComponent(val))
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch {}
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div style={{padding:'1.25rem 1rem'}}>
          <Link href="/" style={{display:'flex',alignItems:'center',gap:'0.625rem',marginBottom:'2rem',textDecoration:'none'}}>
            <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#fff',fontSize:12}}>F</div>
            <span style={{fontWeight:800,fontSize:'0.9375rem',letterSpacing:'-0.02em',color:'#fff'}}>Finsyt</span>
            <span style={{marginLeft:'auto',fontSize:11,padding:'2px 6px',borderRadius:6,fontWeight:700,background:'rgba(27,79,255,0.3)',color:'#93B4FF'}}>Beta</span>
          </Link>

          {NAV.map((group, gi) => (
            <div key={gi}>
              {group.section && <div className="nav-section">{group.section}</div>}
              {group.items.map((item: any) => {
                const active = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href))
                return (
                  <Link key={item.href} href={item.href} className={'nav-item' + (active ? ' active' : '')} style={{textDecoration:'none'}}>
                    <span style={{fontSize:'0.875rem',opacity:0.7}}>{item.icon}</span>
                    <span>{item.label}</span>
                    {item.badge && <span style={{marginLeft:'auto',fontSize:11,fontWeight:700,padding:'1px 6px',borderRadius:999,background:'#1B4FFF',color:'#fff'}}>{item.badge}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>

        <div style={{marginTop:'auto',padding:'1rem',borderTop:'1px solid rgba(255,255,255,0.07)'}}>
          <Link href="/app/settings" className={'nav-item' + (pathname==='/app/settings'?' active':'')} style={{textDecoration:'none'}}>
            <span style={{fontSize:'0.875rem'}}>⚙</span><span>Settings</span>
          </Link>
        </div>
      </aside>

      <div className="main-area">
        <div className="topbar">
          <div style={{position:'relative',flex:1,maxWidth:440}}>
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#B0BCD0',fontSize:14}}>⌕</span>
            <input className="input" placeholder="Search ticker, company..." value={search}
              onChange={e => handleSearch(e.target.value)}
              onBlur={() => setTimeout(() => setSearchResults([]), 200)}
              style={{background:'#F5F7FB',border:'1.5px solid #E2E8F2',height:38,paddingLeft:'2.25rem',fontSize:14}} />
            {searchResults.length > 0 && (
              <div style={{position:'absolute',top:'100%',marginTop:4,left:0,right:0,background:'#fff',borderRadius:12,boxShadow:'0 8px 40px rgba(0,0,0,0.12)',border:'1.5px solid #E2E8F2',zIndex:50,overflow:'hidden'}}>
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => { router.push('/app/company/'+r.symbol); setSearch(''); setSearchResults([]) }}
                    style={{width:'100%',textAlign:'left',padding:'10px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:i<searchResults.length-1?'1px solid #F0F4FA':'none',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>
                    <span style={{fontWeight:700,fontSize:13,color:'#1B4FFF',width:64,flexShrink:0}}>{r.symbol}</span>
                    <span style={{fontSize:13,color:'#1C2B4A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span>
                    <span style={{marginLeft:'auto',fontSize:12,color:'#B0BCD0',flexShrink:0}}>{r.region}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'}}>
            <span style={{fontSize:13,fontWeight:500,color:'#7D8FA9'}}>Live</span>
            <div style={{width:8,height:8,borderRadius:'50%',background:'#059669'}} />
            <div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700,marginLeft:8}}>J</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
