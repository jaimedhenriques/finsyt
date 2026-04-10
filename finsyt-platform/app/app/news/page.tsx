'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { t } from '@/lib/i18n/translations'

// ── News sections — Capital IQ style ─────────────────────────────────────────
const ALL_SECTIONS = [
  'Top News','Business','Markets','Technology','Government','Private Markets',
  'Financing Activities','Operations & Strategy','Mergers & Acquisitions',
  'Sustainability','Financials','Banking','Insurance','Real Estate',
  'Energy & Utilities','Materials, Metals & Mining','Media & Telecom',
  'Consumer','Health Care','Industrials',
]
const DEFAULT_SELECTED = ['Top News','Business','Markets','Technology','Government','Private Markets']

// ── Market movers ─────────────────────────────────────────────────────────────
const MOVERS = {
  mostActive: [
    { name:'NVIDIA Corporation',   ticker:'NASDAQGS:NVDA', price:188.74, chg:2.57 },
    { name:'Palantir Technologies',ticker:'NASDAQGS:PLTR', price:128.11, chg:-1.86 },
    { name:'Intel Corporation',    ticker:'NASDAQGS:INTC', price:62.38,  chg:1.07 },
    { name:'ServiceNow, Inc.',     ticker:'NYSE:NOW',       price:83.00,  chg:-7.58 },
    { name:'Amazon.com, Inc.',     ticker:'NASDAQGS:AMZN', price:238.38, chg:2.02 },
  ],
  topGainers: [
    { name:'Tesla, Inc.',          ticker:'NASDAQGS:TSLA', price:285.42, chg:8.34 },
    { name:'Broadcom Inc.',        ticker:'NASDAQGS:AVGO', price:224.15, chg:5.61 },
    { name:'Meta Platforms, Inc.', ticker:'NASDAQGS:META', price:621.80, chg:4.28 },
    { name:'Alphabet Inc.',        ticker:'NASDAQGS:GOOGL',price:198.40, chg:3.74 },
    { name:'Microsoft Corp.',      ticker:'NASDAQGS:MSFT', price:442.60, chg:2.91 },
  ],
  topLosers: [
    { name:'ServiceNow, Inc.',     ticker:'NYSE:NOW',       price:83.00,  chg:-7.58 },
    { name:'Pfizer Inc.',          ticker:'NYSE:PFE',       price:24.12,  chg:-4.33 },
    { name:'Boeing Company',       ticker:'NYSE:BA',        price:172.50, chg:-3.21 },
    { name:'Moderna, Inc.',        ticker:'NASDAQGS:MRNA',  price:41.88,  chg:-2.97 },
    { name:'Walt Disney Co.',      ticker:'NYSE:DIS',       price:98.42,  chg:-2.14 },
  ],
}

// ── S&P 500 sectors ───────────────────────────────────────────────────────────
const SECTORS = [
  { name:'Information Technology',    chg:0.76 },
  { name:'Materials',                  chg:0.64 },
  { name:'Consumer Discretionary',    chg:0.55 },
  { name:'Real Estate',               chg:0.17 },
  { name:'Communication Services',    chg:-0.28 },
  { name:'Industrials',               chg:-0.43 },
  { name:'Utilities',                  chg:-0.44 },
  { name:'Energy',                     chg:-0.80 },
  { name:'Financials',                chg:-1.06 },
  { name:'Health Care',               chg:-1.33 },
  { name:'Consumer Staples',          chg:-1.43 },
]

// ── Indices ───────────────────────────────────────────────────────────────────
const INDICES = {
  us: [
    { name:'Dow Jones',  val:47916.57, chg:-0.56 },
    { name:'NASDAQ',     val:22902.89, chg:0.35 },
    { name:'S&P 500',   val:6816.89,  chg:-0.11 },
  ],
  europe: [
    { name:'FTSE 100',  val:8204.60,  chg:0.14 },
    { name:'DAX',       val:18821.40, chg:0.62 },
    { name:'CAC 40',    val:8142.20,  chg:-0.08 },
  ],
  asia: [
    { name:'Nikkei 225',val:38441.54, chg:1.02 },
    { name:'Hang Seng', val:23218.00, chg:-0.33 },
    { name:'CSI 300',   val:3891.40,  chg:0.41 },
  ],
}

// ── Static news items ─────────────────────────────────────────────────────────
const NEWS_ITEMS: Record<string, { headline:string; body:string; src:string; mins:number; img?:string }[]> = {
  'Top News': [
    { headline:'Inflation Soared to 3.3% in March, Driven by Higher Gasoline Costs — 8th Update', body:'US consumer prices accelerated in March, complicating the Federal Reserve\'s path toward rate cuts. Core CPI remained sticky at 3.1% YoY, with shelter costs contributing the most to the monthly increase.', src:'Bloomberg', mins:540 },
    { headline:'Consumer Sentiment Hits Record Low, Michigan Survey Shows — Update', body:'The University of Michigan\'s preliminary consumer sentiment index fell to 50.8 in April, the lowest reading since 2022, driven by tariff uncertainty and equity market volatility.', src:'Reuters', mins:300 },
    { headline:'U.S. Stocks Roared Back This Week, Buoyed by a Middle East Cease-Fire', body:'The S&P 500 rose 5.7% over five sessions after geopolitical risk premium unwound sharply. Tech led with NVIDIA up 14% on the week following strong Blackwell demand commentary from analysts.', src:'WSJ', mins:180 },
    { headline:'Fed Officials Signal Patience Amid Tariff Uncertainty and Sticky Inflation', body:'Several Federal Reserve policymakers reiterated a data-dependent stance, suggesting they are in no rush to cut rates. Market pricing now implies fewer than two 25bp cuts in 2026.', src:'FT', mins:90 },
  ],
  'Business': [
    { headline:'Apple Plans $500 Billion U.S. Investment Over Five Years', body:'Apple said it would spend $500 billion in the United States over the next five years, including a new AI server manufacturing plant in Texas, as part of efforts to deepen domestic ties ahead of potential tariff increases.', src:'Bloomberg', mins:120 },
    { headline:'Google Cuts Hundreds of Jobs in Cloud and Platforms Units', body:'Alphabet reduced headcount across Google Cloud and its Platforms & Ecosystems division in a targeted restructuring aimed at improving efficiency. The move affects less than 1% of the global workforce.', src:'CNBC', mins:240 },
  ],
  'Markets': [
    { headline:'Treasury Yields Fall as Investors Pile Into Safe Havens', body:'The 10-year US Treasury yield dropped 12bps to 4.42% as investors sought safety amid renewed trade war fears. The 2-year yield fell to 3.98%, narrowing the inversion further.', src:'Bloomberg', mins:60 },
    { headline:'Dollar Weakens as Trade Tariff Fears Weigh on Risk Sentiment', body:'The DXY dollar index fell 0.8% as markets priced in slower US growth from tariff headwinds. EUR/USD crossed 1.12 for the first time since January 2025.', src:'Reuters', mins:150 },
  ],
  'Technology': [
    { headline:'NVIDIA Blackwell B300 Shipments Tracking Ahead of Schedule', body:'Supply chain checks confirm NVIDIA has resolved CoWoS-L advanced packaging bottlenecks. Multiple hyperscalers have pulled forward orders, and Blackwell is now expected to represent over 70% of data centre revenue by Q3 FY2027.', src:'Barclays', mins:80 },
    { headline:'Microsoft Azure OpenAI Revenue Now on $10bn+ Annualised Run Rate', body:'Following strong Q3 FY2026 results, analyst estimates place Azure AI services at an annualised run rate exceeding $10bn. GitHub Copilot enterprise seat count tripled YoY to 1.8 million.', src:'Morgan Stanley', mins:160 },
  ],
  'Mergers & Acquisitions': [
    { headline:'Juniper Networks Acquisition by HPE Cleared by EU Regulators', body:'The European Commission approved Hewlett Packard Enterprise\'s $14 billion acquisition of Juniper Networks after the companies offered network equipment interoperability remedies.', src:'FT', mins:200 },
    { headline:'KKR Eyes $6bn Takeover of Envision Healthcare in Debt-for-Equity Deal', body:'Private equity giant KKR is in advanced talks to take full ownership of Envision Healthcare through a debt-for-equity restructuring, valuing the physician staffing group at roughly $6 billion including debt.', src:'WSJ', mins:380 },
  ],
}

function getSectionNews(section: string) {
  return NEWS_ITEMS[section] || NEWS_ITEMS['Top News']
}

// ── Earnings beat bar ─────────────────────────────────────────────────────────
function EarningsBar() {
  const beat = 87, beatCount = 53, missCount = 6
  return (
    <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'14px 18px', marginBottom:16 }}>
      <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:4 }}>Earnings</div>
      <p style={{ fontSize:13, color:'#3D4F6E', marginBottom:10 }}>
        <strong style={{ color:'#059669' }}>{beat}%</strong> of reported S&P 500 companies <strong style={{ color:'#059669' }}>beat</strong> estimates as of {new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long'})}.
      </p>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:16, marginBottom:2 }}>🏆</div>
          <div style={{ fontSize:13, fontWeight:800, color:'#059669' }}>{beatCount}</div>
          <div style={{ fontSize:10, color:'#059669', fontWeight:600 }}>Beat</div>
        </div>
        <div style={{ flex:1, height:10, background:'#FEF2F2', borderRadius:999, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${(beatCount/(beatCount+missCount))*100}%`, background:'linear-gradient(90deg,#059669,#10B981)', borderRadius:999 }} />
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:16, marginBottom:2 }}>🌧️</div>
          <div style={{ fontSize:13, fontWeight:800, color:'#DC2626' }}>{missCount}</div>
          <div style={{ fontSize:10, color:'#DC2626', fontWeight:600 }}>Miss</div>
        </div>
      </div>
      <button style={{ marginTop:10, background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:700, color:'#1B4FFF', fontFamily:'inherit', padding:0 }}>VIEW ALL →</button>
    </div>
  )
}

// ── Sector performance chart ──────────────────────────────────────────────────
function SectorChart() {
  const maxAbs = Math.max(...SECTORS.map(s => Math.abs(s.chg)))
  return (
    <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'14px 18px', marginBottom:16 }}>
      <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:12 }}>S&P 500 Sector Performance</div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {[...SECTORS].sort((a,b)=>b.chg-a.chg).map(s => {
          const pos = s.chg >= 0
          const barW = (Math.abs(s.chg) / maxAbs) * 48
          return (
            <div key={s.name} style={{ display:'flex', alignItems:'center', gap:8 }}>
              {/* Negative side */}
              <div style={{ width:52, display:'flex', justifyContent:'flex-end' }}>
                {!pos && <div style={{ height:8, width:`${barW}%`, background:'#FCA5A5', borderRadius:'3px 0 0 3px', minWidth:pos?0:4 }} />}
                {!pos && <span style={{ fontSize:10, fontWeight:700, color:'#DC2626', marginLeft:4, whiteSpace:'nowrap' }}>{s.chg.toFixed(2)}%</span>}
              </div>
              <div style={{ fontSize:11, color:'#3D4F6E', width:170, textAlign:'center', flexShrink:0 }}>{s.name}</div>
              {/* Positive side */}
              <div style={{ width:52, display:'flex', alignItems:'center' }}>
                {pos && <div style={{ height:8, width:`${barW}%`, background:'#6EE7B7', borderRadius:'0 3px 3px 0', minWidth:4 }} />}
                {pos && <span style={{ fontSize:10, fontWeight:700, color:'#059669', marginLeft:4, whiteSpace:'nowrap' }}>+{s.chg.toFixed(2)}%</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize:10, color:'#B0BCD0', marginTop:10 }}>All data as of {new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long'})}, {new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} BST</div>
    </div>
  )
}

// ── Market movers table ───────────────────────────────────────────────────────
function MarketMovers() {
  const [tab, setTab] = useState<'mostActive'|'topGainers'|'topLosers'>('mostActive')
  const data = MOVERS[tab]
  return (
    <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'14px 18px', marginBottom:16 }}>
      <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:10 }}>Market Movers</div>
      <div style={{ display:'flex', gap:16, marginBottom:12, borderBottom:'1px solid #F0F4FA', paddingBottom:8 }}>
        {(['mostActive','topGainers','topLosers'] as const).map(k => (
          <button key={k} onClick={()=>setTab(k)} style={{ fontSize:12, fontWeight:600, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', color:tab===k?'#0A1628':'#7D8FA9', borderBottom:`2px solid ${tab===k?'#DC2626':'transparent'}`, paddingBottom:4, paddingLeft:0, paddingRight:0, transition:'all 0.12s', whiteSpace:'nowrap' }}>
            {k==='mostActive'?'Most Active':k==='topGainers'?'Top Gainers':'Top Losers'}
          </button>
        ))}
      </div>
      {data.map((m, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:i<data.length-1?'1px solid #F5F7FB':'none' }}>
          <div>
            <div style={{ fontSize:12.5, fontWeight:700, color:'#0A1628' }}>{m.name}</div>
            <div style={{ fontSize:10, color:'#7D8FA9', fontFamily:'monospace' }}>{m.ticker}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#0A1628' }}>${m.price.toFixed(2)}</div>
            <div style={{ fontSize:11, fontWeight:700, color:m.chg>=0?'#059669':'#DC2626', display:'flex', alignItems:'center', gap:3, justifyContent:'flex-end' }}>
              {m.chg>=0?'▲':'▼'} ({Math.abs(m.chg).toFixed(2)}%)
            </div>
          </div>
        </div>
      ))}
      <div style={{ fontSize:10, color:'#B0BCD0', marginTop:8 }}>All data as of {new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long'})}, {new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} BST</div>
    </div>
  )
}

// ── Edit News Sections modal ──────────────────────────────────────────────────
function EditSectionsModal({ selected, onSave, onClose }: { selected:string[]; onSave:(s:string[])=>void; onClose:()=>void }) {
  const [sel, setSel] = useState([...selected])
  const avail = ALL_SECTIONS.filter(s => !sel.includes(s))
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,22,40,0.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, maxHeight:'85vh', overflow:'hidden', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid #E8EDF4' }}>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#7D8FA9' }}>‹</button>
          <div style={{ fontSize:15, fontWeight:800, color:'#0A1628' }}>Edit News Sections</div>
          <button onClick={()=>{setSel([...DEFAULT_SELECTED])}} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, color:'#1B4FFF', fontFamily:'inherit' }}>Reset</button>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {/* Selected */}
          <div style={{ padding:'10px 20px 4px', fontSize:10, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.08em', textTransform:'uppercase' }}>Selected</div>
          {sel.map((s,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom:'1px solid #F5F7FB' }}>
              <span style={{ color:'#B0BCD0', fontSize:16, cursor:'grab' }}>≡</span>
              <span style={{ flex:1, fontSize:14, color:'#0A1628' }}>{s}</span>
              <button onClick={()=>setSel(prev=>prev.filter(x=>x!==s))} style={{ background:'none', border:'none', cursor:'pointer', color:'#B0BCD0', fontSize:20, lineHeight:1, padding:0 }}>⊖</button>
            </div>
          ))}
          {/* Available */}
          <div style={{ padding:'14px 20px 4px', fontSize:10, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.08em', textTransform:'uppercase' }}>More News Sections</div>
          {avail.map((s,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom:'1px solid #F5F7FB' }}>
              <span style={{ flex:1, fontSize:14, color:'#0A1628' }}>{s}</span>
              <button onClick={()=>setSel(prev=>[...prev,s])} style={{ background:'none', border:'none', cursor:'pointer', color:'#059669', fontSize:20, lineHeight:1, padding:0 }}>⊕</button>
            </div>
          ))}
        </div>
        <div style={{ padding:'14px 20px', borderTop:'1px solid #E8EDF4' }}>
          <button onClick={()=>{ onSave(sel); onClose() }} style={{ width:'100%', padding:'12px', background:'#1B4FFF', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Save Sections</button>
        </div>
      </div>
    </div>
  )
}

// ── Indices bar ───────────────────────────────────────────────────────────────
function IndicesBar() {
  const [region, setRegion] = useState<'us'|'europe'|'asia'>('us')
  const data = INDICES[region]
  return (
    <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'12px 16px', marginBottom:16 }}>
      {/* Region pills */}
      <div style={{ display:'flex', gap:6, marginBottom:10 }}>
        {(['us','europe','asia'] as const).map(r => (
          <button key={r} onClick={()=>setRegion(r)} style={{ padding:'4px 12px', borderRadius:999, fontSize:11, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit', background:region===r?'#1B4FFF':'#F0F4FA', color:region===r?'#fff':'#7D8FA9' }}>
            {r==='us'?'United States':r==='europe'?'Europe':'Asia'}
          </button>
        ))}
        <button style={{ marginLeft:'auto', fontSize:11, fontWeight:600, color:'#1B4FFF', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>All Indices</button>
      </div>
      {/* Index values */}
      <div style={{ display:'flex', gap:0 }}>
        {data.map((idx,i) => (
          <div key={i} style={{ flex:1, borderRight:i<data.length-1?'1px solid #E8EDF4':'none', paddingRight:i<data.length-1?12:0, paddingLeft:i>0?12:0 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7D8FA9', marginBottom:2 }}>{idx.name}</div>
            <div style={{ fontSize:15, fontWeight:900, color:'#0A1628', letterSpacing:'-0.02em' }}>{idx.val.toLocaleString('en-US',{minimumFractionDigits:2})}</div>
            <div style={{ fontSize:11, fontWeight:700, color:idx.chg>=0?'#059669':'#DC2626', display:'flex', alignItems:'center', gap:3 }}>
              {idx.chg>=0?'▲':'▼'} {Math.abs(idx.chg).toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:9, color:'#B0BCD0', marginTop:8 }}>All data as of {new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long'})}, {new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} BST</div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function NewsPage() {
  const { locale } = useLocale()
  const tr = (k:string) => t(locale, k)
  const [selected, setSelected] = useState(DEFAULT_SELECTED)
  const [activeSection, setActiveSection] = useState('Top News')
  const [showEdit, setShowEdit] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<number|null>(null)

  const newsItems = getSectionNews(activeSection)

  return (
    <div style={{ display:'flex', minHeight:'calc(100vh - 60px)', background:'#F7F9FC' }}>

      {/* LEFT: feed */}
      <div style={{ flex:1, minWidth:0, padding:'1.25rem 1rem 1.5rem 1.5rem', display:'flex', flexDirection:'column', gap:0 }}>

        {/* Indices */}
        <IndicesBar />

        {/* News section */}
        <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, overflow:'hidden' }}>
          {/* Header with gear icon */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #F5F7FB' }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#0A1628' }}>News</div>
            <button onClick={()=>setShowEdit(true)} style={{ background:'none', border:'none', cursor:'pointer', color:'#7D8FA9', display:'flex', alignItems:'center', justifyContent:'center', padding:4, borderRadius:6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>

          {/* Section tabs */}
          <div style={{ display:'flex', gap:0, overflowX:'auto', padding:'0 12px', borderBottom:'1px solid #F5F7FB' }}>
            {selected.map(s => (
              <button key={s} onClick={()=>setActiveSection(s)} style={{ padding:'9px 12px', fontSize:12, fontWeight:600, border:'none', background:'none', cursor:'pointer', fontFamily:'inherit', color:activeSection===s?'#DC2626':'#7D8FA9', borderBottom:`2px solid ${activeSection===s?'#DC2626':'transparent'}`, marginBottom:-1, transition:'all 0.12s', whiteSpace:'nowrap', flexShrink:0 }}>{s}</button>
            ))}
          </div>

          {/* Hero item */}
          {newsItems[0] && (
            <div style={{ padding:'16px', borderBottom:'1px solid #F5F7FB', cursor:'pointer' }}
              onMouseEnter={()=>setHoveredItem(-1)} onMouseLeave={()=>setHoveredItem(null)}>
              <div style={{ width:'100%', height:160, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', borderRadius:10, marginBottom:12, display:'flex', alignItems:'flex-end', padding:12, overflow:'hidden' }}>
                <div style={{ background:'rgba(0,0,0,0.45)', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, color:'#fff' }}>{newsItems[0].src}</div>
              </div>
              <p style={{ fontSize:14, fontWeight:800, color:'#0A1628', lineHeight:1.4, marginBottom:4 }}>{newsItems[0].headline}</p>
              <p style={{ fontSize:11.5, color:'#7D8FA9', marginBottom:4 }}>{newsItems[0].mins >= 60 ? `${Math.floor(newsItems[0].mins/60)} hours ago` : `${newsItems[0].mins} min ago`}</p>
              {hoveredItem===-1&&(
                <div style={{ display:'flex', gap:6, marginTop:6 }}>
                  <Link href="/app/research" style={{ fontSize:11, fontWeight:700, padding:'3px 9px', background:'#EEF3FF', color:'#1B4FFF', borderRadius:6, textDecoration:'none' }}>Ask AI</Link>
                  <button style={{ fontSize:11, fontWeight:600, padding:'3px 9px', background:'#F5F7FB', color:'#7D8FA9', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                </div>
              )}
            </div>
          )}

          {/* Rest of items */}
          {newsItems.slice(1).map((item, i) => (
            <div key={i} style={{ display:'flex', gap:12, padding:'12px 16px', borderBottom:i<newsItems.length-2?'1px solid #F5F7FB':'none', cursor:'pointer', background:hoveredItem===i?'#FAFBFD':'#fff', transition:'background 0.1s' }}
              onMouseEnter={()=>setHoveredItem(i)} onMouseLeave={()=>setHoveredItem(null)}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#7D8FA9' }}>{item.src}</span>
                  <span style={{ fontSize:10, color:'#B0BCD0' }}>· {item.mins >= 60 ? `${Math.floor(item.mins/60)}h` : `${item.mins}m`} ago</span>
                </div>
                <p style={{ fontSize:13, fontWeight:700, color:'#0A1628', lineHeight:1.4, marginBottom:4 }}>{item.headline}</p>
                <p style={{ fontSize:11.5, color:'#7D8FA9', lineHeight:1.5 }}>{item.body.slice(0,120)}…</p>
                {hoveredItem===i&&(
                  <div style={{ display:'flex', gap:5, marginTop:6 }}>
                    <Link href="/app/research" style={{ fontSize:11, fontWeight:700, padding:'3px 9px', background:'#EEF3FF', color:'#1B4FFF', borderRadius:6, textDecoration:'none' }}>Ask AI</Link>
                    <button style={{ fontSize:11, fontWeight:600, padding:'3px 9px', background:'#F5F7FB', color:'#7D8FA9', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                  </div>
                )}
              </div>
              <div style={{ width:72, height:72, borderRadius:8, background:'linear-gradient(135deg,#E8EDF4,#F0F4FA)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>
                {i===0?'📊':i===1?'🏦':'📈'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: market data */}
      <div style={{ width:300, flexShrink:0, padding:'1.25rem 1.5rem 1.5rem 0', display:'flex', flexDirection:'column' }}>
        <EarningsBar />
        <MarketMovers />
        <SectorChart />
      </div>

      {/* Edit sections modal */}
      {showEdit && <EditSectionsModal selected={selected} onSave={setSelected} onClose={()=>setShowEdit(false)} />}
    </div>
  )
}
