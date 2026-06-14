import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function spec(origin: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Finsyt Public API",
      version: "1.0.0",
      description:
        "Institutional-grade financial data API. Authenticate with `Authorization: Bearer <api_key>`. Rate limits are per API key (60 req/min on the free tier, 600 req/min on the paid tier). Provider exhaustion returns `503` so clients can retry.",
    },
    servers: [{ url: `${origin}/api/v1`, description: "Public API" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API Key" },
      },
      schemas: {
        Quote: {
          type: "object",
          properties: {
            symbol: { type: "string" }, price: { type: "number" }, change: { type: "number" },
            changePct: { type: "number" }, open: { type: "number" }, high: { type: "number" },
            low: { type: "number" }, prevClose: { type: "number" }, volume: { type: "number" },
            marketCap: { type: "number" }, pe: { type: "number" }, eps: { type: "number" },
            name: { type: "string" }, exchange: { type: "string" }, currency: { type: "string" },
            source: { type: "string" },
          },
        },
        Bar: {
          type: "object",
          properties: {
            t: { type: "integer", description: "epoch ms" },
            o: { type: "number" }, h: { type: "number" }, l: { type: "number" },
            c: { type: "number" }, v: { type: "number" },
          },
        },
        Error: { type: "object", properties: { error: { type: "string" } } },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/quote": {
        get: {
          summary: "Real-time / delayed quote with company overlay",
          parameters: [{ name: "symbol", in: "query", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Quote", content: { "application/json": { schema: { $ref: "#/components/schemas/Quote" } } } },
            "400": { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "401": { description: "Invalid API key" },
            "429": { description: "Rate limit exceeded" },
            "503": { description: "All upstream providers exhausted" },
          },
        },
      },
      "/aggs": {
        get: {
          summary: "Historical OHLCV bars",
          parameters: [
            { name: "symbol", in: "query", required: true, schema: { type: "string" } },
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
            { name: "multiplier", in: "query", schema: { type: "integer", default: 1 } },
            { name: "timespan", in: "query", schema: { type: "string", enum: ["minute", "hour", "day", "week", "month"], default: "day" } },
          ],
          responses: { "200": { description: "Aggregates" }, "503": { description: "Providers exhausted" } },
        },
      },
      "/financials": {
        get: {
          summary: "Income / balance / cash flow / ratios; snapshot, single metric, or batch",
          parameters: [
            { name: "symbol", in: "query", required: true, schema: { type: "string" } },
            { name: "metric", in: "query", schema: { type: "string", description: "Single metric mnemonic (e.g. iq_total_rev)" } },
            { name: "metrics", in: "query", schema: { type: "string", description: "Comma-separated list of metrics" } },
            { name: "period", in: "query", schema: { type: "string", enum: ["A", "Q"], default: "A" } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 5 } },
          ],
          responses: { "200": { description: "Financials" } },
        },
      },
      "/news": {
        get: {
          summary: "News with sentiment and ticker tagging",
          parameters: [
            { name: "symbol", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 40 } },
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: { "200": { description: "Articles" } },
        },
      },
      "/filings": {
        get: {
          summary: "SEC EDGAR filings (10-K, 10-Q, 8-K, S-1, 4)",
          parameters: [
            { name: "symbol", in: "query", required: true, schema: { type: "string" } },
            { name: "type", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { "200": { description: "Filings list" } },
        },
      },
      "/insider": {
        get: {
          summary: "Insider buy / sell transactions",
          parameters: [
            { name: "symbol", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 30 } },
            { name: "type", in: "query", schema: { type: "string", enum: ["buy", "sell"] } },
          ],
          responses: { "200": { description: "Trades" } },
        },
      },
      "/search": {
        get: {
          summary: "Symbol / company search across global exchanges",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
          ],
          responses: { "200": { description: "Search results" } },
        },
      },
      "/screener": {
        get: {
          summary: "Filter the global ticker universe by sector, market cap, P/E, etc.",
          parameters: [
            { name: "sector", in: "query", schema: { type: "string" } },
            { name: "minMcap", in: "query", schema: { type: "string" } },
            { name: "maxMcap", in: "query", schema: { type: "string" } },
            { name: "country", in: "query", schema: { type: "string" } },
            { name: "exchange", in: "query", schema: { type: "string" } },
            { name: "minPe", in: "query", schema: { type: "string" } },
            { name: "maxPe", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "sort", in: "query", schema: { type: "string", default: "marketCap" } },
            { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
          ],
          responses: { "200": { description: "Screener results" } },
        },
      },
      "/census/datasets": {
        get: {
          summary: "U.S. Census Bureau dataset catalog (ACS, decennial, economic, population estimates)",
          parameters: [
            { name: "q", in: "query", schema: { type: "string", description: "Fuzzy filter on title/description" } },
            { name: "vintage", in: "query", schema: { type: "integer", description: "Year filter, e.g. 2022" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
          ],
          responses: { "200": { description: "Dataset list" }, "502": { description: "Census API upstream error" } },
        },
      },
      "/census/aggregate": {
        get: {
          summary: "Fetch aggregate U.S. Census data (ACS, decennial, economic census)",
          parameters: [
            { name: "dataset", in: "query", required: true, schema: { type: "string", description: "Path after /data/{vintage}, e.g. acs/acs5" } },
            { name: "vintage", in: "query", required: true, schema: { type: "integer", description: "Year, e.g. 2022" } },
            { name: "get", in: "query", required: true, schema: { type: "string", description: "Comma-separated variables, e.g. NAME,B19013_001E" } },
            { name: "for", in: "query", schema: { type: "string", description: "Geography clause, e.g. county:* or state:48" } },
            { name: "in", in: "query", schema: { type: "string", description: "Optional parent geography, e.g. state:48" } },
            { name: "ucgid", in: "query", schema: { type: "string", description: "Alternative to for/in" } },
          ],
          responses: { "200": { description: "Aggregate rows" }, "400": { description: "Missing required params" }, "502": { description: "Census API upstream error" } },
        },
      },
      "/census/groups": {
        get: {
          summary: "Search U.S. Census variable groups (≈ tables)",
          parameters: [
            { name: "dataset", in: "query", required: true, schema: { type: "string" } },
            { name: "vintage", in: "query", required: true, schema: { type: "integer" } },
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
          ],
          responses: { "200": { description: "Groups list" } },
        },
      },
      "/census/variables": {
        get: {
          summary: "List U.S. Census variables in a dataset (optionally restrict to one group/table)",
          parameters: [
            { name: "dataset", in: "query", required: true, schema: { type: "string" } },
            { name: "vintage", in: "query", required: true, schema: { type: "integer" } },
            { name: "group", in: "query", schema: { type: "string" } },
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 200 } },
          ],
          responses: { "200": { description: "Variables list" } },
        },
      },
      "/census/geocode": {
        get: {
          summary: "Resolve an address or place name to FIPS codes via the Census Geocoder",
          parameters: [
            { name: "address", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "FIPS resolution" }, "400": { description: "Missing address" } },
        },
      },
      "/worldbank/indicators": {
        get: {
          summary: "Search the World Bank catalog of ~1,500 development & macro indicators",
          parameters: [
            { name: "q", in: "query", schema: { type: "string", description: "Free-text filter on id / name" } },
            { name: "topic", in: "query", schema: { type: "string", description: "Topic id or name fragment" } },
            { name: "source", in: "query", schema: { type: "string", description: "Source id, e.g. '2' for WDI" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
            { name: "featured", in: "query", schema: { type: "boolean", description: "Return Finsyt's curated short list" } },
          ],
          responses: { "200": { description: "Indicator list" }, "502": { description: "World Bank API upstream error" } },
        },
      },
      "/worldbank/countries": {
        get: {
          summary: "List World Bank country codes & aggregates (regions, income groups, lending categories)",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "region", in: "query", schema: { type: "string", description: "Region id or name fragment" } },
            { name: "incomeLevel", in: "query", schema: { type: "string", description: "e.g. 'HIC', 'LIC', 'UMC'" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 500 } },
          ],
          responses: { "200": { description: "Country list" } },
        },
      },
      "/worldbank/data": {
        get: {
          summary: "Fetch World Bank indicator time-series for one or more countries",
          parameters: [
            { name: "indicator", in: "query", required: true, schema: { type: "string", description: "Indicator id, e.g. 'NY.GDP.MKTP.CD'" } },
            { name: "country", in: "query", schema: { type: "string", description: "ISO2/ISO3, 'all', or semicolon list" } },
            { name: "startYear", in: "query", schema: { type: "integer" } },
            { name: "endYear", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Time-series" } },
        },
      },
      "/imf/indicators": {
        get: {
          summary: "Search the IMF DataMapper catalog (WEO / Fiscal Monitor indicators)",
          parameters: [
            { name: "q", in: "query", schema: { type: "string", description: "Free-text filter on id / label / description" } },
            { name: "dataset", in: "query", schema: { type: "string", description: "Dataset filter, e.g. 'WEO'" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
            { name: "featured", in: "query", schema: { type: "boolean", description: "Return Finsyt's curated short list" } },
          ],
          responses: { "200": { description: "Indicator list" }, "502": { description: "IMF DataMapper upstream error" } },
        },
      },
      "/imf/countries": {
        get: {
          summary: "List IMF DataMapper country/economy codes (ISO3)",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 500 } },
          ],
          responses: { "200": { description: "Country list" } },
        },
      },
      "/imf/data": {
        get: {
          summary: "Fetch IMF annual indicator time-series for one or more economies",
          parameters: [
            { name: "indicator", in: "query", required: true, schema: { type: "string", description: "DataMapper code, e.g. 'NGDP_RPCH'" } },
            { name: "country", in: "query", schema: { type: "string", description: "ISO3 code or comma/semicolon list (omit for all)" } },
          ],
          responses: { "200": { description: "Time-series" }, "502": { description: "IMF DataMapper upstream error" } },
        },
      },
      "/dbnomics/search": {
        get: {
          summary: "Search the DBnomics catalog (90+ official providers) at dataset level",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string", description: "Free-text query" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { "200": { description: "Dataset hits" }, "503": { description: "DBnomics upstream unavailable" } },
        },
      },
      "/dbnomics/series": {
        get: {
          summary: "Fetch a single DBnomics series by provider/dataset/series id",
          parameters: [
            { name: "id", in: "query", schema: { type: "string", description: "Full series id, e.g. 'IMF/WEO:latest/USA.NGDP_RPCH'" } },
            { name: "provider", in: "query", schema: { type: "string" } },
            { name: "dataset", in: "query", schema: { type: "string" } },
            { name: "series", in: "query", schema: { type: "string" } },
            { name: "featured", in: "query", schema: { type: "boolean", description: "Return Finsyt's curated example series ids" } },
          ],
          responses: { "200": { description: "Time-series" }, "404": { description: "Series not found" }, "503": { description: "DBnomics upstream unavailable" } },
        },
      },
      "/agent/persona": {
        get: {
          summary: "List investor personas (Buffett, Graham, Lynch, Munger, Klarman, Marks, Druckenmiller, Burry) — pass ?id=buffett for full prompt",
          parameters: [{ name: "id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Persona list or single persona" } },
        },
        post: {
          summary: "Analyze an investment thesis through the lens of a famous investor's framework",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["persona", "question"],
                  properties: {
                    persona: { type: "string", enum: ["buffett", "graham", "lynch", "munger", "klarman", "marks", "druckenmiller", "burry"] },
                    question: { type: "string" },
                    context: { type: "string", description: "Optional extra context (financials excerpt, news, prior thesis)" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Markdown analysis" }, "503": { description: "LLM provider not configured" } },
        },
      },
      "/dcf": {
        get: {
          summary: "Run a multi-stage DCF with inline assumptions (no ticker lookup)",
          parameters: [
            { name: "baseFcf", in: "query", required: true, schema: { type: "number", description: "Trailing FCF (millions)" } },
            { name: "growthStage1", in: "query", required: true, schema: { type: "number", description: "Stage-1 growth (decimal)" } },
            { name: "growthStage2", in: "query", schema: { type: "number" } },
            { name: "stage1Years", in: "query", schema: { type: "integer", default: 5 } },
            { name: "stage2Years", in: "query", schema: { type: "integer", default: 5 } },
            { name: "terminalGrowth", in: "query", required: true, schema: { type: "number" } },
            { name: "discountRate", in: "query", required: true, schema: { type: "number", description: "WACC (decimal)" } },
            { name: "netDebt", in: "query", schema: { type: "number" } },
            { name: "sharesOutstanding", in: "query", schema: { type: "number" } },
            { name: "terminalExitMultiple", in: "query", schema: { type: "number" } },
            { name: "sensitivity", in: "query", schema: { type: "boolean" } },
          ],
          responses: { "200": { description: "DCF valuation" } },
        },
        post: {
          summary: "Ticker-anchored DCF — auto-pulls baseFcf / netDebt / shares from /financials",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["symbol"],
                  properties: {
                    symbol: { type: "string" },
                    growthStage1: { type: "number", default: 0.08 },
                    growthStage2: { type: "number" },
                    stage1Years: { type: "integer", default: 5 },
                    stage2Years: { type: "integer", default: 5 },
                    terminalGrowth: { type: "number", default: 0.025 },
                    discountRate: { type: "number", description: "If omitted, derived via CAPM from riskFreeRate, beta, equityRiskPremium" },
                    riskFreeRate: { type: "number", default: 0.04 },
                    equityRiskPremium: { type: "number", default: 0.055 },
                    beta: { type: "number", default: 1.0 },
                    sensitivity: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "DCF valuation with derivation trail" } },
        },
      },
      "/portfolio/analytics": {
        get: {
          summary: "Risk metrics for the calling workspace's portfolio (Sharpe, Sortino, beta, VaR, etc.). Currently requires a workspace session — public-key access returns 501 until per-key portfolio scoping ships.",
          parameters: [
            { name: "benchmark", in: "query", schema: { type: "string", default: "SPY" } },
            { name: "days", in: "query", schema: { type: "integer", default: 252 } },
            { name: "riskFreeRate", in: "query", schema: { type: "number", default: 0.04 } },
          ],
          responses: { "200": { description: "Risk metrics" }, "501": { description: "Public-key portfolio access not yet available" } },
        },
      },
    },
  };
}

export function GET(req: NextRequest) {
  const origin = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return NextResponse.json(spec(origin), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
