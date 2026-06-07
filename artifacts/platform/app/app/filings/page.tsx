'use client'
import { useState } from 'react'
import { Card, Button, Badge, Input, EmptyState, Skeleton, ContextualAskBar, InlineAgentMenu } from '@/components/ui'

interface Filing {
  form:           string
  date:           string
  accessionNumber: string
  docUrl?:        string
  description?:   string
  size?:          string
}

type FormTone = 'blue'|'green'|'amber'|'violet'|'red'|'gray'
const FORM_TONES: Record<string, FormTone> = {
  '10-K':'blue', '10-Q':'blue', '8-K':'amber', 'DEF 14A':'violet',
  '4':'green', 'S-1':'red', 'SC 13G':'gray', 'SC 13D':'gray',
}

const FORM_DESCRIPTIONS: Record<string, string> = {
  '10-K':    'Annual Report — full year financial statements and business overview',
  '10-Q':    'Quarterly Report — financial statements for the quarter',
  '8-K':     'Current Report — material events and press releases',
  'DEF 14A': 'Proxy Statement — shareholder meeting and executive compensation',
  '4':       'Insider Transaction — form 4 insider buy/sell activity',
  'S-1':     'IPO Registration — initial public offering filing',
  'SC 13G':  'Beneficial Ownership — 5%+ passive shareholder report',
  'SC 13D':  'Beneficial Ownership — 5%+ active shareholder report',
}

const FORM_FILTERS = ['All','10-K','10-Q','8-K','DEF 14A','4','S-1']
const POPULAR = ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','JPM','BRK.B','XOM']

export default function FilingsPage() {
  const [symbol, setSymbol]       = useState('')
  const [inputVal, setInputVal]   = useState('')
  const [filings, setFilings]     = useState<Filing[]>([])
  const [company, setCompany]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [formFilter, setFormFilter] = useState('All')
  const [sortDir, setSortDir]     = useState<-1|1>(-1)
  const [error, setError]         = useState('')

  async function fetchFilings(sym: string) {
    if (!sym) return
    setLoading(true)
    setError('')
    setFilings([])
    try {
      const res  = await fetch(`/api/filings?symbol=${sym.toUpperCase()}`)
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      setFilings(data.filings || [])
      setCompany(data.company || sym.toUpperCase())
      setSymbol(sym.toUpperCase())
    } catch (e) { setError('Failed to fetch filings') }
    setLoading(false)
  }

  function handleSearch() {
    if (!inputVal.trim()) return
    fetchFilings(inputVal.trim())
  }

  const filtered = filings
    .filter(f => formFilter === 'All' || f.form.startsWith(formFilter))
    .sort((a, b) => sortDir === -1 ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))

  const formStats = FORM_FILTERS.slice(1).reduce((acc, form) => {
    acc[form] = filings.filter(f => f.form.startsWith(form)).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="page-content">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">SEC Filings</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Direct EDGAR access · 10-K · 10-Q · 8-K · insider trades · proxy</p>
        </div>
        {company && (
          <Badge tone="blue" style={{padding:'6px 14px',fontSize:12}}>
            <strong style={{marginRight:6}}>{symbol}</strong>
            <span style={{color:'var(--text-secondary)',fontWeight:500}}>{company}</span>
          </Badge>
        )}
      </div>

      <ContextualAskBar
        context="SEC Filings"
        contextData={{ page: 'filings', symbol: symbol || null }}
        chips={[
          { label: 'Material 8-Ks today',  prompt: 'Surface the most material 8-Ks filed in the past 24 hours across my watchlist.' },
          { label: 'Latest 10-K',          prompt: 'Synthesise the most recent 10-K for the company on screen — risks, MD&A surprises, and accounting changes.' },
          { label: 'Insider selling spike',prompt: 'Show me companies with a notable spike in insider selling over the past 30 days.' },
          { label: 'Compare last two 10-Qs', prompt: 'Diff the last two 10-Qs for the company on screen and highlight every material change.' },
        ]}
        placeholder="Ask Finsyt to read or compare filings…"
        style={{ margin: '0 0 16px' }}
      />

      <Card padding={20} style={{ marginBottom:20 }}>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <Input
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Enter ticker (e.g. AAPL)"
            style={{ width:200, textTransform:'uppercase', fontWeight:700 }}
          />
          <Button variant="primary" onClick={handleSearch} disabled={loading || !inputVal.trim()}>
            {loading ? 'Loading…' : 'Fetch Filings'}
          </Button>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {POPULAR.map(t => {
              const active = symbol === t
              return (
                <button key={t} onClick={() => { setInputVal(t); fetchFilings(t) }}
                  style={{ padding:'6px 10px', borderRadius:20, border:'1px solid var(--border)',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    fontSize:11, fontWeight:700, cursor:'pointer', transition:'all 0.1s' }}>
                  {t}
                </button>
              )
            })}
          </div>
        </div>
        {error && <div style={{ marginTop:10, fontSize:13, color:'var(--neg)', fontWeight:600 }}>⚠ {error}</div>}
      </Card>

      {filings.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:10, marginBottom:20 }}>
          <Card padding="14px 16px" onClick={() => setFormFilter('All')}
            style={{ cursor:'pointer', border: formFilter==='All' ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', marginBottom:4 }}>All Types</div>
            <div style={{ fontWeight:900, fontSize:'1.5rem', color:'var(--text-primary)', letterSpacing:'-0.02em' }}>{filings.length}</div>
          </Card>
          {FORM_FILTERS.slice(1).filter(f => formStats[f] > 0).map(form => {
            const tone = FORM_TONES[form] || 'gray'
            const active = formFilter === form
            return (
              <Card key={form} padding="14px 16px" onClick={() => setFormFilter(form)}
                style={{ cursor:'pointer', border: active ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
                <Badge tone={tone} style={{marginBottom:6}}>{form}</Badge>
                <div style={{ fontWeight:900, fontSize:'1.5rem', color:'var(--text-primary)', letterSpacing:'-0.02em' }}>{formStats[form]}</div>
              </Card>
            )
          })}
        </div>
      )}

      {loading ? (
        <Card padding={0} style={{ overflow:'hidden' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', gap:16, alignItems:'center' }}>
              <Skeleton width={60} height={24} radius={12}/>
              <Skeleton width="60%" height={14}/>
              <Skeleton width={80} height={14}/>
            </div>
          ))}
        </Card>
      ) : filtered.length > 0 ? (
        <Card padding={0} style={{ overflow:'hidden' }}>
          {/* Sort bar */}
          <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--text-secondary)' }}>{filtered.length} filings</span>
            <Button variant="secondary" size="sm" onClick={() => setSortDir(d => d === -1 ? 1 : -1)}>
              Date {sortDir === -1 ? '↓ Newest' : '↑ Oldest'}
            </Button>
          </div>
          <div>
            {filtered.map((f, i) => {
              const tone = FORM_TONES[f.form] || 'gray'
              const desc = FORM_DESCRIPTIONS[f.form] || f.description || ''
              return (
                <div key={i} style={{ padding:'14px 20px', borderBottom: i < filtered.length-1 ? '1px solid var(--border)' : 'none', display:'flex', alignItems:'center', gap:14, transition:'background 0.1s' }}>
                  {/* Form badge */}
                  <Badge tone={tone} style={{minWidth:64,justifyContent:'center'}}>{f.form}</Badge>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:'#0A1628', marginBottom:2 }}>
                      {symbol} — {f.form}
                      {desc && <span style={{ fontWeight:400, color:'#7D8FA9', marginLeft:8, fontSize:12 }}>{desc}</span>}
                    </div>
                    <div style={{ fontSize:11, color:'#B0BCD0', fontFamily:'monospace' }}>{f.accessionNumber}</div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text-secondary)', flexShrink:0 }}>{f.date}</div>
                  <InlineAgentMenu
                    subject={`${f.form} · ${symbol}`}
                    variant="icon"
                    align="right"
                    contextData={{ page:'filings', symbol, form:f.form, date:f.date, accessionNumber:f.accessionNumber, description:desc, docUrl:f.docUrl }}
                    actions={[
                      { label:`Summarise this ${f.form}`,        prompt:`Summarise the key takeaways from this ${f.form} filed by ${symbol} on ${f.date}. Focus on what changed since the previous filing.` },
                      { label:`Pull MD&A highlights`,            prompt:`From this ${f.form} (${symbol}, ${f.date}), pull the management commentary and highlight the strongest forward-looking statements.` },
                      { label:`Risk factor diff vs prior`,       prompt:`Compare the risk factors in this ${f.form} (${symbol}) to the prior filing and tell me what was added, removed, or rephrased.` },
                      { label:`Quote 3 key passages`,            prompt:`Quote the three most material passages from this ${symbol} ${f.form} verbatim and explain why each matters.` },
                    ]}
                  />
                  {f.docUrl && (
                    <a href={f.docUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="btn btn-outline btn-sm" style={{flexShrink:0}}>
                      View on SEC →
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ) : !loading && symbol ? (
        <Card padding={0}>
          <EmptyState icon="▣" title={`No filings found for ${symbol}`} hint="Try a different ticker or form type filter"/>
        </Card>
      ) : !loading && (
        <Card padding={0}>
          <EmptyState
            icon="▣"
            title="Search SEC Filings"
            hint="Enter a ticker above to retrieve all SEC filings from EDGAR — 10-Ks, 10-Qs, 8-Ks, insider transactions, proxy statements and more."
          />
        </Card>
      )}
    </div>
  )
}
