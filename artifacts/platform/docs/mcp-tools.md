# Finsyt MCP Tool Reference

**Protocol:** MCP `2024-11-05` over HTTP  
**Endpoint:** `POST /api/mcp` (JSON-RPC 2.0)  
**Discovery:** `GET /api/mcp?discovery=1` (no auth required)  
**Auth:** `Authorization: Bearer <api-key>` — generate at **Settings → API Keys**

---

## Connecting to Finsyt from an MCP client

### Claude Desktop / Claude.ai

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "finsyt": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-client-http"],
      "env": {
        "MCP_HTTP_URL": "https://platform.finsyt.com/api/mcp",
        "MCP_HTTP_AUTH": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Copilot for Excel (Microsoft 365)

1. Open **Insert → Add-ins → Get Add-ins** in Excel.
2. Search for **Finsyt** (once published to the Microsoft AppSource catalog).
3. For early-access / self-hosted Excel add-in: navigate to **Insert → Add-ins → My Add-ins → Upload My Add-in** and supply the manifest URL:
   ```
   https://platform.finsyt.com/api/excel-addin/manifest
   ```
4. In the Finsyt task pane, enter your API key.  
   The add-in calls `POST /api/mcp` behind the scenes using the MCP `tools/call` method.

### ChatGPT / OpenAI plugins (beta)

Use the discovery manifest for plugin registration:

```
GET https://platform.finsyt.com/api/mcp?discovery=1
```

The manifest includes the required `api`, `auth`, and `descriptionForModel` fields.

### Cursor / Windsurf / VS Code MCP extension

```json
{
  "finsyt": {
    "url": "https://platform.finsyt.com/api/mcp",
    "headers": {
      "Authorization": "Bearer YOUR_API_KEY"
    }
  }
}
```

---

## Authentication

All `POST /api/mcp` calls and authenticated `GET /api/mcp` calls require:

```
Authorization: Bearer <api-key>
```

The unauthenticated `GET /api/mcp?discovery=1` endpoint is open for MCP client discovery flows.

---

## MCP protocol usage

### Initialize

```json
{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} }
```

Response:
```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": { "listChanged": false } },
    "serverInfo": { "name": "finsyt", "version": "2.0.0" }
  }
}
```

### List tools

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }
```

Returns all built-in finance tools plus any Connector Hub tools your workspace has wired in.

### Call a tool

```json
{
  "jsonrpc": "2.0", "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_stock_quote",
    "arguments": { "symbol": "NVDA" }
  }
}
```

---

## Finance tools

### `get_stock_quote`

Real-time quote, market cap, P/E, 52-week range, sector, industry.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | ✓ | Ticker symbol, e.g. `NVDA`, `AAPL`, `MSFT` |

**Example:**
```json
{ "name": "get_stock_quote", "arguments": { "symbol": "NVDA" } }
```

**Response fields:** `symbol`, `name`, `price`, `changePct`, `marketCap`, `pe`, `eps`, `high52w`, `low52w`, `sector`, `industry`, `exchange`, `source`

---

### `get_financials`

Income statement, balance sheet, or cash flow — annual or quarterly.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | ✓ | Ticker symbol |
| `type` | enum | | `income` \| `balance` \| `cashflow` \| `earnings` \| `ratios` (default: `income`) |
| `periods` | number | | Number of periods (default 8) |

**Example:**
```json
{ "name": "get_financials", "arguments": { "symbol": "AAPL", "type": "income", "periods": 4 } }
```

---

### `get_estimates`

Analyst consensus EPS estimates, revenue estimates, price targets, buy/sell/hold ratings, earnings surprises, and upgrade/downgrade history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | ✓ | Ticker symbol |

**Example:**
```json
{ "name": "get_estimates", "arguments": { "symbol": "MSFT" } }
```

**Response fields:** `rating`, `priceTarget`, `priceTargetHigh`, `priceTargetLow`, `numAnalysts`, `strongBuy`, `buy`, `hold`, `sell`, `estimatesAnnual`, `estimatesQuarterly`, `surprises`, `upgrades`, `source`

---

### `get_dcf`

Discounted cash flow (DCF) valuation anchored to a ticker's reported free cash flow. Returns intrinsic value per share. With `sensitivity: true`, also returns a 5×5 grid across ±2% WACC × ±1% terminal growth.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | ✓ | Ticker symbol — FCF and shares outstanding are pulled from the financials provider |
| `growthStage1` | number | | Near-term FCF growth rate (decimal, e.g. `0.12` = 12%). Default `0.10` |
| `growthStage2` | number | | Mid-term growth rate. Default equals `growthStage1` |
| `stage1Years` | number | | Duration of high-growth stage (years). Default `5` |
| `stage2Years` | number | | Duration of mid-growth stage (years). Default `5` |
| `terminalGrowth` | number | | Perpetuity growth rate. Default `0.025` |
| `discountRate` | number | | WACC (decimal, e.g. `0.09` = 9%). Default `0.09` |
| `sensitivity` | boolean | | Return 5×5 sensitivity grid. Default `false` |

**Example:**
```json
{
  "name": "get_dcf",
  "arguments": {
    "symbol": "AAPL",
    "growthStage1": 0.10,
    "discountRate": 0.09,
    "terminalGrowth": 0.025,
    "sensitivity": true
  }
}
```

**Response fields:** `symbol`, `intrinsicValuePerShare`, `impliedUpdownPct`, `baseFcf`, `netDebt`, `sharesOutstanding`, `assumptions`, `sensitivityGrid` (if requested), `source`

---

### `get_earnings_transcript`

List available earnings call transcripts or retrieve the full text for a specific quarter.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | ✓ | Ticker symbol |
| `year` | string | | Year of the call, e.g. `"2025"` |
| `quarter` | string | | Quarter: `"1"` \| `"2"` \| `"3"` \| `"4"` |

**Example — list transcripts:**
```json
{ "name": "get_earnings_transcript", "arguments": { "symbol": "NVDA" } }
```

**Example — fetch Q2 2025 content:**
```json
{ "name": "get_earnings_transcript", "arguments": { "symbol": "NVDA", "year": "2025", "quarter": "2" } }
```

---

### `get_news`

Recent financial news headlines and summaries.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | | Ticker for company-specific news (omit for market-wide) |
| `topic` | string | | `general` \| `technology` \| `forex` \| `crypto` \| `economy` \| `merger` |
| `limit` | number | | Max articles (default 10, max 15) |

**Example:**
```json
{ "name": "get_news", "arguments": { "symbol": "TSLA", "limit": 5 } }
```

---

### `get_filings`

SEC filings with direct document links.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | ✓ | Ticker symbol |
| `type` | string | | `"10-K"` \| `"10-Q"` \| `"8-K"` \| `"DEF 14A"` |
| `limit` | number | | Max results (default 10, max 20) |

**Example:**
```json
{ "name": "get_filings", "arguments": { "symbol": "GOOGL", "type": "10-K" } }
```

---

### `get_insider_trades`

Recent insider trading disclosures (Form 4 filings).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | | Ticker (omit for market-wide insider activity) |
| `type` | enum | | `"buy"` \| `"sell"` \| `"all"` (default: `"all"`) |
| `limit` | number | | Max records (default 20, max 50) |

**Response fields per trade:** `symbol`, `date`, `reportingName`, `title`, `transactionType`, `change` (shares), `price`, `value`, `securitiesOwned`, `source`

**Example:**
```json
{ "name": "get_insider_trades", "arguments": { "symbol": "META", "type": "sell", "limit": 10 } }
```

---

### `get_deals`

M&A deal flow — announced, pending, and completed transactions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | | Filter by company involvement as acquirer or target |
| `limit` | number | | Max deals (default 20, max 50) |

**Response fields per deal:** `id`, `acquirer`, `acquirerSymbol`, `target`, `targetSymbol`, `status`, `type`, `value`, `link`, `date`, `source`

**Example — latest deals:**
```json
{ "name": "get_deals", "arguments": { "limit": 10 } }
```

**Example — deals involving Microsoft:**
```json
{ "name": "get_deals", "arguments": { "symbol": "MSFT" } }
```

---

### `get_peer_comps`

Compare a list of tickers on key financial and valuation metrics. Returns a comp table with market cap, P/E, revenue, revenue growth, gross margin, and net margin.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbols` | string[] | ✓ | Array of tickers to compare (2–10). E.g. `["NVDA","AMD","INTC"]` |
| `subject` | string | | Optional anchor ticker rendered first |

**Example:**
```json
{
  "name": "get_peer_comps",
  "arguments": {
    "symbols": ["NVDA", "AMD", "INTC", "QCOM"],
    "subject": "NVDA"
  }
}
```

**Response fields per peer:** `symbol`, `name`, `price`, `marketCap`, `pe`, `eps`, `revenue`, `revenueGrowthPct`, `grossMarginPct`, `netMarginPct`, `source`

---

### `get_macro_data`

Macroeconomic indicator series from FRED and other sources.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `indicators` | string[] | | List of indicators (default: `["fed_rate","cpi","yield_10y","gdp_growth"]`). Max 10. |
| `periods` | number | | History depth (default 8) |

**Available indicators:** `fed_rate`, `cpi`, `gdp_growth`, `unemployment`, `yield_10y`, `yield_2y`, `spread_10_2`, `vix`, `core_pce`

**Example:**
```json
{
  "name": "get_macro_data",
  "arguments": {
    "indicators": ["fed_rate", "cpi", "unemployment", "yield_10y"],
    "periods": 12
  }
}
```

---

### `search_companies`

Search for companies by name or partial ticker.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✓ | Company name or partial ticker |

**Example:**
```json
{ "name": "search_companies", "arguments": { "query": "semiconductor" } }
```

---

### `screen_stocks`

Screen stocks by sector, market cap range, and exchange.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sector` | string | | Sector filter: `Technology` \| `Healthcare` \| `Financials` \| `Energy` \| `Consumer Cyclical` \| … |
| `minMcap` | number | | Minimum market cap in USD |
| `maxMcap` | number | | Maximum market cap in USD |
| `exchange` | string | | `NYSE` \| `NASDAQ` \| `both` (default) |
| `limit` | number | | Max results (default 25, max 100) |

**Example — large-cap tech:**
```json
{
  "name": "screen_stocks",
  "arguments": {
    "sector": "Technology",
    "minMcap": 10000000000,
    "limit": 20
  }
}
```

---

## Connector Hub tools

In addition to the built-in finance tools above, workspaces can wire in external REST APIs and MCP servers via the **Connector Hub** (`/app/connectors`). Connected tools appear automatically in `tools/list` under the naming convention `conn__<connection>__<operation>__<id>`.

Examples of available connectors: Stripe, Linear, Apify Actors (Capitol Trades, SEC filings intelligence, Glassdoor), Box, Dropbox, and 40+ others in the catalog.

---

## Data attribution

Every tool response includes a `source` field identifying the upstream data provider (e.g. `"Financial Modeling Prep"`, `"FRED"`, `"Yahoo Finance (public chart endpoint)"`). MCP clients and AI models should surface this attribution to end users.

---

## Rate limits & quotas

API key rate limits are enforced at the platform level. Contact support@finsyt.com for higher-volume enterprise tiers.

---

## Census tools (opt-in)

U.S. Census Bureau tools (`finsyt_census_*` — demographics, geographies, ACS variables) are available via the Census connector in the Connector Hub rather than the default finance tool list. This keeps the finance surface focused and avoids crowding the tool selector in Claude / Copilot with demographic APIs irrelevant to most investment research flows. To enable them, connect the Census data source in `/app/connectors`.
