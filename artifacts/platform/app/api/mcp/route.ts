import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiRequest } from '@/lib/api-key-auth'
import { GET as macroHandler } from '@/app/api/macro/route'
import { GET as transcriptsHandler } from '@/app/api/transcripts/route'
import { internalBypassHeaderValue, INTERNAL_BYPASS_HEADER } from '@/lib/internal-auth'
import { runWithApiKeyEntitlement } from '@/lib/api-entitlement-context'
import { buildConnectorAgentTools, invokeConnectorTool } from '@/lib/connectors/agent-tools'

const FMP     = process.env.FMP_API_KEY
const FINNHUB = process.env.FINNHUB_API_KEY
const FRED    = process.env.FRED_API_KEY

// Call a route handler directly (no network, no middleware) with query params.
async function callHandler(
  handler: (r: NextRequest) => Promise<Response> | Response,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const url = new URL('http://internal/api')
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await handler(new NextRequest(url.toString()))
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { raw: text } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Finance-first MCP tool definitions (Census tools excluded from this list;
// they remain accessible via the Connector Hub MCP surface if wired in.)
// ─────────────────────────────────────────────────────────────────────────────
const MCP_TOOLS = [
  // ── Quotes & market data ──────────────────────────────────────────────────
  {
    name: 'get_stock_quote',
    description: 'Get real-time stock quote, price, change, market cap, P/E, 52-week range, sector, and industry for a ticker.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. NVDA, AAPL, MSFT)' },
      },
      required: ['symbol'],
    },
  },
  // ── Fundamentals ──────────────────────────────────────────────────────────
  {
    name: 'get_financials',
    description: 'Get income statement, balance sheet, or cash flow for a company. Ideal for financial analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol:  { type: 'string', description: 'Ticker symbol' },
        type:    { type: 'string', enum: ['income','balance','cashflow','earnings','ratios'], description: 'Statement type (default: income)' },
        periods: { type: 'number', description: 'Number of periods to return (default 8)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_estimates',
    description: 'Analyst consensus EPS estimates, revenue estimates, price targets, buy/sell/hold ratings, earnings surprises, and upgrade/downgrade history for a ticker.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. AAPL, MSFT)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_dcf',
    description: 'Discounted cash flow (DCF) valuation for a ticker. Anchors base FCF from financial statements and returns intrinsic value per share, plus an optional 5×5 sensitivity grid across WACC and terminal growth rates.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol:          { type: 'string', description: 'Ticker symbol (e.g. AAPL). Required — the tool fetches FCF and shares outstanding from the financials provider.' },
        growthStage1:    { type: 'number', description: 'Near-term FCF growth rate, decimal (e.g. 0.12 = 12%). Default 0.10.' },
        growthStage2:    { type: 'number', description: 'Mid-term FCF growth rate after stage 1. Default equals growthStage1.' },
        stage1Years:     { type: 'number', description: 'Duration of high-growth stage in years. Default 5.' },
        stage2Years:     { type: 'number', description: 'Duration of mid-growth stage in years. Default 5.' },
        terminalGrowth:  { type: 'number', description: 'Perpetuity growth rate. Default 0.025.' },
        discountRate:    { type: 'number', description: 'WACC, decimal (e.g. 0.09 = 9%). Default 0.09.' },
        sensitivity:     { type: 'boolean', description: 'If true, also return a 5×5 sensitivity grid (±2% WACC × ±1% terminal growth). Default false.' },
      },
      required: ['symbol'],
    },
  },
  // ── Research depth ────────────────────────────────────────────────────────
  {
    name: 'get_earnings_transcript',
    description: 'Fetch the list of available earnings call transcripts for a ticker, or retrieve the full transcript content for a specific quarter.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol:  { type: 'string', description: 'Ticker symbol' },
        year:    { type: 'string', description: 'Year of the earnings call, e.g. "2025"' },
        quarter: { type: 'string', description: 'Quarter: "1" | "2" | "3" | "4"' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_news',
    description: 'Get recent financial news for a company or market-wide by topic. Returns headlines, summaries, and source attribution.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional ticker for company-specific news' },
        topic:  { type: 'string', description: 'Topic filter: general | technology | forex | crypto | economy | merger' },
        limit:  { type: 'number', description: 'Max articles (default 10)' },
      },
    },
  },
  {
    name: 'get_filings',
    description: 'Get SEC filings for a company: 10-K, 10-Q, 8-K, DEF 14A — with direct document links and filing dates.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        type:   { type: 'string', description: 'Filing type: "10-K" | "10-Q" | "8-K" | "DEF 14A"' },
        limit:  { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['symbol'],
    },
  },
  // ── Deals & insider activity ──────────────────────────────────────────────
  {
    name: 'get_insider_trades',
    description: 'Recent insider trading disclosures (Form 4 filings) for a ticker — name, title, transaction type, shares, price, and estimated value. Supports buy/sell filter.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol. Omit for market-wide recent insider activity.' },
        type:   { type: 'string', enum: ['buy', 'sell', 'all'], description: 'Filter by transaction direction (default: all)' },
        limit:  { type: 'number', description: 'Max records to return (default 20, max 50)' },
      },
    },
  },
  {
    name: 'get_deals',
    description: 'M&A deal flow: latest announced/pending/completed deals, or deals involving a specific company as acquirer or target. Returns deal value, status, counterparty, and filing links.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional ticker to filter by company involvement (acquirer or target)' },
        limit:  { type: 'number', description: 'Max deals to return (default 20, max 50)' },
      },
    },
  },
  // ── Peer benchmarking ─────────────────────────────────────────────────────
  {
    name: 'get_peer_comps',
    description: 'Compare a list of tickers on key financial and valuation metrics: market cap, P/E, EV/EBITDA, revenue growth, gross margin, and net margin. Ideal for comp table construction.',
    inputSchema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of ticker symbols to compare (2–10 tickers). E.g. ["NVDA","AMD","INTC"]',
        },
        subject: { type: 'string', description: 'Optional anchor ticker rendered first in results' },
      },
      required: ['symbols'],
    },
  },
  // ── Macro ─────────────────────────────────────────────────────────────────
  {
    name: 'get_macro_data',
    description: 'Macroeconomic indicator series from FRED: Fed rate, CPI, GDP growth, unemployment, yield curve, VIX, core PCE.',
    inputSchema: {
      type: 'object',
      properties: {
        indicators: {
          type: 'array',
          items: { type: 'string' },
          description: 'Indicators: fed_rate | cpi | gdp_growth | unemployment | yield_10y | yield_2y | spread_10_2 | vix | core_pce',
        },
        periods: { type: 'number', description: 'History depth (default 8)' },
      },
    },
  },
  // ── Discovery & screening ─────────────────────────────────────────────────
  {
    name: 'search_companies',
    description: 'Search for companies by name or partial ticker. Returns symbol, name, and exchange.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Company name or partial ticker' },
      },
      required: ['query'],
    },
  },
  {
    name: 'screen_stocks',
    description: 'Screen stocks by sector, market cap range, and exchange.',
    inputSchema: {
      type: 'object',
      properties: {
        sector:   { type: 'string', description: 'Sector: Technology | Healthcare | Financials | Energy | Consumer Cyclical | etc.' },
        minMcap:  { type: 'number', description: 'Minimum market cap in USD' },
        maxMcap:  { type: 'number', description: 'Maximum market cap in USD' },
        exchange: { type: 'string', description: 'Exchange: NYSE | NASDAQ | both (default)' },
        limit:    { type: 'number', description: 'Max results (default 25)' },
      },
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────
async function executeTool(name: string, params: any, orgId?: string): Promise<any> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://finsyt-platform.vercel.app'
  const fetcher = (path: string) => fetch(`${base}/api/${path}`, { cache: 'no-store' }).then(r => r.json())

  switch (name) {

    case 'get_stock_quote':
      return fetcher(`quote?symbol=${encodeURIComponent(params.symbol)}`)

    case 'get_financials':
      return fetcher(`financials?symbol=${encodeURIComponent(params.symbol)}&type=${params.type || 'income'}&limit=${params.periods || 8}`)

    case 'get_estimates': {
      const d: any = await fetcher(`estimates?symbol=${encodeURIComponent(params.symbol)}`)
      // Trim bulky raw arrays to keep the MCP response readable
      if (d?.estimatesAnnual) d.estimatesAnnual = (d.estimatesAnnual as any[]).slice(0, 4)
      if (d?.estimatesQuarterly) d.estimatesQuarterly = (d.estimatesQuarterly as any[]).slice(0, 4)
      if (d?.priceTargets) d.priceTargets = (d.priceTargets as any[]).slice(0, 6)
      if (d?.surprises) d.surprises = (d.surprises as any[]).slice(0, 4)
      return { ...d, source: 'Financial Modeling Prep' }
    }

    case 'get_dcf': {
      // Build query params for the GET (pure-math) endpoint
      const qp = new URLSearchParams()
      if (params.growthStage1  != null) qp.set('growthStage1',   String(params.growthStage1))
      if (params.growthStage2  != null) qp.set('growthStage2',   String(params.growthStage2))
      if (params.stage1Years   != null) qp.set('stage1Years',    String(params.stage1Years))
      if (params.stage2Years   != null) qp.set('stage2Years',    String(params.stage2Years))
      if (params.terminalGrowth!= null) qp.set('terminalGrowth', String(params.terminalGrowth))
      if (params.discountRate  != null) qp.set('discountRate',   String(params.discountRate))
      if (params.sensitivity)           qp.set('sensitivity',    'true')

      // Ticker-anchored: call the POST endpoint with the internal bypass so it
      // can skip Clerk auth (we already validated the API key above).
      const bypass = internalBypassHeaderValue()
      const body = JSON.stringify({
        symbol: String(params.symbol).toUpperCase(),
        growthStage1:   params.growthStage1   ?? 0.10,
        growthStage2:   params.growthStage2   ?? undefined,
        stage1Years:    params.stage1Years    ?? 5,
        stage2Years:    params.stage2Years    ?? 5,
        terminalGrowth: params.terminalGrowth ?? 0.025,
        discountRate:   params.discountRate   ?? 0.09,
        sensitivity:    params.sensitivity    ?? false,
      })
      const dcfRes = await fetch(`${base}/api/dcf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [INTERNAL_BYPASS_HEADER]: bypass,
        },
        body,
        cache: 'no-store',
      })
      const dcfData: any = await dcfRes.json()
      return { ...dcfData, source: 'Finsyt DCF engine' }
    }

    case 'get_earnings_transcript':
      if (params.year && params.quarter) {
        return callHandler(transcriptsHandler, { symbol: params.symbol, year: params.year, quarter: params.quarter })
      }
      return callHandler(transcriptsHandler, { symbol: params.symbol })

    case 'get_news':
      return fetcher(`news?${params.symbol ? `symbol=${encodeURIComponent(params.symbol)}&` : ''}${params.topic ? `topics=${encodeURIComponent(params.topic)}&` : ''}limit=${Math.min(params.limit || 10, 15)}`)

    case 'get_filings':
      return fetcher(`filings?symbol=${encodeURIComponent(params.symbol)}${params.type ? `&type=${encodeURIComponent(params.type)}` : ''}&limit=${Math.min(params.limit || 10, 20)}`)

    case 'get_insider_trades': {
      const symbol = params.symbol ? `symbol=${encodeURIComponent(params.symbol)}&` : ''
      const type   = params.type && params.type !== 'all' ? `type=${encodeURIComponent(params.type)}&` : ''
      const limit  = Math.min(params.limit || 20, 50)
      const d: any = await fetcher(`insider?${symbol}${type}limit=${limit}`)
      return { trades: Array.isArray(d?.trades) ? d.trades : Array.isArray(d) ? d : [], source: d?.source || 'Financial Modeling Prep / EODHD' }
    }

    case 'get_deals': {
      const symbol = params.symbol ? `symbol=${encodeURIComponent(params.symbol)}&` : ''
      const limit  = Math.min(params.limit || 20, 50)
      const d: any = await fetcher(`deals?${symbol}limit=${limit}`)
      return { deals: Array.isArray(d?.deals) ? d.deals : Array.isArray(d) ? d : [], source: d?.source || 'Financial Modeling Prep' }
    }

    case 'get_peer_comps': {
      const symbols: string[] = (params.symbols || []).slice(0, 10).map((s: string) => s.toUpperCase())
      if (!symbols.length) return { error: 'symbols array is required' }

      // Fetch quotes for all tickers in parallel (no session required)
      const rows = await Promise.allSettled(
        symbols.map(async (sym) => {
          const [q, fin]: [any, any] = await Promise.all([
            fetcher(`quote?symbol=${encodeURIComponent(sym)}`).catch(() => null),
            fetcher(`financials?symbol=${encodeURIComponent(sym)}&type=income&limit=2`).catch(() => null),
          ])
          const quote   = q?.quote || q
          const incomes: any[] = Array.isArray(fin) ? fin : (fin?.statements || fin?.income || fin?.data || [])
          const latest  = incomes[0]
          const prior   = incomes[1]
          const rev     = Number(latest?.revenue)
          const revPrior = Number(prior?.revenue)
          const revGrowth = (rev && revPrior && revPrior !== 0) ? +((rev - revPrior) / Math.abs(revPrior) * 100).toFixed(1) : null
          const grossMargin = (rev && latest?.grossProfit) ? +((Number(latest.grossProfit) / rev) * 100).toFixed(1) : null
          const netMargin   = (rev && latest?.netIncome)   ? +((Number(latest.netIncome)   / rev) * 100).toFixed(1) : null

          return {
            symbol: sym,
            name: quote?.name,
            price: quote?.price,
            marketCap: quote?.marketCap,
            pe: quote?.pe,
            eps: quote?.eps,
            revenue: rev || null,
            revenueGrowthPct: revGrowth,
            grossMarginPct: grossMargin,
            netMarginPct: netMargin,
            source: quote?.source || 'FMP / EODHD',
          }
        }),
      )

      const peers = rows
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<any>).value)

      // Optionally sort so the subject ticker is first
      if (params.subject) {
        const subjectUpper = String(params.subject).toUpperCase()
        peers.sort((a, b) => (a.symbol === subjectUpper ? -1 : b.symbol === subjectUpper ? 1 : 0))
      }

      return { peers, source: 'Financial Modeling Prep / EODHD' }
    }

    case 'get_macro_data': {
      const rawInds: string[] = params.indicators || ['fed_rate', 'cpi', 'yield_10y', 'gdp_growth']
      const inds = rawInds.slice(0, 10)
      const results = await Promise.allSettled(
        inds.map(async (ind: string) => {
          const data = await callHandler(macroHandler, { indicator: ind, periods: params.periods || 8 })
          return { indicator: ind, ...(data as object) }
        }),
      )
      return { indicators: results.filter(r => r.status === 'fulfilled').map(r => (r as any).value) }
    }

    case 'search_companies':
      return fetcher(`search?q=${encodeURIComponent(params.query)}`)

    case 'screen_stocks':
      return fetcher(
        `screener?${params.sector ? `sector=${encodeURIComponent(params.sector)}` : ''}${params.minMcap ? `&minMcap=${params.minMcap}` : ''}${params.maxMcap ? `&maxMcap=${params.maxMcap}` : ''}&limit=${Math.min(params.limit || 25, 100)}`,
      )

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ── MCP Protocol handler ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authResult = await authenticateApiRequest(req)
  if (!authResult.ok) {
    const res = NextResponse.json(authResult.body, { status: authResult.status })
    if (authResult.headers) {
      for (const [k, v] of Object.entries(authResult.headers)) res.headers.set(k, v)
    }
    return res
  }

  return runWithApiKeyEntitlement(authResult.key, async () => {
  try {
    const body = await req.json()
    const { method, params, id } = body

    switch (method) {
      // List available tools — built-in finance tools + per-workspace connector ops.
      case 'tools/list': {
        const extraTools = await loadConnectorMcpTools(authResult.key.orgId)
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: { tools: [...MCP_TOOLS, ...extraTools.tools] },
        })
      }

      // Execute a tool
      case 'tools/call': {
        const { name, arguments: args } = params
        try {
          const builtin = MCP_TOOLS.some(t => t.name === name)
          let result: unknown
          if (builtin) {
            result = await executeTool(name, args, authResult.key.orgId)
          } else {
            const extras = await loadConnectorMcpTools(authResult.key.orgId)
            const match = extras.lookup.get(name)
            if (!match) throw new Error(`Unknown tool: ${name}`)
            result = await invokeConnectorTool(authResult.key.orgId, match, args ?? {}, authResult.key.authorUserId)
          }
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
              isError: false,
            },
          })
        } catch (e) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Error: ${String(e)}` }],
              isError: true,
            },
          })
        }
      }

      // Server info
      case 'initialize':
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'finsyt', version: '2.0.0' },
          },
        })

      default:
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        }, { status: 404 })
    }
  } catch (e) {
    return NextResponse.json({
      jsonrpc: '2.0',
      error: { code: -32700, message: `Parse error: ${String(e)}` },
    }, { status: 400 })
  }
  })
}

// ── Connector hub bridge ────────────────────────────────────────────────────
type ConnectorTool = Awaited<ReturnType<typeof buildConnectorAgentTools>>[number]
async function loadConnectorMcpTools(orgId: string): Promise<{
  tools: Array<{ name: string; description: string; inputSchema: object }>
  lookup: Map<string, ConnectorTool>
}> {
  try {
    const tools = await buildConnectorAgentTools(orgId)
    const lookup = new Map(tools.map(t => [t.name, t]))
    return {
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      })),
      lookup,
    }
  } catch {
    return { tools: [], lookup: new Map() }
  }
}

// ── GET: server manifest + Copilot-for-Excel discovery ──────────────────────
// This endpoint serves two purposes:
// 1. Standard Finsyt manifest (authenticated) — full tool list for MCP clients.
// 2. /api/mcp?discovery=1 (unauthenticated) — minimal public descriptor used by
//    Copilot-for-Excel, Claude, ChatGPT plugin flows, and other MCP clients
//    to discover the endpoint and understand what it offers before connecting.
export async function GET(req: NextRequest) {
  const discovery = req.nextUrl.searchParams.get('discovery') === '1'

  if (discovery) {
    // Public discovery manifest — no auth required, no sensitive data exposed.
    return NextResponse.json(buildPublicManifest(), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    })
  }

  const authResult = await authenticateApiRequest(req)
  if (!authResult.ok) {
    const res = NextResponse.json(authResult.body, { status: authResult.status })
    if (authResult.headers) {
      for (const [k, v] of Object.entries(authResult.headers)) res.headers.set(k, v)
    }
    return res
  }

  const extras = await loadConnectorMcpTools(authResult.key.orgId)
  return NextResponse.json({
    ...buildPublicManifest(),
    tools: [
      ...MCP_TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      ...extras.tools.map(t => ({ name: t.name, description: t.description })),
    ],
  })
}

function buildPublicManifest() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://platform.finsyt.com'
  return {
    schema_version: 'v1',
    // MCP protocol metadata
    mcpVersion: '2024-11-05',
    name: 'Finsyt',
    nameForModel: 'finsyt_finance',
    description: 'Institutional financial intelligence — real-time quotes, fundamentals, analyst estimates, DCF valuation, earnings transcripts, SEC filings, insider trades, M&A deal flow, macro indicators, peer comp tables, and stock screener.',
    descriptionForModel: 'Use Finsyt tools to retrieve financial data for institutional research. Always attribute the "source" field returned by each tool. For valuation work use get_dcf. For comp tables use get_peer_comps. For sentiment use get_estimates + get_earnings_transcript.',
    version: '2.0.0',
    logo_url: `${base}/opengraph.jpg`,
    contact_email: 'support@finsyt.com',
    legal_info_url: 'https://finsyt.com/legal',
    // Endpoint configuration
    endpoint: `${base}/api/mcp`,
    transport: 'http',
    auth: {
      type: 'bearer',
      instructions: 'Generate an API key in the Finsyt platform under Settings → API Keys, then pass it as the Authorization header: "Authorization: Bearer <key>".',
      generateKeyUrl: `${base}/app/settings/api-keys`,
    },
    // Tool summary (full schemas available via tools/list after auth)
    toolCategories: [
      {
        category: 'Quotes & Market Data',
        tools: ['get_stock_quote'],
      },
      {
        category: 'Fundamentals',
        tools: ['get_financials', 'get_estimates', 'get_dcf'],
      },
      {
        category: 'Research',
        tools: ['get_earnings_transcript', 'get_news', 'get_filings'],
      },
      {
        category: 'Corporate Activity',
        tools: ['get_insider_trades', 'get_deals'],
      },
      {
        category: 'Peer Benchmarking',
        tools: ['get_peer_comps'],
      },
      {
        category: 'Macro',
        tools: ['get_macro_data'],
      },
      {
        category: 'Discovery',
        tools: ['search_companies', 'screen_stocks'],
      },
    ],
    // Copilot for Excel / OpenAI plugin fields
    api: {
      type: 'mcp',
      url: `${base}/api/mcp`,
    },
  }
}

// OPTIONS — CORS preflight for browser-based MCP clients
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}
