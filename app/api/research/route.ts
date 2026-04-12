import { NextRequest } from 'next/server'

const GROQ       = process.env.GROQ_API_KEY
const PERPLEXITY = process.env.PERPLEXITY_API_KEY
const FMP        = process.env.FMP_API_KEY
const FINNHUB    = process.env.FINNHUB_API_KEY
const EODHD      = process.env.EODHD_API_KEY || process.env.eodhd_api
const FRED       = process.env.FRED_API_KEY
const SEC_API    = process.env.SEC_API_KEY

// ── Symbol detector ────────────────────────────────────────────────────────────
function detectSymbols(text: string): string[] {
  const matches = text.match(/\b([A-Z]{1,5})\b/g) || []
  const stopwords = new Set(['A','I','US','EU','UK','AI','GDP','CPI','FED','IPO','PE','EPS','ETF','CEO','CFO','SEC','YOY','QOQ','TTM','FCF','DCF','ROE','ROA','EBIT','SMA','RSI','OR','AND','THE','IS','IN','OF','TO','FOR','ON','BY'])
  return [...new Set(matches.filter(s => !stopwords.has(s) && s.length >= 2))]
}

function detectMacroQuery(text: string): boolean {
  return /GDP|CPI|inflation|unemployment|Fed|FOMC|rates|PMI|macro|economy|recession/i.test(text)
}

function detectScreenerQuery(text: string): boolean {
  return /screen|screener|filter|find stocks|find companies|P\/E under|market cap|revenue growth/i.test(text)
}

function detectFilingsQuery(text: string): boolean {
  return /10-K|10-Q|8-K|SEC|EDGAR|filing|proxy|DEF 14A|annual report|quarterly report/i.test(text)
}

// ── Tool: Quote + Fundamentals ─────────────────────────────────────────────────
async function toolGetQuote(symbol: string): Promise<{ tool: string; data: any }> {
  const results: any = { symbol }
  try {
    // Primary: EODHD live quote + fundamentals
    if (EODHD) {
      const eodSym = symbol.includes('.') ? symbol : `${symbol}.US`
      const [liveRes, fundRes] = await Promise.all([
        fetch(`https://eodhd.com/api/real-time/${eodSym}?api_token=${EODHD}&fmt=json`),
        fetch(`https://eodhd.com/api/fundamentals/${eodSym}?api_token=${EODHD}&fmt=json`),
      ])
      const [live, fund] = await Promise.all([liveRes.json(), fundRes.json()])
      if (live?.close) {
        const h = fund?.Highlights || {}
        const v = fund?.Valuation || {}
        const g = fund?.General || {}
        const t = fund?.Technicals || {}
        const e = fund?.Earnings?.Annual || {}
        const ar = fund?.AnalystRatings || {}
        const earningsList = Object.values(e).sort((a: any, b: any) => b.date > a.date ? 1 : -1).slice(0, 4)

        results.price = live.close
        results.change = ((live.close - live.previousClose) / live.previousClose * 100).toFixed(2) + '%'
        results.volume = live.volume
        results.name = g.Name
        results.sector = g.Sector
        results.industry = g.Industry
        results.exchange = g.Exchange
        results.description = g.Description?.slice(0, 400)
        results.employees = g.FullTimeEmployees
        results.marketCap = h.MarketCapitalization
        results.pe = h.PERatio || v.TrailingPE
        results.forwardPe = v.ForwardPE
        results.eps = h.EarningsShare
        results.revenue = h.RevenueTTM
        results.ebitda = h.EBITDA
        results.grossMargin = h.GrossProfitTTM
        results.netMargin = h.ProfitMargin
        results.roe = h.ReturnOnEquityTTM
        results.revenueGrowth = h.QuarterlyRevenueGrowthYOY
        results.eps52wHigh = t['52WeekHigh']
        results.eps52wLow = t['52WeekLow']
        results.beta = t.Beta
        results.divYield = h.DividendYield
        results.analystTarget = h.AnalystTargetPrice
        results.analystRating = ar.Rating
        results.analystBuy = ar.StrongBuy + ar.Buy
        results.analystHold = ar.Hold
        results.analystSell = ar.Sell + ar.StrongSell
        results.recentEarnings = earningsList.map((e: any) => ({
          date: e.date, epsActual: e.epsActual, epsEstimate: e.epsEstimate,
          surprise: e.epsActual && e.epsEstimate ? ((e.epsActual - e.epsEstimate) / Math.abs(e.epsEstimate) * 100).toFixed(1) + '%' : null
        }))
        results.source = 'EODHD'
      }
    }

    // Supplement with FMP income statement
    if (FMP) {
      const [isRes, bsRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&period=annual&limit=3&apikey=${FMP}`),
        fetch(`https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${symbol}&period=annual&limit=1&apikey=${FMP}`),
      ])
      const [is_, bs] = await Promise.all([isRes.json(), bsRes.json()])
      if (Array.isArray(is_) && is_.length > 0) {
        const i0 = is_[0], i1 = is_[1], i2 = is_[2]
        results.financials = {
          revenue: [i0?.revenue, i1?.revenue, i2?.revenue].filter(Boolean).map((v: number) => '$' + (v / 1e9).toFixed(2) + 'B'),
          grossProfit: i0?.grossProfit ? '$' + (i0.grossProfit / 1e9).toFixed(2) + 'B' : null,
          netIncome: i0?.netIncome ? '$' + (i0.netIncome / 1e9).toFixed(2) + 'B' : null,
          ebitda: i0?.ebitda ? '$' + (i0.ebitda / 1e9).toFixed(2) + 'B' : null,
          opIncome: i0?.operatingIncome ? '$' + (i0.operatingIncome / 1e9).toFixed(2) + 'B' : null,
          revGrowthYoy: i0?.revenue && i1?.revenue ? ((i0.revenue - i1.revenue) / i1.revenue * 100).toFixed(1) + '%' : null,
          period: i0?.date,
        }
      }
      if (Array.isArray(bs) && bs.length > 0) {
        const b = bs[0]
        results.balanceSheet = {
          cash: b?.cashAndCashEquivalents ? '$' + (b.cashAndCashEquivalents / 1e9).toFixed(2) + 'B' : null,
          totalDebt: b?.totalDebt ? '$' + (b.totalDebt / 1e9).toFixed(2) + 'B' : null,
          netCash: (b?.cashAndCashEquivalents && b?.totalDebt) ? '$' + ((b.cashAndCashEquivalents - b.totalDebt) / 1e9).toFixed(2) + 'B' : null,
          equity: b?.totalStockholdersEquity ? '$' + (b.totalStockholdersEquity / 1e9).toFixed(2) + 'B' : null,
        }
      }
    }
  } catch (e) {
    results.error = 'Quote fetch partial failure'
  }
  return { tool: 'get_quote', data: results }
}

// ── Tool: News + Sentiment ──────────────────────────────────────────────────────
async function toolGetNews(symbol: string, limit = 10): Promise<{ tool: string; data: any }> {
  const articles: any[] = []
  try {
    if (EODHD) {
      const eodSym = symbol.includes('.') ? symbol : `${symbol}.US`
      const res = await fetch(`https://eodhd.com/api/news?api_token=${EODHD}&s=${eodSym}&limit=${limit}&fmt=json`)
      const data = await res.json()
      if (Array.isArray(data)) {
        data.slice(0, limit).forEach((n: any) => {
          articles.push({
            title: n.title,
            date: n.date,
            source: n.link?.match(/\/\/(www\.)?([^/]+)/)?.[2] || 'Unknown',
            sentiment: n.sentiment?.polarity > 0.2 ? 'POSITIVE' : n.sentiment?.polarity < -0.2 ? 'NEGATIVE' : 'NEUTRAL',
            sentimentScore: n.sentiment?.polarity?.toFixed(3),
            url: n.link,
          })
        })
      }
    }
    if (articles.length < 5 && FINNHUB) {
      const to = Math.floor(Date.now() / 1000)
      const from = to - 7 * 86400
      const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${new Date(from * 1000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}&token=${FINNHUB}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        data.slice(0, 8).forEach((n: any) => {
          articles.push({ title: n.headline, date: n.datetime, source: n.source, url: n.url, sentiment: 'NEUTRAL' })
        })
      }
    }
  } catch {}
  const positiveCount = articles.filter(a => a.sentiment === 'POSITIVE').length
  const negativeCount = articles.filter(a => a.sentiment === 'NEGATIVE').length
  return {
    tool: 'get_news',
    data: {
      symbol,
      articles,
      sentimentSummary: {
        positive: positiveCount,
        negative: negativeCount,
        neutral: articles.length - positiveCount - negativeCount,
        overall: positiveCount > negativeCount ? 'BULLISH' : negativeCount > positiveCount ? 'BEARISH' : 'MIXED',
      },
      source: 'EODHD + Finnhub',
    }
  }
}

// ── Tool: Insider Transactions ──────────────────────────────────────────────────
async function toolGetInsider(symbol: string): Promise<{ tool: string; data: any }> {
  try {
    const eodSym = symbol.includes('.') ? symbol : `${symbol}.US`
    const res = await fetch(`https://eodhd.com/api/insider-transactions?api_token=${EODHD}&code=${eodSym}&limit=20&fmt=json`)
    const data = await res.json()
    const txns = Array.isArray(data?.data) ? data.data : []
    const buys = txns.filter((t: any) => t.transactionCode === 'P' || t.transactionType?.toLowerCase().includes('buy'))
    const sells = txns.filter((t: any) => t.transactionCode === 'S' || t.transactionType?.toLowerCase().includes('sell'))
    const totalBuyValue = buys.reduce((s: number, t: any) => s + (t.transactionValue || 0), 0)
    const totalSellValue = sells.reduce((s: number, t: any) => s + (Math.abs(t.transactionValue || 0)), 0)
    return {
      tool: 'get_insider',
      data: {
        symbol,
        recentTransactions: txns.slice(0, 10).map((t: any) => ({
          name: t.reportingName,
          role: t.reportingRelationship,
          type: t.transactionCode === 'P' ? 'BUY' : t.transactionCode === 'S' ? 'SELL' : t.transactionType,
          shares: t.securitiesTransacted?.toLocaleString(),
          price: t.transactionPrice ? '$' + t.transactionPrice.toFixed(2) : null,
          value: t.transactionValue ? '$' + (Math.abs(t.transactionValue) / 1e6).toFixed(2) + 'M' : null,
          date: t.transactionDate,
        })),
        summary: {
          totalBuys: buys.length,
          totalSells: sells.length,
          buyValue: '$' + (totalBuyValue / 1e6).toFixed(1) + 'M',
          sellValue: '$' + (totalSellValue / 1e6).toFixed(1) + 'M',
          sentiment: buys.length > sells.length ? 'BULLISH (insiders buying)' : sells.length > buys.length ? 'BEARISH (insiders selling)' : 'NEUTRAL',
        },
        source: 'EODHD Form 4',
      }
    }
  } catch {
    return { tool: 'get_insider', data: { symbol, error: 'No insider data available' } }
  }
}

// ── Tool: Macro Data (FRED) ─────────────────────────────────────────────────────
async function toolGetMacro(): Promise<{ tool: string; data: any }> {
  if (!FRED) return { tool: 'get_macro', data: { error: 'FRED API key not configured' } }
  const SERIES = [
    { id: 'GDP', name: 'GDP (Quarterly)', unit: '$T' },
    { id: 'GDPC1', name: 'Real GDP Growth' },
    { id: 'CPIAUCSL', name: 'CPI (YoY Inflation)' },
    { id: 'CPILFESL', name: 'Core CPI' },
    { id: 'FEDFUNDS', name: 'Fed Funds Rate', unit: '%' },
    { id: 'DGS10', name: '10Y Treasury Yield', unit: '%' },
    { id: 'DGS2', name: '2Y Treasury Yield', unit: '%' },
    { id: 'UNRATE', name: 'Unemployment Rate', unit: '%' },
    { id: 'PAYEMS', name: 'Nonfarm Payrolls' },
    { id: 'UMCSENT', name: 'Consumer Sentiment (Mich)' },
    { id: 'VIXCLS', name: 'VIX' },
  ]
  try {
    const results = await Promise.all(SERIES.map(async s => {
      const res = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${FRED}&limit=2&sort_order=desc&file_type=json`)
      const data = await res.json()
      const obs = data?.observations
      const latest = obs?.[0]
      const prev = obs?.[1]
      return {
        name: s.name,
        seriesId: s.id,
        value: latest?.value ? (s.unit === '$T' ? '$' + (parseFloat(latest.value) / 1000).toFixed(1) + 'T' : latest.value + (s.unit || '')) : 'N/A',
        date: latest?.date,
        change: (latest?.value && prev?.value) ? ((parseFloat(latest.value) - parseFloat(prev.value)) / Math.abs(parseFloat(prev.value)) * 100).toFixed(2) + '%' : null,
      }
    }))
    const yieldCurve = results.find(r => r.seriesId === 'DGS10')?.value && results.find(r => r.seriesId === 'DGS2')?.value
      ? (parseFloat(results.find(r => r.seriesId === 'DGS10')!.value) - parseFloat(results.find(r => r.seriesId === 'DGS2')!.value)).toFixed(2) + '%'
      : 'N/A'
    return { tool: 'get_macro', data: { indicators: results, yieldCurve10y2y: yieldCurve, source: 'FRED' } }
  } catch {
    return { tool: 'get_macro', data: { error: 'FRED fetch failed' } }
  }
}

// ── Tool: SEC Filings Search ────────────────────────────────────────────────────
async function toolGetFilings(symbol: string, types = '10-K,10-Q,8-K'): Promise<{ tool: string; data: any }> {
  if (!SEC_API) {
    // Fallback to FMP
    if (FMP) {
      const res = await fetch(`https://financialmodelingprep.com/stable/sec-filings?symbol=${symbol}&type=${types.split(',')[0]}&limit=5&apikey=${FMP}`)
      const data = await res.json()
      return { tool: 'get_filings', data: { symbol, filings: Array.isArray(data) ? data.slice(0, 5) : [], source: 'FMP' } }
    }
    return { tool: 'get_filings', data: { symbol, error: 'SEC API key not configured' } }
  }
  try {
    const typeQuery = types.split(',').map(t => `"${t.trim()}"`).join(' OR ')
    const res = await fetch('https://efts.sec-api.io?token=' + SEC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: { query_string: { query: `ticker:${symbol} AND formType:(${typeQuery})` } },
        from: '0', size: '5',
        sort: [{ filedAt: { order: 'desc' } }],
      })
    })
    const data = await res.json()
    const hits = data?.hits?.hits || []
    return {
      tool: 'get_filings',
      data: {
        symbol,
        filings: hits.map((h: any) => ({
          formType: h._source?.formType,
          filedAt: h._source?.filedAt?.slice(0, 10),
          period: h._source?.periodOfReport,
          url: h._source?.linkToFilingDetails,
          description: h._source?.description,
        })),
        source: 'SEC EDGAR',
      }
    }
  } catch {
    return { tool: 'get_filings', data: { symbol, error: 'SEC search failed' } }
  }
}

// ── Tool: Screener ──────────────────────────────────────────────────────────────
async function toolScreener(params: any): Promise<{ tool: string; data: any }> {
  try {
    if (FMP) {
      const q = new URLSearchParams({
        apikey: FMP,
        limit: '20',
        ...(params.sector && { sector: params.sector }),
        ...(params.marketCapMin && { marketCapMoreThan: String(params.marketCapMin) }),
        ...(params.marketCapMax && { marketCapLowerThan: String(params.marketCapMax) }),
        ...(params.peMax && { peRatioLowerThan: String(params.peMax) }),
        ...(params.country && { country: params.country || 'US' }),
      })
      const res = await fetch(`https://financialmodelingprep.com/stable/stock-screener?${q}`)
      const data = await res.json()
      return {
        tool: 'screener',
        data: {
          results: Array.isArray(data) ? data.slice(0, 15).map((s: any) => ({
            symbol: s.symbol,
            name: s.companyName,
            sector: s.sector,
            price: '$' + s.price?.toFixed(2),
            marketCap: s.marketCap ? '$' + (s.marketCap / 1e9).toFixed(1) + 'B' : null,
            pe: s.pe?.toFixed(1),
            beta: s.beta?.toFixed(2),
            volume: s.volume ? (s.volume / 1e6).toFixed(1) + 'M' : null,
          })) : [],
          source: 'FMP',
          params,
        }
      }
    }
    return { tool: 'screener', data: { error: 'FMP key required for screener' } }
  } catch {
    return { tool: 'screener', data: { error: 'Screener failed' } }
  }
}

// ── Tool: Earnings Transcripts ──────────────────────────────────────────────────
async function toolGetTranscript(symbol: string): Promise<{ tool: string; data: any }> {
  if (!FMP) return { tool: 'get_transcript', data: { error: 'FMP key required' } }
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/earning-call-transcript?symbol=${symbol}&limit=2&apikey=${FMP}`)
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return { tool: 'get_transcript', data: { symbol, error: 'No transcripts found' } }
    return {
      tool: 'get_transcript',
      data: {
        symbol,
        transcripts: data.slice(0, 2).map((t: any) => ({
          quarter: t.quarter,
          year: t.year,
          date: t.date,
          excerpt: t.content?.slice(0, 2000) + (t.content?.length > 2000 ? '…' : ''),
        })),
        source: 'FMP',
      }
    }
  } catch {
    return { tool: 'get_transcript', data: { symbol, error: 'Transcript fetch failed' } }
  }
}

// ── Context formatter for LLM ───────────────────────────────────────────────────
function formatToolResults(toolResults: Array<{ tool: string; data: any }>): string {
  return toolResults.map(({ tool, data }) => {
    switch (tool) {
      case 'get_quote': {
        const d = data
        if (d.error) return `[MARKET DATA] Error: ${d.error}`
        return `[MARKET DATA — ${d.symbol} — Source: ${d.source}]
Company: ${d.name} | Sector: ${d.sector} | Industry: ${d.industry}
Price: $${d.price} (${d.change} change) | Market Cap: $${d.marketCap ? (d.marketCap/1e9).toFixed(1) + 'B' : 'N/A'}
P/E: ${d.pe || 'N/A'} | Forward P/E: ${d.forwardPe || 'N/A'} | EPS: $${d.eps || 'N/A'}
Revenue TTM: ${d.revenue ? '$' + (d.revenue/1e9).toFixed(1) + 'B' : 'N/A'} | EBITDA: ${d.ebitda ? '$' + (d.ebitda/1e9).toFixed(1) + 'B' : 'N/A'}
Net Margin: ${d.netMargin ? (d.netMargin*100).toFixed(1) + '%' : 'N/A'} | ROE: ${d.roe ? (d.roe*100).toFixed(1) + '%' : 'N/A'}
Revenue Growth (YoY): ${d.revenueGrowth ? (d.revenueGrowth*100).toFixed(1) + '%' : 'N/A'} | Beta: ${d.beta || 'N/A'}
52W Range: $${d.eps52wLow} — $${d.eps52wHigh} | Div Yield: ${d.divYield ? (d.divYield*100).toFixed(2) + '%' : 'N/A'}
Analyst Target: $${d.analystTarget || 'N/A'} | Rating: ${d.analystRating || 'N/A'} (${d.analystBuy} buy / ${d.analystHold} hold / ${d.analystSell} sell)
Employees: ${d.employees?.toLocaleString() || 'N/A'}
${d.financials ? `
INCOME STATEMENT (FMP):
Revenue: ${d.financials.revenue?.join(', ')} (${d.financials.revGrowthYoy} YoY growth)
Gross Profit: ${d.financials.grossProfit} | EBITDA: ${d.financials.ebitda} | Net Income: ${d.financials.netIncome}
Operating Income: ${d.financials.opIncome} | Period: ${d.financials.period}` : ''}
${d.balanceSheet ? `
BALANCE SHEET (FMP):
Cash: ${d.balanceSheet.cash} | Total Debt: ${d.balanceSheet.totalDebt} | Net Cash: ${d.balanceSheet.netCash}
Total Equity: ${d.balanceSheet.equity}` : ''}
${d.recentEarnings?.length ? `
EARNINGS HISTORY (EODHD):
${d.recentEarnings.map((e: any) => `  ${e.date}: Actual $${e.epsActual} vs Est $${e.epsEstimate} (${e.surprise ? e.surprise + ' surprise' : 'N/A'})`).join('\n')}` : ''}`
      }

      case 'get_news': {
        const d = data
        if (d.error) return `[NEWS] Error: ${d.error}`
        return `[NEWS & SENTIMENT — ${d.symbol} — Source: ${d.source}]
Sentiment: ${d.sentimentSummary.overall} (${d.sentimentSummary.positive} positive / ${d.sentimentSummary.negative} negative / ${d.sentimentSummary.neutral} neutral articles)
Recent Headlines:
${d.articles.slice(0, 8).map((a: any) => `  [${a.sentiment}] ${a.title} (${a.source}, ${a.date})`).join('\n')}`
      }

      case 'get_insider': {
        const d = data
        if (d.error) return `[INSIDER] Error: ${d.error}`
        return `[INSIDER TRANSACTIONS — ${d.symbol} — Source: ${d.source}]
Summary: ${d.summary.totalBuys} buys ($${d.summary.buyValue}) vs ${d.summary.totalSells} sells (${d.summary.sellValue}) → ${d.summary.sentiment}
Recent transactions:
${d.recentTransactions.slice(0, 6).map((t: any) => `  ${t.type} — ${t.name} (${t.role}): ${t.shares} shares @ ${t.price || 'N/A'} = ${t.value || 'N/A'} on ${t.date}`).join('\n')}`
      }

      case 'get_macro': {
        const d = data
        if (d.error) return `[MACRO] Error: ${d.error}`
        return `[MACRO INDICATORS — Source: ${d.source}]
Yield Curve (10Y-2Y): ${d.yieldCurve10y2y}
${d.indicators?.map((i: any) => `  ${i.name}: ${i.value} (${i.date})${i.change ? ' | Change: ' + i.change : ''}`).join('\n')}`
      }

      case 'get_filings': {
        const d = data
        if (d.error) return `[FILINGS] Error: ${d.error}`
        return `[SEC FILINGS — ${d.symbol} — Source: ${d.source}]
${d.filings?.map((f: any) => `  ${f.formType} filed ${f.filedAt} (period: ${f.period || 'N/A'}) — ${f.url || 'No URL'}`).join('\n') || 'No filings found'}`
      }

      case 'get_transcript': {
        const d = data
        if (d.error) return `[TRANSCRIPTS] Error: ${d.error}`
        return `[EARNINGS CALL TRANSCRIPTS — ${d.symbol} — Source: ${d.source}]
${d.transcripts?.map((t: any) => `Q${t.quarter} ${t.year} (${t.date}):\n${t.excerpt}`).join('\n\n---\n\n') || 'No transcripts'}`
      }

      case 'screener': {
        const d = data
        if (d.error) return `[SCREENER] Error: ${d.error}`
        return `[STOCK SCREENER — Source: ${d.source}]
Filters: ${JSON.stringify(d.params)}
Results (${d.results?.length} companies):
${d.results?.map((s: any) => `  ${s.symbol} | ${s.name} | ${s.sector} | Price: ${s.price} | MCap: ${s.marketCap} | P/E: ${s.pe}`).join('\n')}`
      }

      default:
        return `[TOOL: ${tool}] ${JSON.stringify(data)}`
    }
  }).join('\n\n')
}

// ── Main streaming handler ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { messages, chatHistory } = body

  // Support both single query and full message array
  const userMessage = typeof messages === 'string' ? messages : messages?.[messages.length - 1]?.content
  if (!userMessage) return new Response(JSON.stringify({ error: 'No message provided' }), { status: 400 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`))
      }

      try {
        // ── Step 1: Detect what tools to call ────────────────────────────────
        const symbols = detectSymbols(userMessage)
        const isMacro = detectMacroQuery(userMessage)
        const isScreener = detectScreenerQuery(userMessage)
        const isFilings = detectFilingsQuery(userMessage)
        const wantsTranscript = /transcript|earnings call|call|quarterly call/i.test(userMessage)
        const wantsInsider = /insider|form 4|executive buy|director buy/i.test(userMessage)
        const wantsNews = /news|sentiment|headlines|coverage/i.test(userMessage)

        // ── Step 2: Execute tools in parallel ────────────────────────────────
        const toolCalls: Array<{ tool: string; symbol?: string }> = []

        if (symbols.length > 0) {
          const primarySymbol = symbols[0]
          toolCalls.push({ tool: 'quote', symbol: primarySymbol })
          if (wantsNews || symbols.length > 0) toolCalls.push({ tool: 'news', symbol: primarySymbol })
          if (wantsInsider) toolCalls.push({ tool: 'insider', symbol: primarySymbol })
          if (isFilings) toolCalls.push({ tool: 'filings', symbol: primarySymbol })
          if (wantsTranscript) toolCalls.push({ tool: 'transcript', symbol: primarySymbol })
        }
        if (isMacro) toolCalls.push({ tool: 'macro' })
        if (isScreener) toolCalls.push({ tool: 'screener' })

        // Always emit tool calls upfront so UI can show spinner
        if (toolCalls.length > 0) {
          send('tool_calls', { tools: toolCalls.map(t => t.tool) })
        } else {
          // General knowledge query — still fetch macro context
          send('tool_calls', { tools: ['general'] })
        }

        // ── Step 3: Fetch data ────────────────────────────────────────────────
        const toolResults: Array<{ tool: string; data: any }> = []
        const fetchPromises: Promise<void>[] = []

        toolCalls.forEach(({ tool, symbol }) => {
          if (tool === 'quote' && symbol) {
            fetchPromises.push(
              toolGetQuote(symbol).then(r => { toolResults.push(r); send('tool_result', { tool: 'quote', symbol, status: 'done' }) })
            )
          } else if (tool === 'news' && symbol) {
            fetchPromises.push(
              toolGetNews(symbol, 10).then(r => { toolResults.push(r); send('tool_result', { tool: 'news', symbol, status: 'done' }) })
            )
          } else if (tool === 'insider' && symbol) {
            fetchPromises.push(
              toolGetInsider(symbol).then(r => { toolResults.push(r); send('tool_result', { tool: 'insider', symbol, status: 'done' }) })
            )
          } else if (tool === 'macro') {
            fetchPromises.push(
              toolGetMacro().then(r => { toolResults.push(r); send('tool_result', { tool: 'macro', status: 'done' }) })
            )
          } else if (tool === 'filings' && symbol) {
            fetchPromises.push(
              toolGetFilings(symbol).then(r => { toolResults.push(r); send('tool_result', { tool: 'filings', symbol, status: 'done' }) })
            )
          } else if (tool === 'transcript' && symbol) {
            fetchPromises.push(
              toolGetTranscript(symbol).then(r => { toolResults.push(r); send('tool_result', { tool: 'transcript', symbol, status: 'done' }) })
            )
          } else if (tool === 'screener') {
            const params = {
              sector: userMessage.match(/tech(?:nology)?|energy|health(?:care)?|finance|consumer/i)?.[0] || undefined,
              marketCapMin: userMessage.match(/\$(\d+)B\+/)?.[1] ? parseInt(userMessage.match(/\$(\d+)B\+/)![1]) * 1e9 : 1e9,
            }
            fetchPromises.push(
              toolScreener(params).then(r => { toolResults.push(r); send('tool_result', { tool: 'screener', status: 'done' }) })
            )
          }
        })

        await Promise.all(fetchPromises)

        // ── Step 4: Build context and call LLM ────────────────────────────────
        send('llm_start', { model: 'llama-3.3-70b-versatile' })

        const context = toolResults.length > 0 ? formatToolResults(toolResults) : ''

        const systemPrompt = `You are Finsyt Intelligence — an institutional-grade AI financial analyst on the Finsyt platform. You have access to live financial data provided as context below.

RULES:
1. Lead with the direct answer — no preamble, no "Great question!"
2. Bold key data: **Revenue FY2025: $39.3B (+18% YoY)**
3. Always cite sources inline: (EODHD), (FMP), (SEC EDGAR), (FRED), (Finnhub)
4. Structure: KEY FACTS → ANALYSIS → RISKS → SYNTHESIS (use headers ##)
5. For company questions: always include valuation, growth, margins, analyst view
6. For macro questions: connect to market/sector implications
7. Use tables for comparisons (markdown table format)
8. Be concise but data-dense — analysts are reading this
9. If data is missing or stale, flag it explicitly — never fabricate numbers
10. End with a 1-sentence synthesis: bull/bear/neutral with the key reason

LIVE DATA CONTEXT:
${context || 'No real-time data fetched — using knowledge base only. Flag if data may be stale.'}`

        const historyMessages = Array.isArray(chatHistory) ? chatHistory.slice(-6).map((m: any) => ({
          role: m.role, content: m.content
        })) : []

        // Try GROQ streaming first
        if (GROQ) {
          const models = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768']
          let streamed = false

          for (const model of models) {
            try {
              const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    ...historyMessages,
                    { role: 'user', content: userMessage },
                  ],
                  stream: true,
                  max_tokens: 2048,
                  temperature: 0.2,
                }),
              })

              if (!groqRes.ok || !groqRes.body) continue

              send('stream_start', { model })

              const reader = groqRes.body.getReader()
              const decoder = new TextDecoder()
              let buffer = ''

              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                  if (!line.startsWith('data: ')) continue
                  const raw = line.slice(6).trim()
                  if (raw === '[DONE]') continue
                  try {
                    const chunk = JSON.parse(raw)
                    const delta = chunk.choices?.[0]?.delta?.content
                    if (delta) send('token', { token: delta })
                  } catch {}
                }
              }

              streamed = true
              break
            } catch (e) {
              continue
            }
          }

          if (!streamed && PERPLEXITY) {
            // Fallback to Perplexity
            const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${PERPLEXITY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'sonar',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
                stream: true,
                max_tokens: 1500,
              }),
            })
            if (pRes.ok && pRes.body) {
              send('stream_start', { model: 'perplexity-sonar' })
              const reader = pRes.body.getReader()
              const decoder = new TextDecoder()
              let buf = ''
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                const lines = buf.split('\n'); buf = lines.pop() || ''
                for (const line of lines) {
                  if (!line.startsWith('data: ')) continue
                  const raw = line.slice(6).trim()
                  if (raw === '[DONE]') continue
                  try { const c = JSON.parse(raw); const d = c.choices?.[0]?.delta?.content; if (d) send('token', { token: d }) } catch {}
                }
              }
            }
          }
        }

        send('done', { toolCount: toolResults.length })
        controller.close()
      } catch (err: any) {
        send('error', { message: err.message || 'Stream failed' })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
