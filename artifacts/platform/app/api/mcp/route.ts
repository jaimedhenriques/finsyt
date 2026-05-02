import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiRequest } from '@/lib/api-key-auth'
import { GET as macroHandler } from '@/app/api/macro/route'
import { GET as transcriptsHandler } from '@/app/api/transcripts/route'
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

// MCP-compliant tool definitions
const MCP_TOOLS = [
  {
    name: 'get_stock_quote',
    description: 'Get real-time stock quote, price, change, and basic financials for a ticker symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. NVDA, AAPL, MSFT)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_financials',
    description: 'Get income statement, balance sheet, or cash flow for a company. Ideal for financial analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        type: { type: 'string', enum: ['income','balance','cashflow','earnings','ratios'], description: 'Statement type' },
        periods: { type: 'number', description: 'Number of periods to return (default 8)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_news',
    description: 'Get recent financial news for a company or market-wide by topic. Returns headlines, summaries, sentiment.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional ticker for company-specific news' },
        topic: { type: 'string', description: 'Topic filter: general | technology | forex | crypto | economy | merger' },
        limit: { type: 'number', description: 'Max articles (default 10)' },
      },
    },
  },
  {
    name: 'get_macro_data',
    description: 'Get macroeconomic indicators: Fed rate, CPI, GDP growth, unemployment, yield curve, VIX from FRED.',
    inputSchema: {
      type: 'object',
      properties: {
        indicators: { type: 'array', items: { type: 'string' }, description: 'List of indicators: fed_rate | cpi | gdp_growth | unemployment | yield_10y | yield_2y | spread_10_2 | vix | core_pce' },
        periods: { type: 'number', description: 'History depth (default 8)' },
      },
    },
  },
  {
    name: 'get_earnings_transcript',
    description: 'Get earnings call transcript for a company — management commentary, guidance, Q&A.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol:  { type: 'string', description: 'Ticker symbol' },
        year:    { type: 'string', description: 'Year of earnings call (e.g. 2025)' },
        quarter: { type: 'string', description: 'Quarter: 1 | 2 | 3 | 4' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'search_companies',
    description: 'Search for companies by name or ticker. Returns symbol, name, exchange.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Company name or partial ticker' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_filings',
    description: 'Get SEC filings for a company: 10-K, 10-Q, 8-K with direct document links.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        type: { type: 'string', description: 'Filing type: 10-K | 10-Q | 8-K | DEF 14A' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'screen_stocks',
    description: 'Screen stocks by sector, market cap, exchange, and other filters.',
    inputSchema: {
      type: 'object',
      properties: {
        sector:   { type: 'string', description: 'Sector filter: Technology | Healthcare | Financials | etc.' },
        minMcap:  { type: 'number', description: 'Minimum market cap in USD' },
        maxMcap:  { type: 'number', description: 'Maximum market cap in USD' },
        exchange: { type: 'string', description: 'Exchange: NYSE | NASDAQ | both (default)' },
        limit:    { type: 'number', description: 'Max results (default 25)' },
      },
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────
async function executeTool(name: string, params: any): Promise<any> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://finsyt-platform.vercel.app'
  
  const fetcher = (path: string) => fetch(`${base}/api/${path}`).then(r => r.json())

  switch (name) {
    case 'get_stock_quote':
      return fetcher(`quote?symbol=${params.symbol}`)
    
    case 'get_financials':
      return fetcher(`financials?symbol=${params.symbol}&type=${params.type||'income'}&limit=${params.periods||8}`)
    
    case 'get_news':
      return fetcher(`news?${params.symbol?'symbol='+params.symbol:'topics='+(params.topic||'general')}&limit=${params.limit||10}`)
    
    case 'get_macro_data': {
      const rawInds: string[] = params.indicators || ['fed_rate','cpi','yield_10y','gdp_growth']
      // Cap to 10 indicators per request to bound upstream provider fan-out.
      const inds = rawInds.slice(0, 10)
      const results = await Promise.allSettled(
        inds.map(async (ind: string) => {
          const data = await callHandler(macroHandler, { indicator: ind, periods: params.periods || 8 })
          return { indicator: ind, ...(data as object) }
        })
      )
      return { indicators: results.filter(r=>r.status==='fulfilled').map(r=>(r as any).value) }
    }
    
    case 'get_earnings_transcript':
      if (params.year && params.quarter) {
        return callHandler(transcriptsHandler, { symbol: params.symbol, year: params.year, quarter: params.quarter })
      }
      return callHandler(transcriptsHandler, { symbol: params.symbol })
    
    case 'search_companies':
      return fetcher(`search?q=${encodeURIComponent(params.query)}`)
    
    case 'get_filings':
      return fetcher(`filings?symbol=${params.symbol}${params.type?'&type='+params.type:''}&limit=${params.limit||10}`)
    
    case 'screen_stocks':
      return fetcher(`screener?${params.sector?'sector='+encodeURIComponent(params.sector):''}${params.minMcap?'&minMcap='+params.minMcap:''}${params.maxMcap?'&maxMcap='+params.maxMcap:''}&limit=${params.limit||25}`)
    
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

  try {
    const body = await req.json()
    const { method, params, id } = body

    switch (method) {
      // List available tools — built-in + per-workspace connector ops.
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
            result = await executeTool(name, args)
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
            serverInfo: { name: 'finsyt', version: '1.0.0' },
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
}

// ── Connector hub bridge ────────────────────────────────────────────────────
// Resolves the workspace's connector tools and returns both the MCP-shaped
// definitions (for tools/list) and a name→AgentTool lookup (for tools/call).
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

// GET: return server manifest (for MCP discovery)
export async function GET(req: NextRequest) {
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
    name: 'Finsyt',
    description: 'Institutional financial intelligence — real-time quotes, fundamentals, transcripts, filings, macro data plus any connector hub tools your workspace has connected.',
    version: '1.0.0',
    protocolVersion: '2024-11-05',
    endpoint: '/api/mcp',
    tools: [
      ...MCP_TOOLS.map(t => ({ name: t.name, description: t.description })),
      ...extras.tools.map(t => ({ name: t.name, description: t.description })),
    ],
  })
}
