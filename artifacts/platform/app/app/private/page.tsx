'use client'
import { useState, useCallback } from 'react'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import {
  Card, Button, Input, Select, FieldLabel, Badge, EmptyState,
  Skeleton, Tabs, MetricTile, ContextualAskBar, PageHero,
  ACTION_ICONS, NAV_ICONS, ICON_STROKE,
} from '@/components/ui'

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
  website?: string
  linkedin_url?: string
  followers_count_professional_network?: number
  categories_and_keywords?: string[]
  status?: { value: string; comment: string }[]
  competitors?: { name: string; website: string }[]
}

const SIZE_LABELS: Record<string, string> = {
  '1-10': 'Seed-stage', '11-50': 'Early', '51-200': 'Growing',
  '201-500': 'Scale-up', '501-1000': 'Mid-market', '1001-5000': 'Growth',
  '5001-10000': 'Large', '10001+': 'Enterprise',
}

const QUICK_PICKS = ['Stripe', 'Databricks', 'Klarna', 'Revolut', 'OpenAI', 'Anduril']

function fmt(n?: number) {
  if (!n) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n}`
}

function fmtN(n?: number) {
  if (!n) return '—'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return `${n}`
}

// ── Search toolbar ───────────────────────────────────────────────────────────
// Flat toolbar that mirrors the search/filter idiom used on Agents Library and
// Watchlist — no Card wrapper, single full-width query input on top, filters
// laid out beneath.
function SearchToolbar({
  onSearch, loading,
}: {
  onSearch: (q: string, filters: { hq_country: string; industry: string; size_range: string }) => void
  loading: boolean
}) {
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [size, setSize] = useState('')

  const submit = () => {
    if (!q.trim()) return
    onSearch(q, { hq_country: country, industry, size_range: size })
  }

  const SearchIcon = ACTION_ICONS.search

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', display: 'inline-flex', pointerEvents: 'none',
          }}>
            <SearchIcon width={16} height={16} strokeWidth={ICON_STROKE} />
          </span>
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="Search any private company — e.g. Stripe, Databricks, Klarna…"
            style={{ paddingLeft: 36 }}
          />
        </div>
        <Button variant="primary" size="md" onClick={submit} disabled={loading || !q.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div>
          <FieldLabel>Country (ISO2)</FieldLabel>
          <Input
            fieldSize="sm"
            value={country}
            onChange={e => setCountry(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="US, GB, DE…"
          />
        </div>
        <div>
          <FieldLabel>Industry</FieldLabel>
          <Input
            fieldSize="sm"
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="Software, Fintech…"
          />
        </div>
        <div>
          <FieldLabel>Headcount</FieldLabel>
          <Select fieldSize="sm" value={size} onChange={e => setSize(e.target.value)}>
            <option value="">Any size</option>
            {Object.entries(SIZE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{k} — {v}</option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  )
}

// ── Discovery card (search result) ───────────────────────────────────────────
// Recipe matches the Agents Library template card: bg-elevated, border 1px,
// radius 14, padding 18, hover lift + accent border.
function DiscoveryCard({ c, onClick }: { c: Company; onClick: () => void }) {
  const hc = c.employees_count_inferred
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 18,
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.15s',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-dim)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10, background: 'var(--accent-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--accent-text)', fontWeight: 800, fontSize: 15, flexShrink: 0,
        overflow: 'hidden',
      }}>
        {c.company_logo_url
          ? <img src={c.company_logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : (c.company_name?.[0] || '?')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14 }}>{c.company_name}</span>
          {c.ownership_status && <Badge tone="blue">{c.ownership_status}</Badge>}
          {c.founded_year && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>est. {c.founded_year}</span>
          )}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
          {[c.industry, c.hq_city, c.hq_country].filter(Boolean).join(' · ') || '—'}
        </div>
        {(c.description_enriched || c.description) && (
          <p style={{
            color: 'var(--text-secondary)', fontSize: 12.5, marginTop: 8,
            lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', margin: '8px 0 0',
          }}>{c.description_enriched || c.description}</p>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8, minWidth: 70 }}>
        {hc ? (
          <>
            <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {fmtN(hc)}
            </div>
            <div style={{
              color: 'var(--text-muted)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2,
            }}>employees</div>
          </>
        ) : c.size_range ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{c.size_range}</div>
        ) : null}
      </div>
    </div>
  )
}

// ── Loading rows ─────────────────────────────────────────────────────────────
function LoadingResults() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 18,
          display: 'flex', gap: 14, alignItems: 'flex-start',
        }}>
          <Skeleton width={44} height={44} radius={10} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width={180} height={14} />
            <Skeleton width={240} height={11} />
            <Skeleton width="80%" height={11} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <Skeleton width={50} height={14} />
            <Skeleton width={60} height={10} />
          </div>
        </div>
      ))}
    </div>
  )
}

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
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="hcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmtN(v)} />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 12,
            }}
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
    return (
      <EmptyState
        icon={<NAV_ICONS.deals width={28} height={28} strokeWidth={ICON_STROKE} />}
        title="No funding data"
        hint="CoreSignal hasn't returned funding rounds for this company."
      />
    )
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
            {rounds.slice(0, 8).map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 11.5, width: 70, fontVariantNumeric: 'tabular-nums' }}>
                  {r.announced_date?.slice(0, 7)}
                </span>
                <Badge tone="blue">{r.funding_type}</Badge>
                <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', minWidth: 70 }}>
                  {fmt(r.money_raised)}
                </span>
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

// ── Sticky symbol header ─────────────────────────────────────────────────────
// Mirrors the compact header treatment on /app/company/[symbol]: logo tile +
// name + ownership badge on the left, "Back to results" on the right, with a
// muted one-liner underneath.
function StickyCompanyHeader({ company, onBack }: { company: Company; onBack: () => void }) {
  const ChevronLeft = ACTION_ICONS.chevronLeft
  const summary = [company.industry, company.hq_city, company.hq_country].filter(Boolean).join(' · ')
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 12,
      background: 'var(--bg-page)',
      borderBottom: '1px solid var(--border)',
      padding: '14px 28px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: 'var(--accent-dim)',
            color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, overflow: 'hidden', flexShrink: 0,
          }}>
            {company.company_logo_url
              ? <img src={company.company_logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : (company.company_name?.[0] || '?')}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{
                fontSize: 18, fontWeight: 800, color: 'var(--text-primary)',
                letterSpacing: '-0.015em', margin: 0, lineHeight: 1.2,
              }}>{company.company_name}</h1>
              {company.ownership_status && <Badge tone="blue">{company.ownership_status}</Badge>}
            </div>
            {summary && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{summary}</div>
            )}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onBack}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ChevronLeft width={14} height={14} strokeWidth={ICON_STROKE} />
            Back to results
          </span>
        </Button>
      </div>
    </div>
  )
}

// ── Company detail panel ──────────────────────────────────────────────────────
function CompanyDetail({ company, onBack }: { company: Company; onBack: () => void }) {
  const [tab, setTab] = useState<'overview' | 'headcount' | 'funding' | 'intelligence'>('overview')
  const desc = company.description_enriched || company.description || ''
  const Sparkles = ACTION_ICONS.sparkles

  const metrics = [
    { label: 'Founded', value: company.founded_year },
    { label: 'HQ', value: [company.hq_city, company.hq_country].filter(Boolean).join(', ') || undefined },
    { label: 'Size', value: company.size_range ? `${company.size_range}` : undefined },
    { label: 'Headcount', value: company.employees_count_inferred ? fmtN(company.employees_count_inferred) : undefined },
    { label: 'Attrition', value: company.employee_attrition_rate ? `${company.employee_attrition_rate.toFixed(1)}%` : undefined },
    { label: 'Website', value: company.website },
    { label: 'Total raised', value: company.funding?.total_funding ? fmt(company.funding.total_funding) : undefined },
    { label: 'Last round', value: company.funding?.last_funding_type },
  ].filter(m => m.value)

  return (
    <>
      <StickyCompanyHeader company={company} onBack={onBack} />

      <div style={{ padding: '0 1.75rem' }}>
        <ContextualAskBar
          context={`Private · ${company.company_name}`}
          contextData={{
            page: 'private',
            companyId: company.id,
            companyName: company.company_name,
            industry: company.industry,
            hq: [company.hq_city, company.hq_country].filter(Boolean).join(', '),
          }}
          chips={[
            { label: 'Compare to peers',  prompt: `Compare ${company.company_name} to its closest private peers on headcount, funding stage, and growth.` },
            { label: 'Funding trajectory', prompt: `Walk me through ${company.company_name}'s funding history and what each round implies about valuation.` },
            { label: 'Hiring signals',     prompt: `What do ${company.company_name}'s hiring and attrition signals say about its trajectory?` },
          ]}
          placeholder={`Ask Finsyt about ${company.company_name}…`}
          style={{ margin: '14px 0 0' }}
        />
      </div>

      <div style={{ padding: '18px 1.75rem 0' }}>
        <Tabs
          value={tab}
          onChange={v => setTab(v as typeof tab)}
          items={[
            { id: 'overview', label: 'Overview' },
            { id: 'headcount', label: 'Headcount' },
            { id: 'funding', label: 'Funding' },
            { id: 'intelligence', label: 'Intelligence' },
          ]}
        />
      </div>

      <div style={{ padding: '20px 1.75rem 28px' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {desc && (
              <Card padding={16}>
                <p style={{ color: 'var(--text-primary)', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </Card>
            )}
            {metrics.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                {metrics.map(m => (
                  <MetricTile key={m.label} label={m.label} value={m.value} />
                ))}
              </div>
            )}
            {company.categories_and_keywords?.length ? (
              <Card padding={16}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
                  Categories & keywords
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {company.categories_and_keywords.slice(0, 24).map(k => (
                    <Badge key={k} tone="blue">{k}</Badge>
                  ))}
                </div>
              </Card>
            ) : null}
            {company.competitors?.length ? (
              <Card padding={16}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
                  Known competitors
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {company.competitors.slice(0, 12).map(c => (
                    <Badge key={c.name} tone="gray">{c.name}</Badge>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        )}

        {tab === 'headcount' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card padding={20}>
              <HeadcountChart history={company.employees_count_inferred_by_month || []} />
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <MetricTile
                label="Current headcount"
                value={company.employees_count_inferred ? fmtN(company.employees_count_inferred) : undefined}
              />
              <MetricTile
                label="Attrition rate"
                value={company.employee_attrition_rate ? `${company.employee_attrition_rate.toFixed(1)}%` : undefined}
                changeTone={company.employee_attrition_rate && company.employee_attrition_rate > 5 ? 'neg' : 'neutral'}
              />
              <MetricTile
                label="Monthly departures"
                value={company.departures_count ? fmtN(company.departures_count) : undefined}
              />
            </div>
          </div>
        )}

        {tab === 'funding' && <FundingTimeline funding={company.funding} />}

        {tab === 'intelligence' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card padding={18}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'var(--accent-text)', marginBottom: 10,
              }}>
                <Sparkles width={13} height={13} strokeWidth={ICON_STROKE} />
                AI signal summary
              </div>
              <p style={{ color: 'var(--text-primary)', fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
                {desc
                  ? `${company.company_name} is a ${company.industry || 'private'} company${company.hq_city ? ` headquartered in ${company.hq_city}` : ''}${company.founded_year ? `, founded in ${company.founded_year}` : ''}. ${
                      company.funding?.total_funding ? `They have raised ${fmt(company.funding.total_funding)} in total funding. ` : ''
                    }${
                      company.employees_count_inferred ? `Current inferred headcount stands at ${fmtN(company.employees_count_inferred)} employees. ` : ''
                    }${
                      company.employee_attrition_rate ? `Monthly attrition rate is ${company.employee_attrition_rate.toFixed(1)}%. ` : ''
                    }`
                  : 'No AI summary available for this company.'}
              </p>
            </Card>
            {company.followers_count_professional_network ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <MetricTile
                  label="LinkedIn followers"
                  value={fmtN(company.followers_count_professional_network)}
                  hint="professional network"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PrivateCompaniesPage() {
  const [results, setResults] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async (q: string, filters: any) => {
    setLoading(true)
    setError(null)
    setSelected(null)
    setSearched(true)
    try {
      const res = await fetch('/api/coresignal?action=search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, filters }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const hits: Company[] = (data.hits?.hits || []).map((h: any) => h._source || h)
      setResults(hits)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSelectById = useCallback(async (id: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/coresignal?action=collect&id=${id}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSelected(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  if (selected) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <CompanyDetail company={selected} onBack={() => setSelected(null)} />
      </div>
    )
  }

  const Building2 = NAV_ICONS.discovery
  const Telescope = ACTION_ICONS.telescope
  const Warn = ACTION_ICONS.warn

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <PageHero
          eyebrow={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Building2 width={11} height={11} strokeWidth={ICON_STROKE} />
              Private Markets · 60M+ companies
            </span>
          }
          title="Find any private company in seconds."
          accentWord="private company"
          subtitle="Firmographics, headcount, funding, and hiring signals across 60M+ private companies — powered by CoreSignal."
          actions={
            <Badge tone="blue">
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
                display: 'inline-block', marginRight: 4,
                animation: 'pulse 1.6s ease-in-out infinite',
              }} />
              CoreSignal · Live
            </Badge>
          }
        />
      </div>

      <div style={{ padding: '0 1.75rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
        <ContextualAskBar
          context="Private Companies"
          contextData={{ page: 'private', resultsCount: results.length }}
          chips={[
            { label: 'AI infra startups',   prompt: 'Find AI infrastructure private companies that have grown headcount more than 30% in the last 12 months.' },
            { label: 'Late-stage fintech',  prompt: 'Surface late-stage private fintech companies in the EU that have raised in the last 18 months.' },
            { label: 'Hiring momentum',     prompt: 'Which private companies on my radar are accelerating hiring fastest right now?' },
            { label: 'Quiet attrition',     prompt: 'Find private companies with rising attrition rates — flag potential headwinds before they hit news.' },
          ]}
          placeholder="Ask Finsyt about private-company landscape, peers, or hiring signals…"
          style={{ margin: '0 0 18px' }}
        />

        <div style={{ marginBottom: 18 }}>
          <SearchToolbar onSearch={handleSearch} loading={loading} />
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 14px', borderRadius: 10,
            background: 'var(--neg-dim)', border: '1px solid var(--neg-dim)',
            marginBottom: 14,
          }}>
            <Warn width={16} height={16} strokeWidth={ICON_STROKE} color="var(--neg)" />
            <span style={{ color: 'var(--neg)', fontSize: 13, fontWeight: 600 }}>{error}</span>
          </div>
        )}

        {!searched && !loading && (
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '40px 24px',
          }}>
            <EmptyState
              icon={<Telescope width={28} height={28} strokeWidth={ICON_STROKE} />}
              title="Search 60M+ private companies"
              hint="Headcount trends · funding rounds · hiring signals · attrition rates"
              action={
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {QUICK_PICKS.map(name => (
                    <Button key={name} variant="ghost" size="sm" onClick={() => handleSearch(name, {})}>
                      {name}
                    </Button>
                  ))}
                </div>
              }
            />
          </div>
        )}

        {loading && <LoadingResults />}

        {!loading && searched && results.length === 0 && !error && (
          <EmptyState
            icon={<ACTION_ICONS.search width={28} height={28} strokeWidth={ICON_STROKE} />}
            title="No companies matched"
            hint="Try a different name or loosen the filters."
          />
        )}

        {!loading && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
            }}>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </div>
            {results.map(c => (
              <DiscoveryCard key={c.id} c={c} onClick={() => handleSelectById(c.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
