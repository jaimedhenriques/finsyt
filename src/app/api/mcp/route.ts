import { NextRequest, NextResponse } from 'next/server';
import { financialData, secEdgar, fred, FRED_SERIES } from '@/lib/providers';

// MCP Server endpoint for Claude Desktop and other MCP clients
// This implements a simplified MCP protocol over HTTP

export const runtime = 'nodejs';

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const TOOLS = [
  {
    name: 'get_stock_quote',
    description: 'Get real-time stock quote for a ticker symbol',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker symbol (e.g., AAPL)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_company_profile',
    description: 'Get detailed company profile and information',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker symbol' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_sec_filings',
    description: 'Get SEC filings for a company',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Company ticker or CIK' },
        formTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by form types (10-K, 10-Q, 8-K, etc.)',
        },
        limit: { type: 'number', description: 'Number of filings to return' },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'get_economic_indicator',
    description: 'Get economic indicator data from FRED (Federal Reserve)',
    inputSchema: {
      type: 'object',
      properties: {
        indicator: {
          type: 'string',
          description: 'FRED series ID (GDP, UNRATE, FEDFUNDS, DGS10, CPIAUCSL, etc.)',
        },
        limit: { type: 'number', description: 'Number of observations' },
      },
      required: ['indicator'],
    },
  },
  {
    name: 'search_symbols',
    description: 'Search for stock symbols by company name',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_news',
    description: 'Get financial news for specified stock symbols',
    inputSchema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stock symbols to get news for',
        },
        limit: { type: 'number', description: 'Number of articles' },
      },
      required: ['symbols'],
    },
  },
];

async function handleToolCall(
  name: string,
  params: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'get_stock_quote': {
      const { symbol } = params as { symbol: string };
      return await financialData.getQuote(symbol);
    }

    case 'get_company_profile': {
      const { symbol } = params as { symbol: string };
      return await financialData.getCompanyProfile(symbol);
    }

    case 'get_sec_filings': {
      const { ticker, formTypes, limit } = params as {
        ticker: string;
        formTypes?: string[];
        limit?: number;
      };
      return await secEdgar.getCompanyFilings(ticker, formTypes, limit || 10);
    }

    case 'get_economic_indicator': {
      const { indicator, limit } = params as {
        indicator: string;
        limit?: number;
      };
      return await fred.getSeriesObservations(indicator, { limit: limit || 12 });
    }

    case 'search_symbols': {
      const { query } = params as { query: string };
      return await financialData.searchSymbols(query);
    }

    case 'get_news': {
      const { symbols, limit } = params as { symbols: string[]; limit?: number };
      return await financialData.getNews(symbols, limit || 10);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MCPRequest;

    // Validate JSON-RPC request
    if (body.jsonrpc !== '2.0' || !body.method) {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: body.id || null,
          error: {
            code: -32600,
            message: 'Invalid Request',
          },
        } as MCPResponse,
        { status: 400 }
      );
    }

    let result: unknown;

    switch (body.method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'finsyt-mcp',
            version: '1.0.0',
          },
        };
        break;

      case 'tools/list':
        result = { tools: TOOLS };
        break;

      case 'tools/call': {
        const { name, arguments: args } = body.params as {
          name: string;
          arguments: Record<string, unknown>;
        };

        if (!name) {
          return NextResponse.json(
            {
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32602,
                message: 'Invalid params: tool name required',
              },
            } as MCPResponse,
            { status: 400 }
          );
        }

        const toolResult = await handleToolCall(name, args || {});
        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(toolResult, null, 2),
            },
          ],
        };
        break;
      }

      case 'ping':
        result = {};
        break;

      default:
        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32601,
              message: `Method not found: ${body.method}`,
            },
          } as MCPResponse,
          { status: 404 }
        );
    }

    return NextResponse.json({
      jsonrpc: '2.0',
      id: body.id,
      result,
    } as MCPResponse);
  } catch (error) {
    console.error('MCP error:', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: (error as Error).message,
        },
      } as MCPResponse,
      { status: 500 }
    );
  }
}

// SSE endpoint for MCP streaming (if needed)
export async function GET(request: NextRequest) {
  // Return server info for discovery
  return NextResponse.json({
    name: 'finsyt-mcp',
    version: '1.0.0',
    description: 'Finsyt Financial Data MCP Server',
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    endpoints: {
      rpc: '/api/mcp',
    },
  });
}
