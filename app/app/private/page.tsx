'use client'
import { useState, useCallback } from 'react'
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

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
  '1-10':'Seed-stage', '11-50':'Early', '51-200':'Growing',
  '201-500':'Scale-up', '501-1000':'Mid-market', '1001-5000':'Growth',
  '5001-10000':'Large', '10001+':'Enterprise',
}

function fmt(n?: number) {
  if (!n) return '—'
  if (n >= 1e9) return `$${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n/1e6).toFixed(0)}M`
  if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`
  return `$${n}`
}

function fmtN(n?: number) {
  if (!n) return '—'
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`
  return `${n}`
}

// ── Search bar ────────────────────────────────────────────────────────────────
function SearchBar({ onSearch, loading }: { onSearch: (q: string, filters: any) => void; loading: boolean }) {
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [size, setSize] = useState('')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && q.trim() && onSearch(q, { hq_country: country, industry, size_range: size })}
          placeholder="Search any private company — e.g. Stripe, Databricks, Klarna…"
          className="flex-1 bg-[#0d1b32] border border-blue-500/20 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-blue-500/50"
        />
        <button
          onClick={() => q.trim() && onSearch(q, { hq_country: country, industry, size_range: size })}
          disabled={loading || !q.trim()}
          className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all"
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'Country (ISO2)', key: 'country', value: country, set: setCountry, placeholder: 'US, GB, DE…' },
          { label: 'Industry',      key: 'industry', value: industry, set: setIndustry, placeholder: 'Software, Fintech…' },
        ].map(f => (
          <input key={f.key} value={f.value} onChange={e => f.set(e.target.value)}
            placeholder={f.placeholder}
            className="bg-[#0d1b32] border border-blue-500/15 rounded-lg px-3 py-2 text-white/80 placeholder-white/25 text-xs w-36 focus:outline-none focus:border-blue-500/40"
          />
        ))}
        <select value={size} onChange={e => setSize(e.target.value)}
          className="bg-[#0d1b32] border border-blue-500/15 rounded-lg px-3 py-2 text-white/60 text-xs focus:outline-none focus:border-blue-500/40">
          <option value="">Any size</option>
          {Object.entries(SIZE_LABELS).map(([k, v]) => <option key={k} value={k}>{k} employees</option>)}
        </select>
      </div>
    </div>
  )
}

// ── Company card (search result) ──────────────────────────────────────────────
function CompanyCard({ c, onClick }: { c: Company; onClick: () => void }) {
  const hc = c.employees_count_inferred
  return (
    <button onClick={onClick}
      className="w-full text-left bg-[#0d1b32] hover:bg-[#111f38] border border-blue-500/15 hover:border-blue-500/35 rounded-xl p-4 transition-all">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600/30 to-cyan-600/30 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {c.company_logo_url
            ? <img src={c.company_logo_url} alt="" className="w-full h-full object-contain rounded-lg" />
            : (c.company_name?.[0] || '?')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold text-sm">{c.company_name}</span>
            {c.founded_year && <span className="text-white/30 text-xs">est. {c.founded_year}</span>}
            {c.ownership_status && <span className="px-2 py-0.5 bg-blue-500/10 text-blue-300 text-xs rounded-full">{c.ownership_status}</span>}
          </div>
          <div className="text-white/40 text-xs mt-0.5">{[c.industry, c.hq_city, c.hq_country].filter(Boolean).join(' · ')}</div>
          {(c.description_enriched || c.description) && (
            <p className="text-white/50 text-xs mt-1.5 line-clamp-2">{c.description_enriched || c.description}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          {hc && <div className="text-white text-sm font-semibold">{fmtN(hc)}</div>}
          {hc && <div className="text-white/30 text-xs">employees</div>}
          {c.size_range && !hc && <div className="text-white/40 text-xs">{c.size_range}</div>}
        </div>
      </div>
    </button>
  )
}

// ── Headcount chart ───────────────────────────────────────────────────────────
function HeadcountChart({ history }: { history: { date: string; employees_count_inferred: number }[] }) {
  if (!history?.length) return <div className="text-white/30 text-sm py-8 text-center">No headcount history available</div>
  const data = history.slice(-24).map(d => ({ date: d.date?.slice(0, 7), hc: d.employees_count_inferred }))
  const max = Math.max(...data.map(d => d.hc))
  const min = Math.min(...data.map(d => d.hc))
  const growth = data.length > 1 ? (((data[data.length-1].hc - data[0].hc) / data[0].hc) * 100).toFixed(1) : null

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div>
          <div className="text-white text-2xl font-bold">{fmtN(data[data.length-1]?.hc)}</div>
          <div className="text-white/40 text-xs">Inferred headcount</div>
        </div>
        {growth && (
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${parseFloat(growth) >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
            {parseFloat(growth) >= 0 ? '+' : ''}{growth}% (24mo)
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="hcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1B4FFF" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#1B4FFF" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1B2E4A" />
          <XAxis dataKey="date" tick={{ fill: '#5A6B82', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#5A6B82', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmtN(v)} />
          <Tooltip contentStyle={{ background: '#0d1b32', border: '1px solid #1B4FFF33', borderRadius: 8, color: '#E2E8F0', fontSize: 12 }} formatter={(v: any) => [fmtN(v), 'Employees']} />
          <Area type="monotone" dataKey="hc" stroke="#1B4FFF" strokeWidth={2} fill="url(#hcGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Funding timeline ──────────────────────────────────────────────────────────
function FundingTimeline({ funding }: { funding?: Company['funding'] }) {
  if (!funding) return <div className="text-white/30 text-sm py-4">No funding data available</div>
  const rounds = funding.funding_rounds || []
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-6 mb-2">
        <div><div className="text-white font-bold text-xl">{fmt(funding.total_funding)}</div><div className="text-white/40 text-xs">Total raised</div></div>
        {funding.last_funding_type && <div><div className="text-white font-bold text-xl">{funding.last_funding_type}</div><div className="text-white/40 text-xs">Last round</div></div>}
        {funding.last_funding_amount && <div><div className="text-white font-bold text-xl">{fmt(funding.last_funding_amount)}</div><div className="text-white/40 text-xs">Last amount</div></div>}
      </div>
      {rounds.length > 0 && (
        <div className="flex flex-col gap-2">
          {rounds.slice(0, 6).map((r, i) => (
            <div key={i} className="flex items-center gap-3 bg-[#0a1525] rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              <div className="text-white/40 text-xs w-20">{r.announced_date?.slice(0,7)}</div>
              <div className="text-blue-300 text-xs font-semibold w-24">{r.funding_type}</div>
              <div className="text-white text-xs font-bold">{fmt(r.money_raised)}</div>
              {r.investors?.length > 0 && <div className="text-white/40 text-xs truncate">{r.investors.slice(0,3).join(', ')}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Company detail panel ──────────────────────────────────────────────────────
function CompanyDetail({ company, onBack }: { company: Company; onBack: () => void }) {
  const [tab, setTab] = useState<'overview'|'headcount'|'funding'|'intelligence'>('overview')
  const desc = company.description_enriched || company.description || ''

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-blue-500/10 flex items-center gap-3">
        <button onClick={onBack} className="text-white/40 hover:text-white/80 transition-colors text-sm">← Back</button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600/30 to-cyan-600/30 flex items-center justify-center text-white font-bold text-sm">
          {company.company_logo_url
            ? <img src={company.company_logo_url} alt="" className="w-full h-full object-contain rounded-lg" />
            : (company.company_name?.[0] || '?')}
        </div>
        <div>
          <h2 className="text-white font-bold text-base leading-none">{company.company_name}</h2>
          <div className="text-white/40 text-xs mt-0.5">{[company.industry, company.hq_city, company.hq_country].filter(Boolean).join(' · ')}</div>
        </div>
        {company.ownership_status && (
          <span className="ml-auto px-2.5 py-1 bg-blue-500/10 text-blue-300 text-xs rounded-full font-medium">{company.ownership_status}</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 pb-0 border-b border-blue-500/10">
        {(['overview','headcount','funding','intelligence'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-all capitalize ${tab === t ? 'bg-blue-500/20 text-blue-300 border-b-2 border-blue-500' : 'text-white/40 hover:text-white/70'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Overview */}
        {tab === 'overview' && (
          <div className="flex flex-col gap-6">
            {desc && <p className="text-white/70 text-sm leading-relaxed">{desc}</p>}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Founded',    value: company.founded_year },
                { label: 'HQ',         value: [company.hq_city, company.hq_country].filter(Boolean).join(', ') },
                { label: 'Size',       value: company.size_range ? `${company.size_range} employees` : undefined },
                { label: 'Headcount',  value: company.employees_count_inferred ? fmtN(company.employees_count_inferred) : undefined },
                { label: 'Attrition', value: company.employee_attrition_rate ? `${company.employee_attrition_rate?.toFixed(1)}%` : undefined },
                { label: 'Website',    value: company.website },
                { label: 'Total Raised', value: company.funding?.total_funding ? fmt(company.funding.total_funding) : undefined },
                { label: 'Last Round', value: company.funding?.last_funding_type },
              ].filter(m => m.value).map(m => (
                <div key={m.label} className="bg-[#0a1525] rounded-xl px-4 py-3">
                  <div className="text-white/40 text-xs mb-1">{m.label}</div>
                  <div className="text-white text-sm font-semibold truncate">{m.value}</div>
                </div>
              ))}
            </div>
            {company.categories_and_keywords?.length ? (
              <div>
                <div className="text-white/40 text-xs mb-2">Categories & Keywords</div>
                <div className="flex flex-wrap gap-1.5">
                  {company.categories_and_keywords.slice(0,20).map(k => (
                    <span key={k} className="px-2 py-0.5 bg-blue-500/10 text-blue-300/80 text-xs rounded-full">{k}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {company.competitors?.length ? (
              <div>
                <div className="text-white/40 text-xs mb-2">Known Competitors</div>
                <div className="flex flex-wrap gap-2">
                  {company.competitors.slice(0,8).map(c => (
                    <span key={c.name} className="px-2.5 py-1 bg-[#0a1525] border border-blue-500/15 text-white/60 text-xs rounded-lg">{c.name}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Headcount */}
        {tab === 'headcount' && (
          <div className="flex flex-col gap-4">
            <HeadcountChart history={company.employees_count_inferred_by_month || []} />
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Current headcount', value: company.employees_count_inferred ? fmtN(company.employees_count_inferred) : '—' },
                { label: 'Attrition rate',    value: company.employee_attrition_rate ? `${company.employee_attrition_rate.toFixed(1)}%` : '—' },
                { label: 'Monthly departures',value: company.departures_count ? fmtN(company.departures_count) : '—' },
              ].map(m => (
                <div key={m.label} className="bg-[#0a1525] rounded-xl px-4 py-3 text-center">
                  <div className="text-white/40 text-xs mb-1">{m.label}</div>
                  <div className="text-white text-lg font-bold">{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Funding */}
        {tab === 'funding' && <FundingTimeline funding={company.funding} />}

        {/* Intelligence */}
        {tab === 'intelligence' && (
          <div className="flex flex-col gap-4">
            <div className="bg-[#0a1525] rounded-xl p-4 border border-blue-500/10">
              <div className="text-blue-300 text-xs font-bold mb-2">⚡ AI Signal Summary</div>
              <p className="text-white/70 text-sm leading-relaxed">
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
            </div>
            {company.followers_count_professional_network ? (
              <div className="bg-[#0a1525] rounded-xl p-4">
                <div className="text-white/40 text-xs mb-1">LinkedIn followers</div>
                <div className="text-white font-bold text-xl">{fmtN(company.followers_count_professional_network)}</div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
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
      // CoreSignal returns hits array
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

  return (
    <div className="flex flex-col h-screen bg-[#060e1e] text-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-blue-500/10 flex items-center gap-3 flex-shrink-0">
        <div>
          <h1 className="text-white font-semibold text-base">Private Companies</h1>
          <p className="text-white/30 text-xs">Firmographics · headcount · funding · hiring signals — powered by CoreSignal</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 rounded-full">
          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
          <span className="text-blue-300 text-xs font-medium">CoreSignal</span>
        </div>
      </div>

      {selected ? (
        <CompanyDetail company={selected} onBack={() => setSelected(null)} />
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <SearchBar onSearch={handleSearch} loading={loading} />

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
          )}

          {!searched && !loading && (
            <div className="mt-12 text-center">
              <div className="text-5xl mb-4">🏢</div>
              <div className="text-white/40 text-sm mb-2">Search 60M+ private companies</div>
              <div className="text-white/20 text-xs">Headcount trends · Funding rounds · Hiring signals · Attrition rates</div>
              <div className="flex flex-wrap gap-2 justify-center mt-6">
                {['Stripe', 'Databricks', 'Klarna', 'Revolut', 'OpenAI', 'Anduril'].map(name => (
                  <button key={name} onClick={() => handleSearch(name, {})}
                    className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 text-xs rounded-full transition-all">
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-12 text-center text-white/40 text-sm">Searching CoreSignal…</div>
          )}

          {!loading && searched && results.length === 0 && !error && (
            <div className="mt-8 text-center text-white/30 text-sm">No results found. Try a different name or filters.</div>
          )}

          {!loading && results.length > 0 && (
            <div className="flex flex-col gap-2 mt-5">
              <div className="text-white/30 text-xs mb-1">{results.length} result{results.length !== 1 ? 's' : ''}</div>
              {results.map(c => (
                <CompanyCard key={c.id} c={c} onClick={() => handleSelectById(c.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
