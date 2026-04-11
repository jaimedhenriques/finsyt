import { NextRequest, NextResponse } from 'next/server'
const FMP     = process.env.FMP_API_KEY
const FINNHUB = process.env.FINNHUB_API_KEY
const FRED    = process.env.FRED_API_KEY

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
      const inds = params.indicators || ['fed_rate','cpi','yield_10y','gdp_growth']
      const results = await Promise.allSettled(
        inds.map(async (ind: string) => {
          const data = await fetcher(`macro?series=${ind}&limit=${params.periods||8}`)
          return { indicator: ind, ...data }
        })
      )
      return { indicators: results.filter(r=>r.status==='fulfilled').map(r=>(r as any).value) }
    }
    
    case 'get_earnings_transcript':
      if (params.year && params.quarter) {
        return fetcher(`transcripts?symbol=${params.symbol}&year=${params.year}&quarter=${params.quarter}`)
      }
      return fetcher(`transcripts?symbol=${params.symbol}`)
    
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
  try {
    const body = await req.json()
    const { method, params, id } = body

    // Validate API key
    const authHeader = req.headers.get('authorization')
    const apiKey = authHeader?.replace('Bearer ', '') || req.nextUrl.searchParams.get('api_key')
    // For now we're open — production would check against Supabase
    // if (!apiKey) return NextResponse.json({ error: { code: -32001, message: 'Unauthorized' }}, { status: 401 })

    switch (method) {
      // List available tools
      case 'tools/list':
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: { tools: MCP_TOOLS },
        })

      // Execute a tool
      case 'tools/call': {
        const { name, arguments: args } = params
        try {
          const result = await executeTool(name, args)
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

// GET: return server manifest (for MCP discovery)
export async function GET() {
  return NextResponse.json({
    name: 'Finsyt',
    description: 'Institutional financial intelligence — real-time quotes, fundamentals, transcripts, filings, macro data',
    version: '1.0.0',
    protocolVersion: '2024-11-05',
    endpoint: '/api/mcp',
    tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description })),
  })
}
