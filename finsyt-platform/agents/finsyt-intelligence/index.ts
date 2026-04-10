import { agent, tool } from "@21st-sdk/agent"
import { z } from "zod"

const EODHD   = process.env.EODHD_API_KEY || process.env.eodhd_api
const FMP     = process.env.FMP_API_KEY
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://finsyt-platform.vercel.app"

// ─── Helper ──────────────────────────────────────────────────────────────────
async function eodhd(path: string, params: Record<string, string> = {}) {
  const p = new URLSearchParams({ api_token: EODHD!, fmt: "json", ...params })
  const res = await fetch(`https://eodhd.com/api/${path}?${p}`)
  return res.json()
}

function eodSymbol(symbol: string) {
  return symbol.includes(".") ? symbol : `${symbol}.US`
}

// ─── Agent Definition ────────────────────────────────────────────────────────
export default agent({
  model: "claude-sonnet-4-6",
  runtime: "claude-code",
  permissionMode: "bypassPermissions",
  maxTurns: 40,
  maxBudgetUsd: 2,

  systemPrompt: `You are Finsyt Intelligence — an elite AI financial analyst embedded inside the Finsyt platform.

You have direct access to real-time market data, SEC filings, financial statements, insider transactions, earnings calendars, macro indicators, and news sentiment via your tools.

## Your capabilities
- Pull live quotes, fundamentals, and technicals for any public company globally
- Retrieve and analyse full income statements, balance sheets, and cash flow statements (annual & quarterly)
- Search and summarise SEC filings (10-K, 10-Q, 8-K, DEF 14A, S-1)
- Surface insider buying/selling patterns with Form 4 data
- Track macro indicators: GDP, CPI, unemployment, PMI, interest rates
- Run peer comparisons across sectors
- Identify earnings beats/misses and revenue growth trends
- Analyse news sentiment around a ticker

## How you respond
- Always cite your data source (EODHD, SEC EDGAR, etc.) and the date of the data
- Lead with the most important insight, then support with numbers
- Format financials as clean tables when comparing multiple periods or companies
- Show your reasoning step by step — users want to see your work
- If data is unavailable, say so and suggest alternatives
- Be concise but thorough — this is a professional tool, not a chatbot
- Use $ for USD values, format large numbers as $1.2B, $345M, etc.

## Tone
Professional, direct, analyst-grade. Think Goldman Sachs research note meets Bloomberg terminal intelligence.`,

  tools: {
    // ── Market Data ──────────────────────────────────────────────────────────
    getLiveQuote: tool({
      description: "Get real-time price, market cap, PE ratio, 52-week range and key metrics for a stock",
      inputSchema: z.object({
        symbol: z.string().describe("Stock ticker e.g. AAPL, MSFT, NVDA"),
      }),
      execute: async ({ symbol }) => {
        const sym = eodSymbol(symbol)
        const [live, fund] = await Promise.all([
          eodhd(`real-time/${sym}`),
          eodhd(`fundamentals/${sym}`),
        ])
        const h = fund?.Highlights || {}
        const v = fund?.Valuation || {}
        const g = fund?.General || {}
        const t = fund?.Technicals || {}
        const price = live.close || live.previousClose
        const prev  = live.previousClose
        const chg   = price - prev
        const result = {
          symbol: symbol.toUpperCase(),
          name: g.Name,
          price: `$${price?.toFixed(2)}`,
          change: `${chg >= 0 ? "+" : ""}${chg?.toFixed(2)} (${((chg/prev)*100).toFixed(2)}%)`,
          marketCap: h.MarketCapitalization ? `$${(h.MarketCapitalization/1e9).toFixed(2)}B` : "N/A",
          peRatio: h.PERatio || v.TrailingPE || "N/A",
          eps: h.EarningsShare || "N/A",
          beta: fund?.Technicals?.Beta || "N/A",
          week52High: `$${t["52WeekHigh"] || live.high}`,
          week52Low:  `$${t["52WeekLow"]  || live.low}`,
          dividendYield: h.DividendYield ? `${(h.DividendYield*100).toFixed(2)}%` : "N/A",
          analystTarget: h.AnalystTargetPrice ? `$${h.AnalystTargetPrice}` : "N/A",
          sector: g.Sector,
          industry: g.Industry,
          exchange: g.Exchange,
          description: g.Description?.slice(0, 300),
          dataSource: "EODHD",
          asOf: new Date().toISOString(),
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
      },
    }),

    // ── Financials ───────────────────────────────────────────────────────────
    getFinancials: tool({
      description: "Get income statement, balance sheet, or cash flow statement — annual or quarterly",
      inputSchema: z.object({
        symbol: z.string().describe("Stock ticker"),
        statement: z.enum(["income", "balance", "cashflow"]).describe("Which financial statement"),
        period: z.enum(["annual", "quarterly"]).default("annual"),
        periods: z.number().default(5).describe("Number of periods to return (max 12)"),
      }),
      execute: async ({ symbol, statement, period, periods }) => {
        const sym  = eodSymbol(symbol)
        const fund = await eodhd(`fundamentals/${sym}`)
        const fin  = fund?.Financials
        if (!fin) return { content: [{ type: "text", text: `No financial data found for ${symbol}` }] }

        const map: Record<string, string> = { income: "Income_Statement", balance: "Balance_Sheet", cashflow: "Cash_Flow" }
        const key = map[statement]
        const stmts = period === "quarterly" ? fin[key]?.quarterly : fin[key]?.annual
        if (!stmts) return { content: [{ type: "text", text: `No ${statement} data available` }] }

        const sorted = Object.values(stmts)
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, Math.min(periods, 12))

        const result = {
          symbol: symbol.toUpperCase(),
          statement,
          period,
          data: sorted,
          dataSource: "EODHD",
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
      },
    }),

    // ── Insider Transactions ─────────────────────────────────────────────────
    getInsiderTransactions: tool({
      description: "Get insider buying and selling activity (Form 4 filings) for a company",
      inputSchema: z.object({
        symbol: z.string().describe("Stock ticker"),
      }),
      execute: async ({ symbol }) => {
        const sym  = eodSymbol(symbol)
        const data = await eodhd("insider-transactions", { code: sym })
        const recent = (Array.isArray(data) ? data : []).slice(0, 20)
        return { content: [{ type: "text", text: JSON.stringify({ symbol, transactions: recent, dataSource: "EODHD/SEC Form 4" }, null, 2) }] }
      },
    }),

    // ── News & Sentiment ─────────────────────────────────────────────────────
    getNews: tool({
      description: "Get latest news articles with sentiment scores for a ticker or general market",
      inputSchema: z.object({
        symbol: z.string().optional().describe("Stock ticker (optional — omit for general market news)"),
        limit: z.number().default(10),
      }),
      execute: async ({ symbol, limit }) => {
        const params: Record<string, string> = { limit: String(limit) }
        if (symbol) params.s = eodSymbol(symbol)
        const data = await eodhd("news", params)
        const articles = (Array.isArray(data) ? data : []).slice(0, limit).map((a: any) => ({
          title:     a.title,
          source:    a.source,
          date:      a.date,
          sentiment: a.sentiment,
          url:       a.link || a.url,
          summary:   a.content?.slice(0, 200),
        }))
        return { content: [{ type: "text", text: JSON.stringify({ symbol, articles, dataSource: "EODHD" }, null, 2) }] }
      },
    }),

    // ── Macro Indicators ─────────────────────────────────────────────────────
    getMacroIndicator: tool({
      description: "Get macroeconomic data: GDP growth, inflation (CPI), unemployment, PMI, interest rates, consumer confidence",
      inputSchema: z.object({
        country: z.string().default("US").describe("ISO country code e.g. US, GB, DE, JP"),
        indicator: z.enum([
          "GDP_GROWTH_RATE", "INFLATION_CPI_YOY", "UNEMPLOYMENT_RATE",
          "REAL_INTEREST_RATE", "MANUFACTURING_PMI", "CONSUMER_CONFIDENCE",
          "RETAIL_SALES_YOY", "GOVERNMENT_DEBT_TO_GDP", "TRADE_BALANCE",
          "INDUSTRIAL_PRODUCTION", "GDP_USD",
        ]).describe("Macro indicator to fetch"),
        periods: z.number().default(8).describe("Number of historical periods"),
      }),
      execute: async ({ country, indicator, periods }) => {
        const data = await eodhd(`macro-indicator/${country}`, { indicator })
        const history = (Array.isArray(data) ? data : []).slice(-periods)
        return { content: [{ type: "text", text: JSON.stringify({ country, indicator, history, dataSource: "EODHD" }, null, 2) }] }
      },
    }),

    // ── Earnings Calendar ────────────────────────────────────────────────────
    getEarningsCalendar: tool({
      description: "Get upcoming earnings announcements for the next N days",
      inputSchema: z.object({
        days: z.number().default(14).describe("Number of days ahead to look"),
        symbols: z.string().optional().describe("Comma-separated tickers to filter (optional)"),
      }),
      execute: async ({ days, symbols }) => {
        const from = new Date().toISOString().split("T")[0]
        const to   = new Date(Date.now() + days * 86400000).toISOString().split("T")[0]
        const params: Record<string, string> = { from, to }
        if (symbols) params.symbols = symbols
        const data = await eodhd("calendar/earnings", params)
        const earnings = data?.earnings || data || []
        return { content: [{ type: "text", text: JSON.stringify({ from, to, earnings: Array.isArray(earnings) ? earnings.slice(0, 30) : earnings, dataSource: "EODHD" }, null, 2) }] }
      },
    }),

    // ── Peer Comparison ──────────────────────────────────────────────────────
    comparePeers: tool({
      description: "Compare key metrics across multiple companies side by side",
      inputSchema: z.object({
        symbols: z.array(z.string()).describe("Array of tickers to compare e.g. ['AAPL','MSFT','GOOGL']"),
        metrics: z.array(z.string()).default(["PERatio", "MarketCapitalization", "EarningsShare", "DividendYield", "ProfitMargin", "ReturnOnEquityTTM"]),
      }),
      execute: async ({ symbols, metrics }) => {
        const results = await Promise.allSettled(
          symbols.map(async (symbol) => {
            const fund = await eodhd(`fundamentals/${eodSymbol(symbol)}`)
            const h = fund?.Highlights || {}
            const v = fund?.Valuation  || {}
            const g = fund?.General    || {}
            return {
              symbol: symbol.toUpperCase(),
              name: g.Name,
              sector: g.Sector,
              marketCap: h.MarketCapitalization,
              peRatio: h.PERatio || v.TrailingPE,
              eps: h.EarningsShare,
              dividendYield: h.DividendYield,
              profitMargin: h.ProfitMargin,
              roe: h.ReturnOnEquityTTM,
              revenueGrowth: h.QuarterlyRevenueGrowthYOY,
              analystTarget: h.AnalystTargetPrice,
            }
          })
        )
        const comparison = results.map((r, i) =>
          r.status === "fulfilled" ? r.value : { symbol: symbols[i], error: "Failed to fetch" }
        )
        return { content: [{ type: "text", text: JSON.stringify({ comparison, dataSource: "EODHD" }, null, 2) }] }
      },
    }),

    // ── SEC Filings Search ───────────────────────────────────────────────────
    searchFilings: tool({
      description: "Search SEC EDGAR filings for a company — 10-K, 10-Q, 8-K, S-1, DEF 14A etc.",
      inputSchema: z.object({
        symbol: z.string().describe("Stock ticker"),
        type: z.string().default("10-K").describe("Filing type: 10-K, 10-Q, 8-K, S-1, DEF 14A"),
        limit: z.number().default(5),
      }),
      execute: async ({ symbol, type, limit }) => {
        try {
          const res  = await fetch(`${BASE_URL}/api/filings?symbol=${symbol}&type=${type}&limit=${limit}`)
          const data = await res.json()
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
        } catch (e: any) {
          return { content: [{ type: "text", text: `Failed to fetch filings: ${e.message}` }] }
        }
      },
    }),

    // ── ESG Data ─────────────────────────────────────────────────────────────
    getESGData: tool({
      description: "Get ESG (Environmental, Social, Governance) scores for a company",
      inputSchema: z.object({
        symbol: z.string().describe("Stock ticker"),
      }),
      execute: async ({ symbol }) => {
        const sym  = eodSymbol(symbol)
        const data = await eodhd("esg-data", { code: sym })
        return { content: [{ type: "text", text: JSON.stringify({ symbol, esg: data, dataSource: "EODHD" }, null, 2) }] }
      },
    }),
  },
})
