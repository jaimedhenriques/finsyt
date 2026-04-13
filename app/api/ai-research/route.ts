import { NextRequest, NextResponse } from 'next/server'

const GROQ       = process.env.GROQ_API_KEY
const PERPLEXITY = process.env.PERPLEXITY_API_KEY
const FMP        = process.env.FMP_API_KEY
const FINNHUB    = process.env.FINNHUB_API_KEY
const EODHD      = process.env.EODHD_API_KEY || process.env.eodhd_api
const FRED       = process.env.FRED_API_KEY

const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768']

// ── Agent personas (agency-agents by msitarzewski — Quinn + Morgan composite) ─
const SYSTEM_PROMPT = `You are Finsyt Intelligence — an institutional-grade AI financial research engine built into the Finsyt platform.

## Identity
You operate as a composite of two specialist personas:
- **Quinn** (Investment Researcher, 14+ years buy-side): finds alpha in footnotes, challenges comfortable narratives, always presents bull AND bear case with equal rigour
- **Morgan** (Financial Analyst, 12+ years IB/FP&A): thinks in cash flows not revenue, translates numbers into strategy, states assumptions before conclusions

Your superpower: variant perception. If your thesis matches consensus, you don't have edge — you have company.

## Data Access
Real-time quotes (FMP), income statements/balance sheets/cash flows (FMP), earnings call transcripts (FMP), SEC filings (EDGAR), insider transactions (FMP/EODHD/Finnhub), analyst estimates & consensus (FMP), news & sentiment (EODHD/FMP/Finnhub), macro indicators (FRED), Finsyt FQL formula dictionary.

## Non-Negotiable Rules
1. Separate thesis from narrative — every claim needs quantifiable support
2. Always present both sides — bull AND bear case, equally rigorous
3. Cite primary sources inline: (FMP), (EDGAR 10-K), (transcript Q4'26), (FRED), (consensus)
4. Quantify the downside — specific loss scenarios, not "it could go down"
5. State assumptions before conclusions — make them visible and challengeable
6. Flag confidence levels — High / Medium / Speculative. Flag stale or estimated data.
7. Lead with the "so what" — the key insight first, then the detail

## Response Format
Structure every response as:
DIRECT ANSWER (1-2 sentences upfront)
KEY FACTS — data-rich, bold labels, inline sources
ANALYSIS — variant thesis, assumptions, scenario ranges
RISK FACTORS — quantified downside, thesis breakers
SYNTHESIS — actionable conclusion with conviction level

Use bold labels for every data point: "**Revenue (FY2025):** $39.3B (+73% YoY) (FMP)"
Reference FQL keys where relevant: FX_REV, FX_EBITDA, FX_FCF, FX_FCF`

// ── Context builders ──────────────────────────────────────────────────────────

async function getQuoteContext(symbol: string): Promise<string> {
  if (!symbol) return ''
  try {
    // FMP quote + profile
    const [qRes, profRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP}`),
    ])
    const [quotes, profiles] = await Promise.all([qRes.json(), profRes.json()])
    const q = Array.isArray(quotes) ? quotes[0] : quotes
    const p = Array.isArray(profiles) ? profiles[0] : profiles
    if (!q?.price) return ''
    return `REAL-TIME QUOTE (${symbol}):
Price: $${q.price} | Change: ${q.changesPercentage?.toFixed(2)}% | Volume: ${(q.volume/1e6).toFixed(1)}M
Market Cap: $${(q.marketCap/1e9).toFixed(1)}B | P/E: ${q.pe || 'N/A'} | EPS: $${q.eps || 'N/A'}
52W High: $${q.yearHigh} | 52W Low: $${q.yearLow}
Sector: ${p?.sector || 'N/A'} | Industry: ${p?.industry || 'N/A'}
Exchange: ${p?.exchangeShortName || 'N/A'} | Country: ${p?.country || 'US'}`
  } catch { return '' }
}

async function getFinancialsContext(symbol: string): Promise<string> {
  if (!symbol || !FMP) return ''
  try {
    const [isRes, bsRes, cfRes, ratioRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&period=annual&limit=3&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${symbol}&period=annual&limit=1&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&period=annual&limit=1&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/ratios?symbol=${symbol}&period=annual&limit=1&apikey=${FMP}`),
    ])
    const [is, bs, cf, ratios] = await Promise.all([isRes.json(), bsRes.json(), cfRes.json(), ratioRes.json()])
    const i0 = Array.isArray(is) ? is[0] : {}
    const i1 = Array.isArray(is) ? is[1] : {}
    const b0 = Array.isArray(bs) ? bs[0] : {}
    const c0 = Array.isArray(cf) ? cf[0] : {}
    const r0 = Array.isArray(ratios) ? ratios[0] : {}

    const fmt = (v: any, b = true) => v ? (b ? `$${(Number(v)/1e9).toFixed(2)}B` : `${(Number(v)*100).toFixed(1)}%`) : 'N/A'
    const yoy = (cur: any, prev: any) => (cur && prev && prev !== 0) ? `${(((cur-prev)/Math.abs(prev))*100).toFixed(1)}% YoY` : ''

    return `FINANCIAL STATEMENTS (${symbol}, FY${i0.calendarYear || new Date().getFullYear() - 1}):
INCOME STATEMENT (FX_REV, FX_EBITDA, FX_NET_INC):
  Revenue: ${fmt(i0.revenue)} ${yoy(i0.revenue, i1.revenue)} | Gross Margin: ${fmt(i0.grossProfitRatio, false)} | EBITDA: ${fmt(i0.ebitda)} (${fmt(i0.ebitdaratio, false)})
  EBIT: ${fmt(i0.operatingIncome)} | Net Income: ${fmt(i0.netIncome)} ${yoy(i0.netIncome, i1.netIncome)} | Net Margin: ${fmt(i0.netIncomeRatio, false)}
  EPS Diluted: $${i0.epsdiluted || 'N/A'} | R&D: ${fmt(i0.researchAndDevelopmentExpenses)} | SG&A: ${fmt(i0.sellingGeneralAndAdministrativeExpenses)}
BALANCE SHEET (FX_ASSETS, FX_NET_DEBT, FX_EQUITY):
  Total Assets: ${fmt(b0.totalAssets)} | Cash: ${fmt(b0.cashAndCashEquivalents)} | Total Debt: ${fmt(b0.totalDebt)} | Net Debt: ${fmt(b0.netDebt)}
  Total Equity: ${fmt(b0.totalStockholdersEquity)} | Goodwill: ${fmt(b0.goodwill)} | Book Value/Share: $${b0.bookValuePerShare || 'N/A'}
CASH FLOW (FX_FCF, FX_CAPEX):
  Operating CF: ${fmt(c0.operatingCashFlow)} | CapEx: ${fmt(c0.capitalExpenditure)} | FCF: ${fmt(c0.freeCashFlow)} | Buybacks: ${fmt(c0.commonStockRepurchased)}
KEY RATIOS:
  P/E: ${r0.priceEarningsRatio?.toFixed(1) || 'N/A'}x | EV/EBITDA: ${r0.enterpriseValueMultiple?.toFixed(1) || 'N/A'}x | P/B: ${r0.priceToBookRatio?.toFixed(1) || 'N/A'}x
  ROE: ${fmt(r0.returnOnEquity, false)} | ROA: ${fmt(r0.returnOnAssets, false)} | Debt/Equity: ${r0.debtEquityRatio?.toFixed(2) || 'N/A'}x
Source: FMP (Financial Modeling Prep)`
  } catch { return '' }
}

async function getEstimatesContext(symbol: string): Promise<string> {
  if (!symbol || !FMP) return ''
  try {
    const [analRes, surpriseRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}&period=annual&limit=3&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/earnings-surprises?symbol=${symbol}&limit=4&apikey=${FMP}`),
    ])
    const [analysts, surprises] = await Promise.all([analRes.json(), surpriseRes.json()])
    const a0 = Array.isArray(analysts) ? analysts[0] : {}
    const surpriseLines = (Array.isArray(surprises) ? surprises : []).slice(0, 4)
      .map((s: any) => `  ${s.date}: Actual $${s.actualEarningResult} vs Est $${s.estimatedEarning} (${s.actualEarningResult >= s.estimatedEarning ? 'BEAT +' : 'MISS '}${Math.abs(((s.actualEarningResult - s.estimatedEarning)/Math.abs(s.estimatedEarning))*100).toFixed(1)}%)`)
      .join('\n')

    return `ANALYST ESTIMATES (FE_EPS_EST, FE_REV_EST):
  NTM EPS Consensus: $${a0.estimatedEpsAvg || 'N/A'} (High: $${a0.estimatedEpsHigh || 'N/A'}, Low: $${a0.estimatedEpsLow || 'N/A'})
  NTM Revenue Consensus: $${a0.estimatedRevenueAvg ? (a0.estimatedRevenueAvg/1e9).toFixed(1)+'B' : 'N/A'}
  NTM EBITDA Consensus: $${a0.estimatedEbitdaAvg ? (a0.estimatedEbitdaAvg/1e9).toFixed(1)+'B' : 'N/A'}
EARNINGS BEAT/MISS HISTORY:
${surpriseLines || '  No data'}
Source: FMP Analyst Consensus`
  } catch { return '' }
}

async function getTranscriptContext(symbol: string): Promise<string> {
  if (!symbol || !FMP) return ''
  try {
    // Get list then fetch latest
    const listRes = await fetch(`https://financialmodelingprep.com/api/v4/earning_call_transcript?symbol=${symbol}&apikey=${FMP}`)
    const list = await listRes.json()
    if (!Array.isArray(list) || list.length === 0) return ''
    const [year, quarter] = list[0]
    const tRes = await fetch(`https://financialmodelingprep.com/api/v3/earning_call_transcript/${symbol}?year=${year}&quarter=${quarter}&apikey=${FMP}`)
    const tData = await tRes.json()
    const transcript = Array.isArray(tData) ? tData[0] : tData
    if (!transcript?.content) return ''
    // Extract key management quotes (first 2000 chars of actual content)
    const content = transcript.content.slice(0, 2500).replace(/\n{3,}/g, '\n\n')
    return `LATEST EARNINGS TRANSCRIPT (${symbol} Q${quarter} FY${year}, ${transcript.date || ''}):
${content}...
[Full transcript available via /api/transcripts?symbol=${symbol}&year=${year}&quarter=${quarter}]
Source: FMP Earnings Transcripts`
  } catch { return '' }
}

async function getInsiderContext(symbol: string): Promise<string> {
  if (!symbol || !FMP) return ''
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/insider-trading?symbol=${symbol}&limit=10&apikey=${FMP}`)
    const data = await res.json()
    const trades = (Array.isArray(data) ? data : []).slice(0, 8)
    if (trades.length === 0) return ''
    const lines = trades.map((t: any) =>
      `  ${t.transactionDate}: ${t.reportingName} (${t.officerTitle || 'Insider'}) — ${t.transactionType} ${Math.abs(t.securitiesTransacted || 0).toLocaleString()} shares @ $${t.transactionPrice || 'N/A'} = $${((Math.abs(t.securitiesTransacted || 0)) * (t.transactionPrice || 0) / 1e6).toFixed(1)}M`
    ).join('\n')
    const netBuy = trades.filter((t: any) => t.transactionType?.includes('Purchase') || t.transactionType?.includes('Buy')).length
    const netSell = trades.filter((t: any) => t.transactionType?.includes('Sale') || t.transactionType?.includes('Sell')).length
    return `INSIDER TRANSACTIONS (${symbol}, last 10):
${lines}
SUMMARY: ${netBuy} buys vs ${netSell} sells in recent period
Source: FMP SEC Form 4 Filings`
  } catch { return '' }
}

async function getNewsContext(symbol: string): Promise<string> {
  try {
    const sources: string[] = []
    // FMP news
    if (FMP) {
      const res = await fetch(`https://financialmodelingprep.com/stable/news/stock?symbols=${symbol}&limit=8&apikey=${FMP}`)
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).slice(0, 5).forEach((n: any) => sources.push(`- [${n.publishedDate?.slice(0,10) || ''}] ${n.title} (${n.site || 'FMP News'})`))
    }
    // Finnhub news as supplement
    if (FINNHUB && symbol && sources.length < 8) {
      const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const to = new Date().toISOString().slice(0, 10)
      const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB}`)
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).slice(0, 5).forEach((n: any) => {
        const key = n.headline
        if (!sources.some(s => s.includes(key.slice(0, 30)))) {
          sources.push(`- [${n.datetime ? new Date(n.datetime * 1000).toISOString().slice(0, 10) : ''}] ${n.headline} (Finnhub)`)
        }
      })
    }
    if (sources.length === 0) return ''
    return `RECENT NEWS (${symbol}):\n${sources.join('\n')}`
  } catch { return '' }
}

async function getMacroContext(): Promise<string> {
  if (!FRED) return ''
  try {
    const SERIES = { 'Fed Funds Rate': 'FEDFUNDS', 'CPI YoY': 'CPIAUCSL', '10Y Yield': 'GS10', 'Unemployment': 'UNRATE' }
    const results = await Promise.allSettled(
      Object.entries(SERIES).map(async ([name, sid]) => {
        const res = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${sid}&api_key=${FRED}&file_type=json&sort_order=desc&limit=1`)
        const d = await res.json()
        const val = d.observations?.[0]?.value
        return `${name}: ${val}% (FRED, ${d.observations?.[0]?.date || ''})`
      })
    )
    const lines = results.filter(r => r.status === 'fulfilled').map(r => `  ${(r as any).value}`)
    return lines.length ? `MACRO ENVIRONMENT (FRED):\n${lines.join('\n')}` : ''
  } catch { return '' }
}

// ── Assemble full context for a symbol ────────────────────────────────────────
async function buildContext(symbol: string, queryType: string): Promise<{ text: string; sources: string[] }> {
  const isMacroQuery = /macro|gdp|inflation|fed|rate|yield|economy/i.test(queryType)
  const isInsiderQuery = /insider|form 4|trade|buy|sell/i.test(queryType)
  const isTranscriptQuery = /transcript|call|earnings call|management|guidance/i.test(queryType)
  const isEstimateQuery = /estimate|consensus|analyst|target|forecast/i.test(queryType)

  const tasks: Promise<string>[] = [getQuoteContext(symbol)]
  if (!isMacroQuery) tasks.push(getFinancialsContext(symbol))
  if (isEstimateQuery || !isMacroQuery) tasks.push(getEstimatesContext(symbol))
  if (isTranscriptQuery) tasks.push(getTranscriptContext(symbol))
  if (isInsiderQuery) tasks.push(getInsiderContext(symbol))
  tasks.push(getNewsContext(symbol))
  if (isMacroQuery || !symbol) tasks.push(getMacroContext())

  const results = await Promise.allSettled(tasks)
  const parts = results
    .filter(r => r.status === 'fulfilled' && (r as any).value)
    .map(r => (r as any).value)

  const sources = []
  if (parts.some(p => p.includes('FMP'))) sources.push('FMP')
  if (parts.some(p => p.includes('FRED'))) sources.push('FRED')
  if (parts.some(p => p.includes('Finnhub'))) sources.push('Finnhub')
  if (parts.some(p => p.includes('EODHD'))) sources.push('EODHD')
  if (parts.some(p => p.includes('EDGAR'))) sources.push('SEC EDGAR')
  if (parts.some(p => p.includes('Transcript'))) sources.push('Earnings Transcripts')

  return { text: parts.join('\n\n'), sources }
}

// ── LLM calls ─────────────────────────────────────────────────────────────────
async function callGroq(messages: any[], model: string) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ}` },
    body: JSON.stringify({ model, messages, temperature: 0.15, max_tokens: 2000 }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  return (await res.json()).choices?.[0]?.message?.content || ''
}

async function callPerplexity(query: string, symbol?: string) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PERPLEXITY}` },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: symbol ? `${query} (regarding ${symbol})` : query },
      ],
      temperature: 0.15, max_tokens: 2000,
    }),
  })
  if (!res.ok) throw new Error(`Perplexity ${res.status}`)
  const d = await res.json()
  return { content: d.choices?.[0]?.message?.content || '', citations: d.citations || [] }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { query, symbol, messages: history, usePerplexity, contextLevel = 'full' } = await req.json()
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 })

    const sym = symbol?.toUpperCase() || extractSymbol(query)

    // Build multi-source context
    const { text: context, sources: dataSources } = sym ? await buildContext(sym, query) : { text: '', sources: [] }

    const systemWithCtx = context
      ? `${SYSTEM_PROMPT}\n\n${'─'.repeat(60)}\nLIVE DATA CONTEXT (as of ${new Date().toISOString().slice(0,10)}):\n${context}\n${'─'.repeat(60)}`
      : SYSTEM_PROMPT

    const msgs = [
      { role: 'system', content: systemWithCtx },
      ...(history || []).slice(-8).map((m: any) => ({
        role: m.role === 'ai' || m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : (m.bullets?.join('\n') || ''),
      })),
      { role: 'user', content: query },
    ]

    let responseText = ''
    let citations: any[] = []
    let modelUsed = ''

    // Try Groq first (fastest, free, good for structured financial analysis)
    if (GROQ && !usePerplexity) {
      for (const model of GROQ_MODELS) {
        try {
          responseText = await callGroq(msgs, model)
          modelUsed = `groq/${model}`
          if (responseText) break
        } catch (e) { console.error(`Groq ${model} failed:`, e) }
      }
    }

    // Perplexity fallback (web-grounded, great for current events / news queries)
    if (!responseText && PERPLEXITY) {
      const result = await callPerplexity(query, sym)
      responseText = result.content
      citations = result.citations
      modelUsed = 'perplexity/sonar-pro'
    }

    if (!responseText) return NextResponse.json({ error: 'All AI providers unavailable' }, { status: 503 })

    // Parse into structured bullets + summary
    const lines = responseText.split('\n').filter(l => l.trim())
    const bullets: string[] = []
    const paragraphs: string[] = []

    lines.forEach(line => {
      const trimmed = line.trim()
      if (trimmed.match(/^[-•*]\s+/) || trimmed.match(/^\d+\.\s+/)) {
        bullets.push(trimmed.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, ''))
      } else if (trimmed.length > 30) {
        paragraphs.push(trimmed)
      }
    })

    const allCitations = [
      ...dataSources.map(s => ({ title: `${s} — Live Data`, type: 'filing' as const })),
      ...citations.slice(0, 3).map((c: any) => ({ title: typeof c === 'string' ? c : c.title || c, type: 'news' as const })),
      ...(sym ? [{ title: `${sym} Profile`, type: 'filing' as const, symbol: sym }] : []),
    ]

    return NextResponse.json({
      content: paragraphs.join(' ').slice(0, 600),
      bullets: bullets.length > 0 ? bullets : [responseText.slice(0, 600)],
      fullText: responseText,
      sources: allCitations,
      modelUsed,
      symbol: sym,
      hasLiveData: !!context,
      dataSources,
      contextLength: context.length,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Research failed', detail: String(e) }, { status: 500 })
  }
}

function extractSymbol(query: string): string {
  const upper = query.toUpperCase()
  // Check explicit ticker patterns like "$AAPL" or "AAPL:"
  const dollarMatch = upper.match(/\$([A-Z]{1,5})/)
  if (dollarMatch) return dollarMatch[1]
  // Common tickers
  const tickers = ['NVDA','TSLA','MSFT','AAPL','META','GOOGL','AMZN','JPM','GS','V','MA',
    'NFLX','AMD','INTC','AVGO','TSM','PLTR','UBER','ABNB','CRM','SNOW','COIN','RBLX',
    'HOOD','SOFI','RIVN','LCID','NIO','BABA','JNJ','UNH','PFE','WMT','HD','BAC','WFC',
    'BRK','CVX','XOM','LLY','ABBV','MRK','TMO','COST','ORCL','ADBE','QCOM','TXN','NOW']
  return tickers.find(t => upper.includes(` ${t} `) || upper.includes(` ${t},`) || upper.includes(` ${t}.`) || upper.startsWith(t + ' ') || upper.endsWith(' ' + t)) || ''
}
