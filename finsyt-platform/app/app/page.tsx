'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { t } from '@/lib/i18n/translations'

// ── Colour helpers ────────────────────────────────────────────────────────────
const COMPANY_COLORS: Record<string, string> = {
  TSLA:'#CC0000',MSFT:'#00A4EF',NVDA:'#76B900',AAPL:'#555',META:'#0866FF',
  AMZN:'#FF9900',JPM:'#003087',GS:'#6DB33F',FED:'#1B4FFF',INTC:'#0068B5',
  AMD:'#ED1C24',TSM:'#EE1C25',AVGO:'#CA2026',
}
function companyBg(sym: string) { return COMPANY_COLORS[sym] ?? '#1B4FFF' }
function sentimentBadge(s: string) {
  if (s === 'bullish'||s === 'positive') return { bg:'#ECFDF5',color:'#059669',label:'Bullish' }
  if (s === 'bearish'||s === 'negative') return { bg:'#FEF2F2',color:'#DC2626',label:'Bearish' }
  return { bg:'#F5F7FB',color:'#7D8FA9',label:'Neutral' }
}

// ── Live earnings strip ───────────────────────────────────────────────────────
const LIVE_EARNINGS = [
  { symbol:'TSLA', color:'#CC0000', ago:'Now', live:true },
  { symbol:'MSFT', color:'#00A4EF', ago:'14m', live:true },
  { symbol:'NVDA', color:'#76B900', ago:'28m', live:true },
  { symbol:'AMZN', color:'#FF9900', ago:'41m', live:false },
  { symbol:'META', color:'#0866FF', ago:'1h',  live:false },
  { symbol:'AAPL', color:'#555555', ago:'2h',  live:false },
]

// ── Source library ────────────────────────────────────────────────────────────
const SOURCE_CATEGORIES = [
  { label:'Earnings Transcripts', checked:true },
  { label:'Expert Calls', checked:true },
  { label:'SEC Filings', checked:true },
  { label:'Analyst Reports', checked:true },
  { label:'Channel Checks', checked:true },
  { label:'News & Wire', checked:false },
  { label:'Company Filings (non-US)', checked:false },
]

// ── Agent steps ───────────────────────────────────────────────────────────────
const AGENT_STEPS = [
  { label:'Identifying relevant sources', ms:500 },
  { label:'Searching earnings transcripts & filings', ms:1200 },
  { label:'Running AI Scan for key signals', ms:2000 },
  { label:'Extracting & validating citations', ms:2800 },
  { label:'Synthesising insights', ms:3400 },
]

// ── Demo AI response ──────────────────────────────────────────────────────────
const DEMO_RESPONSE = {
  question: 'Tesla Q1 2026 earnings call — key analyst questions and management tone',
  answer: `Experts indicate management adopted a more optimistic tone vs Q4 2025, with Musk using forward-looking language more freely — particularly around the robotaxi timeline and energy margin sustainability.`,
  citedSnippets: [
    { source:'Earnings Transcript', symbol:'TSLA', quarter:'Q1 2026', time:'00:34:12', speaker:'Elon Musk', role:'CEO', text:'We expect to return to significant growth this year — the energy business is now contributing meaningfully and we see a clear path to 25%+ margins sustained.', highlight:[22,68], sentiment:'positive' },
    { source:'Earnings Transcript', symbol:'TSLA', quarter:'Q1 2026', time:'01:02:45', speaker:'Vaibhav Taneja', role:'CFO', text:'Q1 gross automotive margin came in at 18.2%. We are guiding 19–20% by Q4 on volume leverage and continued cost reduction.', highlight:[0,40], sentiment:'neutral' },
  ],
  sourceChip:'Expert Call',
  expertBio:{ name:'Former Tesla Supply Chain Director', role:'Ex-Tesla / Manufacturing', avatar:'T', bio:'Former Director of Manufacturing Operations at Tesla Fremont. Led Gigapress deployment and oversaw 4 production lines from 2019–2024.' },
}

// ── Feed data ─────────────────────────────────────────────────────────────────
const NEWS_ITEMS = [
  { symbol:'TSLA', company:'Tesla', tag:'Earnings', sentiment:'bullish', mins:3, headline:'Tesla Q1 2026 EPS Beats — Energy Margin Hits Record 25.4%', body:'Tesla reported Q1 EPS of $0.72 vs $0.62 consensus. Energy storage deployments reached 10.4 GWh — a quarterly record. Automotive gross margin at 18.2%, up 110bps QoQ.' },
  { symbol:'FED', company:'Federal Reserve', tag:'Macro', sentiment:'neutral', mins:15, headline:'Fed Holds Rates — June Cut Odds Fall to 28% After Sticky CPI', body:'Fed minutes show policymakers remain in wait-and-see mode. Core PCE running at 2.8% — above the 2% target. Market now pricing fewer than two cuts in 2026.' },
  { symbol:'NVDA', company:'NVIDIA', tag:'Technology', sentiment:'bullish', mins:22, headline:'Blackwell B300 Shipments Ahead of Schedule — CoWoS Bottleneck Resolved', body:'Supply chain checks confirm NVIDIA resolved CoWoS-L packaging constraints. Analysts now model Blackwell at >70% of data centre revenue by Q3 FY2027.' },
  { symbol:'MSFT', company:'Microsoft', tag:'AI', sentiment:'bullish', mins:38, headline:'Azure OpenAI Now on $10bn+ Annualised Revenue Run Rate', body:'Azure AI services crossed $10bn annualised following Q3 FY2026 results. GitHub Copilot enterprise seats tripled YoY to 1.8 million.' },
  { symbol:'GS', company:'Goldman Sachs', tag:'Research', sentiment:'neutral', mins:55, headline:'Goldman Raises S&P 500 Target to 6,500 — Cites Earnings Resilience', body:'Goldman equity strategists raised their 12-month S&P 500 price target to 6,500, citing 12% YoY Q1 earnings growth and improving margin trends.' },
]

const TRANSCRIPT_ITEMS = [
  { symbol:'TSLA', company:'Tesla Inc.', quarter:'Q1 2026', event:'Earnings Call', mins:2, sentiment:'positive', speaker:'Elon Musk', role:'CEO', excerpt:'"We expect to return to significant growth this year, with our energy business now contributing meaningfully to margins..."', tags:['Bullish','Guidance'] },
  { symbol:'MSFT', company:'Microsoft Corp.', quarter:'Q3 FY2026', event:'Earnings Call', mins:14, sentiment:'positive', speaker:'Satya Nadella', role:'CEO', excerpt:'"Azure growth reaccelerated to 35% this quarter, driven by AI workloads. We are seeing broad-based enterprise adoption..."', tags:['Beat','AI'] },
  { symbol:'NVDA', company:'NVIDIA Corp.', quarter:'Q4 FY2026', event:'Analyst Day', mins:45, sentiment:'positive', speaker:'Jensen Huang', role:'CEO', excerpt:'"Blackwell demand continues to exceed supply. We expect data centre revenue to double again in fiscal 2027..."', tags:['Strong Demand','Supply'] },
  { symbol:'JPM', company:'JPMorgan Chase', quarter:'Q1 2026', event:'Earnings Call', mins:61, sentiment:'neutral', speaker:'Jamie Dimon', role:'Chairman & CEO', excerpt:'"We remain cautious on the macro outlook. Credit quality is holding but consumer delinquencies warrant close monitoring..."', tags:['Cautious','Credit'] },
]

const FILING_ITEMS = [
  { symbol:'TSLA', company:'Tesla Inc.', type:'10-Q', title:'Quarterly Report Q1 2026', mins:5, tag:'Earnings', pages:87, docColor:'#8B5CF6' },
  { symbol:'NVDA', company:'NVIDIA Corp.', type:'8-K', title:'Material Event — Blackwell B300 Production Update', mins:18, tag:'Product', pages:4, docColor:'#059669' },
  { symbol:'MSFT', company:'Microsoft Corp.', type:'10-Q', title:'Quarterly Report Q3 FY2026', mins:33, tag:'Earnings', pages:102, docColor:'#8B5CF6' },
  { symbol:'META', company:'Meta Platforms', type:'DEF 14A', title:'Proxy Statement — Annual Meeting 2026', mins:52, tag:'Governance', pages:64, docColor:'#D97706' },
  { symbol:'AMZN', company:'Amazon.com Inc.', type:'8-K', title:'AWS re:Invent 2026 Key Announcements', mins:71, tag:'Strategic', pages:6, docColor:'#059669' },
]

// ── Semiconductor channel check ───────────────────────────────────────────────
const CHANNEL_CHECK = {
  title:'Channel Check: AI & Datacenter Semiconductors',
  period:'Jan – Apr 2026',
  rows:[
    { expert:'Manager at Semiconductor Distributor', date:'02 Apr 26', current:'AI and Datacenter business increased ~30% this quarter, driven by improved product allocations.', next:'No specific % forecast — demand expected to accelerate.' },
    { expert:'Partner at Consulting Firm Sees Demand', date:'28 Mar 26', current:'Results exceeded expectations by a good margin, primarily due to performance of new chips.', next:'Demand expected to increase with new hardware releases. Pipeline for substrate orders will not cover current demand.' },
    { expert:'Technology Practice Lead at Global Consulting Firm', date:'24 Mar 26', current:'Results exceeded expectations due to customer demand and a shift toward inference workloads.', next:'Expected to grow ~10% incrementally, driven by increasing demand and improving supply chain.' },
  ]
}

// ── Expert calls ──────────────────────────────────────────────────────────────
const EXPERT_CALLS = [
  { title:'Director Sees U.S.–China Trade Tensions Impact Supply...', tags:['Consultant','Investor-Led (Buy-Side)','MSFT'], summary:'The client and the expert discussed the impact of U.S.–China trade tensions on the electronic supply chain, highlighting challenges such as cost pressures, lead time variations, quality control issues, and logistics bottlenecks.' },
  { title:'VP of Engineering Sees AI Chip Demand Sustained Through H2', tags:['Industry Expert','Sell-Side','NVDA'], summary:'Expert indicated hyperscaler capex commitments show no sign of slowdown. GB200 NVL72 rack deployments tracking ahead of internal estimates at two major cloud providers.' },
  { title:'Former CFO Comments on Azure Margin Expansion Outlook', tags:['Former Executive','Buy-Side','MSFT'], summary:'Discussion covered Azure margin levers including AI workload mix shift, data centre amortisation schedules, and management\'s internal OKRs for FY2027 operating income.' },
]

// ── Suggested prompts ─────────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  { icon:'📋', label:'Tesla Q1 earnings — key analyst questions and management tone' },
  { icon:'📄', label:'Summarise NVIDIA latest 10-Q: revenue mix, risks, capex guidance' },
  { icon:'📰', label:'Top macro stories this week and impact on rate-sensitive equities' },
  { icon:'🔍', label:'Compare Microsoft and Google AI commentary from latest transcripts' },
  { icon:'⚠️', label:'Flag new risk disclosures in recent Big Tech 8-K filings' },
  { icon:'📊', label:'Channel check synthesis: AI & datacenter semiconductors Q1 2026' },
]

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ sym, size=34 }: { sym:string; size?:number }) {
  return (
    <div style={{ width:size, height:size, borderRadius:size*0.28, flexShrink:0, background:companyBg(sym), display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:size*0.38 }}>{sym[0]}</div>
  )
}

// ── Doc icon ──────────────────────────────────────────────────────────────────
function DocIcon({ color='#8B5CF6' }: { color?:string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill={color+'22'} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="14 2 14 8 20 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Highlighted text ──────────────────────────────────────────────────────────
function HighlightedText({ text, range, color='#FEF08A' }: { text:string; range:[number,number]; color?:string }) {
  const [start, end] = range
  return (
    <span>
      {text.slice(0,start)}
      <mark style={{ background:color, borderRadius:3, padding:'0 2px' }}>{text.slice(start,end)}</mark>
      {text.slice(end)}
    </span>
  )
}

// ── Agent response ────────────────────────────────────────────────────────────
function AgentResultCard({ onClose }: { onClose:()=>void }) {
  const [activeSnippet, setActiveSnippet] = useState(0)
  const snip = DEMO_RESPONSE.citedSnippets[activeSnippet]
  return (
    <div style={{ padding:'16px 18px 18px' }}>
      {/* Agent header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <div style={{ width:22, height:22, borderRadius:6, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:'#fff' }}>F</div>
        <span style={{ fontSize:12, fontWeight:700, color:'#1B4FFF' }}>Finsyt Agent</span>
        <div style={{ display:'flex', gap:6, marginLeft:8 }}>
          {['Transcript is ready','AI Scan complete','Citations validated'].map((s,i)=>(
            <span key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:999, background:'#ECFDF5', color:'#059669' }}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3"/></svg>
              {s}
            </span>
          ))}
        </div>
        <button onClick={onClose} style={{ marginLeft:'auto', fontSize:12, color:'#B0BCD0', background:'none', border:'none', cursor:'pointer', padding:'2px 8px', borderRadius:6, fontFamily:'inherit' }}>✕</button>
      </div>

      {/* Question */}
      <div style={{ background:'#F7F9FC', borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
        <span style={{ fontSize:12, color:'#7D8FA9', marginRight:6 }}>Q</span>
        <span style={{ fontSize:13, fontWeight:600, color:'#1C2B4A' }}>{DEMO_RESPONSE.question}</span>
      </div>

      {/* AI Answer */}
      <p style={{ fontSize:13.5, color:'#1C2B4A', lineHeight:1.65, marginBottom:12 }}>
        {DEMO_RESPONSE.answer}
        {' '}
        <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:6, background:'#ECFDF5', color:'#059669', fontSize:11, fontWeight:700, cursor:'pointer', border:'1px solid #BBF7D0' }}>
          <DocIcon color="#059669" /> {DEMO_RESPONSE.sourceChip} ›
        </span>
      </p>

      {/* Cited snippets */}
      <div style={{ background:'#F7F9FC', borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', marginBottom:8, letterSpacing:'0.06em', textTransform:'uppercase' }}>Cited Snippets</div>
        <div style={{ display:'flex', gap:6, marginBottom:10 }}>
          {DEMO_RESPONSE.citedSnippets.map((s,i)=>(
            <button key={i} onClick={()=>setActiveSnippet(i)} style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:6, border:'1.5px solid', borderColor:activeSnippet===i?'#1B4FFF':'#E8EDF4', background:activeSnippet===i?'#EEF3FF':'#fff', color:activeSnippet===i?'#1B4FFF':'#7D8FA9', cursor:'pointer', fontFamily:'inherit' }}>
              {s.speaker}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:4, background:'#EEF3FF', color:'#1B4FFF' }}>{snip.source}</span>
          <span style={{ fontSize:10, color:'#B0BCD0', display:'flex', alignItems:'center', gap:4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {snip.time}
          </span>
          <span style={{ fontSize:10, fontWeight:600, color:'#3D4F6E', marginLeft:'auto' }}>{snip.speaker} · {snip.role}</span>
        </div>
        <p style={{ fontSize:12.5, color:'#1C2B4A', lineHeight:1.6, fontStyle:'italic' }}>
          "<HighlightedText text={snip.text} range={snip.highlight as [number,number]} color="#FEF08A" />"
        </p>
      </div>

      {/* Expert bio */}
      <div style={{ border:'1px solid #E8EDF4', borderRadius:10, padding:'12px 14px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', marginBottom:8, letterSpacing:'0.06em', textTransform:'uppercase' }}>Expert Bio</div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:13, flexShrink:0 }}>{DEMO_RESPONSE.expertBio.avatar}</div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'#0A1628' }}>{DEMO_RESPONSE.expertBio.name}</div>
            <div style={{ fontSize:11, color:'#7D8FA9' }}>{DEMO_RESPONSE.expertBio.role}</div>
          </div>
        </div>
        <p style={{ fontSize:12, color:'#3D4F6E', lineHeight:1.5, marginBottom:10 }}>{DEMO_RESPONSE.expertBio.bio}</p>
        <button style={{ width:'100%', padding:'7px', background:'#1B4FFF', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Talk to this Expert</button>
      </div>

      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        <Link href="/app/research" style={{ fontSize:12, color:'#1B4FFF', fontWeight:700, textDecoration:'none', padding:'6px 14px', background:'#EEF3FF', borderRadius:7 }}>Open in Research →</Link>
        <button style={{ fontSize:12, color:'#7D8FA9', fontWeight:600, background:'#F5F7FB', border:'none', cursor:'pointer', padding:'6px 14px', borderRadius:7, fontFamily:'inherit' }}>Export PPTX</button>
        <button style={{ fontSize:12, color:'#7D8FA9', fontWeight:600, background:'#F5F7FB', border:'none', cursor:'pointer', padding:'6px 14px', borderRadius:7, fontFamily:'inherit' }}>Save</button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AppOverview() {
  const { locale } = useLocale()
  const tr = (k:string) => t(locale, k)

  const [activeTab, setActiveTab] = useState<'news'|'transcripts'|'filings'|'expert'|'channel'>('news')
  const [query, setQuery] = useState('')
  const [agentState, setAgentState] = useState<'idle'|'thinking'|'done'>('idle')
  const [currentStep, setCurrentStep] = useState(0)
  const [hoveredItem, setHoveredItem] = useState<number|null>(null)
  const [sources, setSources] = useState(SOURCE_CATEGORIES.map(s=>({...s})))
  const [showSources, setShowSources] = useState(false)

  const hour = new Date().getHours()
  const greeting = hour<12?tr('good_morning'):hour<17?tr('good_afternoon'):tr('good_evening')

  function runAgent(q: string) {
    if (!q.trim()) return
    setAgentState('thinking')
    setCurrentStep(0)
    AGENT_STEPS.forEach((step,i) => { setTimeout(()=>setCurrentStep(i), step.ms) })
    setTimeout(()=>setAgentState('done'), AGENT_STEPS[AGENT_STEPS.length-1].ms + 400)
  }

  const TABS = [
    { key:'news', label:tr('news_tab') },
    { key:'transcripts', label:tr('transcripts') },
    { key:'filings', label:tr('filings_tab') },
    { key:'expert', label:'Expert Calls' },
    { key:'channel', label:'Channel Checks' },
  ] as const

  return (
    <div style={{ display:'flex', minHeight:'calc(100vh - 60px)', background:'#F7F9FC' }}>
      {/* LEFT COLUMN */}
      <div style={{ flex:1, minWidth:0, padding:'1.25rem 1rem 1.5rem 1.5rem', display:'flex', flexDirection:'column', gap:16 }}>

        {/* Greeting + live strip */}
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3 }}>{tr('home_subtitle')}</p>
          <h1 style={{ fontSize:'1.375rem', fontWeight:900, color:'#0A1628', letterSpacing:'-0.03em', marginBottom:14 }}>{greeting} 👋</h1>

          {/* Live strip */}
          <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'10px 14px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, color:'#DC2626' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#DC2626', display:'inline-block', animation:'livePulse 1.4s infinite' }} />
                EARNINGS LIVE
              </span>
              <span style={{ fontSize:11, color:'#B0BCD0' }}>· {LIVE_EARNINGS.length} companies</span>
              <Link href="/app/research" style={{ marginLeft:'auto', fontSize:11, color:'#1B4FFF', fontWeight:600, textDecoration:'none' }}>View all →</Link>
            </div>
            <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:2 }}>
              {LIVE_EARNINGS.map(e=>(
                <div key={e.symbol} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer', flexShrink:0 }}>
                  <div style={{ position:'relative' }}>
                    <div style={{ width:42, height:42, borderRadius:'50%', border:`2.5px solid ${e.live?'#DC2626':'#E8EDF4'}`, padding:2 }}>
                      <div style={{ width:'100%', height:'100%', borderRadius:'50%', background:e.color, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:12 }}>{e.symbol[0]}</div>
                    </div>
                    {e.live&&<span style={{ position:'absolute', bottom:0, right:0, width:10, height:10, borderRadius:'50%', background:'#DC2626', border:'2px solid #fff' }} />}
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, color:'#0A1628' }}>{e.symbol}</span>
                  <span style={{ fontSize:10, color:e.live?'#DC2626':'#B0BCD0', fontWeight:600 }}>{e.live?'Live':e.ago}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Agent query bar */}
        <div style={{ background:'#fff', border:`1.5px solid ${agentState!=='idle'?'#1B4FFF':'#E8EDF4'}`, borderRadius:14, overflow:'hidden', transition:'border-color 0.2s', boxShadow:agentState!=='idle'?'0 0 0 3px rgba(27,79,255,0.07)':'none' }}>
          <div style={{ display:'flex', alignItems:'center', padding:'0 14px', gap:10 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1B4FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              value={query}
              onChange={e=>setQuery(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&runAgent(query)}
              placeholder={tr('ask_placeholder')}
              style={{ flex:1, border:'none', outline:'none', padding:'13px 0', fontSize:13.5, color:'#0A1628', background:'transparent', fontFamily:'inherit' }}
            />
            {/* Source filter */}
            <div style={{ position:'relative' }}>
              <button onClick={()=>setShowSources(s=>!s)} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:7, border:`1.5px solid ${showSources?'#1B4FFF':'#E8EDF4'}`, background:showSources?'#EEF3FF':'#F7F9FC', color:showSources?'#1B4FFF':'#7D8FA9', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                Sources
              </button>
              {showSources&&(
                <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, background:'#fff', border:'1.5px solid #E8EDF4', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.1)', zIndex:50, minWidth:220, overflow:'hidden', padding:'8px 0' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px 8px' }}>
                    <div style={{ width:24, height:24, borderRadius:6, background:'#1B4FFF', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:10 }}>F</div>
                    <span style={{ fontSize:13, fontWeight:700, color:'#0A1628' }}>Finsyt Library</span>
                  </div>
                  <div style={{ height:1, background:'#F0F4FA', marginBottom:4 }} />
                  {sources.map((s,i)=>(
                    <button key={i} onClick={()=>setSources(prev=>prev.map((x,j)=>j===i?{...x,checked:!x.checked}:x))}
                      style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'7px 14px', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
                      <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${s.checked?'#1B4FFF':'#D0DAE8'}`, background:s.checked?'#1B4FFF':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {s.checked&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3"/></svg>}
                      </div>
                      <span style={{ fontSize:12, color:'#1C2B4A' }}>{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {query&&(
              <button onClick={()=>runAgent(query)} style={{ background:'#1B4FFF', color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                Run Analysis
              </button>
            )}
          </div>

          {/* Thinking */}
          {agentState==='thinking'&&(
            <div style={{ padding:'14px 18px', borderTop:'1px solid #F5F7FB' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <div style={{ width:20, height:20, borderRadius:6, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff' }}>F</div>
                <span style={{ fontSize:12, fontWeight:700, color:'#1B4FFF' }}>Finsyt Agent</span>
              </div>
              {AGENT_STEPS.map((step,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7, opacity:i<=currentStep?1:0.25, transition:'opacity 0.3s' }}>
                  <div style={{ width:16, height:16, borderRadius:'50%', flexShrink:0, background:i<currentStep?'#059669':i===currentStep?'#1B4FFF':'#E8EDF4', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {i<currentStep
                      ?<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3"/></svg>
                      :i===currentStep
                        ?<div style={{ width:5, height:5, borderRadius:'50%', background:'#fff', animation:'livePulse 1s infinite' }} />
                        :null}
                  </div>
                  <span style={{ fontSize:12, color:i<=currentStep?'#1C2B4A':'#B0BCD0', fontWeight:i===currentStep?600:400 }}>{step.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Done */}
          {agentState==='done'&&<AgentResultCard onClose={()=>{setAgentState('idle');setQuery('')}} />}

          {/* Suggested prompts */}
          {agentState==='idle'&&(
            <div style={{ display:'flex', gap:6, padding:'8px 12px', flexWrap:'wrap', borderTop:'1px solid #F5F7FB' }}>
              {SUGGESTED_PROMPTS.slice(0,3).map((p,i)=>(
                <button key={i} onClick={()=>{setQuery(p.label);setTimeout(()=>runAgent(p.label),50)}}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', background:'#F7F9FC', border:'1px solid #E8EDF4', borderRadius:999, fontSize:11.5, color:'#3D4F6E', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='#EEF3FF';e.currentTarget.style.borderColor='#C7D7FF';e.currentTarget.style.color='#1B4FFF'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#F7F9FC';e.currentTarget.style.borderColor='#E8EDF4';e.currentTarget.style.color='#3D4F6E'}}
                ><span>{p.icon}</span><span>{p.label.length>44?p.label.slice(0,44)+'…':p.label}</span></button>
              ))}
            </div>
          )}
        </div>

        {/* Feed */}
        <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:14, overflow:'hidden', flex:1 }}>
          {/* Tab bar */}
          <div style={{ display:'flex', borderBottom:'1px solid #E8EDF4', padding:'0 14px', overflowX:'auto' }}>
            {TABS.map(tab=>(
              <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
                style={{ padding:'11px 12px', fontSize:12.5, fontWeight:600, border:'none', background:'none', cursor:'pointer', fontFamily:'inherit', color:activeTab===tab.key?'#0A1628':'#7D8FA9', borderBottom:`2px solid ${activeTab===tab.key?'#1B4FFF':'transparent'}`, marginBottom:-1, transition:'all 0.12s', whiteSpace:'nowrap', flexShrink:0 }}>{tab.label}</button>
            ))}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', flexShrink:0 }}>
              <Link href="/app/news" style={{ fontSize:11, color:'#7D8FA9', textDecoration:'none', padding:'4px 6px' }}>View all →</Link>
            </div>
          </div>

          {/* News */}
          {activeTab==='news'&&NEWS_ITEMS.map((item,i)=>{
            const {bg,color,label}=sentimentBadge(item.sentiment)
            return(
              <div key={i} onMouseEnter={()=>setHoveredItem(i)} onMouseLeave={()=>setHoveredItem(null)}
                style={{ padding:'12px 16px', borderBottom:i<NEWS_ITEMS.length-1?'1px solid #F5F7FB':'none', cursor:'pointer', background:hoveredItem===i?'#FAFBFD':'#fff', transition:'background 0.1s' }}>
                <div style={{ display:'flex', gap:10 }}>
                  <Avatar sym={item.symbol} size={32} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'#0A1628' }}>{item.company}</span>
                      <span style={{ fontSize:10, padding:'1px 6px', borderRadius:999, background:'#F0F4FA', color:'#7D8FA9', fontWeight:600 }}>{item.tag}</span>
                      <span style={{ fontSize:10, padding:'1px 6px', borderRadius:999, background:bg, color, fontWeight:700 }}>{label}</span>
                      <span style={{ marginLeft:'auto', fontSize:10, color:'#B0BCD0' }}>{item.mins}m ago</span>
                    </div>
                    <p style={{ fontSize:12.5, fontWeight:700, color:'#0A1628', lineHeight:1.4, marginBottom:3 }}>{item.headline}</p>
                    <p style={{ fontSize:11.5, color:'#7D8FA9', lineHeight:1.5 }}>{item.body}</p>
                    {hoveredItem===i&&(
                      <div style={{ display:'flex', gap:5, marginTop:7 }}>
                        <button onClick={()=>{setQuery(item.headline);runAgent(item.headline)}} style={{ fontSize:11, fontWeight:700, padding:'3px 9px', background:'#EEF3FF', color:'#1B4FFF', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Ask AI</button>
                        <button style={{ fontSize:11, fontWeight:600, padding:'3px 9px', background:'#F5F7FB', color:'#7D8FA9', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Transcripts */}
          {activeTab==='transcripts'&&TRANSCRIPT_ITEMS.map((item,i)=>{
            const {bg,color,label}=sentimentBadge(item.sentiment)
            return(
              <div key={i} onMouseEnter={()=>setHoveredItem(100+i)} onMouseLeave={()=>setHoveredItem(null)}
                style={{ padding:'12px 16px', borderBottom:i<TRANSCRIPT_ITEMS.length-1?'1px solid #F5F7FB':'none', cursor:'pointer', background:hoveredItem===100+i?'#FAFBFD':'#fff', transition:'background 0.1s' }}>
                <div style={{ display:'flex', gap:10 }}>
                  <Avatar sym={item.symbol} size={32} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'#0A1628' }}>{item.company}</span>
                      <span style={{ fontSize:10, padding:'1px 6px', borderRadius:999, background:'#F0F4FA', color:'#7D8FA9', fontWeight:600 }}>{item.quarter} · {item.event}</span>
                      <span style={{ fontSize:10, padding:'1px 6px', borderRadius:999, background:bg, color, fontWeight:700 }}>{label}</span>
                      <span style={{ marginLeft:'auto', fontSize:10, color:'#B0BCD0' }}>{item.mins}m ago</span>
                    </div>
                    {/* Speaker */}
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'#E8EDF4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#7D8FA9', flexShrink:0 }}>{item.speaker[0]}</div>
                      <span style={{ fontSize:11, fontWeight:600, color:'#3D4F6E' }}>{item.speaker}</span>
                      <span style={{ fontSize:11, color:'#B0BCD0' }}>· {item.role}</span>
                      {/* tags */}
                      {item.tags.map(tag=>(
                        <span key={tag} style={{ fontSize:9, padding:'1px 6px', borderRadius:999, background:'#F0F4FA', color:'#7D8FA9', fontWeight:600 }}>{tag}</span>
                      ))}
                    </div>
                    <p style={{ fontSize:12, color:'#1C2B4A', lineHeight:1.55, fontStyle:'italic', borderLeft:'2px solid #E8EDF4', paddingLeft:8, margin:0 }}>{item.excerpt}</p>
                    {hoveredItem===100+i&&(
                      <div style={{ display:'flex', gap:5, marginTop:7 }}>
                        <button onClick={()=>{setQuery(`Summarise ${item.company} ${item.quarter} ${item.event}`);runAgent(`Summarise ${item.company} ${item.quarter} ${item.event}`)}} style={{ fontSize:11, fontWeight:700, padding:'3px 9px', background:'#EEF3FF', color:'#1B4FFF', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Ask AI</button>
                        <button style={{ fontSize:11, fontWeight:600, padding:'3px 9px', background:'#F5F7FB', color:'#7D8FA9', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Highlight</button>
                        <button style={{ fontSize:11, fontWeight:600, padding:'3px 9px', background:'#F5F7FB', color:'#7D8FA9', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                        <button style={{ fontSize:11, fontWeight:600, padding:'3px 9px', background:'#F5F7FB', color:'#7D8FA9', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          Play
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Filings */}
          {activeTab==='filings'&&FILING_ITEMS.map((item,i)=>(
            <div key={i} onMouseEnter={()=>setHoveredItem(200+i)} onMouseLeave={()=>setHoveredItem(null)}
              style={{ padding:'12px 16px', borderBottom:i<FILING_ITEMS.length-1?'1px solid #F5F7FB':'none', cursor:'pointer', background:hoveredItem===200+i?'#FAFBFD':'#fff', transition:'background 0.1s' }}>
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:item.docColor+'18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <DocIcon color={item.docColor} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3, flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#0A1628' }}>{item.company}</span>
                    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:999, background:'#EEF3FF', color:'#1B4FFF', fontWeight:700 }}>{item.type}</span>
                    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:999, background:'#F0F4FA', color:'#7D8FA9', fontWeight:600 }}>{item.tag}</span>
                    <span style={{ marginLeft:'auto', fontSize:10, color:'#B0BCD0' }}>{item.mins}m ago</span>
                  </div>
                  <p style={{ fontSize:12.5, fontWeight:700, color:'#0A1628', lineHeight:1.4, marginBottom:2 }}>{item.title}</p>
                  <p style={{ fontSize:11, color:'#B0BCD0' }}>{item.pages} pages · {item.symbol} · SEC EDGAR</p>
                  {hoveredItem===200+i&&(
                    <div style={{ display:'flex', gap:5, marginTop:7 }}>
                      <button onClick={()=>{setQuery(`Summarise ${item.company} ${item.type}: ${item.title}`);runAgent(`Summarise ${item.company} ${item.type}: ${item.title}`)}} style={{ fontSize:11, fontWeight:700, padding:'3px 9px', background:'#EEF3FF', color:'#1B4FFF', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Ask AI</button>
                      <button style={{ fontSize:11, fontWeight:600, padding:'3px 9px', background:'#F5F7FB', color:'#7D8FA9', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Open</button>
                      <button style={{ fontSize:11, fontWeight:600, padding:'3px 9px', background:'#F5F7FB', color:'#7D8FA9', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Extract to Excel</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Expert Calls */}
          {activeTab==='expert'&&EXPERT_CALLS.map((item,i)=>(
            <div key={i} onMouseEnter={()=>setHoveredItem(300+i)} onMouseLeave={()=>setHoveredItem(null)}
              style={{ padding:'14px 16px', borderBottom:i<EXPERT_CALLS.length-1?'1px solid #F5F7FB':'none', cursor:'pointer', background:hoveredItem===300+i?'#FAFBFD':'#fff', transition:'background 0.1s' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'#1B4FFF18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B4FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.37a16 16 0 0 0 6 6l.87-.87a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/></svg>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                    <span style={{ fontSize:10, fontWeight:600, color:'#059669', display:'flex', alignItems:'center', gap:3 }}>
                      <span style={{ width:8, height:8, borderRadius:2, background:'#059669', display:'inline-block' }} />
                      Expert Transcript
                    </span>
                    <button style={{ marginLeft:'auto', width:26, height:26, borderRadius:'50%', border:'1.5px solid #E8EDF4', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7D8FA9" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                  </div>
                  <p style={{ fontSize:13, fontWeight:700, color:'#0A1628', marginBottom:5, lineHeight:1.35 }}>{item.title}</p>
                  <div style={{ display:'flex', gap:5, marginBottom:6, flexWrap:'wrap' }}>
                    {item.tags.map(tag=>(
                      <span key={tag} style={{ fontSize:10, padding:'1px 7px', borderRadius:999, background:'#F0F4FA', color:'#3D4F6E', fontWeight:600 }}>{tag}</span>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:'#7D8FA9', fontWeight:600, marginBottom:4 }}>AI Summary</div>
                  <p style={{ fontSize:12, color:'#3D4F6E', lineHeight:1.55 }}>{item.summary}</p>
                  {hoveredItem===300+i&&(
                    <div style={{ display:'flex', gap:5, marginTop:8 }}>
                      <button onClick={()=>{setQuery(item.title);runAgent(item.title)}} style={{ fontSize:11, fontWeight:700, padding:'3px 9px', background:'#EEF3FF', color:'#1B4FFF', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Ask AI</button>
                      <button style={{ fontSize:11, fontWeight:600, padding:'3px 9px', background:'#1B4FFF', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Talk to Expert</button>
                      <button style={{ fontSize:11, fontWeight:600, padding:'3px 9px', background:'#F5F7FB', color:'#7D8FA9', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Channel Check */}
          {activeTab==='channel'&&(
            <div style={{ padding:'16px' }}>
              <div style={{ border:'1px solid #E8EDF4', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #E8EDF4', display:'flex', alignItems:'center', gap:10 }}>
                  <DocIcon color="#8B5CF6" />
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#0A1628' }}>{CHANNEL_CHECK.title}</div>
                    <div style={{ fontSize:11, color:'#B0BCD0' }}>{CHANNEL_CHECK.period}</div>
                  </div>
                  <button onClick={()=>runAgent(`Synthesise channel check: ${CHANNEL_CHECK.title}`)} style={{ marginLeft:'auto', fontSize:11, fontWeight:700, padding:'4px 10px', background:'#EEF3FF', color:'#1B4FFF', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>Ask AI</button>
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'#F7F9FC' }}>
                        <th style={{ padding:'8px 14px', textAlign:'left', fontWeight:600, color:'#7D8FA9', fontSize:11, borderBottom:'1px solid #E8EDF4', whiteSpace:'nowrap' }}>Expert</th>
                        <th style={{ padding:'8px 14px', textAlign:'left', fontWeight:600, color:'#7D8FA9', fontSize:11, borderBottom:'1px solid #E8EDF4', whiteSpace:'nowrap' }}>Current Quarter Performance</th>
                        <th style={{ padding:'8px 14px', textAlign:'left', fontWeight:600, color:'#7D8FA9', fontSize:11, borderBottom:'1px solid #E8EDF4', whiteSpace:'nowrap' }}>Next Quarter Forecast</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CHANNEL_CHECK.rows.map((row,i)=>(
                        <tr key={i} style={{ borderBottom:i<CHANNEL_CHECK.rows.length-1?'1px solid #F5F7FB':'none' }}>
                          <td style={{ padding:'10px 14px', verticalAlign:'top', minWidth:160 }}>
                            <div style={{ fontSize:12, color:'#1C2B4A', fontWeight:500, lineHeight:1.4, marginBottom:3 }}>{row.expert}</div>
                            <div style={{ fontSize:10, color:'#B0BCD0' }}>{row.date} · Expert Call</div>
                          </td>
                          <td style={{ padding:'10px 14px', verticalAlign:'top', color:'#3D4F6E', lineHeight:1.5, minWidth:200 }}>
                            {row.current}
                            <button style={{ display:'block', marginTop:5, fontSize:10, fontWeight:700, padding:'2px 8px', background:'#F7F9FC', color:'#7D8FA9', border:'1px solid #E8EDF4', borderRadius:5, cursor:'pointer', fontFamily:'inherit' }}>↗ View Citations</button>
                          </td>
                          <td style={{ padding:'10px 14px', verticalAlign:'top', color:'#3D4F6E', lineHeight:1.5, minWidth:200 }}>{row.next}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div style={{ width:268, flexShrink:0, padding:'1.25rem 1.5rem 1.5rem 0', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Workspace panel — AlphaSense 4-quadrant style */}
        <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #F5F7FB', fontSize:12, fontWeight:700, color:'#0A1628' }}>Workspace</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
            {/* Price monitor */}
            <div style={{ padding:'10px 12px', borderRight:'1px solid #F5F7FB', borderBottom:'1px solid #F5F7FB' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#0A1628' }}>Price Monitor</span>
                <span style={{ fontSize:16, color:'#B0BCD0', cursor:'pointer' }}>···</span>
              </div>
              <div style={{ fontSize:10, color:'#B0BCD0', fontWeight:600, marginBottom:5 }}>↓ Semiconductors</div>
              {[{sym:'AMD',vol:'139K',px:'85.76',chg:8},{sym:'AVGO',vol:'687K',px:'146.29',chg:-2},{sym:'NVDA',vol:'2.3M',px:'94.31',chg:5}].map(s=>(
                <div key={s.sym} style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#fff', background:companyBg(s.sym), padding:'1px 5px', borderRadius:4, flexShrink:0 }}>{s.sym}</span>
                  <span style={{ fontSize:10, fontWeight:600, color:s.chg>0?'#059669':'#DC2626' }}>{s.chg>0?'+':''}{s.chg}%</span>
                  <span style={{ fontSize:10, color:'#B0BCD0', marginLeft:'auto' }}>{s.vol}</span>
                </div>
              ))}
            </div>
            {/* Expert insights */}
            <div style={{ padding:'10px 12px', borderBottom:'1px solid #F5F7FB' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#0A1628' }}>Expert Insights</span>
                <span style={{ fontSize:16, color:'#B0BCD0', cursor:'pointer' }}>···</span>
              </div>
              {[{role:'Former Customer',sym:'NVDA'},{role:'Competitor',sym:'INTC',sub:'Business Dev Manager'},{role:'Consultant',sym:'TSM',sub:'Former Senior Director'}].map((e,i)=>(
                <div key={i} style={{ display:'flex', gap:6, marginBottom:5, cursor:'pointer' }}>
                  <DocIcon color="#059669" />
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:'#1C2B4A', lineHeight:1.2 }}>{e.role}</div>
                    <div style={{ fontSize:10, color:'#B0BCD0' }}>{e.sym}{e.sub?` · ${e.sub}`:''}</div>
                  </div>
                </div>
              ))}
            </div>
            {/* Recent docs */}
            <div style={{ padding:'10px 12px', borderRight:'1px solid #F5F7FB' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#0A1628' }}>Research</span>
                <span style={{ fontSize:16, color:'#B0BCD0', cursor:'pointer' }}>···</span>
              </div>
              {[{title:'NVDA Investment Memo – TMT Group – 25Q4',sym:'NVDA',src:'Box (internal)',color:'#8B5CF6'},{title:'First Read: Taiwan Semiconductor...',sym:'INTC',src:'Expert Insight',color:'#059669'},{title:'Taiwan Semis – CTO Meeting Notes Jan \'26',sym:'TSM',src:'Egnyte',color:'#D97706'}].map((d,i)=>(
                <div key={i} style={{ display:'flex', gap:6, marginBottom:5, cursor:'pointer' }}>
                  <DocIcon color={d.color} />
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#1C2B4A', lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.title}</div>
                    <div style={{ fontSize:10, color:'#B0BCD0' }}>{d.sym} · {d.src}</div>
                  </div>
                </div>
              ))}
            </div>
            {/* Events */}
            <div style={{ padding:'10px 12px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#0A1628' }}>Events</span>
                <span style={{ fontSize:16, color:'#B0BCD0', cursor:'pointer' }}>···</span>
              </div>
              {[{date:'10 Apr',title:'Q1 2025 Sales & Revenue',sym:'TSM',tag:'Earnings'},{date:'16 Apr',title:'Q1 2025 Earnings Release',sym:'TSM',tag:'Earnings'}].map((ev,i)=>(
                <div key={i} style={{ marginBottom:7, cursor:'pointer' }}>
                  <div style={{ fontSize:10, color:'#B0BCD0', marginBottom:1 }}>{ev.date}</div>
                  <div style={{ fontSize:11, fontWeight:600, color:'#1C2B4A', lineHeight:1.3 }}>{ev.title}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:'#fff', background:companyBg(ev.sym), padding:'0 4px', borderRadius:3 }}>{ev.sym}</span>
                    <span style={{ fontSize:10, color:'#DC2626', fontWeight:600 }}>· {ev.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Suggested prompts */}
        <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #F5F7FB', fontSize:12, fontWeight:700, color:'#0A1628' }}>Suggested</div>
          {SUGGESTED_PROMPTS.map((p,i)=>(
            <button key={i} onClick={()=>{setQuery(p.label);runAgent(p.label)}}
              style={{ display:'flex', alignItems:'flex-start', gap:8, width:'100%', padding:'8px 14px', borderBottom:i<SUGGESTED_PROMPTS.length-1?'1px solid #F5F7FB':'none', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}
              onMouseEnter={e=>(e.currentTarget.style.background='#FAFBFD')}
              onMouseLeave={e=>(e.currentTarget.style.background='none')}
            >
              <span style={{ fontSize:13, flexShrink:0, marginTop:1 }}>{p.icon}</span>
              <span style={{ fontSize:11.5, color:'#3D4F6E', lineHeight:1.45 }}>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Quick nav */}
        <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
          {[
            { href:'/app/research', icon:'◎', label:'AI Research', desc:'Deep research with citations', color:'#1B4FFF' },
            { href:'/app/filings', icon:'📄', label:'Filings', desc:'SEC, Companies House & more', color:'#059669' },
            { href:'/app/screener', icon:'▤', label:'Screener', desc:'Filter by any metric', color:'#D97706' },
          ].map(c=>(
            <Link key={c.href} href={c.href} style={{ textDecoration:'none' }}>
              <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:10, padding:'9px 12px', display:'flex', alignItems:'center', gap:9, cursor:'pointer', transition:'all 0.12s' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=c.color;(e.currentTarget as HTMLDivElement).style.boxShadow=`0 0 0 2px ${c.color}18`}}
                onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='#E8EDF4';(e.currentTarget as HTMLDivElement).style.boxShadow='none'}}
              >
                <div style={{ width:28, height:28, borderRadius:7, background:`${c.color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>{c.icon}</div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0A1628' }}>{c.label}</div>
                  <div style={{ fontSize:10, color:'#B0BCD0' }}>{c.desc}</div>
                </div>
                <svg style={{ marginLeft:'auto', color:'#B0BCD0', flexShrink:0 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`@keyframes livePulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  )
}
