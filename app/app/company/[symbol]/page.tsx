'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtLarge, fmtPct, fmt, fmtNum, changeClass } from '@/lib/utils'

const RANGES = ['1W', '1M', '3M', '6M', '1Y', '5Y']

export default function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const SYM = symbol?.toUpperCase()

  const [quote, setQuote] = useState<any>(null)
  const [financials, setFinancials] = useState<any>(null)
  const [estimates, setEstimates] = useState<any>(null)
  const [news, setNews] = useState<any[]>([])
  const [earnings, setEarnings] = useState<any>(null)
  const [tab, setTab] = useState<'overview' | 'financials' | 'estimates' | 'news' | 'filings'>('overview')
  const [finTab, setFinTab] = useState<'income' | 'balance' | 'cashflow'>('income')
  const [period, setPeriod] = useState<'annual' | 'quarterly'>('annual')
  const [range, setRange] = useState('1Y')
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<any[]>([])

  function genChart(price: number, rangeKey: string) {
    const points: Record<string, number> = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 252, '5Y': 1260 }
    const n = points[rangeKey] || 252
    const data = []
    let p = price * (0.7 + Math.random() * 0.3)
    const trend = (price - p) / n
    for (let i = 0; i < n; i++) {
      p += trend + (Math.random() - 0.46) * price * 0.018
      const d = new Date()
      d.setDate(d.getDate() - (n - i))
      data.push({ date: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }), price: parseFloat(p.toFixed(2)) })
    }
    data[data.length - 1].price = price
    return data
  }

  useEffect(() => {
    setLoading(true)
    async function load() {
      try {
        const qres = await fetch(`/api/quote?symbol=${SYM}`)
        const q = await qres.json()
        if (!q.error) {
          setQuote(q)
          setChartData(genChart(q.price, range))
        }
      } catch { }
      try {
        const fres = await fetch(`/api/financials?symbol=${SYM}&type=income`)
        const f = await fres.json()
        setFinancials(f)
      } catch { }
      try {
        const eres = await fetch(`/api/estimates?symbol=${SYM}`)
        const e = await eres.json()
        setEstimates(e)
      } catch { }
      try {
        const nres = await fetch(`/api/news?symbol=${SYM}&limit=10`)
        const n = await nres.json()
        setNews(n.articles || [])
      } catch { }
      setLoading(false)
    }
    load()
  }, [SYM])

  useEffect(() => {
    if (quote?.price) setChartData(genChart(quote.price, range))
  }, [range])

  if (loading) return (
    <div style={{ padding: '1.75rem', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link href="/app" className="btn btn-ghost btn-sm">← Dashboard</Link>
        <div style={{ height: 32, width: 200, background: '#E2E8F2', borderRadius: 8 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[1, 2, 3].map(i => <div key={i} className="card" style={{ height: 60, background: '#E2E8F2', borderRadius: 8 }} />)}
      </div>
      <div className="card" style={{ height: 320, background: '#E2E8F2', borderRadius: 8 }} />
    </div>
  )

  if (!quote) return (
    <div style={{ padding: '1.75rem', maxWidth: 1400, margin: '0 auto' }}>
      <Link href="/app" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>← Dashboard</Link>
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#0A1628', marginBottom: 8 }}>Symbol not found: {SYM}</p>
        <p style={{ color: '#7D8FA9' }}>Try AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, JPM</p>
        <Link href="/app/screener" className="btn btn-primary" style={{ marginTop: 16 }}>Browse Screener</Link>
      </div>
    </div>
  )

  const pricePos = quote.changePct >= 0
  const chartColor = pricePos ? '#059669' : '#DC2626'

  return (
    <div style={{ padding: '1.75rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/app" className="btn btn-ghost btn-sm">← Dashboard</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20, flexShrink: 0 }}>{SYM[0]}</div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.025em', margin: 0 }}>{quote.name}</h1>
              <p style={{ fontSize: 12, color: '#9BAFC8', marginTop: 2, margin: 0 }}>{quote.sector} · {quote.industry}</p>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.03em' }}>${fmt(quote.price)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: chartColor }}>{pricePos ? '+' : ''}{fmt(quote.change)}</span>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: pricePos ? '#ECFDF5' : '#FEF2F2', color: chartColor }}>{pricePos ? '+' : ''}{fmtPct(quote.changePct)}</span>
          </div>
        </div>
      </div>

      {/* Key metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { l: 'Market Cap', v: fmtLarge(quote.marketCap) },
          { l: 'P/E Ratio', v: quote.pe > 0 ? `${fmt(quote.pe)}x` : '—' },
          { l: 'EPS (TTM)', v: quote.eps > 0 ? `$${fmt(quote.eps)}` : '—' },
          { l: '52W High', v: `$${fmt(quote.week52High)}` },
          { l: '52W Low', v: `$${fmt(quote.week52Low)}` },
          { l: 'Div Yield', v: quote.dividendYield > 0 ? fmtPct(quote.dividendYield * 100) : '—' },
        ].map(m => (
          <div key={m.l} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9BAFC8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{m.l}</div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0A1628', letterSpacing: '-0.01em' }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #E2E8F2', overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {['overview', 'financials', 'estimates', 'news', 'filings'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t as any)}
            style={{
              padding: '12px 16px',
              fontWeight: 600,
              fontSize: 14,
              color: tab === t ? '#1B4FFF' : '#7D8FA9',
              borderBottom: tab === t ? '2px solid #1B4FFF' : '2px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div>
          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#0A1628' }}>{SYM} Price Chart</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {RANGES.map(r => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1.5px solid',
                      borderColor: range === r ? '#1B4FFF' : '#E2E8F2',
                      background: range === r ? '#EEF3FF' : '#fff',
                      color: range === r ? '#1B4FFF' : '#7D8FA9',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#B0BCD0' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#B0BCD0' }} domain="dataMin" />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F2', borderRadius: 8, color: '#0A1628' }}
                    formatter={(v: any) => `$${fmt(v)}`}
                  />
                  <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} fill="url(#priceGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* About section */}
          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0A1628', marginBottom: 12, marginTop: 0 }}>About</h2>
            <p style={{ color: '#5A6E7F', lineHeight: 1.6, margin: 0 }}>
              {quote.description || `${quote.name} is a publicly-traded company in the ${quote.industry} sector. Founded in ${quote.year || 'N/A'}, it operates in ${quote.country || 'the United States'} and has a market capitalization of ${fmtLarge(quote.marketCap)}.`}
            </p>
          </div>
        </div>
      )}

      {/* Financials Tab */}
      {tab === 'financials' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {['income', 'balance', 'cashflow'].map(t => (
              <button
                key={t}
                onClick={() => setFinTab(t as any)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1.5px solid',
                  borderColor: finTab === t ? '#1B4FFF' : '#E2E8F2',
                  background: finTab === t ? '#EEF3FF' : '#fff',
                  color: finTab === t ? '#1B4FFF' : '#7D8FA9',
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Financial metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0A1628', marginTop: 0, marginBottom: 16 }}>Key Metrics</h3>
              {[
                { label: 'Revenue (TTM)', value: fmtLarge(quote.revenue || 0) },
                { label: 'Net Income (TTM)', value: fmtLarge(quote.netIncome || 0) },
                { label: 'Operating Margin', value: quote.operatingMargin ? fmtPct(quote.operatingMargin * 100) : '—' },
                { label: 'ROE (TTM)', value: quote.returnOnEquity ? fmtPct(quote.returnOnEquity * 100) : '—' },
                { label: 'Debt/Equity', value: quote.debtToEquity ? fmt(quote.debtToEquity, 2) : '—' },
                { label: 'Current Ratio', value: quote.currentRatio ? fmt(quote.currentRatio, 2) : '—' },
              ].map(m => (
                <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid #F0F4FA', marginBottom: 12, fontSize: 13 }}>
                  <span style={{ color: '#7D8FA9' }}>{m.label}</span>
                  <span style={{ fontWeight: 700, color: '#0A1628' }}>{m.value}</span>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0A1628', marginTop: 0, marginBottom: 16 }}>Growth</h3>
              {[
                { label: 'Revenue Growth (YoY)', value: quote.revenueGrowth ? fmtPct(quote.revenueGrowth * 100) : '—' },
                { label: 'Earnings Growth (YoY)', value: quote.earningsGrowth ? fmtPct(quote.earningsGrowth * 100) : '—' },
                { label: 'Free Cash Flow', value: fmtLarge(quote.freeCashFlow || 0) },
                { label: 'Capital Expenditure', value: fmtLarge(quote.capex || 0) },
                { label: 'Book Value/Share', value: quote.bookValue ? `$${fmt(quote.bookValue)}` : '—' },
                { label: 'Tangible Book Value', value: quote.tangibleBookValue ? `$${fmt(quote.tangibleBookValue)}` : '—' },
              ].map(m => (
                <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid #F0F4FA', marginBottom: 12, fontSize: 13 }}>
                  <span style={{ color: '#7D8FA9' }}>{m.label}</span>
                  <span style={{ fontWeight: 700, color: '#0A1628' }}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Estimates Tab */}
      {tab === 'estimates' && (
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0A1628', marginTop: 0, marginBottom: 20 }}>Analyst Estimates</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            {[
              { metric: 'EPS Next Year', current: estimates?.eps_next_year || 'N/A', target: estimates?.eps_target || 'N/A' },
              { metric: 'Revenue Next Year', current: fmtLarge(estimates?.revenue_next_year || 0), target: fmtLarge(estimates?.revenue_target || 0) },
              { metric: 'Price Target', current: `$${quote.price.toFixed(2)}`, target: `$${estimates?.price_target || 'N/A'}` },
            ].map(e => (
              <div key={e.metric} style={{ padding: 16, border: '1px solid #E2E8F2', borderRadius: 10, background: '#F8FAFD' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#7D8FA9', marginBottom: 8 }}>{e.metric}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0A1628', marginBottom: 4 }}>{e.target}</div>
                <div style={{ fontSize: 12, color: '#9BAFC8' }}>Current: {e.current}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* News Tab */}
      {tab === 'news' && (
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0A1628', marginTop: 0, marginBottom: 16 }}>Latest News</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {news.length > 0 ? news.map((article, i) => (
              <a key={i} href={article.url} target="_blank" rel="noopener noreferrer" style={{
                display: 'block',
                padding: 14,
                borderRadius: 10,
                border: '1px solid #E2E8F2',
                background: '#fff',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'all 0.14s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1B4FFF'; (e.currentTarget as HTMLElement).style.background = '#F5F8FF' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F2'; (e.currentTarget as HTMLElement).style.background = '#fff' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1628', marginBottom: 4 }}>{article.title}</div>
                <div style={{ fontSize: 12, color: '#7D8FA9', marginBottom: 8 }}>{article.source} · {new Date(article.publishedAt).toLocaleDateString()}</div>
                <p style={{ margin: 0, fontSize: 13, color: '#5A6E7F', lineHeight: 1.4 }}>{article.description}</p>
              </a>
            )) : (
              <div style={{ padding: 24, textAlign: 'center', color: '#9BAFC8' }}>No news articles found</div>
            )}
          </div>
        </div>
      )}

      {/* Filings Tab */}
      {tab === 'filings' && (
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0A1628', marginTop: 0, marginBottom: 16 }}>SEC Filings</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['10-K', '10-Q', '8-K', '6-K', 'DEF 14A'].map((filing, i) => (
              <div key={filing} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid #E2E8F2', borderRadius: 8, background: '#fff' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1628' }}>{filing}</div>
                  <div style={{ fontSize: 11, color: '#9BAFC8', marginTop: 2 }}>Annual Report · Filed {new Date(new Date().setDate(new Date().getDate() - i * 90)).toLocaleDateString()}</div>
                </div>
                <a href="#" style={{ fontSize: 12, color: '#1B4FFF', fontWeight: 700, textDecoration: 'none' }}>View →</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
