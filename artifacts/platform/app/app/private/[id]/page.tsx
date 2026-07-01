'use client'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import {
  Card, Button, Badge, Skeleton, Tabs, MetricTile, ContextualAskBar,
  ACTION_ICONS, NAV_ICONS, ICON_STROKE, EmptyState,
} from '@/components/ui'
import AIAnalysisTab from '@/components/company/AIAnalysisTab'
import NotesTab from '@/components/company/NotesTab'

// ── Types ────────────────────────────────────────────────────────────────────
type Company = {
  id: number
  company_name: string
  company_logo_url?: string
  description_enriched?: string
  description?: string
  industry?: string
  hq_country?: string
  hq_city?: string
  founded_year?: string
  size_range?: string
  employees_count_inferred?: number
  employees_count_inferred_by_month?: { date: string; employees_count_inferred: number }[]
  employee_attrition_rate?: number
  departures_count?: number
  ownership_status?: string
  website?: string
  linkedin_url?: string
  followers_count_professional_network?: number
  categories_and_keywords?: string[]
  competitors?: { name: string; website: string }[]
  funding?: {
    total_funding?: number
    last_funding_type?: string
    last_funding_date?: string
    last_funding_amount?: number
    investors?: string[]
    funding_rounds?: {
      announced_date: string
      money_raised: number
      funding_type: string
      investors: string[]
    }[]
  }
}

type FinancialRow = {
  id: string
  period: string
  periodType: string
  source: string
  sourceLabel?: string | null
  currency: string
  data: Record<string, unknown>
  notes: string
}

type CapTableEntry = {
  id: string
  entryType: string
  name: string
  shareClass?: string | null
  round?: string | null
  shares?: string | null
  ownershipPct?: string | null
  liquidationPref?: string | null
  boardSeat?: string | null
  notes: string
}

type PrivateFinancials = {
  income: FinancialRow[]
  balance: FinancialRow[]
  cashflow: FinancialRow[]
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmt(n?: number | null) {
  if (!n) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n}`
}
function fmtN(n?: number | null) {
  if (!n) return '—'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return `${n}`
}
function fmtNum(v: unknown): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (isNaN(n)) return '—'
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}
function pctFmt(v: unknown): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

// ── Financial statement row configs ──────────────────────────────────────────
const INCOME_ROWS: [string, string][] = [
  ['Revenue', 'revenue'], ['Cost of Revenue', 'costOfRevenue'], ['Gross Profit', 'grossProfit'],
  ['Gross Margin', 'grossMargin'], ['Operating Expenses', 'operatingExpenses'],
  ['EBITDA', 'ebitda'], ['EBIT', 'ebit'], ['Net Income', 'netIncome'],
  ['Net Margin', 'netMargin'],
]
const BALANCE_ROWS: [string, string][] = [
  ['Cash', 'cash'], ['Total Assets', 'totalAssets'], ['Total Liabilities', 'totalLiabilities'],
  ['Total Equity', 'totalEquity'], ['Long-term Debt', 'longTermDebt'], ['Net Debt', 'netDebt'],
]
const CASHFLOW_ROWS: [string, string][] = [
  ['Operating Cash Flow', 'operatingCashFlow'], ['CapEx', 'capex'],
  ['Free Cash Flow', 'freeCashFlow'], ['Net Change', 'netChange'],
]

// ── Headcount chart ───────────────────────────────────────────────────────────
function HeadcountChart({ history }: { history: { date: string; employees_count_inferred: number }[] }) {
  if (!history?.length) {
    return (
      <EmptyState
        icon={<NAV_ICONS.signals width={28} height={28} strokeWidth={ICON_STROKE} />}
        title="No headcount history"
        hint="CoreSignal hasn't returned monthly headcount for this company."
      />
    )
  }
  const data = history.slice(-24).map(d => ({ date: d.date?.slice(0, 7), hc: d.employees_count_inferred }))
  const last = data[data.length - 1]?.hc
  const first = data[0]?.hc
  const growth = data.length > 1 && first ? (((last - first) / first) * 100).toFixed(1) : null
  const growthNum = growth ? parseFloat(growth) : 0
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {fmtN(last)}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Inferred headcount
          </div>
        </div>
        {growth && (
          <Badge tone={growthNum >= 0 ? 'green' : 'red'}>
            {growthNum >= 0 ? '+' : ''}{growth}% (24mo)
          </Badge>
        )}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="hcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmtN(v) || ''} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
            formatter={(v: any) => [fmtN(v), 'Employees']}
          />
          <Area type="monotone" dataKey="hc" stroke="var(--accent)" strokeWidth={2} fill="url(#hcGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Funding timeline ──────────────────────────────────────────────────────────
function FundingTimeline({ funding }: { funding?: Company['funding'] }) {
  if (!funding) {
    return <EmptyState icon={<NAV_ICONS.deals width={28} height={28} strokeWidth={ICON_STROKE} />} title="No funding data" hint="CoreSignal hasn't returned funding rounds for this company." />
  }
  const rounds = funding.funding_rounds || []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <MetricTile label="Total raised" value={funding.total_funding ? fmt(funding.total_funding) : undefined} />
        {funding.last_funding_type && <MetricTile label="Last round" value={funding.last_funding_type} />}
        {funding.last_funding_amount && <MetricTile label="Last amount" value={fmt(funding.last_funding_amount)} />}
        {funding.last_funding_date && <MetricTile label="Last date" value={funding.last_funding_date.slice(0, 7)} />}
      </div>
      {rounds.length > 0 && (
        <Card padding={14}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
            Funding rounds
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rounds.slice(0, 10).map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 11.5, width: 70, fontVariantNumeric: 'tabular-nums' }}>{r.announced_date?.slice(0, 7)}</span>
                <Badge tone="blue">{r.funding_type}</Badge>
                <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', minWidth: 70 }}>{fmt(r.money_raised)}</span>
                {r.investors?.length > 0 && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.investors.slice(0, 3).join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Financials tab ────────────────────────────────────────────────────────────
type FinStmt = 'income' | 'balance' | 'cashflow'
const STMT_CONFIG: Record<FinStmt, { label: string; rows: [string, string][] }> = {
  income:   { label: 'Income Statement', rows: INCOME_ROWS },
  balance:  { label: 'Balance Sheet', rows: BALANCE_ROWS },
  cashflow: { label: 'Cash Flow', rows: CASHFLOW_ROWS },
}

function FinancialsTab({
  coresignalId, companyName, financials, loading, onRefresh,
}: {
  coresignalId: string
  companyName: string
  financials: PrivateFinancials | null
  loading: boolean
  onRefresh: () => void
}) {
  const [stmt, setStmt] = useState<FinStmt>('income')
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ period: '', currency: 'USD', notes: '', data: '{}' })

  const stmtData = financials?.[stmt] ?? []
  const cfg = STMT_CONFIG[stmt]

  async function handleAdd() {
    setSaving(true)
    try {
      let data: Record<string, unknown>
      try { data = JSON.parse(form.data) } catch { alert('Invalid JSON in data field'); setSaving(false); return }
      await fetch('/api/private/financials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coresignalId,
          companyName,
          statement: stmt,
          period: form.period,
          currency: form.currency,
          source: 'manual',
          notes: form.notes,
          data,
        }),
      })
      setAddOpen(false)
      setForm({ period: '', currency: 'USD', notes: '', data: '{}' })
      onRefresh()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this statement period?')) return
    await fetch(`/api/private/financials?id=${id}`, { method: 'DELETE' })
    onRefresh()
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1, 2, 3].map(i => <Skeleton key={i} width="100%" height={18} />)}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['income', 'balance', 'cashflow'] as FinStmt[]).map(s => (
            <button key={s} onClick={() => setStmt(s)}
              style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1.5px solid', cursor: 'pointer', transition: 'all 0.12s',
                background: stmt === s ? 'var(--accent)' : 'var(--bg-card)', color: stmt === s ? '#fff' : 'var(--text-secondary)', borderColor: stmt === s ? 'var(--accent)' : 'var(--border)' }}>
              {STMT_CONFIG[s].label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAddOpen(o => !o)}>+ Add period</Button>
      </div>

      {addOpen && (
        <Card padding={16}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Add {cfg.label} period</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Period end (YYYY-MM-DD)</div>
              <input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="2024-12-31"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Currency</div>
              <input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} placeholder="USD"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Data (JSON) — keys: {cfg.rows.map(([, k]) => k).slice(0, 4).join(', ')}, …</div>
            <textarea value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} rows={5}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Notes</div>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Source, assumptions…"
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving || !form.period.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {stmtData.length === 0 ? (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 24px' }}>
          <EmptyState
            icon={<NAV_ICONS.company width={28} height={28} strokeWidth={ICON_STROKE} />}
            title={`No ${cfg.label} data`}
            hint="Upload or manually enter financials for this company via the 'Add period' button above. Alternatively, ingest a data-room document for automatic extraction."
          />
        </div>
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                    Metric
                  </th>
                  {stmtData.map(d => (
                    <th key={d.id} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: 12, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span>{d.period}</span>
                        <Badge tone={d.source === 'manual' ? 'blue' : 'green'}>{d.sourceLabel || d.source}</Badge>
                      </div>
                    </th>
                  ))}
                  <th style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {cfg.rows.map(([label, key], ri) => (
                  <tr key={key} style={{ borderBottom: '1px solid var(--border)', background: ri % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                    <td style={{ padding: '9px 14px', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</td>
                    {stmtData.map(d => {
                      const v = (d.data as Record<string, unknown>)[key]
                      const isPct = key.toLowerCase().includes('margin')
                      const display = isPct ? pctFmt(v) : fmtNum(v)
                      const num = v != null ? Number(v) : null
                      const isNeg = num != null && num < 0
                      return (
                        <td key={d.id} style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: isNeg ? 'var(--neg)' : 'var(--text-primary)', fontWeight: 500 }}>
                          {display}
                        </td>
                      )
                    })}
                    <td />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={stmtData.length + 2} style={{ padding: '8px 14px' }}>
                    {stmtData.map(d => (
                      <button key={d.id} onClick={() => handleDelete(d.id)}
                        style={{ fontSize: 11, color: 'var(--neg)', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8, fontFamily: 'inherit' }}>
                        Delete {d.period}
                      </button>
                    ))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Cap table tab ─────────────────────────────────────────────────────────────
const ENTRY_TONE: Record<string, 'blue' | 'green' | 'gray'> = {
  shareholder: 'blue', share_class: 'green', option_pool: 'gray',
}

function CapTableTab({
  coresignalId, companyName, entries, loading, onRefresh,
}: {
  coresignalId: string
  companyName: string
  entries: CapTableEntry[]
  loading: boolean
  onRefresh: () => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    entryType: 'shareholder', name: '', shareClass: '', round: '', shares: '',
    ownershipPct: '', liquidationPref: '', boardSeat: '', notes: '',
  })

  const totalPct = entries.reduce((acc, e) => {
    const p = e.ownershipPct ? parseFloat(e.ownershipPct) : 0
    return acc + (isNaN(p) ? 0 : p)
  }, 0)

  async function handleAdd() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await fetch('/api/private/cap-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coresignalId, companyName,
          entryType: form.entryType, name: form.name, shareClass: form.shareClass || undefined,
          round: form.round || undefined, shares: form.shares || undefined,
          ownershipPct: form.ownershipPct || undefined, liquidationPref: form.liquidationPref || undefined,
          boardSeat: form.boardSeat || undefined, notes: form.notes,
          position: entries.length,
        }),
      })
      setAddOpen(false)
      setForm({ entryType: 'shareholder', name: '', shareClass: '', round: '', shares: '', ownershipPct: '', liquidationPref: '', boardSeat: '', notes: '' })
      onRefresh()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this entry?')) return
    await fetch(`/api/private/cap-table?id=${id}`, { method: 'DELETE' })
    onRefresh()
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1, 2, 3, 4].map(i => <Skeleton key={i} width="100%" height={18} />)}
    </div>
  )

  const shareholders = entries.filter(e => e.entryType === 'shareholder')
  const shareClasses = entries.filter(e => e.entryType === 'share_class')
  const optionPools = entries.filter(e => e.entryType === 'option_pool')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, flex: 1 }}>
          <MetricTile label="Shareholders" value={shareholders.length ? String(shareholders.length) : undefined} />
          <MetricTile label="Share classes" value={shareClasses.length ? String(shareClasses.length) : undefined} />
          <MetricTile label="Option pools" value={optionPools.length ? String(optionPools.length) : undefined} />
          <MetricTile
            label="Total ownership logged"
            value={entries.length ? `${totalPct.toFixed(1)}%` : undefined}
            changeTone={totalPct > 100 ? 'neg' : totalPct > 90 ? 'pos' : 'neutral'}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAddOpen(o => !o)}>+ Add entry</Button>
      </div>

      {addOpen && (
        <Card padding={16}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Add cap table entry</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Type</div>
              <select value={form.entryType} onChange={e => setForm(f => ({ ...f, entryType: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}>
                <option value="shareholder">Shareholder</option>
                <option value="share_class">Share class</option>
                <option value="option_pool">Option pool</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Name *</div>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Accel Partners"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Share class</div>
              <input value={form.shareClass} onChange={e => setForm(f => ({ ...f, shareClass: e.target.value }))} placeholder="e.g. Series A Preferred"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Round</div>
              <input value={form.round} onChange={e => setForm(f => ({ ...f, round: e.target.value }))} placeholder="e.g. Series B"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Shares</div>
              <input value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} placeholder="e.g. 1000000"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Ownership %</div>
              <input value={form.ownershipPct} onChange={e => setForm(f => ({ ...f, ownershipPct: e.target.value }))} placeholder="e.g. 12.5"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Liq. pref ×</div>
              <input value={form.liquidationPref} onChange={e => setForm(f => ({ ...f, liquidationPref: e.target.value }))} placeholder="e.g. 1.0"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Board seat</div>
              <input value={form.boardSeat} onChange={e => setForm(f => ({ ...f, boardSeat: e.target.value }))} placeholder="e.g. Observer"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Notes</div>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anti-dilution, vesting, notes…"
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Add'}</Button>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {entries.length === 0 ? (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 24px' }}>
          <EmptyState
            icon={<NAV_ICONS.company width={28} height={28} strokeWidth={ICON_STROKE} />}
            title="Cap table not yet entered"
            hint="Add shareholders, share classes, and option pools manually. Funding-round investors are surfaced automatically below from the Ownership tab."
          />
        </div>
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['Type', 'Name', 'Share class', 'Round', 'Shares', 'Ownership %', 'Liq. pref', 'Board', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: i >= 4 ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '9px 14px' }}>
                    <Badge tone={ENTRY_TONE[e.entryType] || 'gray'}>{e.entryType.replace('_', ' ')}</Badge>
                  </td>
                  <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{e.name}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--text-secondary)' }}>{e.shareClass || '—'}</td>
                  <td style={{ padding: '9px 14px' }}>{e.round ? <Badge tone="blue">{e.round}</Badge> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                    {e.shares ? Number(e.shares).toLocaleString('en-US') : '—'}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {e.ownershipPct ? `${parseFloat(e.ownershipPct).toFixed(2)}%` : '—'}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {e.liquidationPref ? `${parseFloat(e.liquidationPref).toFixed(1)}×` : '—'}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                    {e.boardSeat || '—'}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                    <button onClick={() => handleDelete(e.id)}
                      style={{ fontSize: 11, color: 'var(--neg)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px' }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ── Ownership tab ─────────────────────────────────────────────────────────────
function OwnershipTab({ company }: { company: Company }) {
  const rounds = company.funding?.funding_rounds ?? []
  const investors = company.funding?.investors ?? []

  const investorMap: Record<string, { name: string; rounds: string[]; totalInvested: number }> = {}
  for (const round of rounds) {
    for (const inv of round.investors ?? []) {
      if (!investorMap[inv]) investorMap[inv] = { name: inv, rounds: [], totalInvested: 0 }
      investorMap[inv].rounds.push(round.funding_type)
      if (round.money_raised) investorMap[inv].totalInvested += round.money_raised
    }
  }
  const topInvestors = Object.values(investorMap).sort((a, b) => b.rounds.length - a.rounds.length)

  const allInvestors = [...new Set([...topInvestors.map(i => i.name), ...investors])]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Investors */}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Known Investors</span>
          <Badge tone="blue">source: CoreSignal</Badge>
        </div>
        {allInvestors.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No investor data available from CoreSignal.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['Investor', 'Rounds participated', 'Round types', 'Total invested (est.)'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: i > 0 ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allInvestors.slice(0, 25).map((name, i) => {
                const info = investorMap[name]
                return (
                  <tr key={name} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{name}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                      {info ? info.rounds.length : '—'}
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                      {info?.rounds.length ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {[...new Set(info.rounds)].map(r => <Badge key={r} tone="blue">{r}</Badge>)}
                        </div>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                      {info?.totalInvested ? fmt(info.totalInvested) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Funding rounds summary */}
      {rounds.length > 0 && (
        <Card padding={14}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
            Funding timeline
          </div>
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
            {rounds.slice(0, 10).map((r, i) => (
              <div key={i} style={{ position: 'relative', marginBottom: 16, paddingLeft: 12 }}>
                <div style={{ position: 'absolute', left: -15, top: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-card)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, minWidth: 60 }}>{r.announced_date?.slice(0, 7)}</span>
                  <Badge tone="blue">{r.funding_type}</Badge>
                  <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.money_raised)}</span>
                </div>
                {r.investors?.length > 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {r.investors.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty state message */}
      <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Data coverage note:</strong> Ownership data is sourced from CoreSignal's multi-source profile (funding rounds, investor lists). For full cap table detail including individual share classes and option pools, use the Cap Table tab. Board composition data is not yet available via CoreSignal; a future provider integration will slot in here.
      </div>
    </div>
  )
}

// ── Main profile page ─────────────────────────────────────────────────────────
type Tab = 'overview' | 'headcount' | 'funding' | 'financials' | 'cap-table' | 'ownership' | 'ai-analysis' | 'notes'

export default function PrivateCompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  const [financials, setFinancials] = useState<PrivateFinancials | null>(null)
  const [financialsLoading, setFinancialsLoading] = useState(false)
  const [capTable, setCapTable] = useState<CapTableEntry[]>([])
  const [capTableLoading, setCapTableLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/coresignal?action=collect&id=${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setCompany(data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  function loadFinancials() {
    if (!id) return
    setFinancialsLoading(true)
    fetch(`/api/private/financials?coresignal_id=${id}`)
      .then(r => r.json())
      .then(d => setFinancials(d.financials ?? null))
      .catch(() => {})
      .finally(() => setFinancialsLoading(false))
  }

  function loadCapTable() {
    if (!id) return
    setCapTableLoading(true)
    fetch(`/api/private/cap-table?coresignal_id=${id}`)
      .then(r => r.json())
      .then(d => setCapTable(d.entries ?? []))
      .catch(() => {})
      .finally(() => setCapTableLoading(false))
  }

  useEffect(() => {
    if (tab === 'financials' && financials === null && !financialsLoading) loadFinancials()
    // Cap table is shown on both the 'cap-table' tab and the Ownership tab's Major Holders panel
    if ((tab === 'cap-table' || tab === 'ownership') && capTable.length === 0 && !capTableLoading) loadCapTable()
  }, [tab])

  const ChevronLeft = ACTION_ICONS.chevronLeft

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 1.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton width={200} height={20} />
          <Skeleton width="60%" height={32} />
          <Skeleton width="40%" height={14} />
        </div>
      </div>
    )
  }

  if (error || !company) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 1.75rem' }}>
        <EmptyState
          icon={<NAV_ICONS.company width={28} height={28} strokeWidth={ICON_STROKE} />}
          title="Company not found"
          hint={error || 'This CoreSignal company ID could not be resolved.'}
          action={<Button variant="secondary" size="sm" onClick={() => router.back()}>Go back</Button>}
        />
      </div>
    )
  }

  const desc = company.description_enriched || company.description || ''
  const summary = [company.industry, company.hq_city, company.hq_country].filter(Boolean).join(' · ')
  const metrics = [
    { label: 'Founded', value: company.founded_year },
    { label: 'HQ', value: [company.hq_city, company.hq_country].filter(Boolean).join(', ') || undefined },
    { label: 'Size', value: company.size_range },
    { label: 'Headcount', value: company.employees_count_inferred ? fmtN(company.employees_count_inferred) : undefined },
    { label: 'Attrition', value: company.employee_attrition_rate ? `${company.employee_attrition_rate.toFixed(1)}%` : undefined },
    { label: 'Total raised', value: company.funding?.total_funding ? fmt(company.funding.total_funding) : undefined },
    { label: 'Last round', value: company.funding?.last_funding_type },
  ].filter(m => m.value)

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'headcount', label: 'Headcount' },
    { id: 'funding', label: 'Funding' },
    { id: 'financials', label: 'Financials' },
    { id: 'cap-table', label: 'Cap Table' },
    { id: 'ownership', label: 'Ownership' },
    { id: 'ai-analysis', label: 'AI Analysis' },
    { id: 'notes', label: 'Notes' },
  ]

  // Stable symbol key for private companies — used by NotesTab and AIAnalysisTab
  // to namespace localStorage and `/api/notes?symbol=...` lookups.
  const privateSymbol = `private:${company.id}`

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 12, background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', padding: '14px 1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-dim)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, overflow: 'hidden', flexShrink: 0 }}>
              {company.company_logo_url
                ? <img src={company.company_logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : (company.company_name?.[0] || '?')}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.015em', margin: 0, lineHeight: 1.2 }}>
                  {company.company_name}
                </h1>
                {company.ownership_status && <Badge tone="blue">{company.ownership_status}</Badge>}
                <Badge tone="gray">Private</Badge>
              </div>
              {summary && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{summary}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {company.website && (
              <Button variant="ghost" size="sm" onClick={() => window.open(company.website, '_blank')}>
                Website ↗
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => router.push('/app/private')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ChevronLeft width={14} height={14} strokeWidth={ICON_STROKE} />
                Back
              </span>
            </Button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Ask bar */}
        <div style={{ padding: '14px 1.75rem 0' }}>
          <ContextualAskBar
            context={`Private · ${company.company_name}`}
            contextData={{
              page: 'private_profile',
              coresignalId: String(company.id),
              companyName: company.company_name,
              industry: company.industry,
              hq: [company.hq_city, company.hq_country].filter(Boolean).join(', '),
              funding: company.funding?.total_funding,
              headcount: company.employees_count_inferred,
            }}
            chips={[
              { label: 'Compare to peers', prompt: `Compare ${company.company_name} to its closest private peers on headcount, funding, and growth.` },
              { label: 'Funding trajectory', prompt: `Walk me through ${company.company_name}'s funding history and what each round implies about valuation.` },
              { label: 'Investment thesis', prompt: `Summarize the investment thesis for ${company.company_name} based on available data.` },
            ]}
            placeholder={`Ask Finsyt about ${company.company_name}…`}
          />
        </div>

        {/* Tabs */}
        <div style={{ padding: '14px 1.75rem 0' }}>
          <Tabs value={tab} onChange={v => setTab(v as Tab)} items={TABS} />
        </div>

        {/* Tab content */}
        <div style={{ padding: '20px 1.75rem 40px' }}>
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {desc && (
                <Card padding={16}>
                  <p style={{ color: 'var(--text-primary)', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{desc}</p>
                </Card>
              )}
              {metrics.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                  {metrics.map(m => <MetricTile key={m.label} label={m.label} value={m.value} />)}
                </div>
              )}
              {company.categories_and_keywords?.length ? (
                <Card padding={16}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
                    Categories & keywords
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {company.categories_and_keywords.slice(0, 24).map(k => <Badge key={k} tone="blue">{k}</Badge>)}
                  </div>
                </Card>
              ) : null}
              {company.competitors?.length ? (
                <Card padding={16}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
                    Known competitors
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {company.competitors.slice(0, 12).map(c => <Badge key={c.name} tone="gray">{c.name}</Badge>)}
                  </div>
                </Card>
              ) : null}
              {company.followers_count_professional_network ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <MetricTile label="LinkedIn followers" value={fmtN(company.followers_count_professional_network)} hint="professional network" />
                </div>
              ) : null}
            </div>
          )}

          {tab === 'headcount' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card padding={20}>
                <HeadcountChart history={company.employees_count_inferred_by_month || []} />
              </Card>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <MetricTile label="Current headcount" value={company.employees_count_inferred ? fmtN(company.employees_count_inferred) : undefined} />
                <MetricTile label="Attrition rate" value={company.employee_attrition_rate ? `${company.employee_attrition_rate.toFixed(1)}%` : undefined} changeTone={company.employee_attrition_rate && company.employee_attrition_rate > 5 ? 'neg' : 'neutral'} />
                <MetricTile label="Monthly departures" value={company.departures_count ? fmtN(company.departures_count) : undefined} />
                <MetricTile label="Size range" value={company.size_range} />
              </div>
            </div>
          )}

          {tab === 'funding' && <FundingTimeline funding={company.funding} />}

          {tab === 'financials' && (
            <FinancialsTab
              coresignalId={String(company.id)}
              companyName={company.company_name}
              financials={financials}
              loading={financialsLoading}
              onRefresh={loadFinancials}
            />
          )}

          {tab === 'cap-table' && (
            <CapTableTab
              coresignalId={String(company.id)}
              companyName={company.company_name}
              entries={capTable}
              loading={capTableLoading}
              onRefresh={loadCapTable}
            />
          )}

          {tab === 'ownership' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <OwnershipTab company={company} />

              {/* Board of directors — empty state since CoreSignal does not expose board data */}
              <Card padding={0} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Board of Directors</span>
                  <Badge tone="gray">source: not yet available</Badge>
                </div>
                <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
                  Board composition data is not included in CoreSignal's public company profile.
                  <br />
                  <span style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
                    Planned: Crunchbase / PitchBook board member integration — use the Connector Hub to wire in a data source.
                  </span>
                </div>
              </Card>

              {/* Major holders — empty state; for private companies, equity ownership lives in the Cap Table */}
              <Card padding={0} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Major Holders / Share Breakdown</span>
                  <Badge tone="gray">manual entry</Badge>
                </div>
                <div style={{ padding: '24px' }}>
                  {capTable.filter(e => e.entryType === 'shareholder' && e.ownershipPct).length > 0 ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
                        From cap table (manually entered)
                      </div>
                      {capTable.filter(e => e.ownershipPct).slice(0, 10).map((e, i) => {
                        const pct = parseFloat(e.ownershipPct || '0')
                        const maxPct = Math.max(...capTable.filter(x => x.ownershipPct).map(x => parseFloat(x.ownershipPct || '0')))
                        return (
                          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                            <span style={{ width: 180, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{e.name}</span>
                            <div style={{ flex: 1, height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ width: `${maxPct > 0 ? (pct / maxPct) * 100 : 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.3s' }} />
                            </div>
                            <span style={{ width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{pct.toFixed(1)}%</span>
                            {e.shareClass && <Badge tone="blue">{e.shareClass}</Badge>}
                          </div>
                        )
                      })}
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                        Enter additional holders in the <button onClick={() => setTab('cap-table')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-text)', fontWeight: 600, fontSize: 12, fontFamily: 'inherit', padding: 0 }}>Cap Table tab</button>.
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>
                      No major holder breakdown entered yet.{' '}
                      <button onClick={() => setTab('cap-table')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-text)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', textDecoration: 'underline' }}>
                        Add shareholder entries
                      </button>{' '}
                      to the cap table to visualize equity splits here.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {tab === 'ai-analysis' && (
            <AIAnalysisTab
              symbol={privateSymbol}
              companyName={company.company_name}
              onJumpTab={t => setTab(t as Tab)}
            />
          )}

          {tab === 'notes' && (
            <NotesTab
              symbol={privateSymbol}
              snapshot={{
                name: company.company_name,
                industry: company.industry,
                hq: [company.hq_city, company.hq_country].filter(Boolean).join(', '),
                founded: company.founded_year,
                headcount: company.employees_count_inferred,
                totalFunding: company.funding?.total_funding,
                lastRound: company.funding?.last_funding_type,
                lastFundingDate: company.funding?.last_funding_date,
                ownership: company.ownership_status,
                website: company.website,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
