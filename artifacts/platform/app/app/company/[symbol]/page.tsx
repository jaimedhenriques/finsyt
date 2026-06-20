'use client'
import { useEffect, useState, use, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import SyncedTranscript from '@/components/SyncedTranscript'
import SlidesViewer from '@/components/SlidesViewer'
import CompanyQuestions from '@/components/CompanyQuestions'
import SegmentsSection from '@/components/SegmentsSection'
import DividendsSection from '@/components/DividendsSection'
import OwnershipTab from '@/components/company/OwnershipTab'
import RelationshipsTab from '@/components/company/RelationshipsTab'
import EstimatesTab from '@/components/company/EstimatesTab'
import OptionsTab from '@/components/company/OptionsTab'
import AIAnalysisTab from '@/components/company/AIAnalysisTab'
import NotesTab from '@/components/company/NotesTab'
import ValuationsView from '@/components/valuations/ValuationsView'
import TechnicalsView from '@/components/technicals/TechnicalsView'
import HQContext from '@/components/company/HQContext'
import LiveEventBadge from '@/components/LiveEventBadge'
import QuoteFreshness from '@/components/QuoteFreshness'
import { useTier } from '@/lib/tier'
import { Tabs, Drawer, Button, Badge, CitationChip, Skeleton, UIKeyframes, ContextualAskBar } from '@/components/ui'
import { CompanyDataTab } from '@/components/research-pack'
import ConnectorDataPanel from '@/components/company/ConnectorDataPanel'
import AltDataTiles from '@/components/company/AltDataTiles'
import PredictionMarketsTile from '@/components/company/PredictionMarketsTile'
import GeopoliticalExposureTile from '@/components/company/GeopoliticalExposureTile'
import NewsSentimentTile from '@/components/company/NewsSentimentTile'
import ShortInterestTile from '@/components/company/ShortInterestTile'
import { AltDataCitationView, type AltDataCitation } from '@/components/alt-data/cards'
import { getApifyConnection, fetchFilingSignals } from '@/components/alt-data/altDataCache'

function ProGate({ label }: { label: string }) {
  return (
    <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>{label} is a Pro feature</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Upgrade to unlock real-time audio, synced transcripts and clustered analyst Q&A.</div>
      <Link href="/app/settings" className="btn btn-primary" style={{ display: 'inline-block', fontSize: 13 }}>Upgrade to Pro</Link>
    </div>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────
type CompanyTab = 'overview' | 'financials' | 'transcripts' | 'filings' | 'estimates' | 'valuations' | 'technicals' | 'options' | 'ownership' | 'relationships' | 'news' | 'questions' | 'ai-analysis' | 'notes' | 'data'
interface CitationState { open: boolean; label: string; body: string; source?: AltDataCitation }

// ── Utils ────────────────────────────────────────────────────────────────────
function fmt(n: any, dp = 2) { return n == null || n === '' || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) }
function fmtPct(n: any) { if (n == null) return '—'; const v = Number(n); return (v >= 0 ? '+' : '') + v.toFixed(2) + '%' }
const STATEMENT_COLS: Record<'income' | 'balance' | 'cashflow', [string, string][]> = {
  income: [
    ['Revenue','revenue'], ['Cost of Revenue','costOfRevenue'], ['Gross Profit','grossProfit'], ['Gross Margin %','grossMargin'],
    ['Operating Expenses','operatingExpenses'], ['EBITDA','ebitda'], ['EBIT','ebit'], ['Operating Income','operatingIncome'],
    ['Interest Expense','interestExpense'], ['Income Before Tax','incomeBeforeTax'], ['Income Tax','incomeTaxExpense'],
    ['Net Income','netIncome'], ['Net Margin %','netMargin'], ['EPS (Basic)','epsBasic'], ['EPS (Diluted)','eps'],
    ['Weighted Avg Shares (Diluted)','weightedAverageShsOutDil'], ['R&D','researchAndDevelopment'], ['SG&A','sellingGeneralAndAdministrativeExpenses'],
  ],
  balance: [
    ['Cash & Equivalents','cashAndCashEquivalents'], ['Short-term Investments','shortTermInvestments'], ['Accounts Receivable','netReceivables'],
    ['Inventory','inventory'], ['Total Current Assets','totalCurrentAssets'], ['PP&E','propertyPlantEquipmentNet'], ['Goodwill','goodwill'],
    ['Intangible Assets','intangibleAssets'], ['Total Assets','totalAssets'], ['Accounts Payable','accountPayables'],
    ['Short-term Debt','shortTermDebt'], ['Total Current Liabilities','totalCurrentLiabilities'], ['Long-term Debt','longTermDebt'],
    ['Total Liabilities','totalLiabilities'], ['Common Stock','commonStock'], ['Retained Earnings','retainedEarnings'],
    ['Total Equity','totalStockholdersEquity'], ['Net Debt','netDebt'],
  ],
  cashflow: [
    ['Net Income','netIncome'], ['Depreciation & Amort.','depreciationAndAmortization'], ['Stock-based Comp','stockBasedCompensation'],
    ['Change in Working Capital','changeInWorkingCapital'], ['Operating Cash Flow','operatingCashFlow'], ['CapEx','capitalExpenditure'],
    ['Acquisitions','acquisitionsNet'], ['Investing Cash Flow','netCashUsedForInvestingActivites'], ['Debt Issued / (Repaid)','debtRepayment'],
    ['Dividends Paid','dividendsPaid'], ['Share Buybacks','commonStockRepurchased'], ['Financing Cash Flow','netCashUsedProvidedByFinancingActivities'],
    ['Free Cash Flow','freeCashFlow'],
  ],
}
const STMT_TO_API: Record<string, string> = {
  income:  'income-statement',
  balance: 'balance-sheet-statement',
  cashflow:'cash-flow-statement',
}

async function exportFinancialsCsv(symbol: string, statement: 'income' | 'balance' | 'cashflow', financials: any) {
  // Try local cache first; fall back to a fresh provider fetch so all 3 statements are real.
  let years: any[] = financials?.[statement]?.annual || []
  if (!years.length) {
    try {
      const r = await fetch(`/api/financials/statements?symbol=${symbol}&statement=${STMT_TO_API[statement]}&period=annual&limit=10`)
      if (r.ok) {
        const d = await r.json()
        years = d?.rows || []
      }
    } catch {}
  }
  const cols = STATEMENT_COLS[statement]
  const header = ['Metric', ...years.map((y: any) => y.calendarYear || y.year || y.period || y.date || '')]
  const rows = [header.join(',')]
  cols.forEach(([label, key]) => {
    rows.push([label, ...years.map((y: any) => y[key] != null ? y[key] : '')].join(','))
  })
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${symbol}-${statement}.csv`; a.click()
  URL.revokeObjectURL(url)
}
function fmtLarge(n: any) {
  if (!n) return '—'; const v = Number(n)
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(0) + 'M'
  return '$' + v.toLocaleString()
}
function SmartList({ tone, title, items }: { tone: 'pos' | 'neg'; title: string; items: { t: string; src: string }[] }) {
  const accent = tone === 'pos' ? 'var(--pos)' : 'var(--neg)'
  const tint   = tone === 'pos' ? 'var(--pos-dim)' : 'var(--neg-dim)'
  return (
    <div style={{ padding: '14px 18px', borderRight: '1px solid var(--border)', background: tint }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: i === items.length - 1 ? 'none' : '1px dashed var(--border)' }}>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-primary)', margin: 0 }}>{it.t}</p>
          <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)' }} />
            {it.src}
          </div>
        </div>
      ))}
    </div>
  )
}

function fmtB(n: any) {
  if (!n) return '—'; const v = Number(n)
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M'
  return '$' + v.toLocaleString()
}

const RANGES = ['1W', '1M', '3M', '6M', '1Y', '5Y']

// ── Filings tab helpers ──────────────────────────────────────────────────────
/** Strip hyphens / spaces and lowercase so SEC accession numbers compare as
 *  equal regardless of source formatting (`0000320193-24-000123` vs the
 *  compact `000032019324000123` form Apify returns). */
function normAccession(v: unknown): string {
  if (!v) return ''
  return String(v).replace(/[-\s]/g, '').toLowerCase()
}

interface SignalCellState { score: number; sections: string[]; loading: boolean; error: string | null }

/** Renders a 0–100 signal score badge. Three cell states:
 *  - detecting connection           → grey skeleton
 *  - connected, row in flight       → grey skeleton
 *  - connected, score available     → coloured pill with tooltip listing the
 *                                     top material sections from the actor.
 *  - no connection or no row data   → '—'  */
function SignalCell({ state, connected, detecting }: { state: SignalCellState | undefined; connected: boolean; detecting: boolean }) {
  if (detecting || state?.loading) return <span className="skeleton" style={{ display: 'inline-block', width: 36, height: 14 }} />
  if (!connected || !state || state.error || !state.score) {
    return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
  }
  const tone = state.score >= 70 ? { bg: 'var(--pos-dim)', fg: 'var(--pos)' }
             : state.score >= 40 ? { bg: 'rgba(245,158,11,0.18)', fg: 'rgb(245,158,11)' }
             :                     { bg: 'var(--neg-dim)', fg: 'var(--neg)' }
  const tooltip = state.sections.length > 0
    ? `Material sections: ${state.sections.join(', ')}`
    : 'SEC EDGAR Filings Intelligence (Apify) signal score'
  return (
    <span title={tooltip}
      style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, fontVariantNumeric: 'tabular-nums', background: tone.bg, color: tone.fg }}>
      {state.score}
    </span>
  )
}

// ── Filings Sub-tab ──────────────────────────────────────────────────────────
function FilingsTab({ symbol }: { symbol: string }) {
  const [filings, setFilings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [formFilter, setFormFilter] = useState('All')
  const [diff, setDiff] = useState<any | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  // Per-accession signal score from the SEC EDGAR Filings Intelligence
  // Apify actor (Task #322). Loaded lazily after the filings list comes
  // back; keyed by the normalised (digits-only) accession number so it
  // survives the SEC's hyphen vs. compact representations.
  const [signalScores, setSignalScores] = useState<Record<string, { score: number; sections: string[]; loading: boolean; error: string | null }>>({})
  const [signalConn, setSignalConn] = useState<{ id: string } | null | undefined>(undefined)
  const FORMS = ['All', '10-K', '10-Q', '8-K', 'DEF 14A', 'S-1']

  async function openDiff(form: string) {
    setDiffOpen(true); setDiff(null); setDiffLoading(true)
    try {
      const r = await fetch(`/api/filings/diff?symbol=${symbol}&form=${encodeURIComponent(form)}`)
      const d = await r.json()
      setDiff(d)
    } catch (e) {
      setDiff({ error: String(e) })
    } finally { setDiffLoading(false) }
  }

  useEffect(() => {
    fetch(`/api/filings?symbol=${symbol}&limit=20`)
      .then(r => r.json()).then(d => setFilings(d.filings || d.results || []))
      .catch(() => {}).finally(() => setLoading(false))
  }, [symbol])

  // ── Signal column lifecycle ──────────────────────────────────────────
  // We do ONE Apify call per page load (the actor returns the latest 10
  // filings with scores) and map results into `signalScores` keyed by
  // accession. Per-row missing scores render as "—" — this avoids a
  // fan-out of 20 actor runs per page that would blow past the executor's
  // wall and the Apify free-tier quota.
  useEffect(() => {
    let cancelled = false
    getApifyConnection()
      .then((conn) => { if (!cancelled) setSignalConn(conn ? { id: conn.id } : null) })
      .catch(() => { if (!cancelled) setSignalConn(null) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!signalConn || !symbol || filings.length === 0) return
    let cancelled = false
    const acc = filings.slice(0, 10).map((f: any) => normAccession(f.accessionNumber || f.accession || f.id))
    const initial: Record<string, { score: number; sections: string[]; loading: boolean; error: string | null }> = {}
    for (const a of acc) if (a) initial[a] = { score: 0, sections: [], loading: true, error: null }
    setSignalScores(s => ({ ...initial, ...s }))

    // Routed through the shared altDataCache so the same ticker scored here
    // and in the reusable SignalCard (screener / peers) reuses one Apify run.
    fetchFilingSignals(signalConn.id, symbol)
      .then(({ byAccession }) => {
        if (cancelled) return
        setSignalScores(s => {
          const next = { ...s }
          for (const a of Object.keys(byAccession)) {
            next[a] = { ...byAccession[a], loading: false, error: null }
          }
          // Anything we asked for but didn't see → mark resolved with no score.
          for (const a of acc) {
            if (a && next[a]?.loading) next[a] = { score: 0, sections: [], loading: false, error: 'not_returned' }
          }
          return next
        })
      })
      .catch(e => {
        if (cancelled) return
        setSignalScores(s => {
          const next = { ...s }
          for (const a of acc) if (a && next[a]) next[a] = { ...next[a], loading: false, error: String(e?.message || e) }
          return next
        })
      })
    return () => { cancelled = true }
  }, [signalConn, symbol, filings])

  const filtered = formFilter === 'All' ? filings : filings.filter((f: any) => f.form === formFilter)
  // mark the most-recent filing of each form type so the user sees "NEW vs prior"
  const newestByForm = new Map<string, number>()
  filings.forEach((f: any, i: number) => {
    const form = f.form || f.type
    if (form && !newestByForm.has(form)) newestByForm.set(form, i)
  })

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginRight: 8 }}>SEC Filings</span>
        {FORMS.map(f => (
          <button key={f} onClick={() => setFormFilter(f)}
            style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1.5px solid', cursor: 'pointer', transition: 'all 0.12s',
              background: formFilter === f ? 'var(--accent)' : 'var(--bg-card)', color: formFilter === f ? '#fff' : 'var(--text-secondary)', borderColor: formFilter === f ? 'var(--accent)' : 'var(--border)' }}>
            {f}
          </button>
        ))}
      </div>
      <table className="data-table">
        <thead><tr><th>Form</th><th>Filed</th><th>Description</th><th title="SEC EDGAR Filings Intelligence — 0–100 signal score (Apify)">Signal</th><th /></tr></thead>
        <tbody>
          {loading ? Array(5).fill(0).map((_, i) => (
            <tr key={i}><td><span className="skeleton" style={{ width: 50, height: 14 }} /></td><td><span className="skeleton" style={{ width: 80, height: 14 }} /></td><td><span className="skeleton" style={{ width: 220, height: 14 }} /></td><td><span className="skeleton" style={{ width: 36, height: 14 }} /></td><td /></tr>
          )) : filtered.length ? filtered.map((f: any, i: number) => {
            const form = f.form || f.type
            const idxInAll = filings.indexOf(f)
            const isNewest = newestByForm.get(form) === idxInAll && (form === '10-K' || form === '10-Q' || form === '8-K')
            const acc = normAccession(f.accessionNumber || f.accession || f.id)
            const sig = acc ? signalScores[acc] : undefined
            return (
              <tr key={i}>
                <td>
                  <span className="badge badge-blue">{form}</span>
                  {isNewest && (
                    <button onClick={() => openDiff(form)}
                      title={`Compare this ${form} against the previous one`}
                      style={{ marginLeft: 6, padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 800, background: 'var(--pos-dim)', color: 'var(--pos)', border: 'none', cursor: 'pointer' }}>
                      NEW vs PRIOR ↗
                    </button>
                  )}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{f.filedAt || f.date || '—'}</td>
                <td style={{ color: 'var(--text-primary)', fontSize: 13 }}>{f.description || f.title || '—'}</td>
                <td>
                  <SignalCell
                    state={sig}
                    connected={signalConn !== null}
                    detecting={signalConn === undefined}
                  />
                </td>
                {(() => {
                  // /api/filings returns documentUrl (preferred, points at the
                  // SEC HTML viewer) and filingUrl (the index page). Older
                  // mocks used linkToHtml/url — keep those as a fallback so
                  // any cached/upstream payloads still render a link.
                  const link = f.documentUrl || f.filingUrl || f.linkToHtml || f.url
                  return (
                    <td>{link
                      ? <a href={link} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View →</a>
                      : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  )
                })()}
              </tr>
            )
          }) : <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No filings found</td></tr>}
        </tbody>
      </table>
      {diffOpen && (
        <div onClick={() => setDiffOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,11,14,0.4)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 520, maxWidth: '92vw', height: '100%', background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', overflowY: 'auto', boxShadow: '-12px 0 40px rgba(10,11,14,0.10)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Filing diff — Risk Factors</div>
                {diff?.latest && diff?.prior && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {diff.latest.date} <span style={{ opacity: 0.6 }}>vs</span> {diff.prior.date}
                  </div>
                )}
              </div>
              <button onClick={() => setDiffOpen(false)} aria-label="Close"
                style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 16 }}>
              {diffLoading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading filings & computing diff…</div>}
              {!diffLoading && diff?.error && <div style={{ color: 'var(--neg)', fontSize: 13 }}>Error: {diff.error}</div>}
              {!diffLoading && diff && diff.ready === false && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{diff.note || 'Diff not available.'}</div>
              )}
              {!diffLoading && diff?.ready && (
                <>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span className="badge badge-green">+{diff.stats?.added ?? 0} added</span>
                    <span className="badge badge-red">−{diff.stats?.removed ?? 0} removed</span>
                    <a href={diff.latest?.link} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }}>Open latest →</a>
                  </div>
                  {diff.added?.length ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--pos)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Added clauses ({diff.added.length})</div>
                      {diff.added.map((s: string, i: number) => (
                        <div key={i} style={{ borderLeft: '3px solid var(--pos)', background: 'var(--pos-dim)', padding: '8px 10px', borderRadius: 4, fontSize: 12, lineHeight: 1.55, marginBottom: 6, color: 'var(--text-primary)' }}>{s}</div>
                      ))}
                    </>
                  ) : null}
                  {diff.removed?.length ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--neg)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 14, marginBottom: 6 }}>Removed clauses ({diff.removed.length})</div>
                      {diff.removed.map((s: string, i: number) => (
                        <div key={i} style={{ borderLeft: '3px solid var(--neg)', background: 'var(--neg-dim)', padding: '8px 10px', borderRadius: 4, fontSize: 12, lineHeight: 1.55, marginBottom: 6, color: 'var(--text-primary)', textDecoration: 'line-through', textDecorationColor: 'rgba(0,0,0,0.25)' }}>{s}</div>
                      ))}
                    </>
                  ) : null}
                  {!diff.added?.length && !diff.removed?.length && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No material changes detected in the Risk Factors section.</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Transcripts Sub-tab (Synced player + Slides + Q&A) ──────────────────────
function TranscriptsTab({ symbol, onCite }: { symbol: string; onCite?: (label: string, body: string) => void }) {
  const [transcripts, setTranscripts] = useState<any[]>([])
  const [selected, setSelected]       = useState<any>(null)
  const [loading, setLoading]         = useState(true)
  const [view, setView]               = useState<'transcript' | 'slides' | 'qa'>('transcript')
  const { isPro } = useTier()

  useEffect(() => {
    fetch(`/api/transcripts?symbol=${symbol}&limit=8`)
      .then(r => r.json()).then(d => {
        const list = d.transcripts || d.results || []
        setTranscripts(list)
        if (list.length) setSelected(list[0])
      }).catch(() => {}).finally(() => setLoading(false))
  }, [symbol])

  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}><span className="skeleton" style={{ width: 120, height: 14 }} /></div>
        {Array(4).fill(0).map((_, i) => (
          <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--row-stripe)' }}>
            <span className="skeleton" style={{ width: '85%', height: 13, marginBottom: 6 }} />
            <span className="skeleton" style={{ width: 60, height: 10 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 18 }}>
        <span className="skeleton" style={{ width: 220, height: 18, marginBottom: 14 }} />
        {Array(6).fill(0).map((_, i) => (
          <div key={i} style={{ marginBottom: 18 }}>
            <span className="skeleton" style={{ width: 140, height: 12, marginBottom: 8 }} />
            <span className="skeleton" style={{ width: '100%', height: 12, marginBottom: 4 }} />
            <span className="skeleton" style={{ width: '92%', height: 12 }} />
          </div>
        ))}
      </div>
    </div>
  )

  if (!transcripts.length) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
        No transcripts available for {symbol} yet
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto' }}>
        Earnings call transcripts are sourced live from FMP. They appear here as soon as the company files them.
      </div>
    </div>
  )

  const displayList = transcripts
  const sel = selected || displayList[0]
  const call = {
    title: sel.title || `${symbol} Q${sel.quarter ?? ''} ${sel.year ?? ''} Earnings Call`.replace(/\s+/g, ' ').trim() || `${symbol} Earnings Call`,
    date: sel.date || '',
    isLive: !!sel.isLive,
    year: sel.year,
    quarter: sel.quarter,
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Earnings Calls</div>
        {displayList.map((t: any, i: number) => (
          <div key={i} onClick={() => setSelected(t)}
            style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
              background: sel === t ? 'var(--accent-dim)' : 'var(--bg-card)', borderLeft: sel === t ? '3px solid var(--accent)' : '3px solid transparent' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.title || (t.date ? `Earnings call · ${String(t.date).slice(0, 10)}` : 'Earnings call')}
              {t.isLive && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 8, background: 'var(--neg-dim)', color: 'var(--neg)' }}>LIVE</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.date || '—'}</div>
          </div>
        ))}
      </div>
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['transcript', 'slides', 'qa'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid', borderColor: view === v ? 'var(--accent)' : 'var(--border)', background: view === v ? 'var(--accent)' : 'var(--bg-card)', color: view === v ? '#fff' : 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
              {v === 'qa' ? 'Q&A' : v}
            </button>
          ))}
        </div>
        {view === 'transcript' && (
          call.isLive && !isPro
            ? <ProGate label="Live audio + synced transcript" />
            : <SyncedTranscript symbol={symbol} call={call} onCite={onCite} />
        )}
        {view === 'slides' && <SlidesViewer symbol={symbol} call={call} />}
        {view === 'qa' && (isPro ? <CompanyQuestions symbol={symbol} /> : <ProGate label="Clustered analyst Q&A" />)}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const SYM = symbol?.toUpperCase()

  const [quote, setQuote]         = useState<any>(null)
  const [quoteAsOf, setQuoteAsOf] = useState<number | null>(null)
  const [financials, setFinancials] = useState<any>(null)
  const [news, setNews]           = useState<any[]>([])
  const [estimates, setEstimates] = useState<any>(null)
  const [insiders, setInsiders]   = useState<any[]>([])
  // Extended financial-tab data (key metrics, ratios, growth, segmentation).
  // We fetch from FMP via /api/financials/statements (key-metrics / ratios /
  // financial-growth) and /api/financials/segments. Empty arrays = provider
  // returned no data — we render "—" placeholders rather than synthesising.
  const [keyMetrics, setKeyMetrics] = useState<any[]>([])
  const [ratios, setRatios]         = useState<any[]>([])
  const [growth, setGrowth]         = useState<any[]>([])
  const [segments, setSegments]     = useState<{ product: any[]; geographic: any[] }>({ product: [], geographic: [] })
  const [industryKpis, setIndustryKpis] = useState<any | null>(null)
  const [tab, _setTab]            = useState<CompanyTab>('overview')
  const setTab = (t: CompanyTab) => {
    _setTab(t)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', t)
      window.history.replaceState({}, '', url.pathname + '?' + url.searchParams.toString())
    }
  }
  const [citation, setCitation]   = useState<CitationState>({ open: false, label: '', body: '' })
  const { isPro }                 = useTier()
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const t = sp.get('tab')
    const allowed = ['overview','financials','transcripts','filings','estimates','valuations','technicals','options','ownership','relationships','news','questions','ai-analysis','notes','data'] as const
    type TabId = typeof allowed[number]
    if (t && (allowed as readonly string[]).includes(t)) _setTab(t as TabId)
  }, [])
  const [finTab, setFinTab]       = useState<'income' | 'balance' | 'cashflow'>('income')
  const [period, setPeriod]       = useState<'annual' | 'quarterly'>('annual')
  const [drillRow, setDrillRow]   = useState<{ label: string; key: string; rows: any[]; cells: any[] } | null>(null)
  const [periodLoading, setPeriodLoading] = useState(false)
  // Lazy-load quarterly statements when the user toggles to Quarterly.
  useEffect(() => {
    if (period !== 'quarterly') return
    if (!SYM) return
    const have = financials?.[finTab]?.quarterly
    if (Array.isArray(have) && have.length > 0) return
    setPeriodLoading(true)
    const stmtParam = STMT_TO_API[finTab]
    fetch(`${BASE}/api/financials/statements?symbol=${SYM}&statement=${stmtParam}&period=quarter&limit=12`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(d => {
        setFinancials((prev: any) => ({
          ...(prev || {}),
          [finTab]: { ...(prev?.[finTab] || {}), quarterly: d?.rows || [] },
        }))
      })
      .catch(() => {})
      .finally(() => setPeriodLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, finTab, SYM])
  const [range, setRange]         = useState('1Y')
  const [loading, setLoading]     = useState(true)
  const [chartData, setChartData] = useState<any[]>([])

  // Real historical price loader. Hits /api/aggs which proxies FMP / EODHD /
  // Yahoo / Alpha Vantage / etc. and returns { bars: [{t,o,h,l,c,v}] }. We
  // never synthesise a price walk — if the provider stack returns nothing
  // we leave chartData empty and the chart renders its empty state.
  async function loadChartReal(rangeKey: string): Promise<any[]> {
    const days: Record<string, number> = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '5Y': 365 * 5 }
    const span = days[rangeKey] || 365
    const to   = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - span * 86400000).toISOString().slice(0, 10)
    // Cap the chart-data fetch at 15 s so a slow /api/aggs compile (dev mode)
    // or provider timeout never blocks setLoading(false) — all other page
    // content including the ContextualAskBar and ExportToDeckButton becomes
    // visible on the loading-false re-render even if the chart is still loading.
    const ctl   = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 15_000)
    try {
      const r = await fetch(`${BASE}/api/aggs?symbol=${SYM}&from=${from}&to=${to}&timespan=day`, { signal: ctl.signal })
      if (!r.ok) return []
      const j = await r.json()
      const bars: any[] = Array.isArray(j?.bars) ? j.bars : []
      return bars
        .map(b => {
          const ts = typeof b.t === 'number' ? new Date(b.t) : new Date(b.date || b.t)
          return {
            date:   ts.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
            price:  Number(b.c ?? b.close),
            volume: Number(b.v ?? b.volume ?? 0),
          }
        })
        .filter(d => isFinite(d.price))
    } catch {
      return []
    } finally {
      clearTimeout(timer)
    }
  }

  useEffect(() => {
    setLoading(true)
    // No symbol-specific demo seeds — the page renders the loading skeleton
    // until the live /api/quote response arrives, and falls through to the
    // "Symbol not found" empty state if no live data is available. We never
    // show fabricated quote/financial values.
    const safe = (p: Promise<Response>): Promise<any> => p.then(r => r.ok ? r.json() : {}).catch(() => ({}))
    Promise.all([
      safe(fetch(`${BASE}/api/quote?symbol=${SYM}`)),
      safe(fetch(`${BASE}/api/financials?symbol=${SYM}&type=income`)),
      safe(fetch(`${BASE}/api/news?symbol=${SYM}&limit=8`)),
      safe(fetch(`${BASE}/api/estimates?symbol=${SYM}`)),
      safe(fetch(`${BASE}/api/insider?symbol=${SYM}&limit=8`)),
      safe(fetch(`${BASE}/api/financials/statements?symbol=${SYM}&statement=income-statement&period=annual&limit=8`)),
      safe(fetch(`${BASE}/api/financials/statements?symbol=${SYM}&statement=balance-sheet-statement&period=annual&limit=8`)),
      safe(fetch(`${BASE}/api/financials/statements?symbol=${SYM}&statement=cash-flow-statement&period=annual&limit=8`)),
      safe(fetch(`${BASE}/api/financials/statements?symbol=${SYM}&statement=key-metrics&period=annual&limit=8`)),
      safe(fetch(`${BASE}/api/financials/statements?symbol=${SYM}&statement=ratios&period=annual&limit=8`)),
      safe(fetch(`${BASE}/api/financials/statements?symbol=${SYM}&statement=financial-growth&period=annual&limit=8`)),
      safe(fetch(`${BASE}/api/financials/segments?symbol=${SYM}&period=annual&limit=8`)),
      safe(fetch(`${BASE}/api/financials/industry-kpis?symbol=${SYM}`)),
    ]).then(async ([q, f, n, est, ins, incStmt, bs, cf, km, rt, gr, seg, ik]) => {
      if (q?.price) {
        setQuote(q)
        setQuoteAsOf(q.asOf ? new Date(q.asOf).getTime() : Date.now())
        setChartData(await loadChartReal(range))
      } else {
        setQuote(null)
        setQuoteAsOf(null)
        setChartData([])
      }
      const incomeArr   = incStmt?.rows || []
      const balanceArr  = bs?.rows      || []
      const cashflowArr = cf?.rows      || []
      setFinancials({
        ...f,
        snapshot: f?.snapshot,
        income:   { annual: incomeArr.length ? incomeArr : (f?.income?.annual || []), quarterly: [] },
        balance:  { annual: balanceArr, quarterly: [] },
        cashflow: { annual: cashflowArr, quarterly: [] },
      })
      setNews(n.articles || [])
      setEstimates(est)
      setInsiders(ins.insiders || ins.transactions || [])
      setKeyMetrics(Array.isArray(km?.rows) ? km.rows : [])
      setRatios(Array.isArray(rt?.rows) ? rt.rows : [])
      setGrowth(Array.isArray(gr?.rows) ? gr.rows : [])
      setSegments({
        product:    Array.isArray(seg?.product)    ? seg.product    : [],
        geographic: Array.isArray(seg?.geographic) ? seg.geographic : [],
      })
      setIndustryKpis(ik && !ik.error ? ik : null)
      setLoading(false)
    })
  }, [SYM])

  useEffect(() => {
    if (!quote?.price) return
    let cancelled = false
    loadChartReal(range).then(d => { if (!cancelled) setChartData(d) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  // Live quote refresh — poll the quote endpoint on a bounded interval so the
  // header price/change/source stay current without a manual reload. Pauses
  // while the tab is hidden to avoid needless upstream provider calls.
  useEffect(() => {
    if (!quote?.price) return
    let stopped = false
    const POLL_MS = 30000
    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const r = await fetch(`${BASE}/api/quote?symbol=${SYM}`)
        if (!r.ok) return
        const q = await r.json()
        if (!stopped && q?.price) {
          setQuote((prev: any) => ({ ...prev, ...q }))
          setQuoteAsOf(q.asOf ? new Date(q.asOf).getTime() : Date.now())
        }
      } catch { /* keep last good quote on a transient failure */ }
    }
    const id = setInterval(tick, POLL_MS)
    return () => { stopped = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SYM, !!quote?.price])

  if (loading) return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 12 }} />
        <div><div className="skeleton" style={{ width: 200, height: 24, marginBottom: 8 }} /><div className="skeleton" style={{ width: 120, height: 14 }} /></div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}><div className="skeleton" style={{ width: 120, height: 36, marginBottom: 8 }} /><div className="skeleton" style={{ width: 80, height: 18 }} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
        {Array(12).fill(0).map((_, i) => <div key={i} className="card" style={{ padding: '12px 14px' }}><div className="skeleton" style={{ width: '100%', height: 36 }} /></div>)}
      </div>
      <div className="card" style={{ height: 280 }}><div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 12 }} /></div>
    </div>
  )

  if (!quote?.price) return (
    <div style={{ padding: '3rem', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>◎</div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Symbol not found: {SYM}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Try searching for the correct ticker symbol.</p>
      <Link href="/app/screener" className="btn btn-primary">Browse Screener</Link>
    </div>
  )

  const pricePos   = (quote?.changePct || 0) >= 0
  const chartColor = pricePos ? 'var(--pos)' : 'var(--neg)'

  const KEY_METRICS = [
    { l: 'Market Cap',    v: fmtLarge(quote?.marketCap) },
    { l: 'P/E Ratio',     v: quote?.pe > 0 ? `${fmt(quote.pe, 1)}x` : '—' },
    { l: 'Revenue (TTM)', v: fmtLarge(quote?.revenue) },
    { l: 'EPS (TTM)',     v: quote?.eps ? `$${fmt(quote.eps)}` : '—' },
    { l: '52W High',      v: quote?.high52w ? `$${fmt(quote.high52w)}` : '—' },
    { l: '52W Low',       v: quote?.low52w  ? `$${fmt(quote.low52w)}`  : '—' },
    { l: 'Volume',        v: quote?.volume  ? (quote.volume / 1e6).toFixed(1) + 'M' : '—' },
    { l: 'Avg Volume',    v: quote?.avgVolume ? (quote.avgVolume / 1e6).toFixed(1) + 'M' : '—' },
    { l: 'Beta',          v: quote?.beta ? fmt(quote.beta) : '—' },
    { l: 'Div Yield',     v: quote?.dividendYield ? fmt(quote.dividendYield, 2) + '%' : '—' },
    { l: 'Float',         v: quote?.sharesFloat ? fmtLarge(quote.sharesFloat) : '—' },
    { l: 'Short %',       v: quote?.shortRatio ? fmt(quote.shortRatio, 1) + '%' : '—' },
  ]

  return (
    <div style={{ padding: '1.75rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        <Link href="/app" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Overview</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <Link href="/app/screener" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Screener</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{SYM}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20, flexShrink: 0 }}>
          {SYM[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>{quote?.name || SYM}</h1>
            <span className="badge badge-gray">{SYM}</span>
            {quote?.exchange && <span className="badge badge-gray">{quote.exchange}</span>}
            {quote?.sector   && <span className="badge badge-blue">{quote.sector}</span>}
            <LiveEventBadge symbol={SYM} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{quote?.industry || ''}</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '2.25rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>${fmt(quote?.price)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: chartColor }}>{pricePos ? '+' : ''}{fmt(quote?.change)}</span>
            <span className={`badge ${pricePos ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 13 }}>{fmtPct(quote?.changePct)}</span>
          </div>
          <div style={{ marginTop: 4 }}><QuoteFreshness asOf={quoteAsOf} source={quote?.source} align="right" /></div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <StartDealWorkspaceButton symbol={SYM} companyName={quote?.name || SYM} />
            <ExportToDeckButton symbol={SYM} />
          </div>
        </div>
      </div>

      <ContextualAskBar
        context={`Company · ${SYM}`}
        contextData={{ page: 'company', symbol: SYM, name: quote?.name, sector: quote?.sector, price: quote?.price }}
        chips={[
          { label: 'Bull / bear case',     prompt: `Lay out the strongest bull and bear cases for ${SYM} with the 3 most important data points behind each side.` },
          { label: 'Latest call summary',  prompt: `Summarise ${SYM}'s most recent earnings call — guidance, tone, key analyst pushback, and what management did not address.` },
          { label: 'Peer compare',         prompt: `Compare ${SYM} to its closest 3 peers on growth, margins, capital intensity, and valuation.` },
          { label: 'What changed today',   prompt: `What changed for ${SYM} today — news, filings, estimates, ownership, or unusual price/volume.` },
        ]}
        placeholder={`Ask Finsyt anything about ${SYM}…`}
        style={{ margin: '0 0 18px' }}
      />

      {/* Key metrics strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
        {KEY_METRICS.map(m => (
          <div key={m.l} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{m.l}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* ── WORKFLOW AGENTS ── */}
      <WorkflowAgentsPanel
        symbol={SYM}
        companyName={quote?.name || SYM}
        onCitation={(label, body) => setCitation({ open: true, label, body })}
      />

      {/* Sticky tab strip — keyboard-accessible */}
      <div style={{ marginBottom: 20 }}>
        <Tabs
          sticky
          value={tab}
          onChange={(v) => setTab(v as CompanyTab)}
          items={[
            { id: 'overview',    label: 'Overview' },
            { id: 'financials',  label: 'Financials' },
            { id: 'transcripts', label: 'Transcripts' },
            { id: 'filings',     label: 'Filings' },
            { id: 'estimates',   label: 'Estimates' },
            { id: 'valuations',  label: 'Valuations', badge: <Badge tone="violet" style={{ fontSize: 9 }}>NEW</Badge> },
            { id: 'technicals',  label: 'Technicals', badge: <Badge tone="violet" style={{ fontSize: 9 }}>NEW</Badge> },
            { id: 'options',     label: 'Options', badge: <Badge tone="amber" style={{ fontSize: 9 }}>NEW</Badge> },
            { id: 'ownership',   label: 'Ownership' },
            { id: 'relationships', label: 'Relationships', badge: <Badge tone="violet" style={{ fontSize: 9 }}>NEW</Badge> },
            { id: 'data',        label: 'Analyst Data', badge: <Badge tone="amber" style={{ fontSize: 9 }}>NEW</Badge> },
            { id: 'news',        label: 'News' },
            { id: 'ai-analysis', label: 'AI Analysis', badge: <Badge tone="violet" style={{ fontSize: 9 }}>LIVE</Badge> },
            { id: 'notes',       label: 'Notes' },
          ]}
        />
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div key="t-overview" className="fade-up">
          {/* AI summary */}
          <CompanyAISummary symbol={SYM} companyName={quote?.name || SYM} />
          {/* Segments & KPIs (fiscal.ai) */}
          <SegmentsSection symbol={SYM} />
          {/* Dividend history (FMP) */}
          <DividendsSection symbol={SYM} />
          {/* Price chart */}
          <div className="card" style={{ marginBottom: 20, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Price Chart</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {RANGES.map(r => (
                  <button key={r} onClick={() => setRange(r)}
                    style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1.5px solid', cursor: 'pointer',
                      background: range === r ? 'var(--text-primary)' : 'var(--bg-card)', color: range === r ? '#fff' : 'var(--text-secondary)', borderColor: range === r ? 'var(--text-primary)' : 'var(--border)', transition: 'all 0.12s' }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={chartColor} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => ['$' + fmt(v), 'Price']} />
                <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} fill="url(#cg)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Earnings Smart Summary — placeholder. The transcript clustering /
              tone-vs-prior-call / sell-side-actions feed are not yet wired to a
              live NLP pipeline, so we show a clear placeholder rather than the
              previous synthetic positives/negatives. */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>Earnings Smart Summary</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 640, lineHeight: 1.55 }}>
                  Positive/negative quotes, sell-side actions, and tone-vs-prior-call signals will appear here once the transcript NLP pipeline is wired. Until then we&apos;d rather show nothing than synthesise quotes.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setTab('transcripts')} className="btn btn-outline btn-sm">View transcript</button>
                <button onClick={() => setTab('estimates')} className="btn btn-outline btn-sm">Sell-side estimates</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
            {/* About */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>About {quote?.name}</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
                {quote?.description || `${quote?.name} (${SYM}) is a publicly traded company listed on ${quote?.exchange || 'a major exchange'}. The company operates in the ${quote?.sector || 'technology'} sector. For full business description, view the latest 10-K filing in the Filings tab.`}
              </p>
              {quote?.website && (
                <a href={quote.website} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                  Visit website ↗
                </a>
              )}
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <Link href={`/app/research?q=Analyze ${SYM} company`} className="btn btn-primary btn-sm">AI Deep Dive →</Link>
                <button onClick={() => setTab('filings')} className="btn btn-outline btn-sm">View Filings</button>
                <button onClick={() => setTab('transcripts')} className="btn btn-outline btn-sm">Transcripts</button>
              </div>
              {/* Census-backed HQ panel */}
              {(quote?.country === 'US' || !quote?.country) && (
                <HQContext address={quote?.address} city={quote?.city} state={quote?.state} zip={quote?.zip} />
              )}
            </div>

            {/* Live news / quick context (kept here so the right column
                still has content above the alt-data row). */}
            <div className="card" style={{ padding: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>At a glance</div>
              <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Sector: {quote?.sector || '—'}</li>
                <li>Industry: {quote?.industry || '—'}</li>
                <li>Exchange: {quote?.exchange || '—'}</li>
                {quote?.country && <li>HQ country: {quote.country}</li>}
              </ul>
            </div>
          </div>

          {/* ── Alt-data tiles (Task #322): merged insider feed +
              Glassdoor people & culture, both backed by the workspace's
              Apify Actors connection. Empty state inside the component
              renders a "Connect Apify Actors" CTA when no connection is
              configured. */}
          <AltDataTiles
            symbol={SYM}
            companyName={quote?.name || SYM}
            insiders={insiders}
            onCite={(label, body, source) => setCitation({ open: true, label, body, source })}
          />

          {/* ── Prediction markets (Task #395): read-only company-relevant
              odds from Polymarket + Kalshi. Renders a neutral empty state
              when no active markets reference the company. */}
          <div style={{ marginTop: 16 }}>
            <PredictionMarketsTile
              symbol={SYM}
              companyName={quote?.name || SYM}
              onCite={(label, body, source) => setCitation({ open: true, label, body, source })}
            />
          </div>

          {/* ── Geopolitical exposure (Task #400): recent conflict / political /
              disaster coverage relevant to the company's HQ region, from the
              public GDELT dataset. Neutral empty state when nothing matches. */}
          <div style={{ marginTop: 16 }}>
            <GeopoliticalExposureTile
              region={quote?.country || undefined}
              regionLabel={quote?.country || undefined}
              onCite={(label, body, source) => setCitation({ open: true, label, body, source })}
            />
          </div>

          {/* ── Short positioning (Task #410): FINRA daily short-sale volume +
              best-effort SEC fails-to-deliver, both keyless. Neutral empty
              state when no off-exchange short volume is published. */}
          <div style={{ marginTop: 16 }}>
            <ShortInterestTile
              symbol={SYM}
              onCite={(label, body, source) => setCitation({ open: true, label, body, source })}
            />
          </div>
        </div>
      )}

      {/* ── FINANCIALS ── */}
      {tab === 'financials' && (
        <div key="t-financials" className="fade-up">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['income', 'balance', 'cashflow'] as const).map(t => (
              <button key={t} onClick={() => setFinTab(t)}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1.5px solid', cursor: 'pointer',
                  background: finTab === t ? 'var(--text-primary)' : 'var(--bg-card)', color: finTab === t ? '#fff' : 'var(--text-secondary)', borderColor: finTab === t ? 'var(--text-primary)' : 'var(--border)', transition: 'all 0.12s' }}>
                {t === 'income' ? 'Income Statement' : t === 'balance' ? 'Balance Sheet' : 'Cash Flow'}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {(['annual', 'quarterly'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1.5px solid', cursor: 'pointer',
                    background: period === p ? 'var(--accent)' : 'var(--bg-card)', color: period === p ? '#fff' : 'var(--text-secondary)', borderColor: period === p ? 'var(--accent)' : 'var(--border)', transition: 'all 0.12s' }}>
                  {p === 'annual' ? 'Annual' : 'Quarterly'}
                </button>
              ))}
              <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
              <Link href={`/app/company/${SYM}/peers`}
                style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-primary)', textDecoration: 'none' }}>
                ⚖ Peer compare
              </Link>
              <button onClick={() => exportFinancialsCsv(SYM, finTab, financials)}
                style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                ⬇ CSV
              </button>
            </div>
          </div>
          {(() => {
            // Build a generic table from real provider rows for whichever statement is active.
            // Period label switches between annual / quarterly; data plumbed through `period`.
            const rowsAll: any[] = (financials?.[finTab]?.[period] || []) as any[]
            const maxCols = period === 'annual' ? 5 : 8
            const rows = [...rowsAll]
              .sort((a, b) => String(b.date || b.calendarYear || b.year || '').localeCompare(String(a.date || a.calendarYear || a.year || '')))
              .slice(0, maxCols)
              .reverse()
            const colLabel = (r: any) => {
              if (period === 'quarterly') {
                const p = r.period || ''
                const yr = r.calendarYear || r.fiscalYear || (r.date ? String(r.date).slice(2, 4) : '')
                return p ? `${p} '${yr}` : (r.date ? String(r.date).slice(0, 7) : '—')
              }
              return r.calendarYear || r.fiscalYear || r.year || (r.date ? String(r.date).slice(0, 4) : '—')
            }
            const yearLabels = rows.map(colLabel)
            const cfg = STATEMENT_COLS[finTab]
            const PCT_KEYS = new Set(['grossMargin', 'netMargin', 'operatingMargin'])

            const fmtCell = (v: any, key: string) => {
              if (v == null || v === '') return '—'
              if (PCT_KEYS.has(key) || /Margin/.test(key)) return (Number(v) * 100).toFixed(1) + '%'
              if (key === 'eps' || key === 'epsBasic') return Number(v).toFixed(2)
              return fmtB(v)
            }
            const yoy = (latest: any, prior: any) => {
              const a = Number(latest), b = Number(prior)
              if (!isFinite(a) || !isFinite(b) || b === 0) return null
              return ((a - b) / Math.abs(b)) * 100
            }
            // Tiny inline sparkline. Renders an SVG polyline scaled to the cell range.
            const Sparkline = ({ values }: { values: number[] }) => {
              const nums = values.map(v => Number(v)).filter(v => isFinite(v))
              if (nums.length < 2) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
              const min = Math.min(...nums), max = Math.max(...nums)
              const span = max - min || 1
              const W = 64, H = 18
              const step = W / (nums.length - 1)
              const pts = nums.map((v, i) => `${(i * step).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`).join(' ')
              const trend = nums[nums.length - 1] >= nums[0]
              return (
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
                  <polyline fill="none" strokeWidth={1.5} stroke={trend ? 'var(--pos)' : 'var(--neg)'} points={pts} />
                </svg>
              )
            }
            return (
              <div className="card" style={{ overflow: 'hidden' }}>
                {periodLoading && period === 'quarterly' && (
                  <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Loading quarterly data…</div>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 200 }}>Metric</th>
                        <th style={{ width: 80 }}>Trend</th>
                        {yearLabels.map((y, i) => <th key={i} className="right">{y}</th>)}
                        <th className="right" style={{ minWidth: 80 }}>{period === 'annual' ? 'YoY %' : 'QoQ %'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr><td colSpan={3 + yearLabels.length} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                          No {finTab === 'income' ? 'income statement' : finTab === 'balance' ? 'balance sheet' : 'cash flow'} {period} data available from the provider.
                        </td></tr>
                      )}
                      {rows.length > 0 && cfg.map(([label, key]) => {
                        const cells = rows.map((r: any) => r[key])
                        const last = cells[cells.length - 1], prev = cells[cells.length - 2]
                        const change = yoy(last, prev)
                        return (
                          <tr key={label} style={{ cursor: 'pointer' }}
                            onClick={() => setDrillRow({ label, key, rows, cells })}
                            title="Click to expand chart">
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</td>
                            <td><Sparkline values={cells} /></td>
                            {cells.map((v: any, i: number) => (
                              <td key={i} className="right" style={{ color: 'var(--text-primary)' }}>{fmtCell(v, key)}</td>
                            ))}
                            <td className="right" style={{ color: change == null ? 'var(--text-muted)' : change >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 700 }}>
                              {change == null ? '—' : (change >= 0 ? '+' : '') + change.toFixed(1) + '%'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* ── Industry KPIs panel — sector-aware top block, populated from
              /api/financials/industry-kpis. The endpoint returns the
              sector-specific KPI taxonomy resolved from /api/profile + the
              metrics we can actually derive. Missing values render "—". */}
          {industryKpis?.kpis?.length > 0 && (
            <div className="card" style={{ padding: 18, marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Industry KPIs · {industryKpis.sector || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{industryKpis.industry || ''}</div>
                </div>
                <span className="badge badge-blue" style={{ fontSize: 10 }}>{industryKpis.kpiSet || 'Generic'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {industryKpis.kpis.map((k: any) => (
                  <div key={k.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{k.display ?? '—'}</div>
                    {k.hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{k.hint}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Key Metrics & Ratios — latest annual snapshot. Pulls FMP
              /stable/key-metrics + /stable/ratios. Only renders tiles that
              actually have a numeric value; the rest stay "—". */}
          {(keyMetrics.length > 0 || ratios.length > 0) && (() => {
            const km: any = keyMetrics[0] || {}
            const rt: any = ratios[0] || {}
            const fmtPctVal = (n: number) => (n * 100).toFixed(2) + '%'
            const fmtX      = (n: number) => n.toFixed(2) + 'x'
            const fmtNumB   = (n: number) => fmtB(n)
            const fmtN2     = (n: number) => n.toFixed(2)
            const tile = (label: string, raw: any, fn: (n: number) => string) => {
              if (raw == null || raw === '' || (typeof raw === 'number' && !isFinite(raw))) return { label, value: '—' }
              const n = Number(raw)
              if (!isFinite(n)) return { label, value: '—' }
              return { label, value: fn(n) }
            }
            const tiles = [
              tile('Enterprise Value', km.enterpriseValue, fmtNumB),
              tile('EV / EBITDA',      km.enterpriseValueOverEBITDA ?? km.evToEbitda, fmtX),
              tile('EV / Sales',       km.evToSales ?? km.enterpriseValueOverRevenue, fmtX),
              tile('ROIC',             km.roic ?? km.returnOnInvestedCapital, fmtPctVal),
              tile('ROE',              rt.returnOnEquity ?? km.roe, fmtPctVal),
              tile('ROA',              rt.returnOnAssets ?? km.roa, fmtPctVal),
              tile('FCF / Share',      km.freeCashFlowPerShare, fmtN2),
              tile('Working Capital',  km.workingCapital, fmtNumB),
              tile('Debt / Equity',    rt.debtEquityRatio ?? km.debtToEquity, fmtX),
              tile('Current Ratio',    rt.currentRatio ?? km.currentRatio, fmtX),
              tile('P / E',            rt.priceEarningsRatio ?? km.peRatio, fmtX),
              tile('P / B',            rt.priceToBookRatio ?? rt.priceBookValueRatio ?? km.priceToBookRatio, fmtX),
              tile('P / S',            rt.priceToSalesRatio ?? km.priceToSalesRatio, fmtX),
              tile('Gross Margin',     rt.grossProfitMargin, fmtPctVal),
              tile('Operating Margin', rt.operatingProfitMargin, fmtPctVal),
              tile('Net Margin',       rt.netProfitMargin, fmtPctVal),
              tile('Asset Turnover',   rt.assetTurnover, fmtX),
              tile('Payout Ratio',     rt.payoutRatio, fmtPctVal),
              tile('Dividend Yield',   rt.dividendYield, fmtPctVal),
            ]
            return (
              <div className="card" style={{ padding: 0, marginTop: 16, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Key Metrics & Ratios</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{km.calendarYear || km.date || rt.calendarYear || rt.date || ''}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                  {tiles.map(t => (
                    <div key={t.label} style={{ padding: '12px 14px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{t.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* ── Growth Rates — last 5 fiscal years from /stable/financial-growth. */}
          {growth.length > 0 && (() => {
            const sorted = [...growth]
              .sort((a, b) => String(b.date || b.calendarYear || '').localeCompare(String(a.date || a.calendarYear || '')))
              .slice(0, 5)
              .reverse()
            const headers = sorted.map((r: any) => r.calendarYear || (r.date ? String(r.date).slice(0, 4) : '—'))
            const ROWS: [string, string][] = [
              ['Revenue Growth',            'revenueGrowth'],
              ['Gross Profit Growth',       'grossProfitGrowth'],
              ['EBIT Growth',               'ebitgrowth'],
              ['Net Income Growth',         'netIncomeGrowth'],
              ['EPS Growth',                'epsgrowth'],
              ['Free Cash Flow Growth',     'freeCashFlowGrowth'],
              ['Operating Cash Flow Growth','operatingCashFlowGrowth'],
              ['Dividends / Share Growth',  'dividendsperShareGrowth'],
            ]
            return (
              <div className="card" style={{ marginTop: 16, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Growth Rates · YoY</div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>Metric</th>{headers.map((h, i) => <th key={i} className="right">{h}</th>)}</tr></thead>
                    <tbody>
                      {ROWS.map(([label, key]) => (
                        <tr key={key}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</td>
                          {sorted.map((r: any, i: number) => {
                            const v = r[key]
                            const n = Number(v)
                            const ok = v != null && v !== '' && isFinite(n)
                            return <td key={i} className="right" style={{ color: !ok ? 'var(--text-muted)' : n >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 600 }}>{!ok ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* ── Revenue Segments — product + geographic breakdown for the most
              recent reported period. We always render both shells so users
              get an explicit "Not reported" card when the provider has no
              segmentation for this ticker. */}
          {(() => {
            const renderSeg = (rows: any[], title: string) => {
              if (rows.length === 0) {
                return (
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
                    <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Not reported</div>
                  </div>
                )
              }
              const latest: any = [...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]
              const segObj: any = latest?.data || latest?.segments || latest || {}
              const entries: [string, number][] = Object.entries(segObj)
                .filter(([k, v]) => typeof v === 'number' && k !== 'date' && k !== 'symbol' && k !== 'period' && k !== 'fiscalYear' && k !== 'calendarYear') as [string, number][]
              const total = entries.reduce((s, [, v]) => s + Number(v), 0) || 1
              const sorted = entries.sort((a, b) => b[1] - a[1])
              if (sorted.length === 0) {
                return (
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
                    <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No breakdown values returned for the latest period.</div>
                  </div>
                )
              }
              return (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{latest?.date || ''}</span>
                  </div>
                  <div style={{ padding: '8px 16px 12px' }}>
                    {sorted.map(([k, v]) => {
                      const pct = (Number(v) / total) * 100
                      return (
                        <div key={k} style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, gap: 8 }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{fmtB(Number(v))} · {pct.toFixed(1)}%</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-elevated)' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: 'var(--accent)', borderRadius: 2 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }
            return (
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {renderSeg(segments.product,    'Revenue by Product / Segment')}
                {renderSeg(segments.geographic, 'Revenue by Geography')}
              </div>
            )
          })()}

          {drillRow && (() => {
            // Expanded chart modal for a single metric — full-width SVG with axis labels.
            const labels = drillRow.rows.map((r: any) => period === 'quarterly'
              ? `${r.period || ''} ${r.calendarYear || r.fiscalYear || ''}`.trim()
              : (r.calendarYear || r.fiscalYear || (r.date ? String(r.date).slice(0,4) : '')))
            const nums = drillRow.cells.map((v: any) => Number(v)).filter(v => isFinite(v))
            const min = nums.length ? Math.min(...nums) : 0
            const max = nums.length ? Math.max(...nums) : 1
            const span = (max - min) || 1
            const W = 720, H = 280, PAD = 36
            const step = nums.length > 1 ? (W - PAD * 2) / (nums.length - 1) : 0
            const pts = nums.map((v, i) => `${(PAD + i * step).toFixed(1)},${(H - PAD - ((v - min) / span) * (H - PAD * 2)).toFixed(1)}`)
            return (
              <div onClick={() => setDrillRow(null)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                <div onClick={e => e.stopPropagation()} className="card" style={{ width: 780, maxWidth: '95vw', padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{drillRow.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{SYM} · {period === 'annual' ? 'Annual' : 'Quarterly'} · {finTab}</div>
                    </div>
                    <button onClick={() => setDrillRow(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
                  </div>
                  {nums.length < 2 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Not enough data points to chart.</div>
                  ) : (
                    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
                      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border)" />
                      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--border)" />
                      <polyline fill="none" stroke="var(--accent)" strokeWidth={2} points={pts.join(' ')} />
                      {nums.map((v, i) => {
                        const [x, y] = pts[i].split(',').map(Number)
                        return <circle key={i} cx={x} cy={y} r={3} fill="var(--accent)" />
                      })}
                      {labels.map((lab, i) => (
                        <text key={i} x={PAD + i * step} y={H - PAD + 16} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{lab}</text>
                      ))}
                      <text x={PAD - 4} y={PAD + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">{fmtB(max)}</text>
                      <text x={PAD - 4} y={H - PAD + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">{fmtB(min)}</text>
                    </svg>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── ESTIMATES ── Visible-Alpha-style multi-section panel; the
          component fetches its own bundle from /api/estimates so it can be
          reused on other surfaces in the future. */}
      {tab === 'estimates' && (
        <div key="t-estimates" className="fade-up">
          <EstimatesTab symbol={SYM} spotPrice={quote?.price ?? null} />
        </div>
      )}

      {/* ── TRANSCRIPTS ── */}
      {tab === 'transcripts' && (
        <div key="t-transcripts" className="fade-up">
          <TranscriptsTab symbol={SYM} onCite={(label, body) => setCitation({ open: true, label, body })} />
        </div>
      )}
      {tab === 'questions' && (
        <div key="t-questions" className="fade-up">
          {isPro ? <CompanyQuestions symbol={SYM} /> : <ProGate label="Clustered analyst Q&A" />}
        </div>
      )}

      {/* ── NEWS ── */}
      {tab === 'news' && (
        <div key="t-news" className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <NewsSentimentTile symbol={SYM} base={process.env.NEXT_PUBLIC_BASE_PATH || ''} />
          {news.length === 0 && (
            <div className="card" style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              No recent news found for {SYM}.
            </div>
          )}
          {news.map((n: any, i: number) => {
            const sLabel: 'positive' | 'neutral' | 'negative' | undefined = n.sentimentLabel
            const sTone = sLabel === 'positive' ? 'green' : sLabel === 'negative' ? 'red' : 'gray'
            return (
            <div key={i} className="card" style={{ padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 4, borderRadius: 2, background: 'var(--accent)', alignSelf: 'stretch', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <a href={n.url || '#'} target="_blank" rel="noreferrer"
                  style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none', lineHeight: 1.5, display: 'block', marginBottom: 6, transition: 'color 0.12s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}>
                  {n.title}
                </a>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{n.source || n.publisher}</span>
                  <span>·</span>
                  <span>{n.publishedAt || n.date}</span>
                  {sLabel && (
                    <>
                      <span>·</span>
                      <Badge tone={sTone}>{sLabel}{typeof n.sentimentScore === 'number' ? ` ${n.sentimentScore >= 0 ? '+' : ''}${n.sentimentScore.toFixed(2)}` : ''}</Badge>
                    </>
                  )}
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* ── FILINGS ── */}
      {tab === 'filings' && (
        <div key="t-filings" className="fade-up">
          <FilingsTab symbol={SYM} />
        </div>
      )}

      {/* ── VALUATIONS — Football Field ── */}
      {tab === 'valuations' && (
        <div key="t-valuations" className="fade-up">
          <ValuationsView symbol={SYM} initialQuote={quote} />
        </div>
      )}

      {/* ── TECHNICALS — Indicator overlays & oscillators ── */}
      {tab === 'technicals' && (
        <div key="t-technicals" className="fade-up">
          <TechnicalsView symbol={SYM} />
        </div>
      )}

      {/* ── OPTIONS & DERIVATIVES ── */}
      {tab === 'options' && (
        <div key="t-options" className="fade-up">
          <OptionsTab symbol={SYM} spotPrice={quote?.price ?? null} />
        </div>
      )}

      {/* ── OWNERSHIP & INSIDER ── */}
      {tab === 'ownership' && (
        <div key="t-ownership" className="fade-up">
          <OwnershipTab symbol={SYM} />
        </div>
      )}

      {/* ── RELATIONSHIPS — interactive entity map ── */}
      {tab === 'relationships' && (
        <div key="t-relationships" className="fade-up">
          <RelationshipsTab symbol={SYM} />
        </div>
      )}

      {/* ── ANALYST DATA — AlphaSense-style six-widget grid ── */}
      {tab === 'data' && (
        <div key="t-data" className="fade-up">
          <CompanyDataTab symbol={SYM} name={quote?.name} />
          <div style={{ marginTop: 16 }}>
            <ConnectorDataPanel symbol={SYM} />
          </div>
        </div>
      )}

      {/* ── AI ANALYSIS ── */}
      {tab === 'ai-analysis' && (
        <div key="t-ai" className="fade-up">
          <AIAnalysisTab
            symbol={SYM}
            companyName={quote?.name || SYM}
            onCitation={(label, body) => setCitation({ open: true, label, body })}
            onJumpTab={(t) => setTab(t as CompanyTab)}
          />
        </div>
      )}

      {/* ── NOTES ── */}
      {tab === 'notes' && (
        <div key="t-notes" className="fade-up">
          <NotesTab symbol={SYM} snapshot={{
            price:       quote?.price,
            change:      quote?.change,
            marketCap:   quote?.marketCap,
            pe:          quote?.pe,
            eps:         quote?.eps,
            evEbitda:    quote?.evEbitda,
            grossMargin: quote?.grossMargin,
            ebitda:      quote?.ebitda,
            fcf:         quote?.freeCashFlow,
            revenue:     financials?.income?.annual?.[0]?.revenue,
          }} />
        </div>
      )}


      {/* spacer so the floating Ask AI bar never overlaps content */}
      <div style={{ height: 96 }} />

      {/* Citation drawer */}
      <Drawer open={citation.open} onClose={() => setCitation({ open: false, label: '', body: '' })} title={citation.label || 'Source'} width={460}>
        {citation.source ? (
          <AltDataCitationView source={citation.source} />
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Source citation · auto-extracted from {SYM} research context.
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {citation.body || 'No additional context available for this citation.'}
            </div>
          </>
        )}
      </Drawer>

      {/* Persistent Ask AI bar */}
      <AskAIBar symbol={SYM} companyName={quote?.name || SYM} />

      <UIKeyframes />
    </div>
  )
}

// ── Persistent bottom Ask AI bar ─────────────────────────────────────────────
function CompanyAISummary({ symbol, companyName }: { symbol: string; companyName: string }) {
  const [text, setText] = useState('')
  const [tools, setTools] = useState<{ name: string; summary: string }[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const fired = useRef<string | null>(null)

  async function run() {
    setText(''); setTools([]); setError(null); setRunning(true); setCollapsed(false)
    try {
      const r = await fetch(`${BASE}/api/agent/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question:
            `Write a concise institutional research note on ${companyName} (${symbol}). ` +
            `Cover: 1) what they do, 2) latest reported quarter results vs estimates with the actual numbers, ` +
            `3) the 2-3 things bulls focus on, 4) the 2-3 things bears focus on, 5) what to watch next. ` +
            `Use real fetched data via your tools — quote, financials, news, estimates, transcripts. ` +
            `Cite each fact inline like [src: tool_name]. Keep under 250 words.`,
          symbols: [symbol],
        }),
      })
      if (!r.ok || !r.body) { setError(`Agent error ${r.status}`); setRunning(false); return }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const blocks = buf.split('\n\n'); buf = blocks.pop() || ''
        for (const block of blocks) {
          let evtName = 'message'; let dataLine = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) evtName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim()
          }
          if (!dataLine) continue
          let p: any = {}
          try { p = JSON.parse(dataLine) } catch {}
          if (evtName === 'tool_result') setTools(t => [...t, { name: p.name, summary: p.summary }])
          else if (evtName === 'answer_chunk') setText(s => s + (p.text || ''))
          else if (evtName === 'error') setError(p.message || 'agent error')
        }
      }
    } catch (e: any) { setError(e?.message || String(e)) }
    finally { setRunning(false) }
  }

  useEffect(() => {
    if (!symbol || fired.current === symbol) return
    fired.current = symbol
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  return (
    <div className="card" style={{ marginBottom: 20, padding: 18, borderColor: 'var(--accent-dim)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>◎</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>AI Research Note</span>
        <Badge tone="violet" style={{ fontSize: 9 }}>LIVE</Badge>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {running ? 'Generating with live data…' : (text ? `${tools.length} sources` : '')}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={run} disabled={running} style={{
            padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: '1px solid var(--border)', background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', cursor: running ? 'not-allowed' : 'pointer',
            opacity: running ? 0.6 : 1, fontFamily: 'inherit',
          }}>{running ? 'Working…' : 'Regenerate'}</button>
          {text && (
            <button onClick={() => setCollapsed(c => !c)} style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--bg-elevated)',
              color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit',
            }}>{collapsed ? 'Show' : 'Hide'}</button>
          )}
        </div>
      </div>
      {!collapsed && (
        <>
          {tools.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {tools.map((t, i) => (
                <span key={i} style={{
                  fontSize: 10.5, padding: '3px 8px', borderRadius: 99,
                  background: 'var(--accent-dim)', color: 'var(--accent-text)',
                  fontWeight: 600, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
                }}>{t.name}: {t.summary}</span>
              ))}
            </div>
          )}
          {text ? (
            <div style={{
              fontSize: 13, lineHeight: 1.65, color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
            }}>{text}{running && <span style={{ opacity: 0.5 }}>▍</span>}</div>
          ) : running ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton style={{ height: 12, width: '92%' }} />
              <Skeleton style={{ height: 12, width: '85%' }} />
              <Skeleton style={{ height: 12, width: '78%' }} />
            </div>
          ) : null}
          {error && (
            <div style={{
              marginTop: 8, padding: '8px 10px', borderRadius: 6,
              border: '1px solid var(--error)', background: 'rgba(239,68,68,0.08)',
              fontSize: 12, color: 'var(--error)',
            }}>{error}</div>
          )}
        </>
      )}
    </div>
  )
}

function AskAIBar({ symbol, companyName }: { symbol: string; companyName: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const inEditable = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )
      if (e.key === '/' && !inEditable && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    const query = encodeURIComponent(`${q.trim()} (context: ${symbol} ${companyName})`)
    router.push(`${BASE_PATH}/app/research?q=${query}&symbol=${symbol}`)
  }

  return (
    <form
      onSubmit={submit}
      style={{
        position: 'fixed',
        left: 'var(--sidebar-width, 240px)',
        right: 0,
        bottom: 0,
        padding: 14,
        background: 'linear-gradient(180deg, transparent 0%, rgba(2,6,18,0.85) 40%, rgba(2,6,18,0.95) 100%)',
        backdropFilter: 'blur(8px)',
        zIndex: 40,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 880, margin: '0 auto',
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '8px 10px 8px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
          pointerEvents: 'auto',
        }}
      >
        <span aria-hidden style={{ color: 'var(--accent-text)', fontSize: 16, fontWeight: 800 }}>✦</span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Ask Finsyt AI about ${symbol} — earnings, guidance, competitors…  (press /)`}
          aria-label={`Ask AI about ${symbol}`}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 13,
            padding: '8px 0',
          }}
        />
        <Button type="submit" variant="primary" size="sm" disabled={!q.trim()}>Ask →</Button>
      </div>
    </form>
  )
}

// ── Export to Deck button ────────────────────────────────────────────────────
// Calls /api/copilot/deck (banker-pitch template) and downloads the resulting
// PPTX. Inline component so the company page stays self-contained.
//
// Two side-affordances live alongside the primary "Export to pitch deck"
// action:
//   1. An "Overrides" dropdown panel exposing deal-team-workspace overrides —
//      pinning the deck to a saved peer set and overriding the WACC /
//      terminal growth assumptions used by the football field's DCF band —
//      without leaving the company workspace.
//   2. A "Recent decks" drawer listing the user's last N deck generations
//      (across all templates / tickers). Re-downloading from the drawer hits
//      the existing /api/copilot/memo/<fileId> route and avoids regenerating
//      — saves an upstream data fetch and a rate-limit slot.
interface RecentDeckRow {
  fileId:      string
  filename:    string
  ticker:      string
  template:    'banker-pitch' | 'matrix-snapshot' | 'investment-memo' | null
  slides:      number | null
  createdAt:   number
  expiresAt:   number
  bytes:       number
  expired:     boolean
  downloadUrl: string
}

interface PeerSetSummary {
  id:       string
  name:     string
  symbols:  string[]
}

const TEMPLATE_LABEL: Record<string, string> = {
  'banker-pitch':     'Banker pitch',
  'matrix-snapshot':  'Matrix snapshot',
  'investment-memo':  'Investment memo',
}

function fmtBytes(n: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
function fmtRelative(ts: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
function fmtExpiry(expiresAt: number, expired: boolean): string {
  if (!expiresAt) return ''
  if (expired) return 'expired'
  const remaining = expiresAt - Date.now()
  if (remaining < 60_000) return 'expires in <1m'
  if (remaining < 3_600_000) return `expires in ${Math.floor(remaining / 60_000)}m`
  if (remaining < 86_400_000) return `expires in ${Math.floor(remaining / 3_600_000)}h`
  return `expires in ${Math.floor(remaining / 86_400_000)}d`
}

function ExportToDeckButton({ symbol }: { symbol: string }) {
  const [busy, setBusy]     = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  // ── Recent-decks drawer state ──
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [decks, setDecks] = useState<RecentDeckRow[] | null>(null)
  const [decksLoading, setDecksLoading] = useState(false)
  const [decksError, setDecksError] = useState<string | null>(null)

  // ── Overrides panel state — strings so empty input means "use default". ──
  const [open, setOpen]                     = useState(false)
  const [peerSetId, setPeerSetId]           = useState<string>('')
  const [waccPct, setWaccPct]               = useState<string>('')
  const [terminalPct, setTerminalPct]       = useState<string>('')
  const [growth1Pct, setGrowth1Pct]         = useState<string>('')
  const [growth2Pct, setGrowth2Pct]         = useState<string>('')
  const [peerSets, setPeerSets]             = useState<PeerSetSummary[]>([])
  const [peerSetsLoaded, setPeerSetsLoaded] = useState(false)

  // ── Saved-per-workspace deck overrides ──
  // The active deal team's pinned configuration: pre-fills the inputs on
  // mount and re-fetched after Save / Reset so the "Pinned by …" caption
  // reflects the latest state. `null` ⇒ no row yet, `undefined` ⇒ not yet
  // loaded.
  const [savedOverrides, setSavedOverrides] = useState<{
    peerSetId: string | null
    wacc: number | null
    terminalGrowth: number | null
    growthStage1: number | null
    growthStage2: number | null
    updatedByUserId: string
    updatedAt: string
  } | null | undefined>(undefined)
  const [savingOverrides, setSavingOverrides] = useState(false)
  const [overridesMsg, setOverridesMsg]       = useState<string | null>(null)
  // Hover state for the "Workspace defaults pinned" badge popover.
  const [pinnedHover, setPinnedHover]         = useState(false)

  function applySavedToInputs(s: typeof savedOverrides) {
    if (!s) {
      setPeerSetId('')
      setWaccPct('')
      setTerminalPct('')
      setGrowth1Pct('')
      setGrowth2Pct('')
      return
    }
    setPeerSetId(s.peerSetId ?? '')
    setWaccPct(s.wacc != null ? (s.wacc * 100).toString() : '')
    setTerminalPct(s.terminalGrowth != null ? (s.terminalGrowth * 100).toString() : '')
    setGrowth1Pct(s.growthStage1 != null ? (s.growthStage1 * 100).toString() : '')
    setGrowth2Pct(s.growthStage2 != null ? (s.growthStage2 * 100).toString() : '')
  }

  // Load the workspace's saved deck overrides on mount so every "Export"
  // call from this company page picks them up — even if the analyst never
  // opens the Overrides panel.
  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}/api/workspaces/deck-overrides`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled) return
        const o = (j && typeof j === 'object' ? j.overrides : null) ?? null
        setSavedOverrides(o)
        applySavedToInputs(o)
      })
      .catch(() => { if (!cancelled) setSavedOverrides(null) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadDecks() {
    setDecksLoading(true); setDecksError(null)
    try {
      const r = await fetch(`${BASE}/api/copilot/decks`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setDecksError(j?.error || `Failed (${r.status})`)
        setDecks([])
      } else {
        setDecks(Array.isArray(j.items) ? j.items : [])
      }
    } catch (e) {
      setDecksError((e as Error).message || 'Failed to load')
      setDecks([])
    } finally {
      setDecksLoading(false)
    }
  }

  function openDrawer() {
    setDrawerOpen(true)
    loadDecks()
  }

  // Lazy-load saved peer sets either the first time the override panel
  // opens, or as soon as we know the workspace has a pinned peer set —
  // the "Workspace defaults pinned" badge needs the human-readable name
  // to render its hover summary without forcing the analyst to open the
  // panel first.
  useEffect(() => {
    if (peerSetsLoaded) return
    if (!open && !savedOverrides?.peerSetId) return
    let cancelled = false
    fetch(`${BASE}/api/peers/sets`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled) return
        const sets = Array.isArray(j?.sets) ? (j.sets as PeerSetSummary[]) : []
        setPeerSets(sets)
        setPeerSetsLoaded(true)
      })
      .catch(() => { if (!cancelled) setPeerSetsLoaded(true) })
    return () => { cancelled = true }
  }, [open, peerSetsLoaded, savedOverrides])

  async function onExport() {
    setBusy(true); setStatus('Building pitch deck…')
    try {
      const body: Record<string, unknown> = { template: 'banker-pitch', ticker: symbol }
      if (peerSetId) body.peerSetId = peerSetId
      const w  = parseFloat(waccPct);     if (Number.isFinite(w)  && w  > 0) body.wacc           = w  / 100
      const g  = parseFloat(terminalPct); if (Number.isFinite(g)  && g  >= 0) body.terminalGrowth = g  / 100
      const g1 = parseFloat(growth1Pct);  if (Number.isFinite(g1))           body.growthStage1   = g1 / 100
      const g2 = parseFloat(growth2Pct);  if (Number.isFinite(g2))           body.growthStage2   = g2 / 100

      const r = await fetch(`${BASE}/api/copilot/deck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setStatus(j?.error || `Failed (${r.status})`)
        return
      }
      const url = j.downloadUrl as string
      const a = document.createElement('a')
      a.href = url
      a.download = j.filename || `${symbol} Banker Pitch.pptx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setStatus(`Ready · ${(j.bytes / 1024).toFixed(0)} KB · ${j.slideTitles?.length || 0} slides`)
      // If the drawer is open (or opens later), the new deck should show up.
      if (drawerOpen) loadDecks()
      else setDecks(null) // invalidate so next open re-fetches
    } catch (e) {
      setStatus((e as Error).message || 'Export failed')
    } finally {
      setBusy(false)
      setTimeout(() => setStatus(null), 6000)
    }
  }

  function downloadRow(row: RecentDeckRow) {
    if (row.expired) return
    const a = document.createElement('a')
    a.href = row.downloadUrl
    a.download = row.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const hasOverrides = !!(peerSetId || waccPct || terminalPct || growth1Pct || growth2Pct)
  const hasSavedRow  = !!savedOverrides

  // Snapshot the current input values into the saved-overrides row. Empty
  // inputs are persisted as `null` so the row does not silently retain a
  // stale value the analyst just cleared.
  async function onSaveOverrides() {
    setSavingOverrides(true); setOverridesMsg(null)
    try {
      const w  = parseFloat(waccPct)
      const g  = parseFloat(terminalPct)
      const g1 = parseFloat(growth1Pct)
      const g2 = parseFloat(growth2Pct)
      const body = {
        peerSetId:      peerSetId || null,
        wacc:           Number.isFinite(w)  && w  > 0  ? w  / 100 : null,
        terminalGrowth: Number.isFinite(g)  && g  >= 0 ? g  / 100 : null,
        growthStage1:   Number.isFinite(g1)            ? g1 / 100 : null,
        growthStage2:   Number.isFinite(g2)            ? g2 / 100 : null,
      }
      const r = await fetch(`${BASE}/api/workspaces/deck-overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setOverridesMsg(j?.error || `Save failed (${r.status})`)
      } else {
        setSavedOverrides(j.overrides ?? null)
        setOverridesMsg('Saved · pinned to this workspace')
      }
    } catch (e) {
      setOverridesMsg((e as Error).message || 'Save failed')
    } finally {
      setSavingOverrides(false)
      setTimeout(() => setOverridesMsg(null), 4000)
    }
  }

  async function onResetOverrides() {
    setSavingOverrides(true); setOverridesMsg(null)
    try {
      const r = await fetch(`${BASE}/api/workspaces/deck-overrides`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setOverridesMsg(j?.error || `Reset failed (${r.status})`)
      } else {
        setSavedOverrides(null)
        applySavedToInputs(null)
        setOverridesMsg('Reset to defaults')
      }
    } catch (e) {
      setOverridesMsg((e as Error).message || 'Reset failed')
    } finally {
      setSavingOverrides(false)
      setTimeout(() => setOverridesMsg(null), 4000)
    }
  }

  // Format helpers for the pinned-defaults badge tooltip — mirrors the
  // input semantics where stored values are decimals (0.09 → 9.0%).
  const fmtPctVal = (v: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '—'
  const pinnedPeerSetLabel = savedOverrides?.peerSetId
    ? (peerSets.find(p => p.id === savedOverrides.peerSetId)?.name
        ?? (peerSetsLoaded ? 'Saved peer set' : 'Loading…'))
    : 'Default peers (curated)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {savedOverrides && (
          <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setPinnedHover(true)}
            onMouseLeave={() => setPinnedHover(false)}
          >
            <button
              type="button"
              onClick={() => { setOpen(true); setPinnedHover(false) }}
              aria-label="Workspace defaults pinned — click to view or edit"
              title="Workspace defaults are applied to every export. Click to view or edit."
              style={{
                fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 999,
                border: '1px solid var(--accent)', color: 'var(--accent-text)',
                background: 'var(--accent-dim)', cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              <span aria-hidden style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
              }} />
              Workspace defaults pinned
            </button>
            {pinnedHover && (
              <div
                role="tooltip"
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30,
                  width: 260, padding: 12, borderRadius: 8, textAlign: 'left',
                  border: '1px solid var(--border)', background: 'var(--bg-elev)',
                  boxShadow: '0 12px 32px rgba(10,11,14,0.18)',
                  fontSize: 11, color: 'var(--text-primary)',
                }}
              >
                <div style={{
                  fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'var(--text-muted)', marginBottom: 8,
                }}>
                  Pinned by this workspace
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr',
                  columnGap: 12, rowGap: 5,
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>Peer set</span>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{pinnedPeerSetLabel}</span>
                  <span style={{ color: 'var(--text-muted)' }}>WACC</span>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmtPctVal(savedOverrides.wacc)}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Terminal g</span>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmtPctVal(savedOverrides.terminalGrowth)}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Stage 1 g</span>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmtPctVal(savedOverrides.growthStage1)}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Stage 2 g</span>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmtPctVal(savedOverrides.growthStage2)}</span>
                </div>
                <div style={{
                  marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border)',
                  fontSize: 10, color: 'var(--text-muted)',
                }}>
                  Last edited {new Date(savedOverrides.updatedAt).toLocaleDateString()} · click to edit
                </div>
              </div>
            )}
          </div>
        )}
        <button
          onClick={onExport}
          disabled={busy}
          title="Build a banker pitch deck for this company (PPTX)"
          style={{
            fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8,
            border: '1px solid var(--accent)', color: 'var(--accent-text)',
            background: 'var(--accent-dim)', cursor: busy ? 'wait' : 'pointer',
            fontFamily: 'inherit', opacity: busy ? 0.65 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <span>↓</span>
          {busy ? 'Generating…' : 'Export to pitch deck'}
        </button>
        <button
          onClick={() => setOpen(o => !o)}
          disabled={busy}
          title="Pin a peer set or override DCF assumptions before exporting"
          style={{
            fontSize: 11, fontWeight: 600, padding: '7px 9px', borderRadius: 8,
            border: '1px solid var(--border)',
            color: hasOverrides ? 'var(--accent-text)' : 'var(--text-muted)',
            background: hasOverrides ? 'var(--accent-dim)' : 'transparent',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {open ? '▴' : '▾'} Overrides{hasOverrides || hasSavedRow ? ' •' : ''}
        </button>
        <button
          onClick={openDrawer}
          title="Re-download decks you generated recently"
          style={{
            fontSize: 12, fontWeight: 600, padding: '7px 10px', borderRadius: 8,
            border: '1px solid var(--border)', color: 'var(--text-secondary)',
            background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <span aria-hidden>🕒</span>
          Recent
        </button>
      </div>
      {open && (
        <div
          className="card"
          style={{
            marginTop: 6, padding: 10, fontSize: 11, width: 320, gap: 8,
            display: 'flex', flexDirection: 'column',
            border: '1px solid var(--border)', background: 'var(--bg-elev)',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 11 }}>
            Deal team overrides
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ color: 'var(--text-muted)' }}>Peer set</span>
            <select
              value={peerSetId}
              onChange={e => setPeerSetId(e.target.value)}
              style={{
                fontSize: 11, padding: '5px 6px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text-primary)', fontFamily: 'inherit',
              }}
            >
              <option value="">Default peers (curated)</option>
              {peerSets.length === 0 && peerSetsLoaded && (
                <option value="" disabled>No saved peer sets in this workspace</option>
              )}
              {peerSets.map(ps => (
                <option key={ps.id} value={ps.id}>
                  {ps.name} · {ps.symbols.length} tickers
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
              <span style={{ color: 'var(--text-muted)' }}>WACC %</span>
              <input
                type="number" step="0.1" min="1" max="40"
                value={waccPct}
                placeholder="9.0"
                onChange={e => setWaccPct(e.target.value)}
                style={{
                  fontSize: 11, padding: '5px 6px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
              <span style={{ color: 'var(--text-muted)' }}>Terminal g %</span>
              <input
                type="number" step="0.1" min="0" max="10"
                value={terminalPct}
                placeholder="2.5"
                onChange={e => setTerminalPct(e.target.value)}
                style={{
                  fontSize: 11, padding: '5px 6px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%',
                }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
              <span style={{ color: 'var(--text-muted)' }}>Stage 1 g %</span>
              <input
                type="number" step="0.1" min="-20" max="50"
                value={growth1Pct}
                placeholder="auto"
                onChange={e => setGrowth1Pct(e.target.value)}
                style={{
                  fontSize: 11, padding: '5px 6px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
              <span style={{ color: 'var(--text-muted)' }}>Stage 2 g %</span>
              <input
                type="number" step="0.1" min="-20" max="30"
                value={growth2Pct}
                placeholder="auto"
                onChange={e => setGrowth2Pct(e.target.value)}
                style={{
                  fontSize: 11, padding: '5px 6px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%',
                }}
              />
            </label>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.4 }}>
            Leave blank to use platform defaults. Overrides are applied to the
            football-field DCF band and the peer-comp slide. Save to pin them
            for every analyst on this workspace's future exports.
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 6, paddingTop: 6, borderTop: '1px dashed var(--border)',
          }}>
            <span style={{ fontSize: 10, color: hasSavedRow ? 'var(--accent-text)' : 'var(--text-muted)' }}>
              {savedOverrides === undefined
                ? 'Loading saved configuration…'
                : hasSavedRow
                  ? `Pinned · last edited ${new Date(savedOverrides!.updatedAt).toLocaleDateString()}`
                  : 'No saved configuration yet'}
            </span>
            <div style={{ display: 'inline-flex', gap: 4 }}>
              <button
                type="button"
                onClick={onResetOverrides}
                disabled={savingOverrides || !hasSavedRow}
                title="Clear the workspace's saved overrides — future exports use platform defaults"
                style={{
                  fontSize: 10, fontWeight: 600, padding: '4px 8px', borderRadius: 6,
                  border: '1px solid var(--border)',
                  color: hasSavedRow ? 'var(--text-secondary)' : 'var(--text-muted)',
                  background: 'transparent',
                  cursor: savingOverrides || !hasSavedRow ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: savingOverrides ? 0.65 : 1,
                }}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={onSaveOverrides}
                disabled={savingOverrides}
                title="Pin the current values to this workspace — every analyst sees them"
                style={{
                  fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                  border: '1px solid var(--accent)',
                  color: 'var(--accent-text)',
                  background: 'var(--accent-dim)',
                  cursor: savingOverrides ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: savingOverrides ? 0.65 : 1,
                }}
              >
                {savingOverrides ? 'Saving…' : 'Save to workspace'}
              </button>
            </div>
          </div>
          {overridesMsg && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{overridesMsg}</div>
          )}
        </div>
      )}
      {status && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 280, textAlign: 'right' }}>{status}</div>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Recent decks"
        width={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Decks you generated recently. Files are kept for 24 hours after generation, then expire from storage.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={loadDecks}
              disabled={decksLoading}
              style={{
                fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6,
                border: '1px solid var(--border)', color: 'var(--text-secondary)',
                background: 'transparent', cursor: decksLoading ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {decksLoading ? 'Refreshing…' : 'Refresh'}
            </button>
            {decks && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {decks.length === 0 ? 'No decks yet' : `${decks.length} deck${decks.length === 1 ? '' : 's'}`}
              </span>
            )}
          </div>

          {decksError && (
            <div style={{ fontSize: 12, color: 'var(--neg)', padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
              {decksError}
            </div>
          )}

          {decksLoading && !decks && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Loading recent decks…</div>
          )}

          {decks && decks.length === 0 && !decksLoading && !decksError && (
            <div style={{
              fontSize: 12, color: 'var(--text-secondary)',
              padding: '20px 14px', textAlign: 'center',
              border: '1px dashed var(--border)', borderRadius: 8,
            }}>
              You haven't generated any decks yet. Click "Export to deck" to build one — it'll show up here for re-download.
            </div>
          )}

          {decks && decks.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {decks.map((row) => {
                const tmpl = row.template ? TEMPLATE_LABEL[row.template] || row.template : 'Deck'
                return (
                  <li
                    key={row.fileId}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: row.expired ? 'transparent' : 'var(--bg-card)',
                      opacity: row.expired ? 0.55 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.filename}>
                        {row.filename}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtRelative(row.createdAt)}</div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span style={{
                        padding: '1px 6px', borderRadius: 4,
                        background: 'var(--accent-dim)', color: 'var(--accent-text)',
                        fontWeight: 600, fontSize: 10,
                      }}>{tmpl}</span>
                      {row.ticker && row.ticker !== 'MATRIX' && (
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.ticker}</span>
                      )}
                      {row.slides != null && <span>{row.slides} slides</span>}
                      <span>{fmtBytes(row.bytes)}</span>
                      <span style={{ color: row.expired ? 'var(--neg)' : 'var(--text-muted)' }}>
                        {fmtExpiry(row.expiresAt, row.expired)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => downloadRow(row)}
                        disabled={row.expired}
                        title={row.expired ? 'Expired — regenerate from the company page' : 'Re-download this deck'}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6,
                          border: '1px solid var(--accent)',
                          color: row.expired ? 'var(--text-muted)' : 'var(--accent-text)',
                          background: row.expired ? 'transparent' : 'var(--accent-dim)',
                          cursor: row.expired ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {row.expired ? 'Expired' : '↓ Re-download'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Drawer>
    </div>
  )
}

function StartDealWorkspaceButton({ symbol, companyName }: { symbol: string; companyName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)

  async function start() {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`${BASE}/api/workspaces/deal-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSymbol: symbol,
          name: `${companyName} — Deal Team`,
          description: `Deal team workspace for ${symbol}`,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.workspace?.id) {
        setErr(j?.error || `Failed (${res.status})`)
        return
      }
      router.push(`${BASE}/app/workspaces/deal/${encodeURIComponent(j.workspace.id)}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={start}
        disabled={busy}
        title={`Scaffold a deal-team workspace for ${symbol}`}
        style={{
          padding: '7px 12px',
          borderRadius: 8,
          border: '1px solid var(--accent)',
          background: busy ? 'transparent' : 'var(--accent-dim)',
          color: 'var(--accent-text)',
          fontSize: 12,
          fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? 'Starting…' : `🤝 Start a deal workspace for ${symbol}`}
      </button>
      {err && <div style={{ fontSize: 11, color: 'var(--neg)' }}>{err}</div>}
    </div>
  )
}

// ── Workflow Agents Panel ─────────────────────────────────────────────────────
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

const AGENTS = [
  {
    id: 'primer',
    label: 'Company Primer',
    icon: '📋',
    color: 'var(--accent)',
    desc: 'Executive summary of the business model, competitive moat, and investment narrative.',
    prompt: (sym: string, name: string) => `Generate a concise investment primer for ${name} (${sym}). Cover: business model, revenue streams, competitive advantages, key risks, and a one-paragraph investment narrative. Format as structured bullet points.`,
  },
  {
    id: 'customers',
    label: 'Customer Insights',
    icon: '👥',
    color: 'var(--pos)',
    desc: 'Analyse customer concentration, retention signals, and end-market dynamics.',
    prompt: (sym: string, name: string) => `Analyse ${name} (${sym}) customer dynamics. Cover: key customer segments, concentration risk, retention indicators from earnings calls, and any shifts in end-market demand. Use data from recent filings and transcripts.`,
  },
  {
    id: 'competitive',
    label: 'Competitive Positioning',
    icon: '🎯',
    color: 'var(--violet)',
    desc: 'Map competitive landscape, market share trends, and strategic differentiation.',
    prompt: (sym: string, name: string) => `Analyse ${name} (${sym}) competitive positioning. Cover: key competitors, market share dynamics, pricing power, switching costs, and barriers to entry. Assess whether the company is gaining or losing competitive ground.`,
  },
]

type AgentStatus = 'idle' | 'running' | 'done' | 'error'

function WorkflowAgentsPanel({ symbol, companyName, onCitation }: {
  symbol: string;
  companyName: string;
  onCitation?: (label: string, body: string) => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({})
  const [outputs,  setOutputs]  = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  async function runAgent(agent: typeof AGENTS[0]) {
    setStatuses(s => ({ ...s, [agent.id]: 'running' }))
    setExpanded(agent.id)
    try {
      const res  = await fetch(`${BASE}/api/ai-research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: agent.prompt(symbol, companyName), symbol, contextLevel: 'full' }),
      })
      const data = await res.json()
      setOutputs(o => ({ ...o, [agent.id]: data.answer || data.content || data.response || 'Analysis complete.' }))
      setStatuses(s => ({ ...s, [agent.id]: 'done' }))
    } catch {
      setOutputs(o => ({ ...o, [agent.id]: 'Unable to connect to AI service. Check API key configuration.' }))
      setStatuses(s => ({ ...s, [agent.id]: 'error' }))
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Workflow Agents</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Powered by Finsyt AI</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {AGENTS.map(agent => {
          const status  = statuses[agent.id] || 'idle'
          const output  = outputs[agent.id]
          const isOpen  = expanded === agent.id
          return (
            <div key={agent.id} className="card" style={{ overflow: 'hidden', border: status === 'running' ? `1.5px solid ${agent.color}` : '1.5px solid var(--border)', transition: 'border-color 0.2s' }}>
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${agent.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {agent.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{agent.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {status === 'running' && (
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: agent.color, animation: `agentBounce 1s ease-in-out ${i*0.2}s infinite` }} />
                      ))}
                    </div>
                  )}
                  {status === 'done'    && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pos)', padding: '2px 8px', borderRadius: 20, background: 'var(--pos-dim)' }}>✓ Done</span>}
                  {status === 'error'   && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--neg)', padding: '2px 8px', borderRadius: 20, background: 'var(--neg-dim)' }}>Error</span>}
                  {status !== 'running' && (
                    <button onClick={() => runAgent(agent)}
                      style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: agent.color, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                      {status === 'idle' ? 'Run' : 'Re-run'}
                    </button>
                  )}
                </div>
              </div>
              {output && (
                <>
                  <div onClick={() => setExpanded(isOpen ? null : agent.id)}
                    style={{ padding: '6px 16px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)', fontSize: 11, color: agent.color, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', userSelect: 'none' }}>
                    <span>View Analysis</span>
                    <span>{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.75, maxHeight: 240, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                      {output}
                      {onCitation && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Sources</span>
                          <CitationChip
                            label={`${symbol} 10-K`}
                            onClick={() => onCitation(`${symbol} · Latest 10-K`, output)}
                          />
                          <CitationChip
                            label={`${symbol} earnings call`}
                            onClick={() => onCitation(`${symbol} · Most recent earnings call`, output)}
                          />
                          <CitationChip
                            label={`${agent.label} agent`}
                            onClick={() => onCitation(`${agent.label} — ${symbol}`, output)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes agentBounce { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-4px) } }
      `}</style>
    </div>
  )
}
