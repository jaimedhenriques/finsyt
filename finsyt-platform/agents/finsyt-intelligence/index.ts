import { agent, tool, Sandbox } from "@21st-sdk/agent"
import { z } from "zod"

const EODHD = process.env.EODHD_API_KEY || ""
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://finsyt-platform.vercel.app"

async function eodhd(path: string, params: Record<string, string> = {}) {
  const p = new URLSearchParams({ api_token: EODHD, fmt: "json", ...params })
  const res = await fetch(`https://eodhd.com/api/${path}?${p}`)
  return res.json()
}

function sym(symbol: string) {
  return symbol.includes(".") ? symbol : `${symbol}.US`
}

// ─── Skills ──────────────────────────────────────────────────────────────────

const EODHD_SKILL = `---
name: EODHD Data API
description: How to use the EODHD financial data API
---

# EODHD API Reference

## Key Endpoints

### Real-time Quote
GET /real-time/{SYMBOL}.US

### Fundamentals (most important)
GET /fundamentals/{SYMBOL}.US
Returns: General, Highlights, Valuation, Technicals, Financials

### Historical EOD Prices
GET /eod/{SYMBOL}.US?from=YYYY-MM-DD&to=YYYY-MM-DD

### News & Sentiment
GET /news?s={SYMBOL}.US&limit=50
Sentiment: polarity > 0.2 = POSITIVE, < -0.2 = NEGATIVE, else NEUTRAL

### Macro Indicators
GET /macro-indicator/{COUNTRY}?indicator={INDICATOR}
Indicators: GDP_GROWTH_RATE, INFLATION_CPI_YOY, UNEMPLOYMENT_RATE, REAL_INTEREST_RATE, MANUFACTURING_PMI

### Insider Transactions (Form 4)
GET /insider-transactions?code={SYMBOL}.US

### Technical Indicators
GET /technical/{SYMBOL}.US?function=rsi&period=14
Functions: sma, ema, rsi, macd, bbands, atr, adx

## Symbol Format
- US stocks: AAPL.US, MSFT.US
- UK stocks: VOD.LSE
- Crypto: BTC-USD.CC
`

const ANALYSIS_SKILL = `---
name: Financial Analysis Procedures
description: Step-by-step procedures for common financial analysis tasks
---

# Financial Analysis Playbook

## Stock Deep Dive
1. Pull live quote: price, change%, market cap
2. Pull fundamentals: PE, EPS, revenue growth YoY, gross margin, net margin
3. Pull last 4 quarters income statement: identify revenue trend
4. Check insider transactions: bullish if buying, bearish if selling
5. Pull last 10 news items: assess sentiment
6. Summarise: bull case, bear case, key risks, analyst target vs current price

## Peer Comparison
1. Identify 3-5 peers in same sector
2. Pull Highlights: PE, EV/EBITDA, revenue growth, gross margin, net margin, ROE
3. Build comparison table
4. State cheapest on fundamentals and best growth

## Macro Context
1. Pull GDP growth, CPI, unemployment for relevant country
2. Assess interest rate environment
3. State whether macro is tailwind or headwind for sector
`

const FORMATTING_SKILL = `---
name: Output Formatting
description: How to format financial data for Finsyt users
---

# Formatting Standards

## Numbers
- Billions: $1.24B
- Millions: $456M
- Thousands: $12.3K
- Percentages: 23.4% (one decimal)
- Share prices: $142.50 (two decimals)

## Tables
Always use markdown tables for comparisons:
| Company | Revenue | Growth | PE | Margin |
|---------|---------|--------|-----|--------|

## Sentiment Labels
- polarity > 0.2: POSITIVE
- polarity -0.2 to 0.2: NEUTRAL
- polarity < -0.2: NEGATIVE

## Structure
1. TL;DR — one sentence summary
2. Key metrics — bullets
3. Analysis — 2-3 paragraphs
4. Data table — where relevant
5. Risks — 2-3 bullets
6. Source — cite EODHD + date
`

// ─── Tools ───────────────────────────────────────────────────────────────────

const getLiveQuote = tool({
  name: "getLiveQuote",
  description: "Get real-time price, market cap, PE ratio, 52-week range and key metrics for a stock",
  parameters: z.object({
    symbol: z.string().describe("Stock ticker e.g. AAPL, MSFT, NVDA"),
  }),
  execute: async ({ symbol }) => {
    const s = sym(symbol)
    const [live, fund] = await Promise.all([
      eodhd(`real-time/${s}`),
      eodhd(`fundamentals/${s}`),
    ])
    const h = fund?.Highlights || {}
    const g = fund?.General || {}
    const t = fund?.Technicals || {}
    const price = live.close || live.previousClose
    const prev  = live.previousClose
    const chg   = price - prev
    return {
      symbol: symbol.toUpperCase(),
      name: g.Name,
      price: `$${price?.toFixed(2)}`,
      change: `${chg >= 0 ? "+" : ""}${chg?.toFixed(2)} (${((chg / prev) * 100).toFixed(2)}%)`,
      marketCap: h.MarketCapitalization ? `$${(h.MarketCapitalization / 1e9).toFixed(2)}B` : "N/A",
      peRatio: h.PERatio || "N/A",
      eps: h.EarningsShare || "N/A",
      week52High: `$${t["52WeekHigh"] || live.high}`,
      week52Low: `$${t["52WeekLow"] || live.low}`,
      dividendYield: h.DividendYield ? `${(h.DividendYield * 100).toFixed(2)}%` : "N/A",
      analystTarget: h.AnalystTargetPrice ? `$${h.AnalystTargetPrice}` : "N/A",
      sector: g.Sector,
      industry: g.Industry,
      description: g.Description?.slice(0, 300),
      employees: g.FullTimeEmployees,
      dataSource: "EODHD",
      asOf: new Date().toISOString(),
    }
  },
})

const getFinancials = tool({
  name: "getFinancials",
  description: "Get income statement, balance sheet, or cash flow statement — annual or quarterly",
  parameters: z.object({
    symbol: z.string(),
    statement: z.enum(["income", "balance", "cashflow"]),
    period: z.enum(["annual", "quarterly"]).default("annual"),
    periods: z.number().default(5),
  }),
  execute: async ({ symbol, statement, period, periods }) => {
    const fund = await eodhd(`fundamentals/${sym(symbol)}`)
    const fin  = fund?.Financials
    if (!fin) return { error: `No financial data for ${symbol}` }
    const map: Record<string, string> = {
      income: "Income_Statement",
      balance: "Balance_Sheet",
      cashflow: "Cash_Flow",
    }
    const stmts = period === "quarterly"
      ? fin[map[statement]]?.quarterly
      : fin[map[statement]]?.annual
    if (!stmts) return { error: `No ${statement} data available` }
    const sorted = Object.values(stmts)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, Math.min(periods, 12))
    return { symbol: symbol.toUpperCase(), statement, period, data: sorted, dataSource: "EODHD" }
  },
})

const getPeerComparison = tool({
  name: "getPeerComparison",
  description: "Compare key financial metrics across multiple companies side by side",
  parameters: z.object({
    symbols: z.array(z.string()).describe("Array of tickers to compare e.g. ['AAPL', 'MSFT', 'GOOGL']"),
  }),
  execute: async ({ symbols }) => {
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const fund = await eodhd(`fundamentals/${sym(symbol)}`)
        const h = fund?.Highlights || {}
        const g = fund?.General || {}
        const v = fund?.Valuation || {}
        return {
          symbol: symbol.toUpperCase(),
          name: g.Name,
          sector: g.Sector,
          marketCap: h.MarketCapitalization ? `$${(h.MarketCapitalization / 1e9).toFixed(2)}B` : "N/A",
          peRatio: h.PERatio || "N/A",
          evEbitda: v.EnterpriseValueEbitda || "N/A",
          revenueGrowth: h.QuarterlyRevenueGrowthYOY ? `${(h.QuarterlyRevenueGrowthYOY * 100).toFixed(1)}%` : "N/A",
          netMargin: h.ProfitMargin ? `${(h.ProfitMargin * 100).toFixed(1)}%` : "N/A",
          roe: h.ReturnOnEquityTTM ? `${(h.ReturnOnEquityTTM * 100).toFixed(1)}%` : "N/A",
          analystTarget: h.AnalystTargetPrice ? `$${h.AnalystTargetPrice}` : "N/A",
        }
      })
    )
    return { comparison: results, dataSource: "EODHD", asOf: new Date().toISOString() }
  },
})

const getTechnicals = tool({
  name: "getTechnicals",
  description: "Get technical indicators: SMA, EMA, RSI, MACD, Bollinger Bands for a stock",
  parameters: z.object({
    symbol: z.string(),
    indicators: z.array(z.enum(["sma", "ema", "rsi", "macd", "bbands", "atr", "adx"])).default(["sma", "rsi"]),
    period: z.number().default(14),
  }),
  execute: async ({ symbol, indicators, period }) => {
    const s = sym(symbol)
    const results: Record<string, any> = {}
    await Promise.all(
      indicators.map(async (fn) => {
        try {
          const data = await eodhd(`technical/${s}`, { function: fn, period: String(period) })
          results[fn] = Array.isArray(data) ? data.slice(-5) : data
        } catch {
          results[fn] = null
        }
      })
    )
    return { symbol: symbol.toUpperCase(), period, indicators: results, dataSource: "EODHD" }
  },
})

const getHistoricalPrices = tool({
  name: "getHistoricalPrices",
  description: "Get historical OHLCV price data for charting and trend analysis",
  parameters: z.object({
    symbol: z.string(),
    from: z.string().describe("Start date YYYY-MM-DD"),
    to: z.string().describe("End date YYYY-MM-DD").optional(),
    period: z.enum(["d", "w", "m"]).default("d").describe("d=daily, w=weekly, m=monthly"),
  }),
  execute: async ({ symbol, from, to, period }) => {
    const params: Record<string, string> = { from, period }
    if (to) params.to = to
    const data = await eodhd(`eod/${sym(symbol)}`, params)
    const prices = Array.isArray(data) ? data : []
    return {
      symbol: symbol.toUpperCase(),
      from,
      to: to || new Date().toISOString().split("T")[0],
      period,
      count: prices.length,
      prices: prices.slice(-60),
      dataSource: "EODHD",
    }
  },
})

const getInsiderTransactions = tool({
  name: "getInsiderTransactions",
  description: "Get insider buying and selling activity (Form 4) for a company",
  parameters: z.object({
    symbol: z.string(),
  }),
  execute: async ({ symbol }) => {
    const data = await eodhd("insider-transactions", { code: sym(symbol) })
    const txns  = (Array.isArray(data) ? data : []).slice(0, 20)
    const buys  = txns.filter((t: any) => ["P", "A"].includes(t.transactionCode))
    const sells = txns.filter((t: any) => ["S", "D"].includes(t.transactionCode))
    return {
      symbol,
      summary: {
        totalBuys: buys.length,
        totalSells: sells.length,
        netSentiment: buys.length > sells.length ? "BULLISH" : buys.length < sells.length ? "BEARISH" : "NEUTRAL",
      },
      transactions: txns,
      dataSource: "EODHD/SEC Form 4",
    }
  },
})

const getNews = tool({
  name: "getNews",
  description: "Get latest news with sentiment scores for a ticker or general market",
  parameters: z.object({
    symbol: z.string().optional(),
    limit: z.number().default(10),
  }),
  execute: async ({ symbol, limit }) => {
    const params: Record<string, string> = { limit: String(limit) }
    if (symbol) params.s = sym(symbol)
    const data = await eodhd("news", params)
    const articles = (Array.isArray(data) ? data : []).slice(0, limit).map((a: any) => ({
      title: a.title,
      source: a.source,
      date: a.date,
      sentiment: {
        label: (a.sentiment?.polarity || 0) > 0.2 ? "POSITIVE" : (a.sentiment?.polarity || 0) < -0.2 ? "NEGATIVE" : "NEUTRAL",
        score: a.sentiment?.polarity?.toFixed(3),
      },
      url: a.link || a.url,
      summary: a.content?.slice(0, 300),
    }))
    return { symbol, articles, dataSource: "EODHD" }
  },
})

const getMacroIndicator = tool({
  name: "getMacroIndicator",
  description: "Get macroeconomic data: GDP, CPI, unemployment, PMI, interest rates with trend direction",
  parameters: z.object({
    country: z.string().default("US"),
    indicator: z.enum([
      "GDP_GROWTH_RATE", "INFLATION_CPI_YOY", "UNEMPLOYMENT_RATE",
      "REAL_INTEREST_RATE", "MANUFACTURING_PMI", "CONSUMER_CONFIDENCE",
      "RETAIL_SALES_YOY", "GOVERNMENT_DEBT_TO_GDP", "TRADE_BALANCE",
      "INDUSTRIAL_PRODUCTION", "GDP_USD",
    ]),
    periods: z.number().default(8),
  }),
  execute: async ({ country, indicator, periods }) => {
    const data = await eodhd(`macro-indicator/${country}`, { indicator })
    const history = (Array.isArray(data) ? data : []).slice(-periods)
    const latest = history[history.length - 1]
    const prev   = history[history.length - 2]
    const trend  = latest && prev
      ? Number(latest.value) > Number(prev.value) ? "Rising" : "Falling"
      : "N/A"
    return { country, indicator, latest: latest?.value, latestDate: latest?.date, trend, history, dataSource: "EODHD" }
  },
})

const getEarningsCalendar = tool({
  name: "getEarningsCalendar",
  description: "Get upcoming earnings announcements",
  parameters: z.object({
    days: z.number().default(14),
    symbols: z.string().optional(),
  }),
  execute: async ({ days, symbols }) => {
    const from = new Date().toISOString().split("T")[0]
    const to   = new Date(Date.now() + days * 86400000).toISOString().split("T")[0]
    const params: Record<string, string> = { from, to }
    if (symbols) params.symbols = symbols
    const data = await eodhd("calendar/earnings", params)
    const earnings = data?.earnings || data || []
    return { from, to, earnings: Array.isArray(earnings) ? earnings.slice(0, 30) : earnings, dataSource: "EODHD" }
  },
})

const searchSECFilings = tool({
  name: "searchSECFilings",
  description: "Search SEC EDGAR filings for a company (10-K, 10-Q, 8-K, DEF 14A, S-1)",
  parameters: z.object({
    symbol: z.string(),
    type: z.enum(["10-K", "10-Q", "8-K", "DEF 14A", "S-1"]).default("10-K"),
    limit: z.number().default(5),
  }),
  execute: async ({ symbol, type, limit }) => {
    const url = `${BASE_URL}/api/sec/filings?symbol=${symbol}&type=${encodeURIComponent(type)}&limit=${limit}`
    const res = await fetch(url)
    return res.json()
  },
})

// ─── Agent ───────────────────────────────────────────────────────────────────

export default agent({
  model: "claude-sonnet-4-6",
  runtime: "claude_code",
  permissionMode: "bypass",
  maxTurns: 80,
  maxBudgetUsd: 2.0,

  systemPrompt: `You are Finsyt Intelligence — an elite AI financial analyst embedded inside the Finsyt platform.

You have direct access to real-time market data, SEC filings, financial statements, insider transactions, earnings calendars, macro indicators, and news sentiment via your tools.

## Your capabilities
- Pull live quotes, fundamentals, and technicals for any public company globally
- Retrieve and analyse full income statements, balance sheets, and cash flow statements (annual & quarterly)
- Run peer comparisons across multiple companies side by side
- Search and summarise SEC filings (10-K, 10-Q, 8-K, DEF 14A, S-1)
- Surface insider buying/selling patterns with Form 4 data and net sentiment
- Track macro indicators: GDP, CPI, unemployment, PMI, interest rates with trend direction
- Get historical price data for trend analysis
- Analyse news sentiment around a ticker with polarity scoring

## Skills available
- When working with EODHD data APIs -> follow the "EODHD Data API" skill
- When running financial analysis -> follow the "Financial Analysis Procedures" skill
- When formatting output -> follow the "Output Formatting" skill

## How you respond
- Always cite your data source (EODHD, SEC EDGAR, etc.) and the date of the data
- Lead with the most important insight (TL;DR first)
- Format comparisons as markdown tables
- Show your reasoning step by step — users want to see your work
- If data is unavailable, say so and suggest alternatives

## Tone
Professional, direct, analyst-grade. Think Goldman Sachs research note meets Bloomberg terminal intelligence.`,

  sandbox: Sandbox({
    cpuCount: 2,
    memoryMB: 4096,
    timeoutMs: 600_000,
    files: {
      "/home/user/workspace/.claude/skills/eodhd-api/SKILL.md": EODHD_SKILL,
      "/home/user/workspace/.claude/skills/financial-analysis/SKILL.md": ANALYSIS_SKILL,
      "/home/user/workspace/.claude/skills/output-formatting/SKILL.md": FORMATTING_SKILL,
    },
  }),

  tools: [
    getLiveQuote,
    getFinancials,
    getPeerComparison,
    getTechnicals,
    getHistoricalPrices,
    getInsiderTransactions,
    getNews,
    getMacroIndicator,
    getEarningsCalendar,
    searchSECFilings,
  ],
})
