'use client'
import { useState, useRef, useEffect } from 'react'
import AIMessage from '@/components/AIMessage'
import { PageHero, ContextualAskBar, ACTION_ICONS, ICON_STROKE } from '@/components/ui'
import { track } from '@/lib/analytics'
import {
  SourceLibraryPicker,
  SmartSummaryUpgrade,
  DeepResearchPhases,
  CreateAlertButton,
  ExpertQuoteCard,
  ConnectSourcesOverviewCard,
  useSelectedSourceIds,
  type DocBucketId,
} from '@/components/research-pack'

const C = {
  bg:     'var(--bg-page)',
  card:   'var(--bg-card)',
  cardA:  'var(--bg-elevated)',
  border: 'var(--border)',
  borderS:'var(--border-strong)',
  p:      'var(--text-primary)',
  s:      'var(--text-secondary)',
  m:      'var(--text-muted)',
  acc:    'var(--accent)',
  accT:   'var(--accent-text)',
  accD:   'var(--accent-dim)',
  pos:    'var(--pos)',
  neg:    'var(--neg)',
  amb:    'var(--amber)',
}

const SOURCE_TYPES = [
  { id:'all',        label:'All Sources',        count:'47.2M', icon:'⊞' },
  { id:'broker',     label:'Broker Research',    count:'8.4M',  icon:'◧', desc:'Goldman, Morgan Stanley, JPM, BofA, Citi, Barclays, UBS, Jefferies' },
  { id:'transcript', label:'Earnings Calls',     count:'2.1M',  icon:'◉', desc:'Live & historical transcripts with sentiment scoring' },
  { id:'expert',     label:'Expert Calls',       count:'180K',  icon:'◎', desc:'Tegus-style expert network transcripts' },
  { id:'filing',     label:'SEC Filings',        count:'14.8M', icon:'▣', desc:'10-K, 10-Q, 8-K, S-1, DEF 14A, 13F across 8K companies' },
  { id:'news',       label:'News & Trade Press', count:'21.6M', icon:'◻', desc:'Bloomberg, Reuters, FT, WSJ + 12K trade publications' },
  { id:'corp',       label:'Corp Presentations', count:'340K',  icon:'⊟', desc:'Investor day decks, capital markets day' },
]

const SUGGESTED_QUERIES = [
  { q:'What are the key risks NVDA mentioned in their last earnings call?',     tag:'Earnings',   icon:'◉', sources:['Transcripts','SEC Filings'] },
  { q:'How are hyperscalers prioritizing AI capex for 2026?',                   tag:'Theme',      icon:'◎', sources:['Broker Research','News'] },
  { q:'Compare margin trajectory across MSFT, GOOGL, META cloud segments',      tag:'Comparison', icon:'◧', sources:['Filings','Models'] },
  { q:'What is sell-side consensus on AAPL services growth deceleration?',      tag:'Sentiment',  icon:'◐', sources:['Broker Research'] },
  { q:'List all M&A activity in semiconductor equipment over last 12 months',   tag:'M&A',        icon:'⊟', sources:['News','Deals'] },
  { q:'Summarize FOMC commentary on labor market since January',                tag:'Macro',      icon:'◷', sources:['Macro','News'] },
]

type Citation = {
  id: number
  source: string
  ticker?: string
  doc: string
  page?: string
  date: string
  excerpt: string
  type: 'broker'|'transcript'|'filing'|'news'|'expert'
  sentiment?: 'pos'|'neg'|'neu'
}

type TimelineStep =
  | { kind: 'phase'; phase: 'plan'|'tools'|'synthesise'; label: string }
  | { kind: 'tool';  id: string; name: string; label: string; args?: Record<string, unknown>; status: 'pending'|'ok'|'err'; summary?: string }

type Msg = {
  role: 'user'|'agent'
  text: string
  thinking?: boolean
  answer?: { summary: string; bullets: { text: string; cites: number[] }[] }
  citations?: Citation[]
  steps?: TimelineStep[]
}

// EXAMPLE_CITATIONS are illustrative-only — they populate the Smart Summary
// widget on first paint so the layout reads correctly before any search has
// been run. The UI labels them clearly as an example. Real citations come from
// `/api/agent/ask` tool results once the user submits a query.
const EXAMPLE_CITATIONS: Citation[] = [
  { id:1, source:'Example — Earnings call excerpt', ticker:'—', doc:'Earnings Transcript', page:'p.4',  date:'Example',
    excerpt:'Quoted excerpts from the most recent earnings call appear here once you run a search. Citations link back to the exact source page.',
    type:'transcript', sentiment:'neu' },
  { id:2, source:'Example — Sell-side research note', ticker:'—', doc:'Equity Research', page:'p.12', date:'Example',
    excerpt:'Top sell-side notes (price target changes, ratings, summary) for the searched ticker will appear here, with the originating broker and page.',
    type:'broker', sentiment:'neu' },
  { id:3, source:'Example — SEC filing risk factor', ticker:'—', doc:'SEC Filing 10-Q', page:'p.31', date:'Example',
    excerpt:'Risk factors and MD&A excerpts pulled live from EDGAR will appear here once the search completes.',
    type:'filing', sentiment:'neu' },
  { id:4, source:'Example — Industry note', doc:'Industry Note', page:'p.7', date:'Example',
    excerpt:'Cross-company industry research notes will land here. The view filters by document type and ticker, both of which derive from the live answer.',
    type:'broker', sentiment:'neu' },
  { id:5, source:'Example — Expert network call', doc:'Expert Transcript', date:'Example',
    excerpt:'Tegus / Stream / Third Bridge style expert call transcripts will appear here once Tegus integration is live.',
    type:'expert', sentiment:'neu' },
]

// Maps the agent route's tool names → research page citation buckets so each
// tool call shows up in the right-hand source rail with the correct chip color.
const TOOL_TO_CITE_TYPE: Record<string, Citation['type']> = {
  get_quote: 'broker',
  get_news: 'news',
  get_filings: 'filing',
  get_financials: 'broker',
  get_estimates: 'broker',
  get_transcripts: 'transcript',
  get_macro: 'broker',
}
const TOOL_LABEL: Record<string, string> = {
  get_quote: 'Real-time quote',
  get_news: 'Latest news',
  get_filings: 'SEC filings',
  get_financials: 'Financial statements',
  get_estimates: 'Sell-side estimates',
  get_transcripts: 'Earnings transcripts',
  get_macro: 'Macro data',
}
const TOOL_DOC_LABEL: Record<string, string> = {
  get_quote: 'Live market data',
  get_news: 'News feed',
  get_filings: 'SEC EDGAR',
  get_financials: 'Financial statement data',
  get_estimates: 'Analyst estimates',
  get_transcripts: 'Earnings transcript',
  get_macro: 'Macro indicator series',
}

function StepsTimeline({ steps, C }: { steps: TimelineStep[]; C: Record<string, string> }) {
  return (
    <div style={{
      display:'flex',flexDirection:'column',gap:8,
      padding:'12px 14px',marginTop:8,
      background:C.cardA,border:`1px solid ${C.border}`,borderRadius:10,
    }}>
      {steps.map((s, i) => {
        if (s.kind === 'phase') {
          return (
            <div key={i} style={{
              display:'flex',alignItems:'center',gap:8,
              fontSize:10,fontWeight:800,color:C.m,
              letterSpacing:'0.06em',textTransform:'uppercase',
              marginTop: i > 0 ? 6 : 0,
            }}>
              <span style={{
                display:'inline-flex',alignItems:'center',justifyContent:'center',
                width:14,height:14,borderRadius:4,
                background:C.accD,color:C.accT,fontSize:9,
              }}>{s.phase==='plan'?'◷':s.phase==='tools'?'◧':'◐'}</span>
              {s.label}
            </div>
          )
        }
        const argEntries = s.args ? Object.entries(s.args).filter(([,v]) => v !== undefined && v !== null && v !== '') : []
        const argText = argEntries.length
          ? argEntries.map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')
          : ''
        return (
          <div key={i} style={{display:'flex',gap:9,alignItems:'flex-start',paddingLeft:6}}>
            <span style={{
              flexShrink:0,marginTop:2,
              display:'inline-flex',alignItems:'center',justifyContent:'center',
              width:14,height:14,borderRadius:'50%',
              ...(s.status === 'pending'
                ? { border:'2px solid rgba(123,150,184,0.3)', borderTopColor:C.accT, animation:'spin 0.8s linear infinite' }
                : s.status === 'ok'
                ? { background:'rgba(52,211,153,0.18)', color:C.pos, fontSize:9, fontWeight:800 }
                : { background:'rgba(248,113,113,0.18)', color:C.neg, fontSize:9, fontWeight:800 }),
            }}>
              {s.status === 'ok'
                ? <ACTION_ICONS.check width={9} height={9} strokeWidth={ICON_STROKE} />
                : s.status === 'err'
                ? <ACTION_ICONS.close width={9} height={9} strokeWidth={ICON_STROKE} />
                : null}
            </span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12.5,color:C.p,fontWeight:600,lineHeight:1.35}}>
                {s.label}
                {argText && (
                  <span style={{color:C.m,fontWeight:500,marginLeft:6,fontSize:11}}>· {argText}</span>
                )}
              </div>
              {s.summary && (
                <div style={{
                  fontSize:11.5,color:C.s,marginTop:3,lineHeight:1.4,
                  fontFamily:'var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
                  background:'var(--row-stripe)',
                  padding:'4px 8px',borderRadius:5,
                  display:'inline-block',
                }}>{s.summary}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ResearchPage() {
  const [query, setQuery]   = useState('')
  const [source, setSource] = useState('all')
  const [chat, setChat]     = useState<Msg[]>([])
  const [running, setRunning] = useState(false)
  const [activeCite, setActiveCite] = useState<number|null>(null)
  // Result-list filters — derived from the citation set of the latest answer.
  const [citeTicker, setCiteTicker] = useState<string>('all')
  const [citeType, setCiteType] = useState<string>('all')
  const [libOpen, setLibOpen] = useState(false)
  const [deep, setDeep] = useState(false)
  const [phase, setPhase] = useState(-1)
  // Per-message expand toggle for the AI working timeline. Stored as a Set of
  // chat indices so the open/closed state survives streaming updates.
  const [openTimelines, setOpenTimelines] = useState<Set<number>>(new Set())
  // Workspace-scoped Source Library selection (leaf source IDs)
  const selectedSourceIds = useSelectedSourceIds()
  const librarySize = selectedSourceIds.length
  const lastUserQuery = [...chat].reverse().find(m => m.role === 'user')?.text || ''
  // Smart Summary binds to the live citation set of the most recent answer
  // (or the demo citations on first paint, so the dashboard still has content
  // before any question has been asked).
  const lastAnswerCites = chat.length > 0 ? chat[chat.length-1].citations : undefined
  const usingExampleCites = !(lastAnswerCites && lastAnswerCites.length > 0)
  const liveCitations: Citation[] = usingExampleCites ? EXAMPLE_CITATIONS : (lastAnswerCites as Citation[])
  const CITE_TO_BUCKET: Record<Citation['type'], 'broker'|'expert-script'|'regulatory'|'news'|'expert-call'> = {
    broker: 'broker', transcript: 'expert-script', filing: 'regulatory', news: 'news', expert: 'expert-call',
  }
  const liveSummaryItems = liveCitations.map(c => ({
    ticker: c.ticker || '—',
    doc: CITE_TO_BUCKET[c.type],
    date: c.date,
    source: c.source,
    highlight: c.excerpt.replace(/^"|"$/g, ''),
    sentiment: (c.sentiment || 'neu') as 'pos'|'neu'|'neg',
  }))
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({behavior:'smooth'}) }, [chat])
  // Reset cite-list filters whenever a new answer lands so stale chips never
  // hide the freshly-returned source set.
  useEffect(() => { setCiteTicker('all'); setCiteType('all') }, [chat.length])

  // Citation.type → SourceLibrary leaf-id buckets. Used to scope the citation
  // set the (stub) answer pipeline returns by the user's active Source Library
  // selection. When the library is narrowed, the answer's sources should be
  // narrowed too.
  const CITE_TYPE_BUCKETS: Record<Citation['type'], string[]> = {
    broker:     ['nw.bb','nw.rt','nw.wsj','nw.ft','cp.idays','cp.cmd'],
    transcript: ['eprep.script','eprep.kpi','ir.q4','ir.faq'],
    filing:     ['fl.10k','fl.10q','fl.8k','fl.def','fl.13f'],
    news:       ['nw.bb','nw.rt','nw.wsj','nw.ft'],
    expert:     ['ex.tegus','ex.guidepoint','rec.cust11','rec.exp42'],
  }
  function scopeCitations(all: Citation[]): Citation[] {
    if (selectedSourceIds.length === 0) return all
    const sel = new Set(selectedSourceIds)
    const scoped = all.filter(c => (CITE_TYPE_BUCKETS[c.type] || []).some(id => sel.has(id)))
    // Never return zero citations from a non-empty source set — fall back to
    // unscoped so the answer panel is still legible while the picker is open.
    return scoped.length ? scoped : all
  }

  function ask(q?: string) {
    const text = (q || query).trim()
    if (!text) return
    setQuery('')
    setChat(prev => [
      ...prev,
      { role:'user', text },
      { role:'agent', text:'', thinking:true },
    ])
    setRunning(true)
    setPhase(0)
    track('research_ask', { q: text, deep, sources: selectedSourceIds.length })

    const updateAgent = (patch: Partial<Msg>) => setChat(prev => {
      const next = [...prev]
      const i = next.length - 1
      if (i < 0 || next[i].role !== 'agent') return prev
      next[i] = { ...next[i], ...patch }
      return next
    })

    let answerText = ''
    const citations: Citation[] = []
    let citeId = 1
    const steps: TimelineStep[] = []
    const pushSteps = () => updateAgent({ steps: [...steps] })

    ;(async () => {
      try {
        // NOTE: with `basePath: '/platform'` in next.config.ts, browser
        // `fetch` does NOT auto-prefix root-relative paths, so we must
        // prepend NEXT_PUBLIC_BASE_PATH (mirrors the pattern in
        // components/company/AIAnalysisTab.tsx and AppShell.tsx). Without
        // this, the request hits `/api/agent/ask` and 404s before the
        // agent ever runs.
        const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
        const res = await fetch(`${BASE}/api/agent/ask`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // NOTE: server-side source scoping is not yet implemented in
          // /api/agent/ask, so we deliberately do NOT send selectedSourceIds
          // here — sending it would imply scoping that does not exist. UI-side
          // citation filtering still narrows the rendered result set.
          body: JSON.stringify({ question: text }),
        })
        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`)
          updateAgent({
            thinking: false,
            answer: { summary: `**Couldn't reach the research model.**\n\n${errText.slice(0, 400)}`, bullets: [] },
          })
          setRunning(false); setPhase(-1); return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let idx
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            let eventName = 'message'
            let dataLine = ''
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim()
              else if (line.startsWith('data:')) dataLine += line.slice(5).trim()
            }
            if (!dataLine) continue
            let data: any
            try { data = JSON.parse(dataLine) } catch { continue }

            if (eventName === 'step') {
              if (data.kind === 'plan') setPhase(1)
              else if (data.kind === 'tools') setPhase(2)
              else if (data.kind === 'synthesise') setPhase(3)
              if (data.kind === 'plan' || data.kind === 'tools' || data.kind === 'synthesise') {
                steps.push({ kind: 'phase', phase: data.kind, label: data.label || data.kind })
                pushSteps()
              }
            } else if (eventName === 'tool_call') {
              steps.push({
                kind: 'tool',
                id: String(data.id || `${data.name}-${steps.length}`),
                name: data.name,
                label: TOOL_LABEL[data.name] || data.name,
                args: (data.args && typeof data.args === 'object') ? data.args : undefined,
                status: 'pending',
              })
              pushSteps()
            } else if (eventName === 'tool_result') {
              const id = String(data.id || '')
              const idx = steps.findIndex(s => s.kind === 'tool' && s.id === id)
              if (idx >= 0 && steps[idx].kind === 'tool') {
                const prev = steps[idx] as Extract<TimelineStep, { kind: 'tool' }>
                steps[idx] = { ...prev, status: data.ok ? 'ok' : 'err', summary: data.summary || (data.ok ? 'done' : 'no data') }
              } else {
                steps.push({
                  kind: 'tool',
                  id: id || `${data.name}-${steps.length}`,
                  name: data.name,
                  label: TOOL_LABEL[data.name] || data.name,
                  status: data.ok ? 'ok' : 'err',
                  summary: data.summary,
                })
              }
              pushSteps()
            }
            if (eventName === 'tool_result' && data.ok) {
              const sym = (() => { try { const r = JSON.parse(data.raw || '{}'); return r.symbol || r.articles?.[0]?.symbol || undefined } catch { return undefined } })()
              const cite: Citation = {
                id: citeId++,
                source: TOOL_LABEL[data.name] || data.name,
                ticker: sym,
                doc: TOOL_DOC_LABEL[data.name] || data.name,
                date: new Date().toISOString().slice(0, 10),
                excerpt: data.summary || '',
                type: TOOL_TO_CITE_TYPE[data.name] || 'news',
              }
              citations.push(cite)
              updateAgent({ citations: [...citations] })
            } else if (eventName === 'answer_chunk') {
              answerText += data.text || ''
              updateAgent({
                thinking: false,
                answer: { summary: answerText, bullets: [] },
                citations: [...citations],
              })
            } else if (eventName === 'done') {
              updateAgent({
                thinking: false,
                answer: { summary: answerText || '_The model returned an empty response._', bullets: [] },
                citations: [...citations],
              })
            } else if (eventName === 'error') {
              updateAgent({
                thinking: false,
                answer: { summary: `**Research agent error:** ${data.message || 'unknown error'}`, bullets: [] },
              })
            }
          }
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          updateAgent({
            thinking: false,
            answer: { summary: `**Network error:** ${e?.message || String(e)}`, bullets: [] },
          })
        }
      } finally {
        setRunning(false); setPhase(-1)
      }
    })()
  }
  // scopeCitations / SAMPLE_CITATIONS still drive the empty-state Smart Summary
  // preview below — they never feed the live answer.
  void scopeCitations

  return (
    <div style={{display:'flex',height:'100%',color:C.p}}>

      {/* Left: source filters */}
      <aside style={{width:240,minWidth:240,borderRight:`1px solid ${C.border}`,padding:'18px 14px',overflowY:'auto'}}>
        <button onClick={() => setLibOpen(true)} style={{
          display:'flex',width:'100%',alignItems:'center',gap:8,padding:'9px 11px',borderRadius:8,
          background:'var(--accent-dim)',border:'1px solid var(--accent)',color:'var(--accent-text)',
          fontFamily:'inherit',fontSize:12,fontWeight:700,cursor:'pointer',marginBottom:14,
        }}>
          <span style={{fontSize:14}}>▦</span>
          <span style={{flex:1,textAlign:'left'}}>Source Library</span>
          <span style={{fontSize:10,opacity:0.8,fontVariantNumeric:'tabular-nums'}}>{librarySize ? `${librarySize} on` : 'Pick'}</span>
        </button>

        <label style={{
          display:'flex',alignItems:'center',gap:8,padding:'8px 11px',borderRadius:8,marginBottom:14,
          background: deep ? 'var(--violet-dim)' : 'transparent',
          border:'1px solid', borderColor: deep ? 'var(--violet)' : C.border,
          cursor:'pointer',fontSize:12,color:deep ? 'var(--violet)' : C.s,fontWeight:700,
        }}>
          <input type="checkbox" checked={deep} onChange={e => setDeep(e.target.checked)} style={{accentColor:'var(--violet)'}} />
          <span style={{flex:1}}>Deep Research</span>
          <span style={{fontSize:9,opacity:0.7}}>visible reasoning</span>
        </label>

        <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.06em',color:C.m,textTransform:'uppercase',marginBottom:10,padding:'0 6px'}}>Search Across</div>
        {SOURCE_TYPES.map(s => (
          <button key={s.id} onClick={() => setSource(s.id)} style={{
            display:'block',width:'100%',textAlign:'left',padding:'9px 10px',borderRadius:8,
            background: source===s.id ? C.accD : 'transparent',
            border:'none',cursor:'pointer',marginBottom:3,transition:'all 0.14s',fontFamily:'inherit',
          }}
          onMouseEnter={e => { if (source!==s.id) (e.currentTarget as HTMLElement).style.background='var(--row-stripe)' }}
          onMouseLeave={e => { if (source!==s.id) (e.currentTarget as HTMLElement).style.background='transparent' }}>
            <div style={{display:'flex',alignItems:'center',gap:9}}>
              <span style={{fontSize:13,color:source===s.id?C.accT:C.s,width:16,textAlign:'center'}}>{s.icon}</span>
              <span style={{fontSize:12.5,fontWeight:source===s.id?700:500,color:source===s.id?C.accT:C.p,flex:1}}>{s.label}</span>
              <span style={{fontSize:10,color:C.m,fontWeight:600}}>{s.count}</span>
            </div>
            {source===s.id && s.desc && (
              <div style={{fontSize:10,color:C.s,paddingLeft:25,marginTop:5,lineHeight:1.4}}>{s.desc}</div>
            )}
          </button>
        ))}

        <div style={{height:1,background:C.border,margin:'14px 0'}}/>

        <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.06em',color:C.m,textTransform:'uppercase',marginBottom:10,padding:'0 6px'}}>Filters</div>
        {[
          { l:'Time period',  v:'Last 90 days ▾' },
          { l:'Companies',    v:'My watchlist (24) ▾' },
          { l:'Sectors',      v:'All sectors ▾' },
          { l:'Document type',v:'Any type ▾' },
          { l:'Geography',    v:'Global ▾' },
        ].map(f => (
          <div key={f.l} style={{padding:'7px 10px',marginBottom:3}}>
            <div style={{fontSize:10,color:C.m,fontWeight:600,marginBottom:3}}>{f.l}</div>
            <button style={{background:'transparent',border:'none',color:C.p,fontSize:12,fontWeight:500,cursor:'pointer',padding:0,fontFamily:'inherit'}}>{f.v}</button>
          </div>
        ))}

        <div style={{height:1,background:C.border,margin:'14px 0'}}/>

        <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.06em',color:C.m,textTransform:'uppercase',marginBottom:10,padding:'0 6px'}}>Recent Searches</div>
        {[
          'NVDA Blackwell ramp commentary',
          'Hyperscaler AI capex 2026',
          'GLP-1 supply constraints',
          'TSMC CoWoS capacity',
        ].map((r,i) => (
          <button key={i} style={{display:'block',width:'100%',textAlign:'left',padding:'6px 10px',borderRadius:6,background:'transparent',border:'none',cursor:'pointer',color:C.s,fontSize:11.5,fontFamily:'inherit',marginBottom:1}}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='var(--row-stripe)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>
            <span style={{color:C.m,marginRight:6}}>⌕</span>{r}
          </button>
        ))}
      </aside>

      {/* Center: chat */}
      <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Empty state */}
        {chat.length === 0 ? (
          <div style={{flex:1,overflowY:'auto',width:'100%'}}>
            <div style={{maxWidth:980,margin:'0 auto',padding:'12px 24px 48px'}}>

            <PageHero
              eyebrow={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ACTION_ICONS.sparkles width={11} height={11} strokeWidth={ICON_STROKE} />
                  Generative Search · 47.2M sources
                </span>
              }
              title="Begin your research."
              accentWord="research"
              subtitle="Ask anything across broker research, earnings calls, expert interviews, SEC filings, news, and corporate presentations. Every answer is cited to its source."
            />

            <ContextualAskBar
              context="Research"
              contextData={{ page: 'research', selectedSources: selectedSourceIds.length, sourceFilter: source }}
              chips={[
                { label: 'Synthesise sources',  prompt: 'Synthesise the sources I have selected into a single research note with citations.' },
                { label: 'Compare two companies', prompt: 'Compare two companies I name across financials, strategy, and recent disclosures with side-by-side citations.' },
                { label: 'Build a thesis',       prompt: 'Build me a long thesis on a name I provide — bull case, bear case, key catalysts, and risk to thesis.' },
                { label: 'Counter-arguments',    prompt: 'Stress-test my thesis on a name I provide — give me the strongest counter-arguments and what would change my mind.' },
              ]}
              placeholder="Ask anything — Finsyt cites every claim…"
              style={{ margin: '0 8px 14px' }}
            />

            {/* Search box */}
            <div style={{background:C.card,border:`1.5px solid ${C.borderS}`,borderRadius:14,padding:14,margin:'8px 8px 18px',boxShadow:'0 4px 30px rgba(27,79,255,0.08)'}}>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                <span style={{fontSize:18,color:C.accT,padding:'4px 0'}}>⌕</span>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter') ask() }}
                  placeholder="Ask anything across the financial corpus…"
                  style={{flex:1,background:'transparent',border:'none',color:C.p,fontSize:15,outline:'none',fontFamily:'inherit',padding:'5px 0'}}
                />
                <CreateAlertButton
                  query={query || lastUserQuery}
                  sources={selectedSourceIds}
                  sourceFilter={source === 'all' ? undefined : source}
                  variant="ghost"
                  label="＋ Save as alert"
                />
                <button onClick={() => ask()} disabled={!query.trim()} style={{
                  padding:'8px 16px',borderRadius:8,
                  background: query.trim() ? C.acc : 'rgba(27,79,255,0.25)',
                  color: query.trim() ? '#fff' : 'rgba(255,255,255,0.4)',
                  border:'none',fontSize:13,fontWeight:700,cursor:query.trim()?'pointer':'default',
                }}>Ask ↵</button>
              </div>
            </div>

            {/* Try a question — Rogo-style prompt cards with source chips */}
            <div style={{margin:'0 8px 32px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:C.m,letterSpacing:'0.06em',textTransform:'uppercase'}}>Try asking Finsyt</div>
                <span style={{fontSize:11,color:C.s}}>Click a card to run</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {SUGGESTED_QUERIES.map((s,i) => (
                  <button key={i} onClick={() => ask(s.q)} style={{
                    padding:'14px 16px',borderRadius:12,background:C.card,border:`1px solid ${C.border}`,
                    cursor:'pointer',textAlign:'left',transition:'all 0.14s',fontFamily:'inherit',
                    display:'flex',gap:12,alignItems:'flex-start',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor='rgba(27,79,255,0.4)'; (e.currentTarget as HTMLElement).style.background=C.cardA }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor=C.border; (e.currentTarget as HTMLElement).style.background=C.card }}>
                    <span style={{
                      width:32,height:32,borderRadius:8,
                      background:C.accD,color:C.accT,
                      display:'inline-flex',alignItems:'center',justifyContent:'center',
                      fontSize:15,flexShrink:0,
                    }}>{s.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13.5,color:C.p,fontWeight:600,lineHeight:1.4,marginBottom:8}}>{s.q}</div>
                      <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                        <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,background:C.accD,color:C.accT,letterSpacing:'0.04em'}}>{s.tag}</span>
                        {s.sources.map(src => (
                          <span key={src} style={{
                            fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:5,
                            background:'var(--hover)',color:C.s,
                            border:`1px solid ${C.border}`,
                          }}>◧ {src}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:18}}>
              <ConnectSourcesOverviewCard onOpen={() => { window.location.href = '/app/settings?section=data' }} />
            </div>

            {/* Smart Summaries — upgraded with doc-type buckets + ticker tabs */}
            <div style={{marginBottom:24}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:C.p,marginBottom:2}}>Smart Summary</div>
                    <div style={{fontSize:11,color:C.s}}>{usingExampleCites ? 'Example layout — run a search above to populate with real citations.' : 'Latest highlights across your answer\u2019s citations, bucketed by document type'}</div>
                  </div>
                  {usingExampleCites && (
                    <span style={{fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:6,background:'var(--amber-dim,rgba(251,191,36,0.13))',color:'var(--amber)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Example</span>
                  )}
                </div>
                <button style={{background:'none',border:'none',color:C.accT,fontSize:12,fontWeight:600,cursor:'pointer'}}>View all →</button>
              </div>
              <SmartSummaryUpgrade
                items={liveSummaryItems}
                ticker={citeTicker === 'all' ? 'ALL' : citeTicker}
                bucket={citeType === 'all' ? 'all' : (CITE_TO_BUCKET[citeType as Citation['type']] as DocBucketId)}
                onTickerChange={t => setCiteTicker(t === 'ALL' ? 'all' : t)}
                onBucketChange={b => {
                  if (b === 'all') { setCiteType('all'); return }
                  const inv = (Object.entries(CITE_TO_BUCKET) as [Citation['type'], DocBucketId][])
                    .find(([,v]) => v === b)
                  setCiteType(inv ? inv[0] : 'all')
                }}
                onCiteClick={(it) => {
                  // Resolve back to the actual Citation by source+date so the
                  // drawer always opens the right one regardless of which
                  // filter is currently applied to the summary list.
                  const cite = liveCitations.find(c => c.source === it.source && c.date === it.date)
                  if (cite) setActiveCite(cite.id)
                }}
              />
            </div>

            </div>
          </div>
        ) : (
          <div style={{flex:1,overflowY:'auto',padding:'24px 48px'}}>
            <div style={{maxWidth:920,margin:'0 auto'}}>
              {chat.map((m,i) => (
                <div key={i} style={{marginBottom:24}}>
                  {m.role==='user' && (
                    <div style={{padding:'14px 16px',background:C.cardA,border:`1px solid ${C.border}`,borderRadius:11,marginBottom:14,display:'flex',gap:10,alignItems:'flex-start'}}>
                      <div style={{width:24,height:24,borderRadius:6,background:'var(--row-stripe)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:C.s,flexShrink:0}}>J</div>
                      <div style={{flex:1,fontSize:14,color:C.p,fontWeight:600,lineHeight:1.45}}>{m.text}</div>
                    </div>
                  )}
                  {m.role==='agent' && (
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,fontSize:11,color:C.m,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>
                        <div style={{width:18,height:18,borderRadius:5,background:'var(--gradient-brand)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color: '#fff'}}>F</div>
                        Finsyt Generative Search
                        {m.thinking && <span style={{color:C.amb,marginLeft:4}}>● synthesizing across 47M documents…</span>}
                      </div>

                      {m.thinking && deep && (
                        <div style={{padding:'14px 0'}}>
                          <DeepResearchPhases active={phase} sourcesScanned={Math.min(phase * 8, 47)} citationsFound={Math.max(0, phase * 2)} />
                        </div>
                      )}

                      {/*
                        AI working timeline. Visible expanded while the agent
                        is still thinking; once the answer arrives it collapses
                        into a single-line summary that the user can re-open.
                        In Deep Research mode the rich DeepResearchPhases UI
                        already shows the high-level phases, so we only show
                        the per-tool detail here while thinking.
                      */}
                      {(() => {
                        const stepCount = m.steps?.length || 0
                        if (stepCount === 0 && !m.thinking) return null
                        const isOpen = m.thinking || openTimelines.has(i)
                        const toolSteps = (m.steps || []).filter(s => s.kind === 'tool') as Extract<TimelineStep, { kind: 'tool' }>[]
                        const completed = toolSteps.filter(s => s.status !== 'pending').length
                        return (
                          <div style={{margin: m.thinking ? '4px 0 18px' : '0 0 18px'}}>
                            <button
                              type="button"
                              onClick={() => setOpenTimelines(prev => {
                                const next = new Set(prev)
                                if (next.has(i)) next.delete(i); else next.add(i)
                                return next
                              })}
                              disabled={m.thinking}
                              style={{
                                display:'flex',alignItems:'center',gap:8,width:'100%',
                                padding:'8px 12px',borderRadius:8,
                                background: isOpen ? C.cardA : 'var(--row-stripe)',
                                border:`1px solid ${C.border}`,
                                color:C.s,fontSize:11.5,fontWeight:600,fontFamily:'inherit',
                                cursor: m.thinking ? 'default' : 'pointer',textAlign:'left',
                              }}
                            >
                              <span style={{
                                display:'inline-flex',alignItems:'center',justifyContent:'center',
                                width:14,height:14,borderRadius:4,
                                background:m.thinking?'transparent':C.accD,color:C.accT,fontSize:10,fontWeight:800,
                              }}>
                                {m.thinking
                                  ? <span style={{display:'inline-block',width:10,height:10,borderRadius:'50%',border:'2px solid rgba(123,150,184,0.3)',borderTopColor:C.accT,animation:'spin 0.8s linear infinite'}}/>
                                  : <ACTION_ICONS.check width={9} height={9} strokeWidth={ICON_STROKE} />}
                              </span>
                              <span style={{flex:1,color:m.thinking?C.amb:C.s}}>
                                {m.thinking
                                  ? (toolSteps.length > 0
                                      ? `AI working · ${completed}/${toolSteps.length} step${toolSteps.length===1?'':'s'} done`
                                      : 'AI working · planning approach…')
                                  : `AI worked through ${toolSteps.length || stepCount} step${(toolSteps.length || stepCount)===1?'':'s'}`}
                              </span>
                              {!m.thinking && (
                                <span style={{fontSize:10,color:C.m,fontWeight:700}}>{isOpen ? 'Hide ▴' : 'View ▾'}</span>
                              )}
                            </button>
                            {isOpen && stepCount > 0 && (
                              <StepsTimeline steps={m.steps!} C={C} />
                            )}
                          </div>
                        )
                      })()}

                      {m.answer && (
                        <div>
                          <div style={{fontSize:14.5,color:C.p,lineHeight:1.6,marginBottom:18,fontWeight:500}}><AIMessage content={m.answer.summary} /></div>

                          {/* Expert-call quote highlight (Tegus-style pull quote) */}
                          {m.citations?.find(c => c.type === 'expert') && (() => {
                            const ex = m.citations!.find(c => c.type === 'expert')!
                            const role = ex.source.replace(/^Expert Call — /, '')
                            return (
                              <div style={{marginBottom:18}}>
                                <ExpertQuoteCard
                                  q={{
                                    expert: role,
                                    role,
                                    network: ex.doc,
                                    quote: ex.excerpt.replace(/^"|"$/g, ''),
                                    date: ex.date,
                                    ticker: ex.ticker,
                                    sentiment: ex.sentiment,
                                    relevance: 0.92,
                                  }}
                                  onOpen={() => setActiveCite(ex.id)}
                                />
                              </div>
                            )
                          })()}

                          <div style={{marginBottom:20}}>
                            {m.answer.bullets.map((b,j) => (
                              <div key={j} style={{display:'flex',gap:12,padding:'10px 0',borderTop:j>0?`1px solid ${C.border}`:'none'}}>
                                <span style={{color:C.accT,fontSize:14,fontWeight:700,flexShrink:0,width:18,textAlign:'center'}}>·</span>
                                <div style={{flex:1,fontSize:13.5,color:C.p,lineHeight:1.55}}>
                                  <AIMessage content={b.text} />
                                  {b.cites.map(c => (
                                    <button key={c} onClick={() => setActiveCite(c)} style={{
                                      display:'inline-flex',alignItems:'center',justifyContent:'center',
                                      width:18,height:18,borderRadius:5,marginLeft:5,verticalAlign:'middle',
                                      background:activeCite===c?C.acc:C.accD,color:activeCite===c?'#fff':C.accT,
                                      border:'none',cursor:'pointer',fontSize:9.5,fontWeight:700,fontFamily:'inherit',
                                    }}>{c}</button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>

                          <div style={{display:'flex',gap:6,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
                            {[
                              { i:'⊞', l:'Add to workspace' },
                              { i:'↗', l:'Share' },
                              { i:'⬇', l:'Export' },
                              { i:'↻', l:'Regenerate' },
                            ].map(a => (
                              <button key={a.l} style={{padding:'6px 11px',borderRadius:7,background:'var(--row-stripe)',border:`1px solid ${C.border}`,color:C.s,fontSize:11.5,fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5,fontFamily:'inherit'}}>
                                <span style={{color:C.accT}}>{a.i}</span>{a.l}
                              </button>
                            ))}
                            <CreateAlertButton
                              query={lastUserQuery}
                              ticker={m.citations?.find(c => c.ticker)?.ticker}
                              sources={selectedSourceIds}
                              sourceFilter={source === 'all' ? undefined : source}
                              label="🔔 Set live alert"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={endRef}/>
            </div>
          </div>
        )}

        {/* Bottom input bar (when in chat) */}
        {chat.length > 0 && (
          <div style={{padding:'14px 48px',borderTop:`1px solid ${C.border}`,background:C.bg}}>
            <div style={{maxWidth:920,margin:'0 auto',background:C.card,border:`1.5px solid ${C.borderS}`,borderRadius:11,padding:'9px 12px',display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:14,color:C.accT}}>⌕</span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter') ask() }}
                placeholder="Ask a follow-up…"
                style={{flex:1,background:'transparent',border:'none',color:C.p,fontSize:13.5,outline:'none',fontFamily:'inherit',padding:'4px 0'}}
              />
              <button onClick={() => ask()} disabled={!query.trim()||running} style={{
                padding:'7px 14px',borderRadius:7,background:query.trim()?C.acc:'rgba(27,79,255,0.2)',color:query.trim()?'#fff':'rgba(255,255,255,0.4)',
                border:'none',fontSize:12,fontWeight:700,cursor:query.trim()?'pointer':'default',
              }}>Ask ↵</button>
            </div>
          </div>
        )}
      </main>

      {/* Right: citations panel — with query-derived ticker + doc-type tab strips */}
      {chat.length > 0 && chat[chat.length-1].citations && (() => {
        const allCites = chat[chat.length-1].citations!
        const tickers = Array.from(new Set(allCites.map(c => c.ticker).filter(Boolean) as string[]))
        const types   = Array.from(new Set(allCites.map(c => c.type)))
        const visible = allCites.filter(c =>
          (citeTicker === 'all' || c.ticker === citeTicker) &&
          (citeType === 'all' || c.type === citeType)
        )
        return (
        <aside style={{width:380,minWidth:380,borderLeft:`1px solid ${C.border}`,overflowY:'auto'}}>
          <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,position:'sticky',top:0,background:C.bg,zIndex:5}}>
            <div style={{fontSize:13,fontWeight:700,color:C.p,marginBottom:3}}>Sources · {visible.length} of {allCites.length} cited</div>
            <div style={{fontSize:11,color:C.s,marginBottom:10}}>Every claim traceable to original document</div>
            {tickers.length > 0 && (
              <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:6}}>
                <button onClick={() => setCiteTicker('all')} style={{padding:'3px 8px',borderRadius:5,fontSize:10,fontWeight:700,fontFamily:'inherit',cursor:'pointer',
                  border:`1px solid ${citeTicker==='all'?C.acc:C.border}`,background:citeTicker==='all'?C.accD:'transparent',color:citeTicker==='all'?C.accT:C.s,
                }}>All tickers</button>
                {tickers.map(t => (
                  <button key={t} onClick={() => setCiteTicker(t)} style={{padding:'3px 8px',borderRadius:5,fontSize:10,fontWeight:700,fontFamily:'inherit',cursor:'pointer',
                    border:`1px solid ${citeTicker===t?C.acc:C.border}`,background:citeTicker===t?C.accD:'transparent',color:citeTicker===t?C.accT:C.s,
                  }}>{t}</button>
                ))}
              </div>
            )}
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              <button onClick={() => setCiteType('all')} style={{padding:'3px 8px',borderRadius:5,fontSize:10,fontWeight:700,fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.04em',
                border:`1px solid ${citeType==='all'?'var(--violet)':C.border}`,background:citeType==='all'?'var(--violet-dim)':'transparent',color:citeType==='all'?'var(--violet)':C.s,
              }}>All types</button>
              {types.map(t => (
                <button key={t} onClick={() => setCiteType(t)} style={{padding:'3px 8px',borderRadius:5,fontSize:10,fontWeight:700,fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.04em',
                  border:`1px solid ${citeType===t?'var(--violet)':C.border}`,background:citeType===t?'var(--violet-dim)':'transparent',color:citeType===t?'var(--violet)':C.s,
                }}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{padding:'8px 0'}}>
            {visible.map(c => (
              <div key={c.id} onClick={() => setActiveCite(c.id)} style={{
                padding:'12px 16px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'all 0.14s',
                background: activeCite===c.id ? C.accD : 'transparent',
              }}
              onMouseEnter={e => { if (activeCite!==c.id) (e.currentTarget as HTMLElement).style.background='var(--row-hover)' }}
              onMouseLeave={e => { if (activeCite!==c.id) (e.currentTarget as HTMLElement).style.background='transparent' }}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:5,background:C.acc,color: '#fff',fontSize:10,fontWeight:700,flexShrink:0}}>{c.id}</span>
                  <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:5,background:'var(--hover-strong)',color:C.s,letterSpacing:'0.04em',textTransform:'uppercase'}}>{c.type}</span>
                  {c.ticker && <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,background:C.accD,color:C.accT}}>{c.ticker}</span>}
                  {c.sentiment && (
                    <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,marginLeft:'auto',
                      background: c.sentiment==='pos' ? 'rgba(52,211,153,0.15)' : c.sentiment==='neg' ? 'rgba(248,113,113,0.15)' : 'var(--hover)',
                      color: c.sentiment==='pos' ? C.pos : c.sentiment==='neg' ? C.neg : C.s,
                    }}>{c.sentiment==='pos'?'+ POS':c.sentiment==='neg'?'– NEG':'NEU'}</span>
                  )}
                </div>
                <div style={{fontSize:12.5,fontWeight:700,color:C.p,marginBottom:3,lineHeight:1.35}}>{c.source}</div>
                <div style={{fontSize:10.5,color:C.m,marginBottom:8,display:'flex',gap:6}}>
                  <span>{c.doc}</span>
                  {c.page && <><span>·</span><span>{c.page}</span></>}
                  <span>·</span><span>{c.date}</span>
                </div>
                <div style={{fontSize:11.5,color:C.s,lineHeight:1.5,fontStyle: c.excerpt.startsWith('"') ? 'italic' : 'normal',
                  paddingLeft: c.excerpt.startsWith('"') ? 8 : 0,
                  borderLeft: c.excerpt.startsWith('"') ? `2px solid ${C.borderS}` : 'none'}}>
                  {c.excerpt}
                </div>
                <div style={{display:'flex',gap:5,marginTop:9}}>
                  <button style={{padding:'4px 9px',borderRadius:6,background:'var(--row-stripe)',border:`1px solid ${C.border}`,color:C.s,fontSize:10,fontWeight:600,cursor:'pointer'}}>↗ Open</button>
                  <button style={{padding:'4px 9px',borderRadius:6,background:'var(--row-stripe)',border:`1px solid ${C.border}`,color:C.s,fontSize:10,fontWeight:600,cursor:'pointer'}}>＋ Save</button>
                  <button style={{padding:'4px 9px',borderRadius:6,background:'var(--row-stripe)',border:`1px solid ${C.border}`,color:C.s,fontSize:10,fontWeight:600,cursor:'pointer'}}>↗ Share</button>
                </div>
              </div>
            ))}
          </div>
        </aside>
        )
      })()}

      <SourceLibraryPicker
        open={libOpen}
        onClose={() => setLibOpen(false)}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
