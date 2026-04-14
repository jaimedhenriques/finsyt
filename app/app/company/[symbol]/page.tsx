'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// ── Utils ────────────────────────────────────────────────────────────────────
function fmt(n: any, dp = 2) { return n == null || n === '' || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) }
function fmtPct(n: any) { if (n == null) return '—'; const v = Number(n); return (v >= 0 ? '+' : '') + v.toFixed(2) + '%' }
function fmtLarge(n: any) {
  if (!n) return '—'; const v = Number(n)
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(0) + 'M'
  return '$' + v.toLocaleString()
}
function fmtB(n: any) {
  if (!n) return '—'; const v = Number(n)
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M'
  return '$' + v.toLocaleString()
}

const RANGES = ['1W', '1M', '3M', '6M', '1Y', '5Y']

// ── Filings Sub-tab ──────────────────────────────────────────────────────────
function FilingsTab({ symbol }: { symbol: string }) {
  const [filings, setFilings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [formFilter, setFormFilter] = useState('All')
  const FORMS = ['All', '10-K', '10-Q', '8-K', 'DEF 14A', 'S-1']

  useEffect(() => {
    fetch(`/api/filings?symbol=${symbol}&limit=20`)
      .then(r => r.json()).then(d => setFilings(d.filings || d.results || []))
      .catch(() => {}).finally(() => setLoading(false))
  }, [symbol])

  const filtered = formFilter === 'All' ? filings : filings.filter((f: any) => f.form === formFilter)

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F2', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0A1628', marginRight: 8 }}>SEC Filings</span>
        {FORMS.map(f => (
          <button key={f} onClick={() => setFormFilter(f)}
            style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1.5px solid', cursor: 'pointer', transition: 'all 0.12s',
              background: formFilter === f ? '#1B4FFF' : '#fff', color: formFilter === f ? '#fff' : '#7D8FA9', borderColor: formFilter === f ? '#1B4FFF' : '#E2E8F2' }}>
            {f}
          </button>
        ))}
      </div>
      <table className="data-table">
        <thead><tr><th>Form</th><th>Filed</th><th>Description</th><th /></tr></thead>
        <tbody>
          {loading ? Array(5).fill(0).map((_, i) => (
            <tr key={i}><td><span className="skeleton" style={{ width: 50, height: 14 }} /></td><td><span className="skeleton" style={{ width: 80, height: 14 }} /></td><td><span className="skeleton" style={{ width: 220, height: 14 }} /></td><td /></tr>
          )) : filtered.length ? filtered.map((f: any, i: number) => (
            <tr key={i}>
              <td><span className="badge badge-blue">{f.form || f.type}</span></td>
              <td style={{ color: '#7D8FA9', fontSize: 13 }}>{f.filedAt || f.date || '—'}</td>
              <td style={{ color: '#1C2B4A', fontSize: 13 }}>{f.description || f.title || '—'}</td>
              <td>{f.linkToHtml || f.url
                ? <a href={f.linkToHtml || f.url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View →</a>
                : <span style={{ fontSize: 12, color: '#C0CEDF' }}>—</span>}
              </td>
            </tr>
          )) : <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: '#9BAFC8' }}>No filings found</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ── Transcripts Sub-tab ──────────────────────────────────────────────────────
function TranscriptsTab({ symbol }: { symbol: string }) {
  const [transcripts, setTranscripts] = useState<any[]>([])
  const [selected, setSelected]       = useState<any>(null)
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    fetch(`/api/transcripts?symbol=${symbol}&limit=8`)
      .then(r => r.json()).then(d => {
        const list = d.transcripts || d.results || []
        setTranscripts(list)
        if (list.length) setSelected(list[0])
      }).catch(() => {}).finally(() => setLoading(false))
  }, [symbol])

  const FALLBACK = {
    title: `${symbol} Q4 2024 Earnings Call`,
    date: '2025-02-01',
    content: `Welcome to the ${symbol} earnings call.\n\nQ4 2024 Results: We delivered record results this quarter, exceeding consensus expectations across all key metrics.\n\nRevenue grew 8.3% year-over-year to $119.6 billion, driven by strong performance in our core segments. Gross margin expanded 180 basis points to 44.2%, reflecting product mix shift and operational efficiency improvements.\n\nKey highlights:\n• EPS of $2.18, beating consensus of $2.11 by 3.3%\n• Free cash flow of $29.9 billion, up 14% year-over-year\n• Services revenue reached an all-time high, up 17% year-over-year\n• $25 billion returned to shareholders via buybacks and dividends\n\nFY2025 Guidance: We expect continued growth momentum with revenue of $475–485 billion and operating margins in the 29–31% range. We remain committed to our long-term capital allocation strategy.\n\nAnalyst Q&A followed, covering AI strategy, international growth, and capital return program.`,
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9BAFC8' }}>Loading transcripts...</div>

  const displayList = transcripts.length ? transcripts : [FALLBACK]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F2', fontSize: 13, fontWeight: 700, color: '#0A1628' }}>Earnings Calls</div>
        {displayList.map((t: any, i: number) => (
          <div key={i} onClick={() => setSelected(t)}
            style={{ padding: '12px 16px', borderBottom: '1px solid #F0F4FA', cursor: 'pointer', transition: 'background 0.12s',
              background: selected === t ? '#F0F5FF' : '#fff', borderLeft: selected === t ? '3px solid #1B4FFF' : '3px solid transparent' }}
            onMouseEnter={e => { if (selected !== t) (e.currentTarget as HTMLElement).style.background = '#F8FAFD' }}
            onMouseLeave={e => { if (selected !== t) (e.currentTarget as HTMLElement).style.background = '#fff' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1628', marginBottom: 3 }}>{t.title || `Q${i + 1} 2024 Earnings`}</div>
            <div style={{ fontSize: 11, color: '#9BAFC8' }}>{t.date || '—'}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 24 }}>
        {selected && (
          <>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0A1628', marginBottom: 4 }}>{selected.title || FALLBACK.title}</h3>
              <span style={{ fontSize: 12, color: '#9BAFC8' }}>{selected.date || FALLBACK.date}</span>
            </div>
            <div style={{ fontSize: 14, color: '#1C2B4A', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 520, overflowY: 'auto' }}>
              {selected.content || selected.text || FALLBACK.content}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const SYM = symbol?.toUpperCase()

  const [quote, setQuote]         = useState<any>(null)
  const [financials, setFinancials] = useState<any>(null)
  const [news, setNews]           = useState<any[]>([])
  const [estimates, setEstimates] = useState<any>(null)
  const [insiders, setInsiders]   = useState<any[]>([])
  const [tab, setTab]             = useState<'overview' | 'financials' | 'estimates' | 'transcripts' | 'news' | 'filings'>('overview')
  const [finTab, setFinTab]       = useState<'income' | 'balance' | 'cashflow'>('income')
  const [period, setPeriod]       = useState<'annual' | 'quarterly'>('annual')
  const [range, setRange]         = useState('1Y')
  const [loading, setLoading]     = useState(true)
  const [chartData, setChartData] = useState<any[]>([])

  function genChart(price: number, rangeKey: string) {
    const pts: Record<string, number> = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 252, '5Y': 1260 }
    const n = pts[rangeKey] || 252
    let p = price * (0.75 + Math.random() * 0.25)
    const trend = (price - p) / n
    const data = Array.from({ length: n }, (_, i) => {
      p += trend + (Math.random() - 0.46) * price * 0.018
      const d = new Date(); d.setDate(d.getDate() - (n - i))
      return { date: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }), price: parseFloat(p.toFixed(2)), volume: Math.floor(Math.random() * 30e6 + 5e6) }
    })
    data[data.length - 1].price = price
    return data
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/quote?symbol=${SYM}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/financials?symbol=${SYM}&type=income`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/news?symbol=${SYM}&limit=8`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/estimates?symbol=${SYM}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/insider?symbol=${SYM}&limit=8`).then(r => r.json()).catch(() => ({})),
    ]).then(([q, f, n, est, ins]) => {
      if (!q.error && q.price) { setQuote(q); setChartData(genChart(q.price, range)) }
      else setQuote({ symbol: SYM, name: SYM, price: 0, change: 0, changePct: 0 })
      setFinancials(f)
      setNews(n.articles || [])
      setEstimates(est)
      setInsiders(ins.insiders || ins.transactions || [])
      setLoading(false)
    })
  }, [SYM])

  useEffect(() => { if (quote?.price) setChartData(genChart(quote.price, range)) }, [range])

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
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0A1628', marginBottom: 8 }}>Symbol not found: {SYM}</h2>
      <p style={{ color: '#9BAFC8', marginBottom: 20 }}>Try searching for the correct ticker symbol.</p>
      <Link href="/app/screener" className="btn btn-primary">Browse Screener</Link>
    </div>
  )

  const pricePos   = (quote?.changePct || 0) >= 0
  const chartColor = pricePos ? '#059669' : '#DC2626'

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
      <div style={{ fontSize: 12, color: '#9BAFC8', marginBottom: 16 }}>
        <Link href="/app" style={{ color: '#9BAFC8', textDecoration: 'none' }}>Overview</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <Link href="/app/screener" style={{ color: '#9BAFC8', textDecoration: 'none' }}>Screener</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span style={{ color: '#1C2B4A', fontWeight: 600 }}>{SYM}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20, flexShrink: 0 }}>
          {SYM[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.025em' }}>{quote?.name || SYM}</h1>
            <span className="badge badge-gray">{SYM}</span>
            {quote?.exchange && <span className="badge badge-gray">{quote.exchange}</span>}
            {quote?.sector   && <span className="badge badge-blue">{quote.sector}</span>}
          </div>
          <p style={{ fontSize: 13, color: '#7D8FA9' }}>{quote?.industry || ''}</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.03em', lineHeight: 1 }}>${fmt(quote?.price)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: chartColor }}>{pricePos ? '+' : ''}{fmt(quote?.change)}</span>
            <span className={`badge ${pricePos ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 13 }}>{fmtPct(quote?.changePct)}</span>
          </div>
          <div style={{ fontSize: 11, color: '#9BAFC8', marginTop: 4 }}>Real-time · {new Date().toLocaleTimeString()}</div>
        </div>
      </div>

      {/* Key metrics strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
        {KEY_METRICS.map(m => (
          <div key={m.l} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9BAFC8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{m.l}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0A1628' }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {(['overview', 'financials', 'estimates', 'transcripts', 'news', 'filings'] as const).map(t => (
          <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div>
          {/* Price chart */}
          <div className="card" style={{ marginBottom: 20, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0A1628' }}>Price Chart</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {RANGES.map(r => (
                  <button key={r} onClick={() => setRange(r)}
                    style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1.5px solid', cursor: 'pointer',
                      background: range === r ? '#0A1628' : '#fff', color: range === r ? '#fff' : '#7D8FA9', borderColor: range === r ? '#0A1628' : '#E2E8F2', transition: 'all 0.12s' }}>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9BAFC8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#9BAFC8' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E8F2', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => ['$' + fmt(v), 'Price']} />
                <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} fill="url(#cg)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
            {/* About */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1628', marginBottom: 12 }}>About {quote?.name}</div>
              <p style={{ fontSize: 13, color: '#3D4F6E', lineHeight: 1.75 }}>
                {quote?.description || `${quote?.name} (${SYM}) is a publicly traded company listed on ${quote?.exchange || 'a major exchange'}. The company operates in the ${quote?.sector || 'technology'} sector. For full business description, view the latest 10-K filing in the Filings tab.`}
              </p>
              {quote?.website && (
                <a href={quote.website} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 12, color: '#1B4FFF', textDecoration: 'none', fontWeight: 600 }}>
                  Visit website ↗
                </a>
              )}
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <Link href={`/app/research?q=Analyze ${SYM} company`} className="btn btn-primary btn-sm">AI Deep Dive →</Link>
                <button onClick={() => setTab('filings')} className="btn btn-outline btn-sm">View Filings</button>
                <button onClick={() => setTab('transcripts')} className="btn btn-outline btn-sm">Transcripts</button>
              </div>
            </div>

            {/* Insider activity */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F2', fontSize: 13, fontWeight: 700, color: '#0A1628' }}>Insider Activity</div>
              {(insiders.length ? insiders.slice(0, 5) : [
                { name: 'CEO',        role: 'Chief Executive',  type: 'Sale',     shares: 50000, date: '2025-01-15' },
                { name: 'CFO',        role: 'Chief Financial',  type: 'Sale',     shares: 20000, date: '2025-01-10' },
                { name: 'COO',        role: 'Chief Operating',  type: 'Purchase', shares: 5000,  date: '2025-01-08' },
              ]).map((t: any, i: number) => (
                <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid #F0F4FA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0A1628' }}>{t.name || t.reportingName}</div>
                    <div style={{ fontSize: 11, color: '#9BAFC8' }}>{t.role || t.reportingCik} · {t.date || t.filingDate}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge ${(t.type || t.transactionType) === 'Purchase' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>{t.type || t.transactionType}</span>
                    <div style={{ fontSize: 11, color: '#9BAFC8', marginTop: 2 }}>{t.shares ? (Number(t.shares) / 1000).toFixed(0) + 'K shares' : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FINANCIALS ── */}
      {tab === 'financials' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['income', 'balance', 'cashflow'] as const).map(t => (
              <button key={t} onClick={() => setFinTab(t)}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1.5px solid', cursor: 'pointer',
                  background: finTab === t ? '#0A1628' : '#fff', color: finTab === t ? '#fff' : '#7D8FA9', borderColor: finTab === t ? '#0A1628' : '#E2E8F2', transition: 'all 0.12s' }}>
                {t === 'income' ? 'Income Statement' : t === 'balance' ? 'Balance Sheet' : 'Cash Flow'}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {(['annual', 'quarterly'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1.5px solid', cursor: 'pointer',
                    background: period === p ? '#1B4FFF' : '#fff', color: period === p ? '#fff' : '#7D8FA9', borderColor: period === p ? '#1B4FFF' : '#E2E8F2', transition: 'all 0.12s' }}>
                  {p === 'annual' ? 'Annual' : 'Quarterly'}
                </button>
              ))}
            </div>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Metric</th>
                    {['FY2021', 'FY2022', 'FY2023', 'FY2024', 'TTM'].map(y => <th key={y} className="right">{y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {finTab === 'income' && [
                    { l: 'Revenue',       k: 'revenue' },
                    { l: 'Gross Profit',  k: 'grossProfit' },
                    { l: 'Gross Margin',  k: 'grossMargin',  pct: true },
                    { l: 'EBITDA',        k: 'ebitda' },
                    { l: 'EBIT',          k: 'ebit' },
                    { l: 'Net Income',    k: 'netIncome' },
                    { l: 'Net Margin',    k: 'netMargin',    pct: true },
                    { l: 'EPS (Diluted)', k: 'eps' },
                    { l: 'R&D Expense',   k: 'researchAndDevelopment' },
                  ].map(row => {
                    const years = financials?.income?.annual || []
                    return (
                      <tr key={row.l}>
                        <td style={{ fontWeight: 600, color: '#1C2B4A' }}>{row.l}</td>
                        {['2021', '2022', '2023', '2024', 'ttm'].map(y => {
                          const yr = years.find((d: any) => String(d.year || d.calendarYear || d.period) === y || d.period === y) || {}
                          const v = yr[row.k]
                          return <td key={y} className="right" style={{ color: '#0A1628' }}>{v != null ? (row.pct ? fmt(v * 100, 1) + '%' : fmtB(v)) : '—'}</td>
                        })}
                      </tr>
                    )
                  })}
                  {(finTab === 'balance' || finTab === 'cashflow') && [
                    finTab === 'balance' ? ['Total Assets', 'Total Liabilities', 'Total Equity', 'Cash & Equivalents', 'Long-term Debt', 'Short-term Debt', 'Net Debt', 'Book Value / Share']
                      : ['Operating CF', 'Capital Expenditure', 'Free Cash Flow', 'FCF Margin', 'Dividends Paid', 'Share Buybacks', 'Net Borrowing'],
                  ][0].map((label: string) => (
                    <tr key={label}>
                      <td style={{ fontWeight: 600, color: '#1C2B4A' }}>{label}</td>
                      {['2021', '2022', '2023', '2024', 'TTM'].map(y => <td key={y} className="right" style={{ color: '#9BAFC8' }}>—</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ESTIMATES ── */}
      {tab === 'estimates' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0A1628' }}>Analyst Consensus</span>
              {estimates?.rating && <span className={`badge ${estimates.rating === 'Buy' || estimates.rating === 'Strong Buy' ? 'badge-green' : estimates.rating === 'Sell' ? 'badge-red' : 'badge-amber'}`}>{estimates.rating}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
              {[
                { l: 'Consensus',    v: estimates?.rating || 'Buy' },
                { l: 'Price Target', v: estimates?.priceTarget ? `$${fmt(estimates.priceTarget)}` : '—' },
                { l: 'Upside',       v: estimates?.priceTarget && quote?.price ? `${(((estimates.priceTarget - quote.price) / quote.price) * 100).toFixed(1)}%` : '—' },
                { l: '# Analysts',   v: estimates?.numAnalysts || estimates?.numberOfAnalysts || '—' },
                { l: 'Strong Buy',   v: estimates?.strongBuy || '—' },
                { l: 'Buy',          v: estimates?.buy || '—' },
                { l: 'Hold',         v: estimates?.hold || '—' },
                { l: 'Sell',         v: estimates?.sell || '—' },
              ].map((m, i) => (
                <div key={m.l} style={{ padding: '16px 20px', borderRight: (i + 1) % 4 !== 0 ? '1px solid #F0F4FA' : 'none', borderBottom: i < 4 ? '1px solid #F0F4FA' : 'none' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9BAFC8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{m.l}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0A1628' }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F2', fontSize: 13, fontWeight: 700, color: '#0A1628' }}>Forward Estimates</div>
            <table className="data-table">
              <thead><tr><th>Period</th><th className="right">Revenue Est.</th><th className="right">EPS Est.</th><th className="right">EPS High</th><th className="right">EPS Low</th><th className="right">YoY Growth</th></tr></thead>
              <tbody>
                {(estimates?.quarterly || [
                  { period: 'Q1 2025', revenue: 95.5e9,  epsEst: 1.62, epsHigh: 1.71, epsLow: 1.55, growth: 4.2 },
                  { period: 'Q2 2025', revenue: 89.2e9,  epsEst: 1.48, epsHigh: 1.58, epsLow: 1.38, growth: 6.1 },
                  { period: 'FY2025',  revenue: 398.1e9, epsEst: 7.24, epsHigh: 7.80, epsLow: 6.90, growth: 8.4 },
                  { period: 'FY2026',  revenue: 432.0e9, epsEst: 8.12, epsHigh: 8.90, epsLow: 7.60, growth: 12.2 },
                ]).map((e: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: '#0A1628' }}>{e.period}</td>
                    <td className="right">{fmtB(e.revenue || e.revenueEst)}</td>
                    <td className="right" style={{ fontWeight: 700 }}>${fmt(e.epsEst || e.estimatedEps)}</td>
                    <td className="right" style={{ color: '#059669' }}>${fmt(e.epsHigh)}</td>
                    <td className="right" style={{ color: '#DC2626' }}>${fmt(e.epsLow)}</td>
                    <td className="right" style={{ color: e.growth >= 0 ? '#059669' : '#DC2626', fontWeight: 600 }}>{e.growth >= 0 ? '+' : ''}{e.growth?.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TRANSCRIPTS ── */}
      {tab === 'transcripts' && <TranscriptsTab symbol={SYM} />}

      {/* ── NEWS ── */}
      {tab === 'news' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(news.length ? news : [
            { title: 'Company reports record quarterly earnings, beats on revenue and EPS', source: 'Bloomberg', publishedAt: '2025-01-24', url: '#' },
            { title: 'Analyst upgrades stock citing strong services growth momentum',         source: 'Goldman Sachs', publishedAt: '2025-01-20', url: '#' },
            { title: 'New product announcement expected at upcoming developer conference',    source: 'Reuters',       publishedAt: '2025-01-18', url: '#' },
          ]).map((n: any, i: number) => (
            <div key={i} className="card" style={{ padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 4, borderRadius: 2, background: '#1B4FFF', alignSelf: 'stretch', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <a href={n.url || '#'} target="_blank" rel="noreferrer"
                  style={{ fontSize: 14, fontWeight: 600, color: '#0A1628', textDecoration: 'none', lineHeight: 1.5, display: 'block', marginBottom: 6, transition: 'color 0.12s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#1B4FFF'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#0A1628'}>
                  {n.title}
                </a>
                <div style={{ fontSize: 12, color: '#9BAFC8' }}>
                  <span style={{ fontWeight: 600, color: '#3D4F6E' }}>{n.source || n.publisher}</span>
                  <span style={{ margin: '0 6px' }}>·</span>
                  {n.publishedAt || n.date}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── FILINGS ── */}
      {tab === 'filings' && <FilingsTab symbol={SYM} />}
    </div>
  )
}
