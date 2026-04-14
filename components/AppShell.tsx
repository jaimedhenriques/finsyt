'use client'
import NPSWidget from '@/components/NPSWidget'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

type SearchResult = {
  symbol: string
  name: string
  exchange?: string
}

type NavItem = {
  href: string
  label: string
  icon: string
  exact?: boolean
  badge?: string
  pro?: boolean
}

const NAV = [
  { section: null, items: [
    { href: '/app', label: 'Overview', icon: '⊞', exact: true },
    { href: '/app/watchlist', label: 'Watchlist', icon: '◈' },
    { href: '/app/alerts', label: 'Alerts', icon: '◉', badge: '3' },
  ]},
  { section: 'Research', items: [
    { href: '/app/research', label: 'AI Research', icon: '◎' },
    { href: '/app/workspaces', label: 'Workspaces', icon: '◫' },
    { href: '/app/screener', label: 'Screener', icon: '▤' },
    { href: '/app/news', label: 'News & Signals', icon: '◻' },
    { href: '/app/filings', label: 'Filings', icon: '▣' },
  ]},
  { section: 'Data', items: [
    { href: '/app/markets', label: 'Markets', icon: '◲' },
    { href: '/app/deals', label: 'Deals & M&A', icon: '◳' },
    { href: '/app/macro', label: 'Macro', icon: '◷' },
    { href: '/app/discovery', label: 'Private Co.', icon: '◎', pro: true },
  ]},
  { section: 'Platform', items: [
    { href: '/app/developer', label: 'API Docs', icon: '◧' },
    { href: '/app/mcp', label: 'MCP Tools', icon: '⬡' },
    { href: '/app/docs', label: 'Docs', icon: '◨' },
  ]},
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [search, setSearch]             = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [sidebarOpen, setSidebarOpen]   = useState(true)

  if (pathname?.startsWith('/app/auth')) {
    return <>{children}</>
  }

  async function handleSearch(val: string) {
    setSearch(val)
    if (val.length < 2) { setSearchResults([]); return }
    try {
      const res  = await fetch('/api/search?q=' + encodeURIComponent(val))
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch {}
  }

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'#080E1A',fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif"}}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: sidebarOpen ? 224 : 56, minWidth: sidebarOpen ? 224 : 56,
        background:'#0A1220', borderRight:'1px solid rgba(255,255,255,0.06)',
        display:'flex', flexDirection:'column',
        transition:'width 0.2s ease, min-width 0.2s ease', overflow:'hidden',
      }}>
        {/* Logo row */}
        <div style={{padding:'1rem 0.875rem',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
          <Link href="/" style={{display:'flex',alignItems:'center',gap:8,textDecoration:'none',flexShrink:0}}>
            <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#fff',fontSize:12,flexShrink:0}}>F</div>
            {sidebarOpen && <span style={{fontWeight:800,fontSize:'0.9375rem',letterSpacing:'-0.02em',color:'#fff',whiteSpace:'nowrap'}}>Finsyt</span>}
          </Link>
          {sidebarOpen && <span style={{marginLeft:'auto',fontSize:10,padding:'2px 6px',borderRadius:6,fontWeight:700,background:'rgba(27,79,255,0.25)',color:'#93B4FF',whiteSpace:'nowrap'}}>Beta</span>}
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{marginLeft: sidebarOpen ? 0 : 'auto',background:'none',border:'none',cursor:'pointer',color:'#4A5568',padding:4,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:6,flexShrink:0}}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              {sidebarOpen ? <path d="M9 2L4 7l5 5"/> : <path d="M5 2l5 5-5 5"/>}
            </svg>
          </button>
        </div>

        {/* Nav */}
        <div style={{flex:1,overflowY:'auto',padding:'0.625rem 0.5rem'}}>
          {NAV.map((group, gi) => (
            <div key={gi} style={{marginBottom:'0.125rem'}}>
              {group.section && sidebarOpen && (
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',color:'#3D5270',textTransform:'uppercase',padding:'0.625rem 0.5rem 0.25rem'}}>
                  {group.section}
                </div>
              )}
              {!sidebarOpen && gi > 0 && <div style={{height:1,background:'rgba(255,255,255,0.05)',margin:'0.5rem 0'}}/>}
              {group.items.map((item: NavItem) => {
                const active = item.exact ? pathname===item.href : pathname===item.href||pathname.startsWith(item.href+'/')
                return (
                  <Link key={item.href} href={item.href} title={!sidebarOpen ? item.label : undefined}
                    style={{
                      display:'flex',alignItems:'center',gap:10,padding:'7px 10px',borderRadius:8,
                      textDecoration:'none',marginBottom:2,
                      background: active ? 'rgba(27,79,255,0.18)' : 'transparent',
                      color: active ? '#7EB3FF' : '#7A8EAE',
                      transition:'background 0.15s,color 0.15s',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.05)' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background='transparent' }}>
                    <span style={{fontSize:'0.875rem',width:18,textAlign:'center',flexShrink:0}}>{item.icon}</span>
                    {sidebarOpen && <>
                      <span style={{fontSize:13,fontWeight:active?600:500,whiteSpace:'nowrap'}}>{item.label}</span>
                      {item.badge && <span style={{marginLeft:'auto',fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:999,background:'#1B4FFF',color:'#fff'}}>{item.badge}</span>}
                      {item.pro && <span style={{marginLeft:'auto',fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:4,background:'rgba(245,158,11,0.2)',color:'#F59E0B',letterSpacing:'0.05em'}}>PRO</span>}
                    </>}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div style={{padding:'0.75rem 0.5rem',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
          {sidebarOpen && (
            <Link href="/app/upgrade" style={{
              display:'block',padding:'10px 12px',borderRadius:10,
              background:'linear-gradient(135deg,rgba(27,79,255,0.18),rgba(6,182,212,0.12))',
              border:'1px solid rgba(27,79,255,0.28)',textDecoration:'none',marginBottom:8,
            }}>
              <div style={{fontSize:11,fontWeight:700,color:'#93B4FF',marginBottom:2}}>✦ Upgrade to Pro</div>
              <div style={{fontSize:11,color:'#4A6280'}}>Unlock unlimited queries</div>
            </Link>
          )}
          <Link href="/app/settings"
            style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',borderRadius:8,textDecoration:'none',
              background:pathname==='/app/settings'?'rgba(27,79,255,0.18)':'transparent',
              color:pathname==='/app/settings'?'#7EB3FF':'#7A8EAE'}}
            title={!sidebarOpen ? 'Settings' : undefined}>
            <span style={{fontSize:'0.875rem',flexShrink:0}}>⚙</span>
            {sidebarOpen && <span style={{fontSize:13,fontWeight:500}}>Settings</span>}
          </Link>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

        {/* Topbar — white */}
        <div style={{
          height:52,minHeight:52,
          background:'#ffffff',
          borderBottom:'1px solid #E2E8F2',
          display:'flex',alignItems:'center',
          padding:'0 1.5rem',gap:12,
          zIndex:30,
        }}>
          {/* Search */}
          <div style={{position:'relative',flex:1,maxWidth:480}}>
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#9BAFC8',fontSize:15}}>⌕</span>
            <input
              placeholder="Search ticker, company... (⌘K)"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              onBlur={() => setTimeout(() => setSearchResults([]), 200)}
              style={{
                width:'100%',background:'#F5F7FB',border:'1.5px solid #E2E8F2',
                borderRadius:10,height:36,paddingLeft:'2.25rem',paddingRight:12,
                fontSize:13,color:'#1C2B4A',fontFamily:'inherit',outline:'none',
                boxSizing:'border-box',transition:'border-color 0.14s',
              }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor='#1B4FFF'; (e.target as HTMLInputElement).style.background='#fff' }}
              onBlurCapture={e => { (e.target as HTMLInputElement).style.borderColor='#E2E8F2'; (e.target as HTMLInputElement).style.background='#F5F7FB' }}
            />
            {searchResults.length > 0 && (
              <div style={{position:'absolute',top:'100%',marginTop:4,left:0,right:0,background:'#fff',borderRadius:12,boxShadow:'0 8px 40px rgba(0,0,0,0.12)',border:'1px solid #E2E8F2',zIndex:50,overflow:'hidden'}}>
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => { router.push('/app/company/'+r.symbol); setSearch(''); setSearchResults([]) }}
                    style={{width:'100%',textAlign:'left',padding:'10px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:i<searchResults.length-1?'1px solid #F0F4FA':'none',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#F8FAFD'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                    <span style={{fontWeight:700,fontSize:13,color:'#1B4FFF',width:64,flexShrink:0}}>{r.symbol}</span>
                    <span style={{fontSize:13,color:'#4A5568',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span>
                    <span style={{marginLeft:'auto',fontSize:11,color:'#9BAFC8',background:'#F5F7FB',padding:'2px 8px',borderRadius:6,flexShrink:0}}>{r.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right actions */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'}}>
            {/* Market status pill */}
            <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:20,background:'#ECFDF5',border:'1px solid #D1FAE5'}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:'#059669',boxShadow:'0 0 6px rgba(5,150,105,0.5)'}}/>
              <span style={{fontSize:11,fontWeight:600,color:'#059669'}}>Markets Open</span>
            </div>
            {/* Notifications */}
            <button style={{background:'none',border:'none',cursor:'pointer',padding:'6px',borderRadius:8,color:'#7D8FA9',position:'relative'}}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#F5F7FB'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='none'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span style={{position:'absolute',top:4,right:4,width:7,height:7,borderRadius:'50%',background:'#1B4FFF',border:'1.5px solid #fff'}}/>
            </button>
            {/* Avatar */}
            <div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0}}>J</div>
          </div>
        </div>

        <NPSWidget minSessionSeconds={120} />

        {/* Page content — WHITE background */}
        <div style={{flex:1,overflowY:'auto',background:'#F5F7FB'}}>
          {children}
        </div>
      </div>
    </div>
  )
}
