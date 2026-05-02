import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, corsPreflight } from "@/lib/api-key-auth";
import { GET as quoteHandler } from "@/app/api/quote/route";
import { GET as financialsHandler } from "@/app/api/financials/route";
import { GET as newsHandler } from "@/app/api/news/route";
import { GET as filingsHandler } from "@/app/api/filings/route";
import { GET as searchHandler } from "@/app/api/search/route";
import { GET as screenerHandler } from "@/app/api/screener/route";
import { GET as insiderHandler } from "@/app/api/insider/route";
import { GET as censusDatasetsHandler } from "@/app/api/census/datasets/route";
import { GET as censusAggregateHandler } from "@/app/api/census/aggregate/route";
import { GET as censusGroupsHandler } from "@/app/api/census/groups/route";
import { GET as censusVariablesHandler } from "@/app/api/census/variables/route";
import { GET as censusGeocodeHandler } from "@/app/api/census/geocode/route";
import { GET as wbIndicatorsHandler } from "@/app/api/worldbank/indicators/route";
import { GET as wbCountriesHandler } from "@/app/api/worldbank/countries/route";
import { GET as wbDataHandler } from "@/app/api/worldbank/data/route";
import { GET as personaGetHandler, POST as personaPostHandler } from "@/app/api/agent/persona/route";
import { GET as dcfGetHandler, POST as dcfPostHandler } from "@/app/api/dcf/route";
import { INTERNAL_BYPASS_HEADER, internalBypassHeaderValue } from "@/lib/internal-auth";

export const runtime = "nodejs";

/**
 * Streamable-HTTP MCP server (JSON-RPC 2.0 over POST). Compatible with the
 * Model Context Protocol clients in Claude Desktop (via mcp-remote bridge),
 * Cursor, ChatGPT connectors, and the OpenAI Agents SDK. Auth uses the same
 * `Authorization: Bearer <api_key>` scheme as the public REST surface.
 *
 * Spec: https://spec.modelcontextprotocol.io/specification/2024-11-05/
 */

interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

async function callInternal(
  handler: (r: NextRequest) => Promise<Response> | Response,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const url = new URL("http://internal/api");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await handler(new NextRequest(url.toString()));
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

const TOOLS: ToolDef[] = [
  {
    name: "finsyt_quote",
    description: "Real-time / delayed quote, market cap, fundamentals overlay for a stock symbol.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Ticker symbol, e.g. AAPL" } },
      required: ["symbol"],
    },
    handler: async (args) => callInternal(quoteHandler, { symbol: String(args.symbol).toUpperCase() }),
  },
  {
    name: "finsyt_financials",
    description: "Income statement / balance sheet / cash flow / KPIs. Pass a single mnemonic, comma-separated batch, or omit for a snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        metric: { type: "string", description: "Single metric (e.g. iq_total_rev, iq_net_inc, iq_marketcap)" },
        metrics: { type: "string", description: "Comma-separated metrics" },
        period: { type: "string", enum: ["A", "Q"], description: "Annual or quarterly" },
        offset: { type: "integer" },
        limit: { type: "integer" },
      },
      required: ["symbol"],
    },
    handler: async (args) => callInternal(financialsHandler, args as Record<string, string>),
  },
  {
    name: "finsyt_news",
    description: "Latest news with AI sentiment scores. Optional symbol filter.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string" }, limit: { type: "integer" } },
    },
    handler: async (args) => callInternal(newsHandler, args as Record<string, string>),
  },
  {
    name: "finsyt_filings",
    description: "SEC EDGAR filings (10-K, 10-Q, 8-K, S-1, etc.) for a US-listed company.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        type: { type: "string", description: "Filing type, e.g. 10-K" },
        limit: { type: "integer" },
      },
      required: ["symbol"],
    },
    handler: async (args) => callInternal(filingsHandler, args as Record<string, string>),
  },
  {
    name: "finsyt_search",
    description: "Search global tickers and companies by name or symbol.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "integer" } },
      required: ["query"],
    },
    handler: async (args) => callInternal(searchHandler, { q: String(args.query), limit: args.limit as number | undefined }),
  },
  {
    name: "finsyt_screener",
    description: "Filter the equities universe by sector, market cap, P/E, etc.",
    inputSchema: {
      type: "object",
      properties: {
        sector: { type: "string" }, minMcap: { type: "string" }, maxMcap: { type: "string" },
        country: { type: "string" }, exchange: { type: "string" }, limit: { type: "integer" },
        sort: { type: "string" }, order: { type: "string", enum: ["asc", "desc"] },
      },
    },
    handler: async (args) => callInternal(screenerHandler, args as Record<string, string>),
  },
  {
    name: "finsyt_insider",
    description: "Recent insider buy / sell transactions for a US-listed company.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        type: { type: "string", enum: ["buy", "sell"] },
        limit: { type: "integer" },
      },
    },
    handler: async (args) => callInternal(insiderHandler, args as Record<string, string>),
  },
  {
    name: "finsyt_census_datasets",
    description:
      "Catalog of U.S. Census Bureau datasets (ACS 1/5-year, Decennial, Economic Census, Population Estimates). Filter by year and free-text query.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Free-text filter on title/description, e.g. 'acs5', 'population estimates'" },
        vintage: { type: "integer", description: "Year filter, e.g. 2022" },
        limit: { type: "integer", description: "Max rows (default 100, max 500)" },
      },
    },
    handler: async (args) =>
      callInternal(censusDatasetsHandler, args as Record<string, string | number | undefined>),
  },
  {
    name: "finsyt_census_aggregate",
    description:
      "Fetch aggregate U.S. Census data. Provide dataset path (e.g. 'acs/acs5'), vintage (year), variables (e.g. 'NAME,B19013_001E'), and a 'for' geography clause (e.g. 'county:*'), with optional 'in' parent (e.g. 'state:48').",
    inputSchema: {
      type: "object",
      properties: {
        dataset: { type: "string", description: "Path after /data/{vintage}, e.g. 'acs/acs5' or 'dec/pl'" },
        vintage: { type: "integer", description: "Year, e.g. 2022" },
        get: { type: "string", description: "Comma-separated variables, e.g. 'NAME,B19013_001E'" },
        for: { type: "string", description: "Geography clause, e.g. 'county:*' or 'state:48'" },
        in: { type: "string", description: "Optional parent geography, e.g. 'state:48'" },
        ucgid: { type: "string", description: "Alternative to for/in (Uniform Census Geography ID)" },
      },
      required: ["dataset", "vintage", "get"],
    },
    handler: async (args) =>
      callInternal(censusAggregateHandler, args as Record<string, string | number | undefined>),
  },
  {
    name: "finsyt_census_search_tables",
    description:
      "Search U.S. Census variable groups (≈ tables). Each group rolls up many variables; e.g. group 'B19013' = 'Median Household Income in the Past 12 Months'.",
    inputSchema: {
      type: "object",
      properties: {
        dataset: { type: "string", description: "e.g. 'acs/acs5'" },
        vintage: { type: "integer", description: "Year, e.g. 2022" },
        q: { type: "string", description: "Free-text filter on group description, e.g. 'income'" },
        limit: { type: "integer", description: "Max rows (default 100, max 1000)" },
      },
      required: ["dataset", "vintage"],
    },
    handler: async (args) =>
      callInternal(censusGroupsHandler, args as Record<string, string | number | undefined>),
  },
  {
    name: "finsyt_census_variables",
    description:
      "List U.S. Census variables (the actual data columns) in a dataset. Optionally restrict to one group/table.",
    inputSchema: {
      type: "object",
      properties: {
        dataset: { type: "string", description: "e.g. 'acs/acs5'" },
        vintage: { type: "integer", description: "Year, e.g. 2022" },
        group: { type: "string", description: "Optional group/table filter, e.g. 'B19013'" },
        q: { type: "string", description: "Free-text filter on label/concept" },
        limit: { type: "integer", description: "Max rows (default 200, max 2000)" },
      },
      required: ["dataset", "vintage"],
    },
    handler: async (args) =>
      callInternal(censusVariablesHandler, args as Record<string, string | number | undefined>),
  },
  {
    name: "finsyt_census_resolve_fips",
    description:
      "Resolve a one-line address or place name to FIPS codes via the Census Geocoder. Use to convert e.g. 'Travis County, TX' into state=48 & county=453 before calling finsyt_census_aggregate.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "One-line address or place, e.g. '1600 Pennsylvania Ave NW, Washington DC'" },
      },
      required: ["address"],
    },
    handler: async (args) => callInternal(censusGeocodeHandler, { address: String(args.address || "") }),
  },
  {
    name: "finsyt_worldbank_indicators",
    description:
      "Search the World Bank's catalog of ~1,500 development & macro indicators (WDI, ICP, Doing Business, etc.). Use this to discover indicator IDs like 'NY.GDP.MKTP.CD' before calling finsyt_worldbank_data. Pass featured=true for a curated short list.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Free-text filter on id / name / source note" },
        topic: { type: "string", description: "Topic id or name fragment, e.g. 'Economy', 'Health'" },
        source: { type: "string", description: "Source id, e.g. '2' (WDI)" },
        limit: { type: "integer", description: "Max rows (default 100, max 2000)" },
        featured: { type: "boolean", description: "Return only the curated featured-indicator list" },
      },
    },
    handler: async (args) => callInternal(wbIndicatorsHandler, args as Record<string, string | number | undefined>),
  },
  {
    name: "finsyt_worldbank_countries",
    description:
      "List World Bank country codes & aggregates. Filter by region, income level, or free-text. Returns ISO2/ISO3 codes you can pass to finsyt_worldbank_data.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Free-text filter on name / iso codes / capital" },
        region: { type: "string", description: "Region id or name fragment, e.g. 'EAS' or 'East Asia'" },
        incomeLevel: { type: "string", description: "Income level id, e.g. 'HIC', 'LIC', 'UMC'" },
        limit: { type: "integer", description: "Max rows (default 500)" },
      },
    },
    handler: async (args) => callInternal(wbCountriesHandler, args as Record<string, string | number | undefined>),
  },
  {
    name: "finsyt_worldbank_data",
    description:
      "Fetch a World Bank indicator time-series for one country, multiple countries (semicolon-separated), or 'all'. Default returns full history; restrict with startYear/endYear.",
    inputSchema: {
      type: "object",
      properties: {
        indicator: { type: "string", description: "World Bank indicator id, e.g. 'NY.GDP.MKTP.CD'" },
        country: { type: "string", description: "ISO2/ISO3 code, 'all', or semicolon list (USA;CHN;DEU)" },
        startYear: { type: "integer" },
        endYear: { type: "integer" },
      },
      required: ["indicator"],
    },
    handler: async (args) => callInternal(wbDataHandler, args as Record<string, string | number | undefined>),
  },
  {
    name: "finsyt_persona_list",
    description:
      "List the available investor personas (Buffett, Graham, Lynch, Munger, Klarman, Marks, Druckenmiller, Burry) with their style and tagline. Use before calling finsyt_persona_analyze.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => callInternal(personaGetHandler, {}),
  },
  {
    name: "finsyt_persona_analyze",
    description:
      "Analyze an investment thesis through the lens of one of eight famous investors. The model adopts that investor's published framework (e.g. Buffett: moat + owner earnings + margin of safety; Druckenmiller: macro + 18-month forward + concentration). Returns a Markdown analysis with the persona's checklist filled in.",
    inputSchema: {
      type: "object",
      properties: {
        persona: { type: "string", enum: ["buffett", "graham", "lynch", "munger", "klarman", "marks", "druckenmiller", "burry"] },
        question: { type: "string", description: "The investment question, e.g. 'Should I own AAPL at the current price?'" },
        context: { type: "string", description: "Optional extra context: financials excerpt, news, prior thesis, etc." },
      },
      required: ["persona", "question"],
    },
    handler: async (args) => {
      const fakeReq = new NextRequest("http://internal/api/agent/persona", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_BYPASS_HEADER]: internalBypassHeaderValue(),
        },
        body: JSON.stringify(args),
      });
      const res = await personaPostHandler(fakeReq);
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { raw: text }; }
    },
  },
  {
    name: "finsyt_dcf",
    description:
      "Run a multi-stage discounted cash flow valuation. Two modes: (1) inline assumptions — pass baseFcf, growthStage1, terminalGrowth, discountRate (and optionally netDebt, sharesOutstanding); (2) ticker-anchored — pass symbol and the platform pulls baseFcf / netDebt / shares from /api/financials. Use sensitivity=true for a 5×5 grid across WACC × terminal growth.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker for ticker-anchored mode" },
        baseFcf: { type: "number", description: "Trailing FCF to firm in millions (overrides ticker lookup)" },
        growthStage1: { type: "number", description: "Stage-1 growth, decimal (0.10 = 10%)" },
        growthStage2: { type: "number" },
        stage1Years: { type: "integer", description: "Default 5" },
        stage2Years: { type: "integer", description: "Default 5" },
        terminalGrowth: { type: "number", description: "Perpetual growth rate, decimal (default 0.025)" },
        discountRate: { type: "number", description: "WACC, decimal. If omitted, derived via CAPM from riskFreeRate, beta, equityRiskPremium" },
        riskFreeRate: { type: "number" },
        equityRiskPremium: { type: "number" },
        beta: { type: "number" },
        netDebt: { type: "number" },
        sharesOutstanding: { type: "number" },
        terminalExitMultiple: { type: "number", description: "Optional EV/FCF exit multiple instead of Gordon perpetuity" },
        sensitivity: { type: "boolean" },
      },
    },
    handler: async (args) => {
      // If a symbol is provided, use the POST path that pulls financials; otherwise GET with inline assumptions.
      if (args.symbol) {
        const fakeReq = new NextRequest("http://internal/api/dcf", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [INTERNAL_BYPASS_HEADER]: internalBypassHeaderValue(),
          },
          body: JSON.stringify(args),
        });
        const res = await dcfPostHandler(fakeReq);
        const text = await res.text();
        try { return JSON.parse(text); } catch { return { raw: text }; }
      }
      return callInternal(dcfGetHandler, args as Record<string, string | number | undefined>);
    },
  },
];

const SERVER_INFO = {
  name: "finsyt-mcp",
  version: "1.0.0",
};
const PROTOCOL_VERSION = "2024-11-05";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcError(id: string | number | null | undefined, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message, data } };
}

async function handleRpc(req: JsonRpcRequest): Promise<unknown | null> {
  const { id, method, params = {} } = req;
  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "Finsyt MCP server. Use the finsyt_* tools to fetch quotes, financials, news, SEC filings, insider trades, screener results, ticker search, U.S. Census Bureau data (ACS / decennial / economic census / FIPS), World Bank macro indicators for any country, multi-stage DCF intrinsic-value calculations, and investor-persona analyses (Buffett, Graham, Lynch, Munger, Klarman, Marks, Druckenmiller, Burry). All data is live and source-attributed.",
        },
      };
    case "notifications/initialized":
    case "initialized":
      return null; // notification — no response
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };
    case "tools/call": {
      const name = (params as { name?: string }).name;
      const args = ((params as { arguments?: Record<string, unknown> }).arguments) || {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await tool.handler(args);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: false,
          },
        };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
            isError: true,
          },
        };
      }
    }
    case "resources/list":
    case "prompts/list":
      // We don't expose resources or prompts; return empty so clients don't error.
      return { jsonrpc: "2.0", id, result: { resources: [], prompts: [] } };
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) {
    const res = NextResponse.json(auth.body, { status: auth.status });
    if (auth.headers) for (const [k, v] of Object.entries(auth.headers)) res.headers.set(k, v);
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  }
  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((r) => handleRpc(r)))).filter((r) => r !== null);
    return NextResponse.json(responses);
  }

  const result = await handleRpc(body);
  if (result === null) {
    // notification-only: HTTP 202 with empty body
    return new NextResponse(null, { status: 202 });
  }
  const res = NextResponse.json(result);
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("X-RateLimit-Limit", String(auth.rateLimit.limit));
  res.headers.set("X-RateLimit-Remaining", String(auth.rateLimit.remaining));
  return res;
}

// Some MCP transports do a discovery GET first.
export async function GET() {
  return NextResponse.json({
    mcp: SERVER_INFO,
    protocolVersion: PROTOCOL_VERSION,
    transport: "streamable-http",
    auth: "Bearer <api_key>",
    tools: TOOLS.map((t) => t.name),
    docsUrl: "/app/mcp",
  });
}

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
