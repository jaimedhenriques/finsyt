/**
 * Finsyt Intelligence — financial data tools (no SDK dependency)
 * These are used directly by /api/ai-research via dynamic import.
 */

const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api || ''

async function eodhd(path: string, params: Record<string, string> = {}) {
  const p = new URLSearchParams({ api_token: EODHD, fmt: 'json', ...params })
  const res = await fetch(`https://eodhd.com/api/${path}?${p}`)
  return res.json()
}

function eodSymbol(symbol: string) {
  return symbol.includes('.') ? symbol : `${symbol}.US`
}

export const tools = {
  getLiveQuote: async ({ symbol }: { symbol: string }) => {
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
    return {
      symbol: symbol.toUpperCase(), name: g.Name,
      price: `$${price?.toFixed(2)}`,
      change: `${chg >= 0 ? '+' : ''}${chg?.toFixed(2)} (${((chg / prev) * 100).toFixed(2)}%)`,
      marketCap: h.MarketCapitalization ? `$${(h.MarketCapitalization / 1e9).toFixed(2)}B` : 'N/A',
      peRatio: h.PERatio || v.TrailingPE || 'N/A',
      eps: h.EarningsShare || 'N/A',
      week52High: `$${t['52WeekHigh'] || live.high}`,
      week52Low:  `$${t['52WeekLow']  || live.low}`,
      dividendYield: h.DividendYield ? `${(h.DividendYield * 100).toFixed(2)}%` : 'N/A',
      analystTarget: h.AnalystTargetPrice ? `$${h.AnalystTargetPrice}` : 'N/A',
      sector: g.Sector, industry: g.Industry, exchange: g.Exchange,
      description: g.Description?.slice(0, 300),
    }
  },

  getFinancials: async ({ symbol, statement, period = 'annual', periods = 5 }: {
    symbol: string; statement: 'income' | 'balance' | 'cashflow'; period?: 'annual' | 'quarterly'; periods?: number
  }) => {
    const sym  = eodSymbol(symbol)
    const fund = await eodhd(`fundamentals/${sym}`)
    const fin  = fund?.Financials
    if (!fin) return { error: `No financial data found for ${symbol}` }
    const map: Record<string, string> = { income: 'Income_Statement', balance: 'Balance_Sheet', cashflow: 'Cash_Flow' }
    const stmts = period === 'quarterly' ? fin[map[statement]]?.quarterly : fin[map[statement]]?.annual
    if (!stmts) return { error: `No ${statement} data available` }
    const sorted = Object.values(stmts)
      .sort((a: any, b: any) => new Date((b as any).date).getTime() - new Date((a as any).date).getTime())
      .slice(0, Math.min(periods, 12))
    return { symbol: symbol.toUpperCase(), statement, period, data: sorted }
  },

  getNews: async ({ symbol, limit = 10 }: { symbol?: string; limit?: number }) => {
    const params: Record<string, string> = { limit: String(limit) }
    if (symbol) params.s = eodSymbol(symbol)
    const data = await eodhd('news', params)
    return (Array.isArray(data) ? data : []).slice(0, limit).map((a: any) => ({
      title: a.title, source: a.source, date: a.date,
      sentiment: a.sentiment, url: a.link || a.url,
      summary: a.content?.slice(0, 200),
    }))
  },

  getMacroIndicator: async ({ country = 'US', indicator, periods = 8 }: {
    country?: string; indicator: string; periods?: number
  }) => {
    const data = await eodhd(`macro-indicator/${country}`, { indicator })
    return { country, indicator, history: (Array.isArray(data) ? data : []).slice(-periods) }
  },

  getEarningsCalendar: async ({ days = 14, symbols }: { days?: number; symbols?: string }) => {
    const from = new Date().toISOString().split('T')[0]
    const to   = new Date(Date.now() + days * 86400000).toISOString().split('T')[0]
    const params: Record<string, string> = { from, to }
    if (symbols) params.symbols = symbols
    const data = await eodhd('calendar/earnings', params)
    const earnings = data?.earnings || data || []
    return { from, to, earnings: Array.isArray(earnings) ? earnings.slice(0, 30) : earnings }
  },

  getInsiderTransactions: async ({ symbol }: { symbol: string }) => {
    const data = await eodhd('insider-transactions', { code: eodSymbol(symbol) })
    return { symbol, transactions: (Array.isArray(data) ? data : []).slice(0, 20) }
  },
}

export type ToolName = keyof typeof tools
