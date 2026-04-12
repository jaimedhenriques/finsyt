'use client'
import { useState, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
type Company = {
  id: number
  name: string
  industry?: string
  country?: string
  country_iso2?: string
  city?: string
  size_range?: string
  headcount?: number
  founded?: string
  ownership?: string
  website?: string
  description?: string
  total_funding?: number
  last_funding_type?: string
  last_funding_date?: string
  logo_url?: string
  keywords?: string[]
  score?: number
}

type SearchResult = {
  hits: Company[]
  total: number
  explanation: string
  dsl: object
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n?: number) => {
  if (!n) return '—'
  if (n >= 1e9) return `$${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n/1e6).toFixed(0)}M`
  if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`
  return `$${n}`
}

const fmtN = (n?: number) => {
  if (!n) return null
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`
  return `${n}`
}

const FUNDING_COLORS: Record<string, string> = {
  'Seed': 'bg-emerald-500/15 text-emerald-400',
  'Angel': 'bg-yellow-500/15 text-yellow-400',
  'Series A': 'bg-blue-500/15 text-blue-400',
  'Series B': 'bg-blue-600/15 text-blue-300',
  'Series C': 'bg-purple-500/15 text-purple-400',
  'Series D': 'bg-purple-600/15 text-purple-300',
  'Late Stage VC': 'bg-indigo-500/15 text-indigo-400',
  'Growth Equity': 'bg-cyan-500/15 text-cyan-400',
  'Private Equity': 'bg-orange-500/15 text-orange-400',
}

const EXAMPLE_PROMPTS = [
  'Find AI infrastructure startups in the US that raised Series B or later with 50-500 employees',
  'Show European fintech companies founded after 2018 with between 11-200 employees',
  'Early-stage climate tech startups in Germany or Netherlands with seed or angel funding',
  'B2B SaaS companies in London with 51-500 employees and Series A funding',
  'Private cybersecurity companies in Israel with more than 200 employees',
  'Find healthtech startups in NYC with Series A funding raised in 2022 or 2023',
]

// ── Company row ───────────────────────────────────────────────────────────────
function CompanyRow({ c, idx }: { c: Company; idx: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-blue-500/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left bg-[#0a1525] hover:bg-[#0d1b32] transition-colors px-4 py-3 flex items-center gap-3"
      >
        <span className="text-white/20 text-xs w-5 flex-shrink-0">{idx + 1}</span>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600/25 to-cyan-600/25 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
          {c.logo_url
            ? <img src={c.logo_url} alt="" className="w-full h-full object-contain rounded-lg" />
            : (c.name?.[0] || '?')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold text-sm">{c.name}</span>
            {c.last_funding_type && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FUNDING_COLORS[c.last_funding_type] || 'bg-gray-500/15 text-gray-400'}`}>
                {c.last_funding_type}
              </span>
            )}
            {c.ownership && c.ownership !== 'Private' && (
              <span className="px-2 py-0.5 bg-white/5 text-white/40 text-xs rounded-full">{c.ownership}</span>
            )}
          </div>
          <div className="text-white/40 text-xs mt-0.5">
            {[c.industry, c.city || c.country, c.founded ? `est. ${c.founded}` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0 ml-2">
          {c.headcount && (
            <div className="text-right hidden sm:block">
              <div className="text-white text-sm font-bold">{fmtN(c.headcount)}</div>
              <div className="text-white/30 text-xs">employees</div>
            </div>
          )}
          {c.total_funding && (
            <div className="text-right hidden sm:block">
              <div className="text-emerald-400 text-sm font-bold">{fmt(c.total_funding)}</div>
              <div className="text-white/30 text-xs">raised</div>
            </div>
          )}
          <svg className={`w-4 h-4 text-white/30 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="bg-[#060e1e] px-4 py-4 border-t border-blue-500/10">
          <div className="flex flex-wrap gap-4 mb-3">
            {[
              { label: 'Size', value: c.size_range ? `${c.size_range} employees` : null },
              { label: 'Headcount', value: c.headcount ? fmtN(c.headcount) : null },
              { label: 'Total raised', value: c.total_funding ? fmt(c.total_funding) : null },
              { label: 'Last round', value: c.last_funding_type },
              { label: 'Round date', value: c.last_funding_date?.slice(0, 7) },
              { label: 'Website', value: c.website },
              { label: 'Country', value: c.country },
            ].filter(m => m.value).map(m => (
              <div key={m.label} className="bg-[#0a1525] rounded-lg px-3 py-2">
                <div className="text-white/30 text-xs">{m.label}</div>
                <div className="text-white text-xs font-semibold mt-0.5">
                  {m.label === 'Website' && c.website
                    ? <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">{c.website}</a>
                    : m.value}
                </div>
              </div>
            ))}
          </div>
          {c.description && (
            <p className="text-white/50 text-xs leading-relaxed mb-3">{c.description}</p>
          )}
          {c.keywords?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {c.keywords.map(k => (
                <span key={k} className="px-2 py-0.5 bg-blue-500/8 text-blue-300/60 text-xs rounded-full border border-blue-500/10">{k}</span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ── DSL inspector ─────────────────────────────────────────────────────────────
function DslInspector({ dsl }: { dsl: object }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-white/25 hover:text-white/50 text-xs transition-colors">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
        {open ? 'Hide' : 'View'} generated query
      </button>
      {open && (
        <pre className="mt-2 bg-[#060e1e] border border-blue-500/10 rounded-lg p-3 text-xs text-blue-300/60 overflow-x-auto">
          {JSON.stringify(dsl, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ── Export to CSV ─────────────────────────────────────────────────────────────
function exportCsv(companies: Company[]) {
  const headers = ['Name','Industry','Country','City','Size','Headcount','Total Funding','Last Round','Founded','Website']
  const rows = companies.map(c => [
    c.name, c.industry, c.country, c.city, c.size_range, c.headcount,
    c.total_funding, c.last_funding_type, c.founded, c.website
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'finsyt-discovery.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DiscoveryPage() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const runSearch = async (q?: string) => {
    const searchPrompt = q ?? prompt
    if (!searchPrompt.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/company-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: searchPrompt }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const useExample = (ex: string) => {
    setPrompt(ex)
    runSearch(ex)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-screen bg-[#060e1e] text-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-blue-500/10 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white font-semibold text-base">Company Discovery</h1>
            <p className="text-white/30 text-xs mt-0.5">Plain-English search across 75M+ companies · powered by CoreSignal + AI</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 rounded-full">
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
            <span className="text-blue-300 text-xs font-medium">AI-powered</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {/* Search box */}
          <div className="bg-[#0a1525] border border-blue-500/20 rounded-2xl p-4 mb-6">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch() } }}
              placeholder="Describe the companies you're looking for in plain English…&#10;e.g. Find Series B AI startups in the US with 50-200 employees"
              rows={3}
              className="w-full bg-transparent text-white placeholder-white/25 text-sm resize-none focus:outline-none leading-relaxed"
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-blue-500/10">
              <span className="text-white/20 text-xs">Press Enter to search · Shift+Enter for new line</span>
              <button
                onClick={() => runSearch()}
                disabled={loading || !prompt.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Searching…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    Discover
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Example prompts */}
          {!result && !loading && !error && (
            <div>
              <div className="text-white/30 text-xs mb-3">Try an example</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXAMPLE_PROMPTS.map(ex => (
                  <button key={ex} onClick={() => useExample(ex)}
                    className="text-left px-4 py-3 bg-[#0a1525] hover:bg-[#0d1b32] border border-blue-500/10 hover:border-blue-500/25 rounded-xl text-white/50 hover:text-white/80 text-xs leading-relaxed transition-all">
                    "{ex}"
                  </button>
                ))}
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3">
                {[
                  { icon: '🏢', label: '75M+', sub: 'company profiles' },
                  { icon: '🌍', label: '190+', sub: 'countries covered' },
                  { icon: '⚡', label: 'Real-time', sub: 'data via CoreSignal' },
                ].map(s => (
                  <div key={s.label} className="bg-[#0a1525] rounded-xl p-4 text-center border border-blue-500/8">
                    <div className="text-2xl mb-1">{s.icon}</div>
                    <div className="text-white font-bold text-sm">{s.label}</div>
                    <div className="text-white/30 text-xs">{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="text-center py-12">
              <div className="text-white/30 text-sm mb-2">Translating your query with AI…</div>
              <div className="text-white/15 text-xs">Searching CoreSignal's 75M+ company database</div>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <div>
              {/* Result meta */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-white font-semibold text-sm">{result.hits.length} companies found</div>
                  <div className="text-white/40 text-xs mt-0.5">"{result.explanation}"</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => exportCsv(result.hits)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Export CSV
                  </button>
                  <button onClick={() => setResult(null)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/40 text-xs rounded-lg transition-all">
                    New search
                  </button>
                </div>
              </div>

              {/* Company list */}
              {result.hits.length === 0 ? (
                <div className="text-center py-8 text-white/30 text-sm">
                  No companies matched. Try broadening your search.
                </div>
              ) : (
                <div className="flex flex-col gap-2 mb-4">
                  {result.hits.map((c, i) => (
                    <CompanyRow key={c.id || i} c={c} idx={i} />
                  ))}
                </div>
              )}

              {/* DSL inspector */}
              <DslInspector dsl={result.dsl} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
