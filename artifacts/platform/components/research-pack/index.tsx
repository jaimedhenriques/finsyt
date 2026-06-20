'use client'
/**
 * AlphaSense-inspired research pack.
 * Layered, additive surfaces that plug into existing Research/Matrix/Settings/Company pages.
 *
 * Exports:
 *   SourceLibraryPicker   – checkbox-tree drawer over Internal + External sources
 *   GridTemplatesGallery  – 7 pre-built Matrix templates (Industry Read-Through, etc.)
 *   ConnectSourcesPanel   – Connect Sources page body (Email-In + cloud connectors)
 *   SmartSummaryUpgrade   – doc-type buckets + ticker tabs over earnings briefs
 *   DeepResearchPhases    – visible reasoning phases for "Deep" research mode
 *   CreateAlertButton     – one-click "Create Alert from this query"
 *   ExpertQuoteCard       – quoted excerpt block with attribution + relevance
 *   CompanyDataTab        – analyst-grade widgets: Shareholders / Market Data / Workforce / Funding / Key Metrics / Statements
 *
 * Design rules:
 *   - Every surface uses existing tokens (--bg-card, --accent, --text-*) and ui primitives.
 *   - Where no real data feed exists we render a "Sample data" badge so users know.
 *   - All persistence is per-workspace via localStorage, mirroring the rest of the app.
 */
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { Badge, Button, Card, CitationChip, Drawer, EmptyState } from '@/components/ui'

// ─── Workspace-scoped localStorage ───────────────────────────────────────────
// Every persisted surface in this module is keyed by the current workspace
// (`orgId` when signed-in to an org, `userId` otherwise, `anon` if neither).
// This mirrors the rest of the platform and keeps Source Library selections,
// connector status, and saved query alerts isolated per workspace.
function useScope(): string {
  const { orgId, userId } = useAuth()
  return orgId || userId || 'anon'
}
function scopedKey(base: string, scope: string): string {
  return `${base}.${scope}`
}

// ─── Tokens helpers ──────────────────────────────────────────────────────────
const muted: CSSProperties = { color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }
const card:  CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }
const num:   CSSProperties = { fontVariantNumeric: 'tabular-nums' }

function SampleBadge() {
  return <Badge tone="amber" style={{ fontSize: 9 }}>Sample data</Badge>
}

// ════════════════════════════════════════════════════════════════════════════
// 1. SourceLibraryPicker — checkbox-tree drawer
// ════════════════════════════════════════════════════════════════════════════

export interface SourceLeaf { id: string; label: string; count?: string }
export interface SourceBucket { id: string; label: string; leaves: SourceLeaf[] }
export interface SourceGroup { id: string; label: string; eyebrow?: string; buckets: SourceBucket[] }

const INTERNAL_BUCKETS: SourceBucket[] = [
  { id: 'board',       label: 'Board Presentations',     leaves: [{ id:'board.q4', label:'Q4 board pack', count:'48p' }, { id:'board.strat', label:'Strategy review', count:'62p' }] },
  { id: 'strategy',    label: 'Strategy Decks',          leaves: [{ id:'strat.2026', label:'2026 plan deck', count:'33p' }, { id:'strat.ai', label:'AI strategy', count:'21p' }] },
  { id: 'ir',          label: 'IR Briefings',            leaves: [{ id:'ir.q4', label:'Q4 IR briefing', count:'18p' }, { id:'ir.faq', label:'IR FAQ master', count:'12p' }] },
  { id: 'earnings',    label: 'Earnings Prep',           leaves: [{ id:'eprep.script', label:'Script + Q&A', count:'40p' }, { id:'eprep.kpi', label:'KPI tracker', count:'8 sheets' }] },
  { id: 'compete',     label: 'Competitive Intel Reports', leaves: [{ id:'ci.snowflake', label:'Snowflake teardown' }, { id:'ci.dbx', label:'Databricks teardown' }] },
  { id: 'forecast',    label: 'Forecast Models',         leaves: [{ id:'fcst.opmodel', label:'Op model v17', count:'12 tabs' }, { id:'fcst.scenarios', label:'Scenario book' }] },
  { id: 'deal',        label: 'Deal Diligence',          leaves: [{ id:'deal.alpha', label:'Project Alpha CIM' }, { id:'deal.beta', label:'Project Beta DD' }] },
  { id: 'exec',        label: 'Exec Meeting Notes',      leaves: [{ id:'exec.weekly', label:'Weekly exec notes' }] },
  { id: 'roadmap',     label: 'Product Roadmaps',        leaves: [{ id:'rm.h1', label:'H1 roadmap' }, { id:'rm.h2', label:'H2 roadmap' }] },
  { id: 'excel',       label: 'Excel Models',            leaves: [{ id:'xls.dcf', label:'DCF master' }, { id:'xls.cohorts', label:'Cohort model' }] },
  { id: 'transcripts', label: 'Recorded Call Transcripts', leaves: [{ id:'rec.exp42', label:'Expert call #42' }, { id:'rec.cust11', label:'Customer call #11' }] },
]

const EXTERNAL_BUCKETS: SourceBucket[] = [
  { id: 'broker',     label: 'Broker Research',     leaves: [
    { id:'br.gs',  label:'Goldman Sachs', count:'1.4M' },
    { id:'br.ms',  label:'Morgan Stanley', count:'1.1M' },
    { id:'br.jpm', label:'JPMorgan', count:'960K' },
    { id:'br.bofa',label:'BofA', count:'820K' },
  ] },
  { id: 'transcript', label: 'Earnings Calls',      leaves: [{ id:'tr.us', label:'US listed', count:'1.4M' }, { id:'tr.eu', label:'EMEA listed', count:'420K' }] },
  { id: 'expert',     label: 'Expert Calls',        leaves: [{ id:'ex.tegus', label:'Tegus library', count:'180K' }, { id:'ex.guidepoint', label:'GuidePoint network', count:'72K' }] },
  { id: 'filing',     label: 'SEC Filings',         leaves: [{ id:'fl.10k', label:'10-K' }, { id:'fl.10q', label:'10-Q' }, { id:'fl.8k', label:'8-K' }, { id:'fl.def', label:'DEF 14A' }, { id:'fl.13f', label:'13F' }] },
  { id: 'news',       label: 'News & Trade Press',  leaves: [{ id:'nw.bb', label:'Bloomberg' }, { id:'nw.rt', label:'Reuters' }, { id:'nw.wsj', label:'WSJ' }, { id:'nw.ft', label:'FT' }] },
  { id: 'corp',       label: 'Corp Presentations',  leaves: [{ id:'cp.idays', label:'Investor days' }, { id:'cp.cmd', label:'Capital Markets Day' }] },
]

const DEFAULT_GROUPS: SourceGroup[] = [
  { id: 'internal', label: 'Internal Library', eyebrow: 'Your firm · 12 connected', buckets: INTERNAL_BUCKETS },
  { id: 'external', label: 'External Corpus',  eyebrow: '47.2M documents',           buckets: EXTERNAL_BUCKETS },
]

export const SOURCE_LIB_KEY_BASE = 'finsyt.sourcelibrary.v1'

function loadSel(scope: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(scopedKey(SOURCE_LIB_KEY_BASE, scope))
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch { return new Set() }
}
// Same-tab observers (writes to localStorage in the same tab don't fire `storage`).
const SOURCE_LIB_EVENT = 'finsyt:sourcelibrary-changed'

function saveSel(s: Set<string>, scope: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(scopedKey(SOURCE_LIB_KEY_BASE, scope), JSON.stringify(Array.from(s)))
    // Notify in-tab subscribers (other tabs hear `storage` automatically).
    window.dispatchEvent(new CustomEvent(SOURCE_LIB_EVENT, { detail: { scope } }))
  } catch {}
}

/** Read the current workspace's selected source-library leaf IDs. Updates live across tabs and within the same tab. */
export function useSelectedSourceIds(): string[] {
  const scope = useScope()
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    setIds(Array.from(loadSel(scope)))
    function refresh() { setIds(Array.from(loadSel(scope))) }
    function onStorage(e: StorageEvent) {
      if (e.key === scopedKey(SOURCE_LIB_KEY_BASE, scope)) refresh()
    }
    function onLocal(e: Event) {
      const detail = (e as CustomEvent<{ scope?: string }>).detail
      if (!detail || detail.scope === scope) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(SOURCE_LIB_EVENT, onLocal as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(SOURCE_LIB_EVENT, onLocal as EventListener)
    }
  }, [scope])
  return ids
}

export function SourceLibraryPicker({
  open, onClose, onApply, groups = DEFAULT_GROUPS, initialSelected,
}: {
  open: boolean
  onClose: () => void
  onApply?: (selected: string[]) => void
  groups?: SourceGroup[]
  initialSelected?: string[]
}) {
  const scope = useScope()
  const [sel, setSel] = useState<Set<string>>(() => initialSelected ? new Set(initialSelected) : new Set())
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(groups.flatMap(g => g.buckets.map(b => `${g.id}.${b.id}`))))

  // Hydrate from per-workspace storage on mount and when the drawer opens.
  useEffect(() => { if (!initialSelected) setSel(loadSel(scope)) }, [scope, initialSelected])
  useEffect(() => { if (open && !initialSelected) setSel(loadSel(scope)) }, [open, initialSelected, scope])

  function toggle(id: string) {
    setSel(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  function toggleBucket(_g: SourceGroup, b: SourceBucket) {
    // Selection set only ever holds *leaf* IDs — synthetic bucket keys would
    // pollute the payload that downstream filters consume.
    setSel(prev => {
      const n = new Set(prev)
      const allOn = b.leaves.every(l => n.has(l.id))
      if (allOn) b.leaves.forEach(l => n.delete(l.id))
      else       b.leaves.forEach(l => n.add(l.id))
      return n
    })
  }
  function toggleExpand(key: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const matches = (s: string) => !filter || s.toLowerCase().includes(filter.toLowerCase())

  return (
    <Drawer open={open} onClose={onClose} width={520} title="Source Library">
      <div style={{ marginBottom: 14 }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter sources…"
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 8,
            background: 'var(--bg-input)', border: '1.5px solid var(--border)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
          }}
        />
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          {sel.size} selected · scoping every Research / Matrix run to these documents
        </div>
      </div>
      {groups.map(g => (
        <div key={g.id} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{g.label}</div>
              {g.eyebrow && <div style={muted}>{g.eyebrow}</div>}
            </div>
          </div>
          {g.buckets.filter(b => matches(b.label) || b.leaves.some(l => matches(l.label))).map(b => {
            const key = `${g.id}.${b.id}`
            const open = expanded.has(key)
            const allOn = b.leaves.every(l => sel.has(l.id))
            const someOn = !allOn && b.leaves.some(l => sel.has(l.id))
            return (
              <div key={b.id} style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={el => { if (el) el.indeterminate = someOn }}
                    onChange={() => toggleBucket(g, b)}
                    aria-label={`Select all in ${b.label}`}
                  />
                  <button
                    onClick={() => toggleExpand(key)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}
                  >
                    <span>{b.label}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{b.leaves.length} · {open ? '▾' : '▸'}</span>
                  </button>
                </div>
                {open && (
                  <div style={{ paddingLeft: 28, paddingBottom: 8 }}>
                    {b.leaves.filter(l => matches(l.label)).map(l => (
                      <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} />
                        <span style={{ flex: 1 }}>{l.label}</span>
                        {l.count && <span style={{ ...muted, ...num }}>{l.count}</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
      <div style={{ position: 'sticky', bottom: -18, marginTop: 18, padding: '14px 0', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={() => { setSel(new Set()); saveSel(new Set(), scope) }}>Clear</Button>
        <Button variant="primary" onClick={() => { saveSel(sel, scope); onApply?.(Array.from(sel)); onClose() }}>
          Apply ({sel.size})
        </Button>
      </div>
    </Drawer>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 2. GridTemplatesGallery — 7 Matrix templates
// ════════════════════════════════════════════════════════════════════════════

export interface GridTemplate {
  id: string
  name: string
  audience: string
  blurb: string
  columns: { label: string; prompt: string }[]
  accent: 'blue' | 'sage' | 'amber' | 'violet' | 'red'
}

export const GRID_TEMPLATES: GridTemplate[] = [
  { id:'industry',  name:'Industry Read-Through',     audience:'Sector analyst',    accent:'blue',   blurb:'Compare commentary across every name in a sector for one earnings season.',
    columns:[
      { label:'Headline reaction',     prompt:'Did the print beat, miss, or come in line vs consensus?' },
      { label:'Pricing power',         prompt:'Quote management commentary on pricing, mix, and units.' },
      { label:'Capex / supply',        prompt:'Summarise capex and supply-chain remarks.' },
      { label:'Forward guide',         prompt:'Extract next-quarter and full-year guidance.' },
      { label:'Read-through',          prompt:'What does this imply for sector peers?' },
    ] },
  { id:'earnings',  name:'Earnings Analysis',         audience:'Buy-side PM',       accent:'sage',   blurb:'Standardised five-column scorecard for any earnings transcript.',
    columns:[
      { label:'KPI scorecard',         prompt:'Rev / EBIT / EPS vs consensus and prior.' },
      { label:'Positives',             prompt:'Three biggest positives with quotes.' },
      { label:'Negatives',             prompt:'Three biggest negatives with quotes.' },
      { label:'Q&A flashpoints',       prompt:'Which analyst questions got pushback?' },
      { label:'Model deltas',          prompt:'What needs to change in our model?' },
    ] },
  { id:'primer',    name:'Company Primer',            audience:'Generalist',        accent:'violet', blurb:'Two-page primer that builds itself from filings + transcripts + sell-side.',
    columns:[
      { label:'What they do',          prompt:'One-paragraph business description.' },
      { label:'Segment mix',           prompt:'Revenue by segment, latest year.' },
      { label:'Margin profile',        prompt:'Gross / EBIT / FCF margins, last 3 years.' },
      { label:'Capital allocation',    prompt:'Buybacks / dividends / M&A in last 24 months.' },
      { label:'Bull/bear',             prompt:'Three bull and three bear points.' },
    ] },
  { id:'tariff',    name:'Tariff Impact',             audience:'Macro / equity',    accent:'amber',  blurb:'Map exposure of names to tariff regimes and surface mitigations.',
    columns:[
      { label:'Tariff exposure',       prompt:'Quantify revenue / cost exposure to tariffs.' },
      { label:'Pass-through',          prompt:'Is management able to pass through costs?' },
      { label:'Sourcing changes',      prompt:'Any nearshoring / supplier diversification.' },
      { label:'Margin sensitivity',    prompt:'Estimate margin hit at +10pts tariff.' },
      { label:'Hedge ideas',           prompt:'Pair-trade or hedging suggestions.' },
    ] },
  { id:'cim',       name:'CIM Analyzer',              audience:'PE / IB associate', accent:'sage',   blurb:'Drop a CIM, get the deal memo skeleton with citations.',
    columns:[
      { label:'Investment highlights', prompt:'List the top 3 investment highlights.' },
      { label:'Risks',                 prompt:'List the top 3 investment risks.' },
      { label:'Market context',        prompt:'TAM, growth rate, comparable transactions.' },
      { label:'Customer concentration',prompt:'Top customer % of revenue and churn.' },
      { label:'Quality of earnings',   prompt:'Adjustments and concerns on QoE.' },
    ] },
  { id:'clinical',  name:'Clinical Trial Tracker',    audience:'Healthcare',        accent:'violet', blurb:'Phase, endpoints, readout dates and competitive landscape side-by-side.',
    columns:[
      { label:'Phase / status',        prompt:'Trial phase and current enrolment.' },
      { label:'Primary endpoints',     prompt:'Primary efficacy endpoints and powering.' },
      { label:'Next readout',          prompt:'Date and event of next readout.' },
      { label:'Comparator',            prompt:'Standard of care and competitive arms.' },
      { label:'Commercial size',       prompt:'Peak sales estimate range.' },
    ] },
  { id:'expert',    name:'Expert Interview Summarizer', audience:'Investor research', accent:'blue', blurb:'Synthesise a stack of expert calls into one structured view.',
    columns:[
      { label:'Expert profile',        prompt:'Role, tenure, what they observed.' },
      { label:'Key claim',             prompt:'Most useful claim or anecdote.' },
      { label:'Sentiment',             prompt:'Positive / neutral / negative on the company.' },
      { label:'Supporting evidence',   prompt:'How they substantiated the claim.' },
      { label:'Open questions',        prompt:'What still needs to be diligence-d.' },
    ] },
]

const TPL_BG: Record<GridTemplate['accent'], string> = {
  blue:'var(--accent-dim)', sage:'var(--pos-dim)', amber:'var(--amber-dim)', violet:'var(--violet-dim)', red:'var(--neg-dim)',
}
const TPL_FG: Record<GridTemplate['accent'], string> = {
  blue:'var(--accent-text)', sage:'var(--pos)', amber:'var(--amber)', violet:'var(--violet)', red:'var(--neg)',
}

// Workflow filter chips — categorise the 7 templates by analyst workflow.
const TPL_WORKFLOW: Record<string, 'Earnings' | 'Sector' | 'Diligence' | 'Macro' | 'Healthcare' | 'Expert'> = {
  industry: 'Sector',
  earnings: 'Earnings',
  primer:   'Diligence',
  tariff:   'Macro',
  cim:      'Diligence',
  clinical: 'Healthcare',
  expert:   'Expert',
}
const WORKFLOWS = ['All', 'Earnings', 'Sector', 'Diligence', 'Macro', 'Healthcare', 'Expert'] as const

// Document Source filter — which corpus a template typically reads against.
type TplDocSource = 'Transcripts' | 'Filings' | 'Broker Research' | 'Internal Docs' | 'Expert Calls' | 'News'
const TPL_DOC_SOURCES: Record<string, TplDocSource[]> = {
  industry: ['Transcripts', 'Broker Research'],
  earnings: ['Transcripts', 'Filings'],
  primer:   ['Filings', 'Broker Research', 'Internal Docs'],
  tariff:   ['News', 'Filings', 'Broker Research'],
  cim:      ['Internal Docs', 'Filings'],
  clinical: ['Filings', 'News'],
  expert:   ['Expert Calls'],
}
const DOC_SOURCES: ('All' | TplDocSource)[] = ['All', 'Transcripts', 'Filings', 'Broker Research', 'Internal Docs', 'Expert Calls', 'News']

export function GridTemplatesGallery({
  open, onClose, onChoose,
}: {
  open: boolean
  onClose: () => void
  onChoose?: (tpl: GridTemplate) => void
}) {
  const [wf, setWf] = useState<typeof WORKFLOWS[number]>('All')
  const [docSrc, setDocSrc] = useState<typeof DOC_SOURCES[number]>('All')
  // "Recommended for you" is the first three; the rest land under Browse all.
  const recommendedIds = ['earnings', 'industry', 'primer']
  if (!open) return null
  const filtered = GRID_TEMPLATES.filter(t => {
    if (wf !== 'All' && TPL_WORKFLOW[t.id] !== wf) return false
    if (docSrc !== 'All' && !(TPL_DOC_SOURCES[t.id] || []).includes(docSrc)) return false
    return true
  })
  const recommended = filtered.filter(t => recommendedIds.includes(t.id))
  const browseAll = filtered.filter(t => !recommendedIds.includes(t.id))

  function renderCard(t: GridTemplate) {
    return (
      <button key={t.id} onClick={() => { onChoose?.(t); onClose() }}
        style={{ ...card, padding:16, textAlign:'left', cursor:'pointer', fontFamily:'inherit', transition:'all .14s', display:'flex', flexDirection:'column', gap:10 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ width:30, height:30, borderRadius:7, background:TPL_BG[t.accent], color:TPL_FG[t.accent], display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:800 }}>▦</span>
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ fontSize:13.5, fontWeight:800, color:'var(--text-primary)' }}>{t.name}</div>
            <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:1 }}>{t.audience} · {TPL_WORKFLOW[t.id]}</div>
          </div>
        </div>
        <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5 }}>{t.blurb}</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
          {t.columns.slice(0,3).map(c => (
            <span key={c.label} style={{ fontSize:10, padding:'2px 7px', borderRadius:4, background:'var(--bg-elevated)', color:'var(--text-secondary)', border:'1px solid var(--border)' }}>{c.label}</span>
          ))}
          {t.columns.length > 3 && <span style={{ fontSize:10, color:'var(--text-muted)', padding:'2px 4px' }}>+{t.columns.length-3} more</span>}
        </div>
      </button>
    )
  }

  return (
    <div onClick={onClose} role="dialog" aria-modal="true"
      style={{ position:'fixed', inset:0, background:'rgba(8,14,26,0.65)', backdropFilter:'blur(4px)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ ...card, width:'min(960px, 100%)', maxHeight:'90vh', overflow:'auto', padding:0 }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={muted}>Grid Templates · {GRID_TEMPLATES.length} starters</div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--text-primary)', marginTop:2 }}>Start a Matrix from a template</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background:'none', border:'none', color:'var(--text-secondary)', fontSize:22, cursor:'pointer' }}>×</button>
        </div>

        <div style={{ padding:'14px 22px 0', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ ...muted, fontSize:11, marginRight:4 }}>Workflow</span>
          {WORKFLOWS.map(w => (
            <button key={w} onClick={() => setWf(w)} style={{
              padding:'4px 10px', borderRadius:14, fontSize:11, fontWeight:700, fontFamily:'inherit', cursor:'pointer',
              border:'1px solid', borderColor: wf === w ? 'var(--accent)' : 'var(--border)',
              background: wf === w ? 'var(--accent-dim)' : 'transparent',
              color: wf === w ? 'var(--accent-text)' : 'var(--text-secondary)',
            }}>{w}</button>
          ))}
        </div>

        <div style={{ padding:'10px 22px 0', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ ...muted, fontSize:11, marginRight:4 }}>Document Source</span>
          {DOC_SOURCES.map(s => (
            <button key={s} onClick={() => setDocSrc(s)} style={{
              padding:'4px 10px', borderRadius:14, fontSize:11, fontWeight:700, fontFamily:'inherit', cursor:'pointer',
              border:'1px solid', borderColor: docSrc === s ? 'var(--violet)' : 'var(--border)',
              background: docSrc === s ? 'var(--violet-dim)' : 'transparent',
              color: docSrc === s ? 'var(--violet)' : 'var(--text-secondary)',
            }}>{s}</button>
          ))}
        </div>

        {recommended.length > 0 && (
          <>
            <div style={{ padding:'18px 22px 6px', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, fontWeight:800, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--accent-text)' }}>Recommended for you</span>
              <span style={{ ...muted, fontSize:11 }}>· based on your recent activity</span>
            </div>
            <div style={{ padding:'4px 22px 6px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
              {recommended.map(renderCard)}
            </div>
          </>
        )}

        {browseAll.length > 0 && (
          <>
            <div style={{ padding:'18px 22px 6px' }}>
              <span style={{ fontSize:11, fontWeight:800, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)' }}>Browse all</span>
            </div>
            <div style={{ padding:'4px 22px 22px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
              {browseAll.map(renderCard)}
            </div>
          </>
        )}

        {filtered.length === 0 && (
          <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No templates match this workflow yet.</div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 3. ConnectSourcesPanel — Email-In + cloud connectors
// ════════════════════════════════════════════════════════════════════════════

export type ConnectorCategory = 'data-import' | 'file-storage' | 'productivity'

export interface Connector {
  id: string
  name: string
  blurb: string
  icon: string
  status: 'connected' | 'available' | 'coming-soon'
  category: ConnectorCategory
  meta?: string
}

const CATEGORY_LABEL: Record<ConnectorCategory, string> = {
  'data-import':   'Data Import Tools',
  'file-storage':  'File Storage',
  'productivity':  'Productivity',
}

const DEFAULT_CONNECTORS: Connector[] = [
  { id:'emailin',   name:'Email In',     icon:'✉', status:'available',    category:'data-import',  blurb:'Forward documents to a unique inbox to sync them in seconds.', meta:'workspace-…@in.finsyt.app' },
  { id:'filesync',  name:'FileSync',     icon:'⤓', status:'available',    category:'data-import',  blurb:'Watched folder agent — drop a file, it appears in your library.' },
  { id:'box',       name:'Box',          icon:'☐', status:'available',    category:'file-storage', blurb:'Sync any Box folder, with permissions inherited.' },
  { id:'gdrive',    name:'Google Drive', icon:'◭', status:'connected',    category:'file-storage', blurb:'Two-way Drive sync, including comments.', meta:'Connected · 1,284 files indexed' },
  { id:'sharepoint',name:'SharePoint',   icon:'◍', status:'available',    category:'file-storage', blurb:'Connect a SharePoint site or Teams channel.' },
  { id:'dropbox',   name:'Dropbox',      icon:'◆', status:'available',    category:'file-storage', blurb:'Sync a Dropbox folder; Smart Sync supported.' },
  { id:'egnyte',    name:'Egnyte',       icon:'◬', status:'coming-soon',  category:'file-storage', blurb:'Compliance-grade file mirror.' },
  { id:'evernote',  name:'Evernote',     icon:'◧', status:'coming-soon',  category:'productivity', blurb:'Pull notes & web clips into the corpus.' },
  { id:'onenote',   name:'OneNote',      icon:'◨', status:'coming-soon',  category:'productivity', blurb:'Pull OneNote notebooks into the corpus.' },
]

export const CONN_KEY_BASE = 'finsyt.connectors.v1'

export function ConnectSourcesPanel() {
  const scope = useScope()
  const key = scopedKey(CONN_KEY_BASE, scope)
  const notifyKey = scopedKey('finsyt.connectors.notify.v1', scope)
  const [state, setState] = useState<Record<string, Connector['status']>>({})
  // "Notify me" tracks intent only — it never flips a coming-soon connector
  // into a live integration we don't actually support.
  const [notified, setNotified] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(key)
      setState(raw ? JSON.parse(raw) : {})
    } catch { setState({}) }
    try {
      const raw = window.localStorage.getItem(notifyKey)
      setNotified(raw ? JSON.parse(raw) : {})
    } catch { setNotified({}) }
  }, [key, notifyKey])

  function setStatus(id: string, status: Connector['status']) {
    // Coming-soon connectors are not real integrations — never let the UI
    // flip them into "connected" state, regardless of which button was hit.
    const original = DEFAULT_CONNECTORS.find(c => c.id === id)
    if (original?.status === 'coming-soon') return
    setState(prev => {
      const next = { ...prev, [id]: status }
      try { window.localStorage.setItem(key, JSON.stringify(next)) } catch {}
      return next
    })
  }
  function toggleNotify(id: string) {
    setNotified(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { window.localStorage.setItem(notifyKey, JSON.stringify(next)) } catch {}
      return next
    })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div>
        <div style={{ fontSize:14, fontWeight:800, color:'var(--text-primary)', marginBottom:4 }}>Connect Sources</div>
        <div style={{ fontSize:12.5, color:'var(--text-secondary)', maxWidth:620 }}>
          Pull your firm&apos;s documents into the research corpus. Email In and FileSync work in seconds; cloud connectors mirror with permissions inherited.
        </div>
      </div>
      {(['data-import','file-storage','productivity'] as ConnectorCategory[]).map(cat => {
        const items = DEFAULT_CONNECTORS.filter(c => c.category === cat)
        if (items.length === 0) return null
        return (
          <div key={cat}>
            <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom:8 }}>{CATEGORY_LABEL[cat]}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
              {items.map(c => {
                const status = state[c.id] || c.status
                return (
                  <div key={c.id} style={{ ...card, padding:14, display:'flex', flexDirection:'column', gap:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ width:32, height:32, borderRadius:8, background:'var(--bg-elevated)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:16, color:'var(--text-secondary)' }}>{c.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:800, color:'var(--text-primary)' }}>{c.name}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{c.meta || (status === 'connected' ? 'Connected' : status === 'coming-soon' ? 'Coming soon' : 'Not connected')}</div>
                      </div>
                      <Badge tone={status === 'connected' ? 'green' : status === 'coming-soon' ? 'gray' : 'blue'}>{status === 'coming-soon' ? 'Soon' : status === 'connected' ? 'On' : 'Off'}</Badge>
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5 }}>{c.blurb}</div>
                    <div style={{ display:'flex', gap:6 }}>
                      {status === 'connected' ? (
                        <Button size="sm" variant="ghost" onClick={() => setStatus(c.id, 'available')}>Disconnect</Button>
                      ) : status === 'coming-soon' ? (
                        <Button size="sm" variant="ghost" onClick={() => toggleNotify(c.id)}>
                          {notified[c.id] ? "✓ You'll be notified" : 'Notify me'}
                        </Button>
                      ) : (
                        <Button size="sm" variant="primary" onClick={() => setStatus(c.id, 'connected')}>Connect</Button>
                      )}
                      <Button size="sm" variant="ghost">Docs ↗</Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <div style={{ ...card, padding:14, display:'flex', alignItems:'flex-start', gap:12 }}>
        <span style={{ fontSize:18, color:'var(--accent-text)' }}>ⓘ</span>
        <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.55 }}>
          Permissions are inherited from the source. Documents only become visible to teammates that already have read access in the source system. <SampleBadge />
        </div>
      </div>
    </div>
  )
}

export function ConnectSourcesOverviewCard({ onOpen }: { onOpen?: () => void }) {
  const scope = useScope()
  const key = scopedKey(CONN_KEY_BASE, scope)
  const [connected, setConnected] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    let st: Record<string, Connector['status']> = {}
    try { const raw = window.localStorage.getItem(key); st = raw ? JSON.parse(raw) : {} } catch { st = {} }
    const n = DEFAULT_CONNECTORS.reduce((acc, c) => acc + ((st[c.id] || c.status) === 'connected' ? 1 : 0), 0)
    setConnected(n)
  }, [key])
  return (
    <div style={{ ...card, padding:14, display:'flex', alignItems:'center', gap:12 }}>
      <span style={{ width:36, height:36, borderRadius:9, background:'var(--accent-dim)', color:'var(--accent-text)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>⇆</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:800, color:'var(--text-primary)' }}>Connect Sources</div>
        <div style={{ fontSize:11.5, color:'var(--text-secondary)' }}>{connected} of {DEFAULT_CONNECTORS.length} sources connected · Email In · Drive · SharePoint · Box</div>
      </div>
      <Button size="sm" variant={connected === 0 ? 'primary' : 'ghost'} onClick={onOpen}>{connected === 0 ? 'Connect' : 'Manage'}</Button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 4. SmartSummaryUpgrade — doc-type buckets + ticker tabs
// ════════════════════════════════════════════════════════════════════════════

export const DOC_BUCKETS = [
  { id:'expert-call',   label:'Expert Calls' },
  { id:'broker',        label:'Broker Reports' },
  { id:'regulatory',    label:'Regulatory' },
  { id:'expert-script', label:'Expert Transcripts' },
  { id:'company',       label:'Company Doc' },
  { id:'news',          label:'News' },
  { id:'internal',      label:'Internal Notes' },
  { id:'client',        label:'Client Presentations' },
] as const

export type DocBucketId = typeof DOC_BUCKETS[number]['id']

export interface SmartSummaryItem {
  ticker: string
  doc: DocBucketId
  date: string
  source: string
  highlight: string
  sentiment: 'pos' | 'neu' | 'neg'
}

const DEMO_SUMMARY_ITEMS: SmartSummaryItem[] = [
  { ticker:'NVDA', doc:'broker',        date:'Mar 04', source:'Morgan Stanley AI Capex Survey', sentiment:'pos', highlight:'Hyperscaler AI capex tracking +47% YoY in 2026 ($312B). NVDA priority allocation on CoWoS.' },
  { ticker:'NVDA', doc:'expert-call',   date:'Feb 28', source:'Former TSMC Senior PM',          sentiment:'neu', highlight:'CoWoS, not wafers, is binding constraint. AMD MI400 unable to source meaningful volume until Q1 2027.' },
  { ticker:'NVDA', doc:'regulatory',    date:'Feb 27', source:'NVIDIA 10-Q Q4 FY24',            sentiment:'neg', highlight:'Risks: continued export controls to China; supply concentration at TSMC; hyperscaler internal silicon.' },
  { ticker:'AAPL', doc:'broker',        date:'Mar 02', source:'Bernstein — Services growth', sentiment:'neu',  highlight:'Services growth set to decelerate to mid-teens; App Store fee structure under regulatory pressure.' },
  { ticker:'AAPL', doc:'news',          date:'Mar 06', source:'WSJ',                            sentiment:'neg', highlight:'EU DMA enforcement action accelerated; potential €700M penalty pending.' },
  { ticker:'AAPL', doc:'company',       date:'Feb 01', source:'Q1 FY26 Press Release',          sentiment:'pos', highlight:'Buyback raised by $90B; Services +14% in line; iPhone +0.5% YoY.' },
  { ticker:'MSFT', doc:'expert-script', date:'Feb 12', source:'Tegus — ex-Azure GM',            sentiment:'pos', highlight:'M365 AI assistant ARR run-rate now ~$5B; attach rates in E5 SKUs ahead of plan.' },
  { ticker:'MSFT', doc:'internal',      date:'Mar 01', source:'Helix — internal note',          sentiment:'pos', highlight:'Capex $96B for FY26 (raised) implies durable Azure growth into FY27.' },
  { ticker:'GOOGL',doc:'broker',        date:'Feb 06', source:'Goldman — Cloud teardown',       sentiment:'pos', highlight:'GCP gross margin inflection visible; +35% YoY revenue with positive op-leverage.' },
  { ticker:'GOOGL',doc:'news',          date:'Feb 14', source:'Reuters',                        sentiment:'neg', highlight:'YouTube ad softness flagged; Shorts monetisation gap to TikTok widening.' },
]

const SENT_BG: Record<SmartSummaryItem['sentiment'], string> = { pos:'var(--pos-dim)', neg:'var(--neg-dim)', neu:'var(--bg-elevated)' }
const SENT_FG: Record<SmartSummaryItem['sentiment'], string> = { pos:'var(--pos)', neg:'var(--neg)', neu:'var(--text-secondary)' }

export function SmartSummaryUpgrade({
  items = DEMO_SUMMARY_ITEMS,
  tickers,
  onCiteClick,
  ticker: tickerProp,
  bucket: bucketProp,
  onTickerChange,
  onBucketChange,
}: {
  items?: SmartSummaryItem[]
  tickers?: string[]
  onCiteClick?: (item: SmartSummaryItem, idx: number) => void
  ticker?: string
  bucket?: DocBucketId | 'all'
  onTickerChange?: (t: string) => void
  onBucketChange?: (b: DocBucketId | 'all') => void
}) {
  const allTickers = useMemo(() => Array.from(new Set([...(tickers || []), ...items.map(i => i.ticker)])), [items, tickers])
  const [internalTicker, setInternalTicker] = useState(allTickers[0] || 'ALL')
  const [internalBucket, setInternalBucket] = useState<DocBucketId | 'all'>('all')
  const activeTicker = tickerProp ?? internalTicker
  const activeBucket = bucketProp ?? internalBucket
  const setActiveTicker = (t: string) => { onTickerChange ? onTickerChange(t) : setInternalTicker(t) }
  const setActiveBucket = (b: DocBucketId | 'all') => { onBucketChange ? onBucketChange(b) : setInternalBucket(b) }

  const visible = useMemo(() => items.filter(i =>
    (activeTicker === 'ALL' || i.ticker === activeTicker) &&
    (activeBucket === 'all' || i.doc === activeBucket)
  ), [items, activeTicker, activeBucket])

  const counts = useMemo(() => {
    const by: Record<string, number> = { all: 0 }
    items.forEach(i => {
      if (activeTicker !== 'ALL' && i.ticker !== activeTicker) return
      by.all++; by[i.doc] = (by[i.doc] || 0) + 1
    })
    return by
  }, [items, activeTicker])

  return (
    <div style={{ ...card, padding:0, overflow:'hidden' }}>
      <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <div style={{ fontSize:13, fontWeight:800, color:'var(--text-primary)' }}>Smart Summary</div>
        <CitationChip label={`${items.length} sources`} />
        <span style={muted}>across {allTickers.length} tickers</span>
        <div style={{ marginLeft:'auto' }}><SampleBadge /></div>
      </div>
      {/* Ticker tabs */}
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, overflowX:'auto' }}>
        <TickerPill label="All" active={activeTicker === 'ALL'} onClick={() => setActiveTicker('ALL')} />
        {allTickers.map(t => <TickerPill key={t} label={t} active={activeTicker === t} onClick={() => setActiveTicker(t)} />)}
      </div>
      {/* Doc-type bucket chips */}
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, flexWrap:'wrap' }}>
        <BucketChip label="All types" count={counts.all || 0} active={activeBucket === 'all'} onClick={() => setActiveBucket('all')} />
        {DOC_BUCKETS.map(b => (
          <BucketChip key={b.id} label={b.label} count={counts[b.id] || 0} active={activeBucket === b.id} onClick={() => setActiveBucket(b.id)} />
        ))}
      </div>
      {/* Items list */}
      <div>
        {visible.length === 0 ? (
          <EmptyState icon="∅" title="No items match" hint="Try a different ticker or document type." />
        ) : visible.map((it, i) => (
          <div key={i} style={{ padding:'12px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', display:'flex', gap:12, alignItems:'flex-start' }}>
            <span style={{ width:42, padding:'2px 6px', borderRadius:5, background:'var(--accent-dim)', color:'var(--accent-text)', fontSize:10.5, fontWeight:800, textAlign:'center' }}>{it.ticker}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:4, flexWrap:'wrap' }}>
                <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:4, background:'var(--bg-elevated)', color:'var(--text-secondary)' }}>
                  {DOC_BUCKETS.find(b => b.id === it.doc)?.label || it.doc}
                </span>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>{it.source} · {it.date}</span>
              </div>
              <div style={{ fontSize:13, color:'var(--text-primary)', lineHeight:1.55 }}>
                {it.highlight}
                {' '}
                <CitationChip label={`${i + 1}`} onClick={onCiteClick ? () => onCiteClick(it, i) : undefined} />
              </div>
            </div>
            <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:SENT_BG[it.sentiment], color:SENT_FG[it.sentiment] }}>
              {it.sentiment === 'pos' ? '+ POS' : it.sentiment === 'neg' ? '– NEG' : 'NEU'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TickerPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding:'5px 12px', borderRadius:7, fontSize:12, fontWeight:700,
      background: active ? 'var(--accent)' : 'transparent',
      color: active ? '#fff' : 'var(--text-secondary)',
      border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--border)',
      cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap',
    }}>{label}</button>
  )
}
function BucketChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding:'4px 9px', borderRadius:999, fontSize:11, fontWeight:700,
      background: active ? 'var(--accent-dim)' : 'transparent',
      color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
      border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--border)',
      cursor:'pointer', fontFamily:'inherit', display:'inline-flex', gap:6, alignItems:'center',
    }}>
      {label}
      <span style={{ ...num, fontSize:10, opacity:0.7 }}>{count}</span>
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 5. DeepResearchPhases — visible reasoning phases
// ════════════════════════════════════════════════════════════════════════════

export interface ResearchPhase {
  /** Phase headline shown collapsed (e.g. "Interpreted your question"). */
  label: string
  /** Short summary line shown next to the headline. */
  detail: string
  /** Sub-steps revealed when the phase is expanded. */
  steps: string[]
}

/**
 * Deep Research's three canonical phases. The platform spec is opinionated:
 * always show three phases — interpret, think, summarize — each independently
 * expandable so users can audit the reasoning trace.
 */
export const DEFAULT_PHASES: ResearchPhase[] = [
  { label:'Interpreted your question',
    detail:'Parsed entities, time horizon, and which source buckets to query.',
    steps:[
      'Identified primary tickers and sector tags from the question.',
      'Inferred time horizon (last 4 quarters) and document mix.',
      'Selected source buckets: filings · transcripts · broker · expert calls.',
    ] },
  { label:'Thinking',
    detail:'Reading documents, extracting claims, and reconciling contradictions.',
    steps:[
      'Pulled candidate documents from selected sources.',
      'Extracted relevant claims with page-level citations.',
      'Cross-referenced claims; weighted by recency and source rank.',
      'Drafted bullets and verified each against its citation.',
    ] },
  { label:'Summarized',
    detail:'Composed the answer with structured bullets and inline citations.',
    steps:[
      'Composed top-line summary.',
      'Generated bullet-by-bullet evidence with [n] citation chips.',
      'Surfaced disagreements between sources where applicable.',
    ] },
]

export function DeepResearchPhases({
  active = -1, phases = DEFAULT_PHASES, sourcesScanned = 0, citationsFound = 0,
}: { active?: number; phases?: ResearchPhase[]; sourcesScanned?: number; citationsFound?: number }) {
  // Auto-expand the currently-running phase; user can fold/unfold any other.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]))
  useEffect(() => {
    if (active >= 0 && active < phases.length) {
      setExpanded(prev => { const n = new Set(prev); n.add(active); return n })
    }
  }, [active, phases.length])
  function toggle(i: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }
  return (
    <div style={{ ...card, padding:'14px 18px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        <Badge tone="violet">Deep Research</Badge>
        <span style={muted}>Reasoning phases · click to expand</span>
        <span style={{ marginLeft:'auto', ...muted, ...num }}>{sourcesScanned} sources · {citationsFound} citations</span>
      </div>
      <ol style={{ margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:8 }}>
        {phases.map((p, i) => {
          const done = active > i || active === phases.length
          const cur  = i === active
          const open = expanded.has(i)
          return (
            <li key={i} style={{ borderRadius:8, background: cur ? 'var(--accent-dim)' : 'var(--bg-elevated)', border:'1px solid', borderColor: cur ? 'var(--accent)' : 'var(--border)' }}>
              <button
                onClick={() => toggle(i)}
                aria-expanded={open}
                style={{ width:'100%', display:'flex', gap:10, alignItems:'flex-start', padding:'9px 12px', background:'transparent', border:'none', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}
              >
                <span style={{
                  width:18, height:18, borderRadius:'50%',
                  background: done ? 'var(--pos)' : cur ? 'var(--accent)' : 'var(--bg-card)',
                  color: done || cur ? '#fff' : 'var(--text-muted)',
                  fontSize:10, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1,
                }}>{done ? '✓' : i + 1}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:700, color:'var(--text-primary)' }}>{p.label}</div>
                  <div style={{ fontSize:11.5, color:'var(--text-secondary)', lineHeight:1.45 }}>{p.detail}</div>
                </div>
                {cur && <span style={{ fontSize:10, color:'var(--accent-text)', fontWeight:700, marginTop:2 }}>● running</span>}
                <span aria-hidden style={{ color:'var(--text-muted)', fontSize:11, marginTop:2 }}>{open ? '▾' : '▸'}</span>
              </button>
              {open && (
                <ul style={{ listStyle:'none', margin:0, padding:'0 14px 12px 40px', display:'flex', flexDirection:'column', gap:5 }}>
                  {p.steps.map((s, j) => (
                    <li key={j} style={{ fontSize:11.5, color:'var(--text-secondary)', lineHeight:1.5, position:'relative' }}>
                      <span style={{ position:'absolute', left:-12, color: done || (cur && j < (active === i ? 99 : 0)) ? 'var(--pos)' : 'var(--text-muted)' }}>·</span>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 6. CreateAlertButton — one-click "Create Alert from this query"
// ════════════════════════════════════════════════════════════════════════════

/** Saved query-alert payload — captures full search context, not just text. */
export interface QueryAlert {
  id: string
  q: string
  createdAt: string
  cadence: 'realtime' | 'daily' | 'weekly'
  ticker?: string
  sources?: string[]      // selected source-library leaf IDs at save time
  sourceFilter?: string   // active "Search Across" bucket id (e.g. 'broker')
}
export const QUERY_ALERTS_KEY_BASE = 'finsyt.queryalerts.v1'

export function CreateAlertButton({
  query, ticker, sources, sourceFilter, onCreated, size = 'sm', label, variant = 'ghost',
}: {
  query: string
  ticker?: string
  sources?: string[]
  sourceFilter?: string
  onCreated?: (a: QueryAlert) => void
  size?: 'sm' | 'md'
  /** Override button copy — defaults to "Create Alert". */
  label?: string
  variant?: 'ghost' | 'primary'
}) {
  const scope = useScope()
  const [open, setOpen] = useState(false)
  const [cadence, setCadence] = useState<QueryAlert['cadence']>('daily')
  const [done, setDone] = useState(false)

  function save() {
    const a: QueryAlert = {
      id: Math.random().toString(36).slice(2),
      q: query,
      createdAt: new Date().toISOString(),
      cadence,
      ticker: ticker || undefined,
      sources: sources && sources.length ? sources : undefined,
      sourceFilter: sourceFilter || undefined,
    }
    if (typeof window !== 'undefined') {
      try {
        const key = scopedKey(QUERY_ALERTS_KEY_BASE, scope)
        const raw = window.localStorage.getItem(key)
        const arr: QueryAlert[] = raw ? JSON.parse(raw) : []
        arr.unshift(a)
        window.localStorage.setItem(key, JSON.stringify(arr))
      } catch {}
    }
    setDone(true)
    onCreated?.(a)
    setTimeout(() => { setOpen(false); setDone(false) }, 1400)
  }

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} disabled={!query.trim()} title="Create an alert from this query">◔ {label || 'Create Alert'}</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Create Alert" width={420}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <div style={muted}>Query</div>
            <div style={{ marginTop:4, padding:'8px 10px', background:'var(--bg-elevated)', borderRadius:8, border:'1px solid var(--border)', fontSize:13, color:'var(--text-primary)', lineHeight:1.5 }}>
              {query || <span style={{ color:'var(--text-muted)' }}>(no query yet)</span>}
            </div>
          </div>
          {(ticker || sourceFilter || (sources && sources.length)) && (
            <div>
              <div style={muted}>Filters captured</div>
              <div style={{ marginTop:6, display:'flex', flexWrap:'wrap', gap:6 }}>
                {ticker && <Badge tone="blue">{ticker}</Badge>}
                {sourceFilter && <Badge tone="gray">{sourceFilter}</Badge>}
                {sources && sources.length > 0 && <Badge tone="violet">{sources.length} library docs</Badge>}
              </div>
            </div>
          )}
          <div>
            <div style={muted}>Cadence</div>
            <div style={{ marginTop:6, display:'flex', gap:6 }}>
              {(['realtime','daily','weekly'] as const).map(c => (
                <button key={c} onClick={() => setCadence(c)} style={{
                  flex:1, padding:'8px 10px', borderRadius:8, fontSize:12, fontWeight:700, fontFamily:'inherit', cursor:'pointer',
                  background: cadence === c ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: cadence === c ? '#fff' : 'var(--text-primary)',
                  border:'1px solid', borderColor: cadence === c ? 'var(--accent)' : 'var(--border)',
                  textTransform:'capitalize',
                }}>{c}</button>
              ))}
            </div>
          </div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5 }}>
            We&apos;ll re-run this query — with the captured filters — on the schedule you pick and notify you when results materially change. Manage alerts under <Link href="/app/alerts" style={{ color:'var(--accent-text)' }}>Alerts</Link>.
          </div>
          {done ? (
            <Button variant="primary" disabled>✓ Alert created</Button>
          ) : (
            <Button variant="primary" onClick={save} disabled={!query.trim()}>Create Alert</Button>
          )}
        </div>
      </Drawer>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 7. ExpertQuoteCard — quoted excerpt with attribution + relevance
// ════════════════════════════════════════════════════════════════════════════

export interface ExpertQuote {
  expert:  string
  role:    string
  network?: string
  quote:   string
  date:    string
  ticker?: string
  topic?:  string
  relevance?: number   // 0..1
  sentiment?: 'pos' | 'neu' | 'neg'
}

export function ExpertQuoteCard({ q, onOpen }: { q: ExpertQuote; onOpen?: () => void }) {
  const tone = q.sentiment || 'neu'
  return (
    <article style={{ ...card, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--bg-elevated)', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--text-secondary)', fontWeight:800, flexShrink:0 }}>
          {q.expert.split(' ').map(w => w[0]).slice(0,2).join('')}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'var(--text-primary)' }}>{q.expert}</div>
          <div style={{ fontSize:11.5, color:'var(--text-secondary)' }}>{q.role}{q.network ? ` · ${q.network}` : ''}</div>
        </div>
        {q.ticker && <Badge tone="blue">{q.ticker}</Badge>}
        <Badge tone={tone === 'pos' ? 'green' : tone === 'neg' ? 'red' : 'gray'}>{tone === 'pos' ? '+ POS' : tone === 'neg' ? '– NEG' : 'NEU'}</Badge>
      </div>
      <blockquote style={{ margin:0, padding:'10px 12px', borderLeft:'3px solid var(--accent)', background:'var(--bg-elevated)', borderRadius:6, fontSize:13.5, color:'var(--text-primary)', lineHeight:1.6, fontStyle:'italic' }}>
        &ldquo;{q.quote}&rdquo;
      </blockquote>
      <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:11, color:'var(--text-muted)' }}>
        <span>{q.date}</span>
        {q.topic && <><span>·</span><span>{q.topic}</span></>}
        {q.relevance != null && (
          <span style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:6 }}>
            Relevance
            <span style={{ display:'inline-block', width:60, height:5, borderRadius:3, background:'var(--bg-elevated)', overflow:'hidden' }}>
              <span style={{ display:'block', width:`${Math.round((q.relevance) * 100)}%`, height:'100%', background:'var(--accent)' }} />
            </span>
            <span style={{ ...num, color:'var(--text-secondary)' }}>{Math.round(q.relevance * 100)}%</span>
          </span>
        )}
        {onOpen && <Button size="sm" variant="ghost" onClick={onOpen}>Open transcript ↗</Button>}
      </div>
    </article>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 8. CompanyDataTab — analyst-grade widgets
// ════════════════════════════════════════════════════════════════════════════

export function CompanyDataTab({ symbol, name }: { symbol: string; name?: string }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:18 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:14, fontWeight:800, color:'var(--text-primary)' }}>Analyst Data — {name || symbol}</div>
        <SampleBadge />
        <span style={{ ...muted, marginLeft:'auto' }}>Six analyst-grade widgets · sourced from filings, market data & alt-data feeds</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:14 }}>
        <ShareholdersWidget symbol={symbol} />
        <MarketDataWidget symbol={symbol} />
        <WorkforceWidget symbol={symbol} />
        <FundingWidget symbol={symbol} />
        <KeyMetricsWidget symbol={symbol} />
        <StatementsWidget symbol={symbol} />
      </div>
    </div>
  )
}

function WidgetShell({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card padding={0} style={{ overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontSize:12.5, fontWeight:800, color:'var(--text-primary)' }}>{title}</div>
        <SampleBadge />
        <div style={{ marginLeft:'auto' }}>{action}</div>
      </div>
      <div style={{ padding:'12px 16px' }}>{children}</div>
    </Card>
  )
}

function ShareholdersWidget({ symbol }: { symbol: string }) {
  const rows = [
    { name:'Vanguard Group',        pct:8.74, chg:+0.12, type:'Index' },
    { name:'BlackRock',             pct:7.21, chg:+0.04, type:'Index' },
    { name:'State Street',          pct:4.18, chg:-0.02, type:'Index' },
    { name:'Fidelity (FMR)',        pct:3.92, chg:+0.31, type:'Active' },
    { name:'Capital Group',         pct:2.65, chg:-0.18, type:'Active' },
    { name:'T. Rowe Price',         pct:1.84, chg:+0.07, type:'Active' },
    { name:'Insider holdings',      pct:1.12, chg:-0.04, type:'Insider' },
  ]
  return (
    <WidgetShell title={`Top Shareholders · ${symbol}`} action={<Button size="sm" variant="ghost">Full 13F →</Button>}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
        <thead>
          <tr style={{ color:'var(--text-muted)', textAlign:'left' }}>
            <th style={{ padding:'4px 0', fontWeight:600 }}>Holder</th>
            <th style={{ padding:'4px 0', fontWeight:600 }}>Type</th>
            <th style={{ padding:'4px 0', fontWeight:600, textAlign:'right' }}>% O/S</th>
            <th style={{ padding:'4px 0', fontWeight:600, textAlign:'right' }}>Δ qtr</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} style={{ borderTop:'1px dashed var(--border)' }}>
              <td style={{ padding:'6px 0', color:'var(--text-primary)' }}>{r.name}</td>
              <td style={{ padding:'6px 0', color:'var(--text-secondary)' }}>{r.type}</td>
              <td style={{ padding:'6px 0', textAlign:'right', ...num, color:'var(--text-primary)' }}>{r.pct.toFixed(2)}%</td>
              <td style={{ padding:'6px 0', textAlign:'right', ...num, color: r.chg >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{r.chg >= 0 ? '+' : ''}{r.chg.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </WidgetShell>
  )
}

function MarketDataWidget({ symbol }: { symbol: string }) {
  const rows = [
    { l:'Short interest',        v:'2.1% O/S', s:'+0.4 wk' },
    { l:'Days to cover',         v:'1.6',      s:'flat' },
    { l:'Borrow fee',            v:'0.35%',    s:'-2 bps' },
    { l:'Implied vol (30d)',     v:'34.6%',    s:'+1.2 vols' },
    { l:'Put/Call ratio',        v:'0.72',     s:'-0.05' },
    { l:'Block trades (5d)',     v:'14',       s:'+3' },
  ]
  return (
    <WidgetShell title={`Market Data · ${symbol}`} action={<Button size="sm" variant="ghost">Options chain →</Button>}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {rows.map(r => (
          <div key={r.l} style={{ padding:'8px 10px', background:'var(--bg-elevated)', borderRadius:8 }}>
            <div style={muted}>{r.l}</div>
            <div style={{ marginTop:4, ...num, fontSize:14, fontWeight:800, color:'var(--text-primary)' }}>{r.v}</div>
            <div style={{ fontSize:10.5, color:'var(--text-muted)' }}>{r.s}</div>
          </div>
        ))}
      </div>
    </WidgetShell>
  )
}

function WorkforceWidget({ symbol }: { symbol: string }) {
  const segments = [
    { l:'Engineering', pct:48, color:'var(--accent)' },
    { l:'GTM',         pct:21, color:'var(--pos)' },
    { l:'Operations',  pct:15, color:'var(--amber)' },
    { l:'G&A',         pct:9,  color:'var(--violet)' },
    { l:'Other',       pct:7,  color:'var(--text-muted)' },
  ]
  return (
    <WidgetShell title={`Workforce mix · ${symbol}`} action={<Button size="sm" variant="ghost">Headcount trend →</Button>}>
      <div style={{ display:'flex', height:10, borderRadius:5, overflow:'hidden', marginBottom:10, border:'1px solid var(--border)' }}>
        {segments.map(s => <span key={s.l} style={{ flex:s.pct, background:s.color }} />)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        {segments.map(s => (
          <div key={s.l} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11.5, color:'var(--text-secondary)' }}>
            <span style={{ width:8, height:8, borderRadius:2, background:s.color }} />
            <span style={{ flex:1 }}>{s.l}</span>
            <span style={{ ...num, color:'var(--text-primary)', fontWeight:700 }}>{s.pct}%</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop:10, padding:'8px 10px', background:'var(--bg-elevated)', borderRadius:8, display:'flex', gap:14, fontSize:11.5, color:'var(--text-secondary)' }}>
        <span>Headcount <strong style={{ color:'var(--text-primary)', ...num }}>32,140</strong></span>
        <span>Net hires (90d) <strong style={{ color:'var(--pos)', ...num }}>+412</strong></span>
        <span>Attrition <strong style={{ color:'var(--text-primary)', ...num }}>9.2%</strong></span>
      </div>
    </WidgetShell>
  )
}

function FundingWidget({ symbol }: { symbol: string }) {
  const rounds = [
    { date:'2018-06', round:'IPO',          amt:'$3.6B',  lead:'Goldman / MS / JPM' },
    { date:'2017-04', round:'Series F',     amt:'$520M',  lead:'Sequoia / SoftBank' },
    { date:'2015-11', round:'Series E',     amt:'$210M',  lead:'a16z / Greylock' },
    { date:'2014-02', round:'Series D',     amt:'$95M',   lead:'Insight Partners' },
  ]
  return (
    <WidgetShell title={`Funding history · ${symbol}`} action={<Button size="sm" variant="ghost">Cap table →</Button>}>
      <div style={{ position:'relative', paddingLeft:14 }}>
        <div style={{ position:'absolute', left:5, top:6, bottom:6, width:2, background:'var(--border)' }} />
        {rounds.map(r => (
          <div key={r.date} style={{ position:'relative', marginBottom:10 }}>
            <span style={{ position:'absolute', left:-12, top:4, width:8, height:8, borderRadius:'50%', background:'var(--accent)' }} />
            <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
              <span style={{ fontSize:11, color:'var(--text-muted)', ...num }}>{r.date}</span>
              <span style={{ fontSize:13, fontWeight:800, color:'var(--text-primary)' }}>{r.round}</span>
              <span style={{ fontSize:13, fontWeight:800, color:'var(--accent-text)', ...num }}>{r.amt}</span>
            </div>
            <div style={{ fontSize:11.5, color:'var(--text-secondary)' }}>{r.lead}</div>
          </div>
        ))}
      </div>
    </WidgetShell>
  )
}

function KeyMetricsWidget({ symbol }: { symbol: string }) {
  const cells = [
    { l:'Revenue (TTM)',  v:'$96.3B', d:'+125% YoY' },
    { l:'Gross margin',   v:'74.5%',  d:'+540 bps' },
    { l:'Op margin',      v:'56.1%',  d:'+810 bps' },
    { l:'FCF (TTM)',      v:'$33.1B', d:'+180% YoY' },
    { l:'ROIC',           v:'46.2%',  d:'+1,420 bps' },
    { l:'Net debt / EBIT',v:'-0.8×',  d:'net cash' },
  ]
  return (
    <WidgetShell title={`Key metrics · ${symbol}`} action={<Button size="sm" variant="ghost">Cohort builder →</Button>}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        {cells.map(c => (
          <div key={c.l} style={{ padding:'10px 11px', background:'var(--bg-elevated)', borderRadius:8 }}>
            <div style={muted}>{c.l}</div>
            <div style={{ marginTop:4, ...num, fontSize:14, fontWeight:800, color:'var(--text-primary)' }}>{c.v}</div>
            <div style={{ fontSize:10.5, color:'var(--text-muted)' }}>{c.d}</div>
          </div>
        ))}
      </div>
    </WidgetShell>
  )
}

function StatementsWidget({ symbol }: { symbol: string }) {
  const years = ['FY22','FY23','FY24','FY25E']
  const TABS = {
    income: [
      { l:'Revenue',       v:[26.9, 60.9, 96.3, 142.0] },
      { l:'Gross profit',  v:[15.4, 41.6, 71.7, 108.4] },
      { l:'Op income',     v:[4.2, 32.9, 54.0, 82.0] },
      { l:'Net income',    v:[4.4, 29.8, 47.1, 70.5] },
      { l:'Diluted EPS',   v:[1.74, 11.93, 18.84, 28.20] },
    ],
    balance: [
      { l:'Cash & equiv.', v:[17.0, 25.9, 38.5, 62.0] },
      { l:'Total assets',  v:[44.2, 65.7, 96.0, 138.0] },
      { l:'Total debt',    v:[11.0, 9.7, 8.5, 7.0] },
      { l:'Total equity',  v:[26.6, 42.6, 65.4, 105.0] },
      { l:'Net cash',      v:[6.0, 16.2, 30.0, 55.0] },
    ],
    cash: [
      { l:'CFO',           v:[5.6, 28.1, 38.4, 64.0] },
      { l:'Capex',         v:[-1.8, -1.2, -5.3, -8.0] },
      { l:'FCF',           v:[3.8, 26.9, 33.1, 56.0] },
      { l:'Buybacks',      v:[-10.0, -8.0, -10.5, -25.0] },
      { l:'Dividends',     v:[-0.4, -0.4, -0.4, -0.5] },
    ],
  } as const
  type StmtTab = keyof typeof TABS
  const [tab, setTab] = useState<StmtTab>('income')
  const rows = TABS[tab]
  return (
    <WidgetShell
      title={`Statements snapshot · ${symbol}`}
      action={
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {(['income','balance','cash'] as StmtTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding:'3px 9px', borderRadius:5, fontSize:11, fontWeight:700, fontFamily:'inherit', cursor:'pointer',
              border:'1px solid', borderColor: tab === t ? 'var(--accent)' : 'var(--border)',
              background: tab === t ? 'var(--accent-dim)' : 'transparent',
              color: tab === t ? 'var(--accent-text)' : 'var(--text-secondary)',
            }}>{t === 'income' ? 'Income' : t === 'balance' ? 'Balance' : 'Cash Flow'}</button>
          ))}
          <Button size="sm" variant="ghost">Open Excel →</Button>
        </div>
      }
    >
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
        <thead>
          <tr style={{ color:'var(--text-muted)' }}>
            <th style={{ padding:'4px 0', textAlign:'left', fontWeight:600 }}>$ in B</th>
            {years.map(y => <th key={y} style={{ padding:'4px 0', textAlign:'right', fontWeight:600 }}>{y}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.l} style={{ borderTop:'1px dashed var(--border)' }}>
              <td style={{ padding:'6px 0', color:'var(--text-primary)' }}>{r.l}</td>
              {r.v.map((v, i) => (
                <td key={i} style={{ padding:'6px 0', textAlign:'right', ...num, color:'var(--text-primary)' }}>{v.toFixed(1)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </WidgetShell>
  )
}
