'use client'
import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import AIMessage from '@/components/AIMessage'
import DataSourcesUsedFooter from '@/components/DataSourcesUsedFooter'
import SourceDrawer from '@/components/SourceDrawer'
import { traceFromToolResult, type ProviderTrace } from '@/lib/data-sources-trace'
import { PageHero, ContextualAskBar, ACTION_ICONS, ICON_STROKE } from '@/components/ui'
import { track } from '@/lib/analytics'
import { buildFollowups, type TimelineStep } from '@/lib/research-followups'
import { DelegateButton } from '@/components/agent-jobs/DelegateButton'
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
  /** tool_result id — links a "Data sources used" footer row back to this card. */
  traceId?: string
  /** Original document URL when the upstream payload carried one. */
  url?: string
  /** Truncated JSON of the upstream payload, rendered in the source drawer. */
  raw?: string
}

type Msg = {
  role: 'user'|'agent'
  text: string
  thinking?: boolean
  answer?: { summary: string; bullets: { text: string; cites: number[] }[] }
  citations?: Citation[]
  steps?: TimelineStep[]
  /** Provider/connector usage trace; rendered as the "Data sources used" footer. */
  trace?: ProviderTrace[]
  /** Guided deep-dive follow-up suggestions shown after the answer. */
  followups?: string[]
}

// Citations are populated entirely from the agent's tool results — the page
// no longer ships placeholder citations. Until the user runs a query the
// Smart Summary panel renders an empty/coachmark state.

// Maps the agent route's tool names → research page citation buckets so each
// tool call shows up in the right-hand source rail with the correct chip color.
/**
 * Extract a real grounding passage from a tool result's raw JSON payload.
 * Returns the most informative human-readable text from the actual data
 * returned by the tool — not a generic summary string. Falls back to
 * `data.summary` when the raw payload cannot be parsed.
 */
function extractRealExcerpt(raw: string | undefined, toolName: string, summaryFallback: string): string {
  if (raw) {
    try {
      const obj = JSON.parse(raw)
      switch (toolName) {
        case 'get_news': {
          const a = obj?.articles?.[0]
          if (a) {
            const title = a.title || a.headline || ''
            const src   = a.source || a.publisher || a.site || ''
            const date  = a.date || a.publishedAt || a.pubDate || ''
            const parts = [title, src ? `— ${src}` : '', date ? `(${date})` : ''].filter(Boolean)
            if (parts.length) return parts.join(' ').slice(0, 300)
          }
          break
        }
        case 'get_filings': {
          const f = obj?.filings?.[0]
          if (f) {
            const parts = [
              f.form || f.type,
              f.description || f.title,
              f.filed || f.filedAt || f.date,
            ].filter(Boolean)
            if (parts.length) return parts.join(' · ').slice(0, 300)
          }
          break
        }
        case 'get_transcripts': {
          const t = obj?.transcripts?.[0]
          if (t) {
            if (typeof t.excerpt === 'string' && t.excerpt.length > 10) return t.excerpt.slice(0, 300)
            const parts = [t.symbol, t.quarter ? `Q${t.quarter} ${t.year}` : (t.year || ''), t.date].filter(Boolean)
            if (parts.length) return parts.join(' · ').slice(0, 300)
          }
          break
        }
        case 'get_quote': {
          if (obj?.price != null || obj?.symbol) {
            const parts: string[] = []
            if (obj.name)                 parts.push(obj.name)
            if (obj.symbol)               parts.push(`(${obj.symbol})`)
            if (obj.price != null)        parts.push(`$${Number(obj.price).toFixed(2)}`)
            if (obj.changePct != null)    parts.push(`${obj.changePct > 0 ? '+' : ''}${Number(obj.changePct).toFixed(2)}%`)
            if (obj.marketCap)            parts.push(`Mkt cap $${(obj.marketCap / 1e9).toFixed(1)}B`)
            if (obj.pe != null)           parts.push(`P/E ${Number(obj.pe).toFixed(1)}`)
            if (obj.sector)               parts.push(obj.sector)
            if (parts.length) return parts.join(' · ').slice(0, 300)
          }
          break
        }
        case 'get_financials': {
          const y = obj?.years?.[0]
          if (y) {
            const parts: string[] = []
            if (y.year)                          parts.push(String(y.year))
            if (y.revenue != null)               parts.push(`Revenue $${(y.revenue / 1e9).toFixed(1)}B`)
            if (y.grossProfit != null)           parts.push(`Gross profit $${(y.grossProfit / 1e9).toFixed(1)}B`)
            if (y.operatingIncome != null)       parts.push(`Op. income $${(y.operatingIncome / 1e9).toFixed(1)}B`)
            if (y.netIncome != null)             parts.push(`Net income $${(y.netIncome / 1e9).toFixed(1)}B`)
            if (parts.length) return parts.join(' · ').slice(0, 300)
          }
          break
        }
        case 'get_estimates': {
          const e = obj?.estimates || obj?.consensus || obj
          if (e && typeof e === 'object' && !Array.isArray(e)) {
            const parts: string[] = []
            if (e.targetPrice != null)       parts.push(`Price target $${Number(e.targetPrice).toFixed(2)}`)
            if (e.consensusRating)           parts.push(`Consensus: ${e.consensusRating}`)
            if (e.buyCount != null)          parts.push(`Buy ${e.buyCount} · Hold ${e.holdCount ?? '?'} · Sell ${e.sellCount ?? '?'}`)
            if (e.epsEstimate != null)       parts.push(`EPS est. $${Number(e.epsEstimate).toFixed(2)}`)
            if (parts.length) return parts.join(' · ').slice(0, 300)
          }
          break
        }
        case 'get_macro': {
          const arr = Array.isArray(obj) ? obj : (Array.isArray(obj?.series) ? obj.series : null)
          if (arr && arr.length > 0) {
            const d = arr[0]
            const parts = [
              d.indicator || d.name,
              d.date,
              d.value != null ? String(d.value) : '',
              d.unit || '',
            ].filter(Boolean)
            if (parts.length) return parts.join(' · ').slice(0, 300)
          }
          break
        }
        case 'score_filing': {
          if (obj?.score != null) {
            const parts: string[] = []
            if (obj.symbol)    parts.push(obj.symbol)
            if (obj.formType)  parts.push(obj.formType)
            parts.push(`Signal score ${obj.score}/100`)
            if (obj.attribution) parts.push(obj.attribution.slice(0, 150))
            return parts.join(' · ').slice(0, 300)
          }
          break
        }
      }
    } catch { /* fall through to summary */ }
  }
  return summaryFallback
}

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

// ─── Workspace picker panel for Save actions ─────────────────────────────────
// Renders as a small fixed overlay (below the triggering button) with a list
// of the user's workspaces. Closes on outside click or Escape.

type SaveTarget =
  | { kind: 'cite'; cite: Citation }
  | { kind: 'answer'; msgIdx: number; question: string; answerText: string; citations: Citation[] }

function SaveWorkspacePanel({
  workspaces,
  loading,
  onPick,
  onClose,
}: {
  workspaces: { id: string; name: string }[] | null
  loading: boolean
  onPick: (workspaceId: string, name: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1400 }} />
      <div style={{
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 1401,
        background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
        borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        minWidth: 220, maxWidth: 300, padding: '6px 0',
      }}>
        <div style={{ padding: '6px 12px 8px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
          Save to workspace
        </div>
        {loading && (
          <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Loading…</div>
        )}
        {!loading && workspaces !== null && workspaces.length === 0 && (
          <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
            No workspaces yet.<br />
            <a href="/platform/app/workspaces" style={{ color: 'var(--accent)', fontWeight: 700 }}>Create one →</a>
          </div>
        )}
        {!loading && workspaces && workspaces.map(w => (
          <button key={w.id} onClick={() => onPick(w.id, w.name)} style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '8px 12px', background: 'none', border: 'none',
            color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--row-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            {w.name}
          </button>
        ))}
      </div>
    </>
  )
}

export default function ResearchPage() {
  const searchParams = useSearchParams()
  const [query, setQuery]   = useState('')
  const [source, setSource] = useState('all')
  const [chat, setChat]     = useState<Msg[]>([])
  const [running, setRunning] = useState(false)
  const [activeCite, setActiveCite] = useState<number|null>(null)
  // Citation whose underlying snippet/record is open in the source drawer.
  const [drawerCite, setDrawerCite] = useState<Citation|null>(null)
  // Result-list filters — derived from the citation set of the latest answer.
  const [citeTicker, setCiteTicker] = useState<string>('all')
  const [citeType, setCiteType] = useState<string>('all')
  const [libOpen, setLibOpen] = useState(false)
  const [deep, setDeep] = useState(false)
  const [phase, setPhase] = useState(-1)
  // Per-message expand toggle for the AI working timeline. Stored as a Set of
  // chat indices so the open/closed state survives streaming updates.
  const [openTimelines, setOpenTimelines] = useState<Set<number>>(new Set())
  // Save / share state
  const [savePanel, setSavePanel] = useState<SaveTarget | null>(null)
  const [workspacesCache, setWorkspacesCache] = useState<{ id: string; name: string }[] | null>(null)
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)
  const [savingCites, setSavingCites] = useState<Set<string>>(new Set())
  const [savedCites, setSavedCites] = useState<Map<string, string>>(new Map())
  const [shareToast, setShareToast] = useState<string | null>(null)

  // ── Save / share helpers ───────────────────────────────────────────────────

  /** Lazily fetch the org's workspaces and cache for the session. */
  async function ensureWorkspaces(): Promise<{ id: string; name: string }[]> {
    if (workspacesCache !== null) return workspacesCache
    setLoadingWorkspaces(true)
    try {
      const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
      const res = await fetch(`${BASE}/api/workspaces`)
      if (!res.ok) {
        setWorkspacesCache([])
        return []
      }
      const data = await res.json() as { workspaces?: { id: string; name: string }[] }
      const list = (data.workspaces || []).map((w) => ({ id: w.id, name: w.name }))
      setWorkspacesCache(list)
      return list
    } catch {
      setWorkspacesCache([])
      return []
    } finally {
      setLoadingWorkspaces(false)
    }
  }

  /** Open the workspace picker for a citation card. */
  function openSaveForCite(cite: Citation) {
    setSavePanel({ kind: 'cite', cite })
    ensureWorkspaces()
  }

  /** Open the workspace picker for an answer turn. */
  function openSaveForAnswer(msgIdx: number, msg: Msg) {
    const question = chat[msgIdx - 1]?.role === 'user' ? chat[msgIdx - 1].text : ''
    setSavePanel({
      kind: 'answer',
      msgIdx,
      question,
      answerText: msg.answer?.summary || '',
      citations: msg.citations || [],
    })
    ensureWorkspaces()
  }

  /** POST a text source to the ingest route. Throws on failure. */
  async function ingestText(opts: {
    name: string
    content: string
    workspaceId: string
    clientSourceId: string
  }) {
    const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const fd = new FormData()
    fd.set('sourceId', opts.clientSourceId)
    fd.set('type', 'text')
    fd.set('name', opts.name)
    fd.set('workspaceId', opts.workspaceId)
    fd.set('origin', 'url')
    fd.set('text', opts.content)
    const res = await fetch(`${BASE}/api/workspaces/ingest`, { method: 'POST', body: fd })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
      throw new Error(body.error || `Ingest failed (${res.status})`)
    }
  }

  /** Called when the user picks a workspace in the save panel. */
  async function handleSavePick(workspaceId: string, workspaceName: string) {
    const target = savePanel
    setSavePanel(null)
    if (!target) return

    if (target.kind === 'cite') {
      const key = `cite-${target.cite.id}`
      setSavingCites(prev => new Set([...prev, key]))
      try {
        const content = [
          target.cite.ticker ? `Ticker: ${target.cite.ticker}` : '',
          `Source: ${target.cite.source}`,
          `Type: ${target.cite.type}`,
          `Document: ${target.cite.doc}`,
          `Date: ${target.cite.date}`,
          '',
          target.cite.excerpt,
          target.cite.url ? `\nURL: ${target.cite.url}` : '',
        ].filter(Boolean).join('\n')
        await ingestText({
          name: `[${target.cite.type.toUpperCase()}] ${target.cite.source} — ${target.cite.date}`,
          content,
          workspaceId,
          clientSourceId: `research-cite-${target.cite.id}-${Date.now()}`,
        })
        setSavedCites(prev => new Map([...prev, [key, workspaceName]]))
        track('research_cite_saved', { type: target.cite.type, workspaceId })
      } catch (err) {
        setShareToast(`Save failed: ${err instanceof Error ? err.message : 'unknown error'}`)
        setTimeout(() => setShareToast(null), 3500)
      } finally {
        setSavingCites(prev => { const n = new Set(prev); n.delete(key); return n })
      }
    } else {
      const key = `answer-${target.msgIdx}`
      setSavingCites(prev => new Set([...prev, key]))
      try {
        const content = [
          target.question ? `Question: ${target.question}` : '',
          '',
          target.answerText,
          '',
          ...target.citations.map(c => `[${c.id}] ${c.source} (${c.type}) — ${c.excerpt}`),
        ].join('\n')
        const label = target.question
          ? target.question.slice(0, 80)
          : `Research answer — ${new Date().toLocaleDateString()}`
        await ingestText({
          name: `Research: ${label}`,
          content,
          workspaceId,
          clientSourceId: `research-answer-${target.msgIdx}-${Date.now()}`,
        })
        setSavedCites(prev => new Map([...prev, [key, workspaceName]]))
        track('research_answer_saved', { workspaceId })
      } catch (err) {
        setShareToast(`Save failed: ${err instanceof Error ? err.message : 'unknown error'}`)
        setTimeout(() => setShareToast(null), 3500)
      } finally {
        setSavingCites(prev => { const n = new Set(prev); n.delete(key); return n })
      }
    }
  }

  /** Copy a URL to clipboard and flash a toast. */
  function copyAndToast(text: string, label: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setShareToast(label)
    setTimeout(() => setShareToast(null), 2500)
  }

  function shareCitation(cite: Citation) {
    const url = cite.url || window.location.href
    copyAndToast(url, `Link copied`)
  }

  function shareAnswer(question: string) {
    const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const url = `${window.location.origin}${BASE}/app/research?q=${encodeURIComponent(question)}`
    copyAndToast(url, 'Research link copied')
  }
  // Workspace-scoped Source Library selection (leaf source IDs)
  const selectedSourceIds = useSelectedSourceIds()
  const librarySize = selectedSourceIds.length
  const lastUserQuery = [...chat].reverse().find(m => m.role === 'user')?.text || ''
  // Smart Summary binds to the live citation set of the most recent answer.
  // Until a query has produced citations the Summary renders an empty state
  // (see `liveCitations.length === 0` branch below).
  const lastAnswerCites = chat.length > 0 ? chat[chat.length-1].citations : undefined
  const usingExampleCites = !(lastAnswerCites && lastAnswerCites.length > 0)
  const liveCitations: Citation[] = usingExampleCites ? [] : (lastAnswerCites as Citation[])
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

  // Pre-fill and auto-submit when a ?q= share link is followed.
  useEffect(() => {
    const q = searchParams?.get('q')
    if (q && chat.length === 0 && !running) {
      ask(q)
    }
    // Intentionally not including `ask` / `chat` / `running` — we only want
    // this to fire once on mount from the URL param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    // Snapshot the recent conversation BEFORE we append the new turn so the
    // server can ground a follow-up in the prior question + answer.
    const historyForRequest = chat
      .filter(m => m.role === 'user' || (m.role === 'agent' && !!m.answer))
      .slice(-6)
      .map(m => ({ role: m.role, text: m.role === 'agent' ? (m.answer?.summary || '') : m.text }))
      .filter(m => m.text)
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
    // Per-message provider trace, fed by every successful `tool_result`.
    // Drives the "Data sources used" footer rendered below the answer.
    const trace: ProviderTrace[] = []
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
          // `history` carries the recent conversation so guided deep-dive
          // follow-ups ("compare to peers", "break down revenue") resolve
          // against the prior turn instead of starting cold.
          body: JSON.stringify({
            question: text,
            history: historyForRequest,
            // Send the workspace's active Source Library selection so the
            // agent route can filter tools server-side.  An empty array means
            // "no scope" (all sources); a non-empty array restricts which data
            // tools the model may call.
            selectedSourceIds,
          }),
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
              const parsed = (() => { try { return JSON.parse(data.raw || '{}') } catch { return {} } })()
              const sym = parsed.symbol || parsed.articles?.[0]?.symbol || parsed.ticker || undefined
              // Pull an "open original" link out of whatever record shape the
              // upstream tool returned (news / filings / transcripts all carry
              // their own url/link field).
              const url =
                parsed.articles?.[0]?.url || parsed.articles?.[0]?.link ||
                parsed.filings?.[0]?.url || parsed.filings?.[0]?.link ||
                parsed.transcripts?.[0]?.url ||
                (typeof parsed.url === 'string' ? parsed.url : undefined)
              const cite: Citation = {
                // Prefer the server's stable global citation number so inline
                // [n] markers in the answer line up with this card. Fall back
                // to the local counter for legacy frames without citeIndex.
                id: typeof data.citeIndex === 'number' ? data.citeIndex : citeId++,
                source: TOOL_LABEL[data.name] || data.name,
                ticker: sym,
                doc: TOOL_DOC_LABEL[data.name] || data.name,
                date: new Date().toISOString().slice(0, 10),
                // Extract a real grounding passage from the actual tool-result
                // payload rather than the short summary string. Falls back to
                // the summary when the payload cannot be parsed.
                excerpt: extractRealExcerpt(
                  typeof data.raw === 'string' ? data.raw : undefined,
                  data.name,
                  data.summary || '',
                ),
                type: TOOL_TO_CITE_TYPE[data.name] || 'news',
                traceId: String(data.id || ''),
                url: typeof url === 'string' ? url : undefined,
                raw: typeof data.raw === 'string' ? data.raw : undefined,
              }
              citations.push(cite)
              // Build the corresponding "Data sources used" footer row. We
              // pass `1` as the citation count because each tool_result here
              // contributes exactly one citation card to the right rail.
              const t = traceFromToolResult(data, 1)
              if (t) trace.push(t)
              updateAgent({ citations: [...citations], trace: [...trace] })
            } else if (eventName === 'answer_chunk') {
              answerText += data.text || ''
              updateAgent({
                thinking: false,
                answer: { summary: answerText, bullets: [] },
                citations: [...citations],
                trace: [...trace],
              })
            } else if (eventName === 'done') {
              updateAgent({
                thinking: false,
                answer: { summary: answerText || '_The model returned an empty response._', bullets: [] },
                citations: [...citations],
                trace: [...trace],
                followups: buildFollowups(steps, citations),
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
              actions={
                <DelegateButton
                  variant="ghost"
                  label="Delegate to agent"
                  context={{ surface: 'research', defaultDeliverable: 'research_note' }}
                />
              }
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
                    <div style={{fontSize:11,color:C.s}}>{usingExampleCites ? 'Run a search above to populate this panel with real citations.' : 'Latest highlights across your answer\u2019s citations, bucketed by document type'}</div>
                  </div>
                </div>
                {!usingExampleCites && (
                  <button style={{background:'none',border:'none',color:C.accT,fontSize:12,fontWeight:600,cursor:'pointer'}}>View all →</button>
                )}
              </div>
              {usingExampleCites ? (
                <div style={{
                  padding:'24px 18px',
                  border:`1.5px dashed ${C.border}`,
                  borderRadius:12,
                  background:C.cardA,
                  textAlign:'center',
                  color:C.s,
                  fontSize:12.5,
                  lineHeight:1.6,
                }}>
                  No citations yet. Ask the analyst a question — citations from filings, transcripts, news and live data will appear here.
                </div>
              ) : (
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
              )}
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

                      {m.answer && (() => {
                        const openByCiteIndex = (n: number) => {
                          const cit = m.citations?.find(c => c.id === n)
                          if (cit) { setActiveCite(cit.id); setDrawerCite(cit) }
                        }
                        const openByTraceId = (tid: string) => {
                          const cit = m.citations?.find(c => c.traceId === tid)
                          if (cit) { setActiveCite(cit.id); setDrawerCite(cit) }
                        }
                        return (
                        <div>
                          <div style={{fontSize:14.5,color:C.p,lineHeight:1.6,marginBottom:18,fontWeight:500}}><AIMessage content={m.answer.summary} onCiteClick={openByCiteIndex} /></div>

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
                            {/* Add to workspace */}
                            {(() => {
                              const key = `answer-${i}`
                              const saving = savingCites.has(key)
                              const saved = savedCites.get(key)
                              const isOpen = savePanel?.kind === 'answer' && savePanel.msgIdx === i
                              return (
                                <div style={{position:'relative'}}>
                                  <button
                                    onClick={() => { if (isOpen) { setSavePanel(null) } else { openSaveForAnswer(i, m) } }}
                                    disabled={saving}
                                    style={{
                                      padding:'6px 11px',borderRadius:7,
                                      background: saved ? 'rgba(52,211,153,0.10)' : 'var(--row-stripe)',
                                      border:`1px solid ${saved ? C.pos : C.border}`,
                                      color: saved ? C.pos : C.s,
                                      fontSize:11.5,fontWeight:600,
                                      cursor:saving?'default':'pointer',
                                      display:'inline-flex',alignItems:'center',gap:5,fontFamily:'inherit',
                                      opacity: saving ? 0.6 : 1,
                                    }}
                                  >
                                    <span style={{color: saved ? C.pos : C.accT}}>{saved ? '✓' : '⊞'}</span>
                                    {saving ? 'Saving…' : saved ? `Saved to ${saved}` : 'Add to workspace'}
                                  </button>
                                  {isOpen && (
                                    <SaveWorkspacePanel
                                      workspaces={workspacesCache}
                                      loading={loadingWorkspaces}
                                      onPick={(wid, wname) => { handleSavePick(wid, wname) }}
                                      onClose={() => setSavePanel(null)}
                                    />
                                  )}
                                </div>
                              )
                            })()}
                            {/* Share answer */}
                            <button
                              onClick={() => { const q = chat[i-1]?.role==='user' ? chat[i-1].text : ''; shareAnswer(q) }}
                              style={{padding:'6px 11px',borderRadius:7,background:'var(--row-stripe)',border:`1px solid ${C.border}`,color:C.s,fontSize:11.5,fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5,fontFamily:'inherit'}}
                            >
                              <span style={{color:C.accT}}>↗</span>Share
                            </button>
                            {/* Export / Regenerate (stubs) */}
                            {[
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

                          {/* "Data sources used" transparency footer — always
                              rendered below an answer (loading / empty states
                              handled inside). Each row is clickable and opens
                              the underlying snippet/record in the source
                              drawer. Hidden only when the workspace setting is
                              off. */}
                          <DataSourcesUsedFooter
                            trace={m.trace || []}
                            loading={!!m.thinking}
                            onOpenSource={openByTraceId}
                          />

                          {/* Guided deep-dive follow-ups — run as
                              context-retaining follow-up turns. */}
                          {m.followups && m.followups.length > 0 && (
                            <div style={{marginTop:18}}>
                              <div style={{fontSize:10,fontWeight:800,letterSpacing:'0.06em',textTransform:'uppercase',color:C.m,marginBottom:8}}>Dig deeper</div>
                              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                                {m.followups.map((s,k) => (
                                  <button
                                    key={k}
                                    onClick={() => ask(s)}
                                    disabled={running}
                                    style={{
                                      padding:'8px 13px',borderRadius:8,
                                      background:'var(--accent-dim)',border:`1px solid ${C.accD}`,
                                      color:C.accT,fontSize:12,fontWeight:600,
                                      cursor:running?'default':'pointer',opacity:running?0.5:1,
                                      fontFamily:'inherit',textAlign:'left',
                                      display:'inline-flex',alignItems:'center',gap:6,
                                    }}
                                  ><span style={{fontWeight:800}}>→</span>{s}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        )
                      })()}
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

      {/* Right: citations panel — always visible during chat, with loading +
          empty states so analysts can see source provenance at every stage. */}
      {chat.length > 0 && (() => {
        const lastMsg = chat[chat.length - 1]
        const isLoading = lastMsg.thinking === true
        const allCites = lastMsg.citations || []
        const tickers = Array.from(new Set(allCites.map(c => c.ticker).filter(Boolean) as string[]))
        const types   = Array.from(new Set(allCites.map(c => c.type)))
        const visible = allCites.filter(c =>
          (citeTicker === 'all' || c.ticker === citeTicker) &&
          (citeType === 'all' || c.type === citeType)
        )
        return (
        <aside style={{width:380,minWidth:380,borderLeft:`1px solid ${C.border}`,overflowY:'auto',display:'flex',flexDirection:'column'}}>
          {/* Sticky header */}
          <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,position:'sticky',top:0,background:C.bg,zIndex:5}}>
            {isLoading ? (
              <>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                  <span style={{display:'inline-block',width:10,height:10,borderRadius:'50%',border:'2px solid rgba(123,150,184,0.3)',borderTopColor:C.accT,animation:'spin 0.8s linear infinite',flexShrink:0}}/>
                  <div style={{fontSize:13,fontWeight:700,color:C.p}}>Sources</div>
                </div>
                <div style={{fontSize:11,color:C.s}}>Fetching from data providers…</div>
              </>
            ) : (
              <>
                <div style={{fontSize:13,fontWeight:700,color:C.p,marginBottom:3}}>
                  Sources · {visible.length} of {allCites.length} cited
                </div>
                <div style={{fontSize:11,color:C.s,marginBottom:allCites.length > 0 ? 10 : 0}}>Every claim traceable to original document</div>
                {allCites.length > 0 && tickers.length > 0 && (
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
                {allCites.length > 0 && (
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
                )}
              </>
            )}
          </div>

          {/* Citation list / loading skeleton / empty state */}
          <div style={{padding:'8px 0',flex:1}}>
            {isLoading ? (
              /* Loading skeleton — pulsing placeholder cards */
              [0,1,2].map(n => (
                <div key={n} style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}>
                  {[70,90,55].map((w,k) => (
                    <div key={k} style={{
                      height:10,borderRadius:5,marginBottom:8,
                      background:'var(--row-stripe)',
                      width:`${w}%`,opacity:1 - n * 0.2,
                    }}/>
                  ))}
                </div>
              ))
            ) : allCites.length === 0 ? (
              /* Explicit empty state — never a silent failure */
              <div style={{
                padding:'32px 20px',textAlign:'center',
                display:'flex',flexDirection:'column',alignItems:'center',gap:10,
              }}>
                <span style={{fontSize:24,opacity:0.35}}>◧</span>
                <div style={{fontSize:13,fontWeight:700,color:C.p}}>No sources found</div>
                <div style={{fontSize:11.5,color:C.s,lineHeight:1.6,maxWidth:280}}>
                  The agent answered without fetching external data. Try asking about a specific ticker, filing, or earnings call to surface citable sources.
                </div>
              </div>
            ) : (
              /* Citation cards */
              visible.map(c => (
                <div key={c.id} onClick={() => setActiveCite(c.id)} style={{
                  padding:'12px 16px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'all 0.14s',
                  background: activeCite===c.id ? C.accD : 'transparent',
                }}
                onMouseEnter={e => { if (activeCite!==c.id) (e.currentTarget as HTMLElement).style.background='var(--row-hover)' }}
                onMouseLeave={e => { if (activeCite!==c.id) (e.currentTarget as HTMLElement).style.background='transparent' }}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:5,background:C.acc,color:'#fff',fontSize:10,fontWeight:700,flexShrink:0}}>{c.id}</span>
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
                  <div style={{fontSize:11.5,color:C.s,lineHeight:1.5,fontStyle:c.excerpt.startsWith('"')?'italic':'normal',
                    paddingLeft:c.excerpt.startsWith('"')?8:0,
                    borderLeft:c.excerpt.startsWith('"')?`2px solid ${C.borderS}`:'none'}}>
                    {c.excerpt}
                  </div>
                  <div style={{display:'flex',gap:5,marginTop:9,position:'relative'}}>
                    <button onClick={(e) => { e.stopPropagation(); setActiveCite(c.id); setDrawerCite(c) }} style={{padding:'4px 9px',borderRadius:6,background:'var(--row-stripe)',border:`1px solid ${C.border}`,color:C.s,fontSize:10,fontWeight:600,cursor:'pointer'}}>↗ Open</button>
                    {(() => {
                      const key = `cite-${c.id}`
                      const saving = savingCites.has(key)
                      const saved = savedCites.get(key)
                      const isOpen = savePanel?.kind === 'cite' && savePanel.cite.id === c.id
                      return (
                        <div style={{position:'relative'}}>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (isOpen) { setSavePanel(null) } else { openSaveForCite(c) } }}
                            disabled={saving}
                            style={{
                              padding:'4px 9px',borderRadius:6,
                              background: saved ? 'rgba(52,211,153,0.12)' : 'var(--row-stripe)',
                              border:`1px solid ${saved ? C.pos : C.border}`,
                              color: saved ? C.pos : C.s,
                              fontSize:10,fontWeight:600,cursor:saving?'default':'pointer',
                              opacity: saving ? 0.6 : 1,
                            }}
                          >
                            {saving ? '…' : saved ? `✓ Saved` : '＋ Save'}
                          </button>
                          {isOpen && (
                            <SaveWorkspacePanel
                              workspaces={workspacesCache}
                              loading={loadingWorkspaces}
                              onPick={(wid, wname) => { handleSavePick(wid, wname) }}
                              onClose={() => setSavePanel(null)}
                            />
                          )}
                        </div>
                      )
                    })()}
                    <button
                      onClick={(e) => { e.stopPropagation(); shareCitation(c) }}
                      style={{padding:'4px 9px',borderRadius:6,background:'var(--row-stripe)',border:`1px solid ${C.border}`,color:C.s,fontSize:10,fontWeight:600,cursor:'pointer'}}
                    >↗ Share</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
        )
      })()}

      <SourceLibraryPicker
        open={libOpen}
        onClose={() => setLibOpen(false)}
      />

      {drawerCite && (
        <SourceDrawer
          record={{
            id: drawerCite.id,
            source: drawerCite.source,
            ticker: drawerCite.ticker,
            doc: drawerCite.doc,
            date: drawerCite.date,
            excerpt: drawerCite.excerpt,
            type: drawerCite.type,
            url: drawerCite.url,
            raw: drawerCite.raw,
          }}
          onClose={() => setDrawerCite(null)}
        />
      )}

      {/* Share toast */}
      {shareToast && (
        <div style={{
          position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',
          background:'var(--bg-card)',border:'1px solid var(--border-strong)',
          borderRadius:9,padding:'9px 18px',
          fontSize:12.5,fontWeight:700,color:'var(--text-primary)',
          boxShadow:'0 8px 28px rgba(0,0,0,0.35)',zIndex:1500,
          display:'flex',alignItems:'center',gap:8,
          animation:'fadeIn 0.15s ease',
        }}>
          <span style={{color:'var(--pos)'}}>✓</span>
          {shareToast}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  )
}
