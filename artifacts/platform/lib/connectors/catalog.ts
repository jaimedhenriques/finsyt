/**
 * Curated Connector Catalog
 * ─────────────────────────
 * Shortlist of finance-relevant APIs from the API-mega-list
 * (https://github.com/cporter202/API-mega-list) plus first-party providers
 * that already live in `lib/data-providers.ts`.
 *
 * This is the authoritative source for the Connector Hub Catalog tab and the
 * `/api/connectors/catalog` endpoint. The seeder writes this list into the
 * `connector_definitions` table on first boot (and updates by slug when the
 * file changes).
 */

export type CatalogAuthType =
  | "none"
  | "api_key_header"
  | "api_key_query"
  | "bearer"
  | "basic"
  | "oauth2";

export type CatalogCategory =
  | "markets"
  | "fundamentals"
  | "macro"
  | "filings"
  | "news"
  | "sentiment"
  | "crypto"
  | "fx"
  | "ai_nlp"
  | "geocoding"
  | "calendars"
  | "comms"
  | "search"
  | "data_room"
  | "alt_data";

export interface CatalogOperation {
  /** Stable name. Surfaces as `conn__<slug>__<name>` in the unified MCP. */
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path template — `{var}` placeholders bind to `paramSchema` keys. */
  path: string;
  paramSchema: Record<string, { type: "string" | "number" | "boolean"; required?: boolean; description?: string }>;
  cacheTtlSeconds?: number;
  /**
   * When true the operation is seeded into `connection_operations` (so the
   * executor can still look it up by name for credential-validation probes
   * like Apify's `users_me`) but is hidden from the agent / MCP tool
   * registry — `buildConnectorAgentTools` skips rows with `hidden = true`.
   * Lets us keep `validateOperation` working without inflating the
   * user-facing tool count.
   */
  hidden?: boolean;
}

export interface CatalogCredentialField {
  /** Credential bag key. Stored encrypted, never re-served. */
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  /** When true the input renders as a password field. */
  secret?: boolean;
}

export interface CatalogEntry {
  slug: string;
  name: string;
  category: CatalogCategory;
  description: string;
  authType: CatalogAuthType;
  baseUrl: string;
  docUrl: string;
  /** When true the user already gets this without connecting (data-providers.ts). */
  isFirstParty?: boolean;
  /**
   * When true the connector represents a premium / institutional data feed
   * (FactSet, S&P CapIQ, Bloomberg DL, Refinitiv, PitchBook). The Hub UI
   * surfaces these with a distinct badge and the marketing site uses them
   * as the source for the "Coming from FactSet?" card section.
   */
  isPremium?: boolean;
  /** Optional OAuth definition. The handler reads client id/secret from env. */
  oauth?: {
    authorizeUrl: string;
    tokenUrl: string;
    scopes: string;
    clientIdEnv: string;
    clientSecretEnv: string;
    pkce?: boolean;
  };
  /**
   * Per-connector credential prompts. Overrides the default field set the
   * Hub UI infers from `authType` so connectors with non-obvious labels
   * (FactSet "Username-Serial / API Key", Refinitiv "App Key", etc.) surface
   * the right copy + helper text. Each field is stored in the encrypted
   * credential bag under `key`.
   */
  credentialFields?: CatalogCredentialField[];
  /**
   * Friendly note shown above the credential inputs in the connect modal —
   * used to call out entitlement requirements ("Requires Estimates entitlement")
   * or to document where the user should obtain the credentials.
   */
  credentialNotes?: string;
  /**
   * Static credential bag entries merged into whatever the user enters —
   * used to pre-populate things like `header_name` for `api_key_header`
   * connectors whose upstream expects a non-default header (e.g. CapIQ's
   * `Apikey` header). Never overrides user-supplied values.
   */
  credentialDefaults?: Record<string, string>;
  /**
   * Name of the operation (must exist in `operationTemplates`) that the
   * test/validate endpoints should invoke as a lightweight credential
   * check. When present the test endpoint runs this op instead of a
   * blunt base-URL ping. The connection POST also runs this inline so the
   * user gets immediate feedback that their credentials were accepted.
   */
  validateOperation?: string;
  /**
   * Stub parameters fed to `validateOperation` so the call is a true no-arg
   * credential probe even when the underlying op accepts placeholders. Used
   * to disambiguate "wrong credentials" (401/403) from "missing required
   * request parameter" (400). Choose values that are stable, harmless, and
   * cheap on the upstream (a well-known ticker, a tiny page size, etc.).
   */
  validateParams?: Record<string, string>;
  /**
   * Per-connector copy overrides for the validation outcome surfaced on
   * connection POST and the manual Test button. Lets the catalog speak to
   * the user in provider-specific terms ("Invalid Apify token" instead of
   * the generic "Credentials were rejected by the provider (HTTP 401)")
   * and pluck an identity hint out of the success payload so the modal
   * can confirm whose account is now connected ("Connected as <username>").
   *
   * - `invalidCredentials`: copy used for 401 / 403 from this connector.
   * - `successIdentityPath`: dot-path into the validation response `data`
   *    (e.g. "data.username" for Apify's `users/me`). When the path
   *    resolves to a non-empty string the validation `detail` becomes
   *    `Connected as <value>` instead of the generic "Validated via …".
   */
  validationMessages?: {
    invalidCredentials?: string;
    successIdentityPath?: string;
  };
  operationTemplates?: CatalogOperation[];
}

// ── Category labels (used by UI) ────────────────────────────────────────────
export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  markets: "Markets & Quotes",
  fundamentals: "Fundamentals",
  macro: "Macro & Economic",
  filings: "Filings & Regulatory",
  news: "News",
  sentiment: "Sentiment",
  crypto: "Crypto",
  fx: "FX & Rates",
  ai_nlp: "AI / NLP",
  geocoding: "Geocoding & Places",
  calendars: "Calendars",
  comms: "Communications",
  search: "Web Search",
  data_room: "Data Rooms & Diligence",
  alt_data: "Alt Data & Scrapers",
};

export const AUTH_LABELS: Record<CatalogAuthType, string> = {
  none: "No auth",
  api_key_header: "API key (header)",
  api_key_query: "API key (query)",
  bearer: "Bearer token",
  basic: "Basic auth",
  oauth2: "OAuth 2.0",
};

// ── Catalog ─────────────────────────────────────────────────────────────────
// Kept long-form on purpose — the hub UI surfaces the description verbatim.
export const CATALOG: CatalogEntry[] = [
  // ─── First-party (already wired into data-providers.ts) ───────────────────
  {
    slug: "finsyt-fmp",
    name: "Financial Modeling Prep",
    category: "fundamentals",
    description: "70k+ tickers, 30 yrs financials, transcripts, SEC filings. Already wired into Finsyt.",
    authType: "api_key_query",
    baseUrl: "https://financialmodelingprep.com/api/v3",
    docUrl: "https://site.financialmodelingprep.com/developer/docs",
    isFirstParty: true,
  },
  {
    slug: "finsyt-massive",
    name: "Massive (Polygon.io)",
    category: "markets",
    description: "US equities, options, FX, crypto — real-time + 20yr history.",
    authType: "api_key_query",
    baseUrl: "https://api.polygon.io",
    docUrl: "https://polygon.io/docs",
    isFirstParty: true,
  },
  {
    slug: "finsyt-eodhd",
    name: "EODHD",
    category: "fundamentals",
    description: "150k+ tickers across 70 exchanges, strong international coverage.",
    authType: "api_key_query",
    baseUrl: "https://eodhd.com/api",
    docUrl: "https://eodhd.com/financial-apis/",
    isFirstParty: true,
  },
  {
    slug: "finsyt-finnhub",
    name: "Finnhub",
    category: "markets",
    description: "US/EU/Asia equities, real-time WebSocket, recommendation trends.",
    authType: "api_key_query",
    baseUrl: "https://finnhub.io/api/v1",
    docUrl: "https://finnhub.io/docs/api",
    isFirstParty: true,
  },
  {
    slug: "finsyt-fred",
    name: "FRED (St. Louis Fed)",
    category: "macro",
    description: "800k+ economic time series — GDP, CPI, rates, unemployment.",
    authType: "api_key_query",
    baseUrl: "https://api.stlouisfed.org/fred",
    docUrl: "https://fred.stlouisfed.org/docs/api/fred/",
    isFirstParty: true,
  },

  // ─── Premium institutional data ───────────────────────────────────────────
  // These tiles target enterprise buyers who already license FactSet / CapIQ /
  // Refinitiv / Bloomberg DL / PitchBook. Finsyt brokers no data redistribution
  // here — the customer plugs in their own credentials and Finsyt becomes a
  // unified surface across them. Each tile ships with credential prompts
  // tuned to the provider, two or three sample queries the user can run
  // immediately, and a `validateOperation` that the connect flow uses for a
  // lightweight credential check on save.
  {
    slug: "factset",
    name: "FactSet",
    category: "fundamentals",
    description:
      "FactSet Symbology, Prices, Fundamentals, and Estimates over the standard FactSet API. Bring your own FactSet username-serial + API key.",
    authType: "basic",
    baseUrl: "https://api.factset.com",
    docUrl: "https://developer.factset.com/api-catalog",
    isPremium: true,
    credentialNotes:
      "FactSet API uses HTTP Basic auth: your username-serial (e.g. USER1-12345) as the username and the API key generated in the FactSet Developer Portal as the password. Connecting requires an active subscription to the relevant data packages (Symbology, Prices, Fundamentals, Estimates).",
    credentialFields: [
      { key: "username", label: "Username-Serial", placeholder: "USER1-12345", help: "From your FactSet Developer Portal account." },
      { key: "password", label: "API Key", secret: true, help: "Generated in the FactSet Developer Portal under API Keys." },
    ],
    validateOperation: "symbology_lookup",
    validateParams: { ids: "AAPL-US" },
    operationTemplates: [
      {
        name: "symbology_lookup",
        description: "Resolve identifiers (ticker, ISIN, CUSIP, SEDOL) to FactSet permanent IDs. Used as the credential validation call.",
        method: "GET",
        path: "/factset-symbology/v1/factset-permanent-id?ids={ids}",
        paramSchema: { ids: { type: "string", required: true, description: "Comma-separated identifiers, e.g. AAPL-US,MSFT-US" } },
        cacheTtlSeconds: 3600,
      },
      {
        name: "prices",
        description: "Reference quote / EOD price snapshot for a list of FactSet identifiers.",
        method: "GET",
        path: "/factset-prices/v1/prices?ids={ids}",
        paramSchema: { ids: { type: "string", required: true, description: "Comma-separated FactSet identifiers" } },
        cacheTtlSeconds: 60,
      },
      {
        name: "estimates_consensus",
        description: "Consensus EPS / revenue estimates from FactSet Estimates (requires the Estimates package).",
        method: "GET",
        path: "/factset-estimates/v2/consensus?ids={ids}&metrics={metric}&periodicity=ANN",
        paramSchema: {
          ids: { type: "string", required: true, description: "Comma-separated FactSet identifiers" },
          metric: { type: "string", required: true, description: "Estimate metric, e.g. EPS or SALES" },
        },
        cacheTtlSeconds: 600,
      },
    ],
  },
  {
    slug: "spglobal-capiq",
    name: "S&P Capital IQ",
    category: "fundamentals",
    description:
      "S&P Capital IQ Pro — quotes, financials, transactions, ownership over the Marketplace API. Bring your own Marketplace API key.",
    authType: "api_key_header",
    baseUrl: "https://api-ciq.marketplace.spglobal.com",
    docUrl: "https://www.marketplace.spglobal.com/en/datasets/s-p-capital-iq-pro",
    isPremium: true,
    credentialNotes:
      "S&P Capital IQ Marketplace requires a Marketplace API key tied to your Capital IQ Pro subscription. Generate one in the Marketplace developer console; the key is sent as the `Apikey` header on every request.",
    credentialFields: [
      { key: "api_key", label: "Marketplace API key", secret: true, help: "Generated in the S&P Marketplace developer console." },
    ],
    credentialDefaults: {
      header_name: "Apikey",
    },
    validateOperation: "reference_quote",
    validateParams: { symbol: "NasdaqGS:AAPL" },
    operationTemplates: [
      {
        name: "reference_quote",
        description: "Latest reference quote for a single security. Used as the credential validation call.",
        method: "GET",
        path: "/V1/Quote?Symbol={symbol}",
        paramSchema: { symbol: { type: "string", required: true, description: "Capital IQ ticker, e.g. NasdaqGS:AAPL" } },
        cacheTtlSeconds: 60,
      },
      {
        name: "financials_snapshot",
        description: "Income statement / balance sheet / cash flow snapshot for a security (requires the Fundamentals package).",
        method: "GET",
        path: "/V1/Financials?Symbol={symbol}&periodType={periodType}",
        paramSchema: {
          symbol: { type: "string", required: true, description: "Capital IQ ticker" },
          periodType: { type: "string", required: false, description: "ANNUAL | QUARTERLY (default ANNUAL)" },
        },
        cacheTtlSeconds: 3600,
      },
      {
        name: "transactions_search",
        description: "M&A and private placement transaction search (requires the Transactions package).",
        method: "GET",
        path: "/V1/Transactions?Target={target}&AnnouncedDateFrom={from}",
        paramSchema: {
          target: { type: "string", required: true, description: "Target company name or Capital IQ id" },
          from: { type: "string", required: false, description: "ISO date floor for announced date" },
        },
        cacheTtlSeconds: 3600,
      },
    ],
  },
  {
    slug: "refinitiv-lseg",
    name: "Refinitiv / LSEG Data Platform",
    category: "fundamentals",
    description:
      "LSEG (formerly Refinitiv) Data Platform — Symbology, Pricing, Fundamentals, News. Use a bearer token issued by your RDP credentials and your App Key.",
    authType: "bearer",
    baseUrl: "https://api.refinitiv.com",
    docUrl: "https://developers.lseg.com/en/api-catalog/refinitiv-data-platform",
    isPremium: true,
    credentialNotes:
      "Refinitiv / LSEG Data Platform uses an OAuth2 bearer token plus a per-app `X-Tr-AppKey` header. Issue the bearer token via the RDP token endpoint with your machine ID + password and paste it here together with your App Key. Tokens expire — re-paste a fresh one when the validation call returns 401.",
    credentialFields: [
      { key: "access_token", label: "Bearer access token", secret: true, help: "Issue via RDP /auth/oauth2/v1/token (password or client_credentials grant)." },
      { key: "app_key", label: "App Key (X-Tr-AppKey)", help: "Created in the Refinitiv App Key Generator. Sent as X-Tr-AppKey on every call." },
    ],
    credentialDefaults: {
      app_key_header: "X-Tr-AppKey",
    },
    validateOperation: "symbology_lookup",
    validateParams: { identifier: "AAPL.O" },
    operationTemplates: [
      {
        name: "symbology_lookup",
        description: "Resolve identifiers via the LSEG Symbology service. Used as the credential validation call.",
        method: "GET",
        path: "/data/symbology/v1/lookup?identifiers={identifier}&from=Ric&to=ISIN",
        paramSchema: { identifier: { type: "string", required: true, description: "RIC, e.g. AAPL.O" } },
        cacheTtlSeconds: 3600,
      },
      {
        name: "pricing_snapshot",
        description: "Real-time pricing snapshot for a single RIC (requires the Real-time package).",
        method: "GET",
        path: "/data/pricing/snapshots/v1/{ric}",
        paramSchema: { ric: { type: "string", required: true, description: "Refinitiv Instrument Code" } },
        cacheTtlSeconds: 30,
      },
      {
        name: "news_headlines",
        description: "Latest news headlines for a query / RIC (requires the News package).",
        method: "GET",
        path: "/data/news/v1/headlines?query={query}&limit=20",
        paramSchema: { query: { type: "string", required: true, description: "Search query, e.g. R:AAPL.O" } },
        cacheTtlSeconds: 120,
      },
    ],
  },
  {
    slug: "bloomberg-dl",
    name: "Bloomberg Data License",
    category: "fundamentals",
    description:
      "Bloomberg Data License via the BEAP cloud Hub — reference data, history, and pricing pulls submitted as DL requests. (B-PIPE Terminal API is out of scope and licensed separately.)",
    authType: "basic",
    baseUrl: "https://api.bloomberg.com/eap",
    docUrl: "https://developer.bloomberg.com/portal/products/data-license",
    isPremium: true,
    credentialNotes:
      "Bloomberg Data License (BEAP) authenticates with your DL Account credentials. Issue a service account in the BEAP portal and paste the Client ID / Client Secret here — they are sent as HTTP Basic on every call. Production deployments should also pin the BEAP-issued certificate via your reverse-proxy; this connector only covers the bearer half.",
    credentialFields: [
      { key: "username", label: "DL Client ID", placeholder: "client_xxxxxxxx", help: "Your BEAP service-account client id." },
      { key: "password", label: "DL Client Secret", secret: true, help: "Service-account secret from the BEAP portal." },
      { key: "account_id", label: "DL Account number", placeholder: "12345", help: "Your Bloomberg DL account number — required by most request paths." },
    ],
    validateOperation: "catalogs_list",
    operationTemplates: [
      {
        name: "catalogs_list",
        description: "List the catalogs the credentials can see. Used as the credential validation call.",
        method: "GET",
        path: "/catalogs/",
        paramSchema: {},
        cacheTtlSeconds: 3600,
      },
      {
        name: "request_status",
        description: "Status of a previously submitted DL request (poll until the data file is ready).",
        method: "GET",
        path: "/catalogs/{accountId}/requests/{requestId}/",
        paramSchema: {
          accountId: { type: "string", required: true, description: "DL account number" },
          requestId: { type: "string", required: true, description: "Request id returned when the DL request was submitted" },
        },
        cacheTtlSeconds: 0,
      },
      {
        name: "universe_list",
        description: "List the saved universes available to this account.",
        method: "GET",
        path: "/catalogs/{accountId}/universes/",
        paramSchema: { accountId: { type: "string", required: true, description: "DL account number" } },
        cacheTtlSeconds: 3600,
      },
    ],
  },
  {
    slug: "pitchbook",
    name: "PitchBook",
    category: "fundamentals",
    description:
      "PitchBook Data API — private companies, funding rounds, M&A, LP / GP records. Bring your own PitchBook API access token.",
    authType: "bearer",
    baseUrl: "https://api-v2.pitchbook.com",
    docUrl: "https://pitchbook.com/data/api",
    isPremium: true,
    credentialNotes:
      "PitchBook API access is provisioned per seat. Generate a personal access token from your PitchBook profile (API Tokens) and paste it here. The token grants the same entitlements as the issuing user.",
    credentialFields: [
      { key: "access_token", label: "PitchBook access token", secret: true, help: "Generated in the PitchBook user profile under API Tokens." },
    ],
    validateOperation: "company_search",
    validateParams: { query: "Stripe" },
    operationTemplates: [
      {
        name: "company_search",
        description: "Search the PitchBook company graph by free-text. Used as the credential validation call.",
        method: "GET",
        path: "/companies?searchText={query}&limit=10",
        paramSchema: { query: { type: "string", required: true, description: "Company name fragment, e.g. Stripe" } },
        cacheTtlSeconds: 600,
      },
      {
        name: "company_detail",
        description: "Full PitchBook record for a company by id (funding history, ownership, valuations).",
        method: "GET",
        path: "/companies/{id}",
        paramSchema: { id: { type: "string", required: true, description: "PitchBook company id, e.g. 51217-23" } },
        cacheTtlSeconds: 3600,
      },
      {
        name: "deal_search",
        description: "Search deals (funding rounds, M&A, LBOs) with optional filters.",
        method: "GET",
        path: "/deals?dealType={dealType}&minDealSize={minDealSize}&limit=20",
        paramSchema: {
          dealType: { type: "string", required: true, description: "VC | PE | M&A | IPO | …" },
          minDealSize: { type: "number", required: false, description: "Floor in USD millions" },
        },
        cacheTtlSeconds: 600,
      },
    ],
  },

  // ─── Markets / Quotes (new) ───────────────────────────────────────────────
  {
    slug: "alphavantage",
    name: "Alpha Vantage",
    category: "markets",
    description: "Global equities, FX, crypto, technical indicators. Free tier available.",
    authType: "api_key_query",
    baseUrl: "https://www.alphavantage.co",
    docUrl: "https://www.alphavantage.co/documentation/",
    operationTemplates: [
      {
        name: "global_quote",
        description: "Get the latest quote for a ticker symbol.",
        method: "GET",
        path: "/query?function=GLOBAL_QUOTE&symbol={symbol}",
        paramSchema: { symbol: { type: "string", required: true, description: "Ticker symbol (e.g. AAPL)" } },
        cacheTtlSeconds: 60,
      },
      {
        name: "company_overview",
        description: "Company overview, sector, market cap, P/E.",
        method: "GET",
        path: "/query?function=OVERVIEW&symbol={symbol}",
        paramSchema: { symbol: { type: "string", required: true } },
        cacheTtlSeconds: 3600,
      },
    ],
  },
  {
    slug: "twelvedata",
    name: "Twelve Data",
    category: "markets",
    description: "Global equities, ETFs, FX, crypto, indices — REST + WebSocket.",
    authType: "api_key_query",
    baseUrl: "https://api.twelvedata.com",
    docUrl: "https://twelvedata.com/docs",
    operationTemplates: [
      {
        name: "quote",
        description: "Get latest quote for a symbol (global coverage).",
        method: "GET",
        path: "/quote?symbol={symbol}",
        paramSchema: { symbol: { type: "string", required: true } },
        cacheTtlSeconds: 60,
      },
    ],
  },
  {
    slug: "iex-cloud",
    name: "IEX Cloud",
    category: "markets",
    description: "US equities and ETFs, deep historical data and reference data.",
    authType: "api_key_query",
    baseUrl: "https://cloud.iexapis.com/stable",
    docUrl: "https://iexcloud.io/docs/api/",
  },
  {
    slug: "tiingo",
    name: "Tiingo",
    category: "markets",
    description: "EOD prices, IEX-derived intraday, fundamentals and news.",
    authType: "bearer",
    baseUrl: "https://api.tiingo.com",
    docUrl: "https://www.tiingo.com/documentation/general/overview",
  },
  {
    slug: "marketstack",
    name: "Marketstack",
    category: "markets",
    description: "30k+ tickers across 70 exchanges, 30 yrs EOD data.",
    authType: "api_key_query",
    baseUrl: "https://api.marketstack.com/v1",
    docUrl: "https://marketstack.com/documentation",
  },
  {
    slug: "stooq",
    name: "Stooq",
    category: "markets",
    description: "Free EOD prices for global tickers, indices and commodities.",
    authType: "none",
    baseUrl: "https://stooq.com",
    docUrl: "https://stooq.com/q/?h",
  },

  // ─── Macro / Economic ─────────────────────────────────────────────────────
  {
    slug: "world-bank",
    name: "World Bank Open Data",
    category: "macro",
    description: "1,500+ development & macro indicators across 200+ countries. Keyless.",
    authType: "none",
    baseUrl: "https://api.worldbank.org/v2",
    docUrl: "https://datahelpdesk.worldbank.org/knowledgebase/topics/125589",
    operationTemplates: [
      {
        name: "indicator",
        description: "Fetch a country/indicator series (e.g. NY.GDP.MKTP.CD).",
        method: "GET",
        path: "/country/{country}/indicator/{indicator}?format=json&per_page=200",
        paramSchema: {
          country: { type: "string", required: true, description: "ISO-3 code or 'all'" },
          indicator: { type: "string", required: true, description: "World Bank indicator code" },
        },
        cacheTtlSeconds: 86400,
      },
    ],
  },
  {
    slug: "bea",
    name: "BEA (US Bureau of Economic Analysis)",
    category: "macro",
    description: "GDP, regional accounts, industry accounts, international trade.",
    authType: "api_key_query",
    baseUrl: "https://apps.bea.gov/api/data",
    docUrl: "https://apps.bea.gov/API/docs/index.htm",
  },
  {
    slug: "bls",
    name: "BLS (US Bureau of Labor Statistics)",
    category: "macro",
    description: "Employment, CPI, PPI, productivity, wages.",
    authType: "api_key_query",
    baseUrl: "https://api.bls.gov/publicAPI/v2",
    docUrl: "https://www.bls.gov/developers/",
  },
  {
    slug: "oecd",
    name: "OECD Data",
    category: "macro",
    description: "Cross-country macro, social, environmental indicators.",
    authType: "none",
    baseUrl: "https://stats.oecd.org/sdmx-json/data",
    docUrl: "https://data.oecd.org/api/",
  },
  {
    slug: "imf",
    name: "IMF Data Services",
    category: "macro",
    description: "International financial statistics, balance of payments.",
    authType: "none",
    baseUrl: "https://www.imf.org/external/datamapper/api/v1",
    docUrl: "https://datahelp.imf.org/knowledgebase/articles/667681",
  },
  {
    slug: "treasury-fiscaldata",
    name: "US Treasury Fiscal Data",
    category: "macro",
    description: "Federal debt, daily treasury statement, interest rates.",
    authType: "none",
    baseUrl: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service",
    docUrl: "https://fiscaldata.treasury.gov/api-documentation/",
  },
  {
    slug: "us-census",
    name: "U.S. Census Bureau",
    category: "macro",
    description: "ACS, decennial census, economic census, population estimates.",
    authType: "api_key_query",
    baseUrl: "https://api.census.gov/data",
    docUrl: "https://www.census.gov/data/developers.html",
  },

  // ─── Filings / Regulatory ─────────────────────────────────────────────────
  {
    slug: "sec-edgar",
    name: "SEC EDGAR",
    category: "filings",
    description: "All US public-company SEC filings since 1993. Keyless.",
    authType: "none",
    baseUrl: "https://data.sec.gov",
    docUrl: "https://www.sec.gov/edgar/sec-api-documentation",
    operationTemplates: [
      {
        name: "submissions",
        description: "Recent filings for a CIK (10-digit, zero-padded).",
        method: "GET",
        path: "/submissions/CIK{cik}.json",
        paramSchema: { cik: { type: "string", required: true, description: "10-digit CIK e.g. 0000320193" } },
        cacheTtlSeconds: 3600,
      },
    ],
  },
  {
    slug: "edgar-online",
    name: "EDGAR Online",
    category: "filings",
    description: "Cleaned XBRL fundamentals and full-text filing search.",
    authType: "api_key_header",
    baseUrl: "https://api.edgar-online.com/v2",
    docUrl: "https://www.edgar-online.com/api/",
  },
  {
    slug: "opencorporates",
    name: "OpenCorporates",
    category: "filings",
    description: "Global company registry — entity lookups across 180+ jurisdictions.",
    authType: "api_key_query",
    baseUrl: "https://api.opencorporates.com/v0.4",
    docUrl: "https://api.opencorporates.com/documentation/API-Reference",
  },
  {
    slug: "opensanctions",
    name: "OpenSanctions",
    category: "filings",
    description: "Consolidated sanctions / PEP / watchlist entities.",
    authType: "api_key_header",
    baseUrl: "https://api.opensanctions.org",
    docUrl: "https://www.opensanctions.org/docs/api/",
  },
  {
    slug: "ofac",
    name: "OFAC SDN List",
    category: "filings",
    description: "US Treasury sanctioned-individuals list (XML/JSON).",
    authType: "none",
    baseUrl: "https://www.treasury.gov/ofac/downloads",
    docUrl: "https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists",
  },

  // ─── Crypto ───────────────────────────────────────────────────────────────
  {
    slug: "coingecko",
    name: "CoinGecko",
    category: "crypto",
    description: "Coin prices, market caps, exchange data — generous free tier.",
    authType: "api_key_header",
    baseUrl: "https://api.coingecko.com/api/v3",
    docUrl: "https://www.coingecko.com/en/api/documentation",
    operationTemplates: [
      {
        name: "simple_price",
        description: "Spot price for one or more coins in one or more currencies.",
        method: "GET",
        path: "/simple/price?ids={ids}&vs_currencies={vs_currencies}",
        paramSchema: {
          ids: { type: "string", required: true, description: "Comma-separated coin ids (e.g. bitcoin,ethereum)" },
          vs_currencies: { type: "string", required: true, description: "Comma-separated currencies (e.g. usd,eur)" },
        },
        cacheTtlSeconds: 30,
      },
    ],
  },
  {
    slug: "coinmarketcap",
    name: "CoinMarketCap",
    category: "crypto",
    description: "Crypto market data, latest listings, historical OHLCV.",
    authType: "api_key_header",
    baseUrl: "https://pro-api.coinmarketcap.com/v1",
    docUrl: "https://coinmarketcap.com/api/documentation/",
  },
  {
    slug: "kraken",
    name: "Kraken",
    category: "crypto",
    description: "Public market data and (with auth) trading endpoints.",
    authType: "api_key_header",
    baseUrl: "https://api.kraken.com/0",
    docUrl: "https://docs.kraken.com/rest/",
  },
  {
    slug: "binance",
    name: "Binance",
    category: "crypto",
    description: "Spot & futures market data, OHLCV, order books.",
    authType: "api_key_header",
    baseUrl: "https://api.binance.com",
    docUrl: "https://binance-docs.github.io/apidocs/",
  },
  {
    slug: "coinbase",
    name: "Coinbase",
    category: "crypto",
    description: "Exchange rates, products, candles. Public + authenticated.",
    authType: "bearer",
    baseUrl: "https://api.coinbase.com/v2",
    docUrl: "https://docs.cloud.coinbase.com/sign-in-with-coinbase/docs",
  },

  // ─── FX / Rates ───────────────────────────────────────────────────────────
  {
    slug: "exchangerate-api",
    name: "ExchangeRate-API",
    category: "fx",
    description: "Real-time FX rates for 160+ currencies.",
    authType: "api_key_query",
    baseUrl: "https://v6.exchangerate-api.com/v6",
    docUrl: "https://www.exchangerate-api.com/docs",
  },
  {
    slug: "frankfurter",
    name: "Frankfurter (ECB)",
    category: "fx",
    description: "ECB-published FX rates, no API key required.",
    authType: "none",
    baseUrl: "https://api.frankfurter.app",
    docUrl: "https://www.frankfurter.app/docs/",
    operationTemplates: [
      {
        name: "latest",
        description: "Latest FX rates for a base currency.",
        method: "GET",
        path: "/latest?from={from}",
        paramSchema: { from: { type: "string", required: true, description: "Base currency, e.g. EUR" } },
        cacheTtlSeconds: 3600,
      },
    ],
  },
  {
    slug: "open-exchange-rates",
    name: "Open Exchange Rates",
    category: "fx",
    description: "Hourly-updated FX rates for 200+ currencies.",
    authType: "api_key_query",
    baseUrl: "https://openexchangerates.org/api",
    docUrl: "https://docs.openexchangerates.org/",
  },

  // ─── News / Sentiment ─────────────────────────────────────────────────────
  {
    slug: "newsapi",
    name: "NewsAPI",
    category: "news",
    description: "Articles and headlines from 80,000+ sources worldwide.",
    authType: "api_key_header",
    baseUrl: "https://newsapi.org/v2",
    docUrl: "https://newsapi.org/docs",
    operationTemplates: [
      {
        name: "everything",
        description: "Search articles by keyword, date, language.",
        method: "GET",
        path: "/everything?q={q}&pageSize=20&sortBy=publishedAt",
        paramSchema: { q: { type: "string", required: true, description: "Search query" } },
        cacheTtlSeconds: 300,
      },
    ],
  },
  {
    slug: "gnews",
    name: "GNews",
    category: "news",
    description: "Global news search, headlines, multilingual.",
    authType: "api_key_query",
    baseUrl: "https://gnews.io/api/v4",
    docUrl: "https://gnews.io/docs/v4",
  },
  {
    slug: "currents",
    name: "Currents API",
    category: "news",
    description: "Latest news, trending stories, by category.",
    authType: "api_key_query",
    baseUrl: "https://api.currentsapi.services/v1",
    docUrl: "https://currentsapi.services/en/docs",
  },
  {
    slug: "marketaux",
    name: "Marketaux",
    category: "sentiment",
    description: "Financial news with entity tagging and sentiment.",
    authType: "api_key_query",
    baseUrl: "https://api.marketaux.com/v1",
    docUrl: "https://www.marketaux.com/documentation",
  },
  {
    slug: "mediastack",
    name: "Mediastack",
    category: "news",
    description: "Live news data from 7,500+ sources.",
    authType: "api_key_query",
    baseUrl: "https://api.mediastack.com/v1",
    docUrl: "https://mediastack.com/documentation",
  },
  {
    slug: "finnhub-news",
    name: "Finnhub News",
    category: "news",
    description: "Company-specific and market-wide financial news.",
    authType: "api_key_query",
    baseUrl: "https://finnhub.io/api/v1/news",
    docUrl: "https://finnhub.io/docs/api/company-news",
  },

  // ─── Search ──────────────────────────────────────────────────────────────
  {
    slug: "brave-search",
    name: "Brave Search",
    category: "search",
    description: "Independent web search index. Cite-able results.",
    authType: "api_key_header",
    baseUrl: "https://api.search.brave.com/res/v1",
    docUrl: "https://api.search.brave.com/app/documentation",
  },
  {
    slug: "tavily",
    name: "Tavily",
    category: "search",
    description: "Search API tuned for LLM agents — clean snippets + citations.",
    authType: "bearer",
    baseUrl: "https://api.tavily.com",
    docUrl: "https://docs.tavily.com/",
  },
  {
    slug: "exa",
    name: "Exa (formerly Metaphor)",
    category: "search",
    description: "Neural search with rich, source-attributed results.",
    authType: "api_key_header",
    baseUrl: "https://api.exa.ai",
    docUrl: "https://docs.exa.ai/",
  },

  // ─── AI / NLP ─────────────────────────────────────────────────────────────
  {
    slug: "openai",
    name: "OpenAI",
    category: "ai_nlp",
    description: "GPT-5 / GPT-4o / o-series reasoning, embeddings, vision.",
    authType: "bearer",
    baseUrl: "https://api.openai.com/v1",
    docUrl: "https://platform.openai.com/docs",
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    category: "ai_nlp",
    description: "Claude Opus / Sonnet / Haiku — chat, tools, vision.",
    authType: "api_key_header",
    baseUrl: "https://api.anthropic.com/v1",
    docUrl: "https://docs.anthropic.com",
  },
  {
    slug: "cohere",
    name: "Cohere",
    category: "ai_nlp",
    description: "Embed, rerank, generate, classify endpoints.",
    authType: "bearer",
    baseUrl: "https://api.cohere.ai/v1",
    docUrl: "https://docs.cohere.com/",
  },
  {
    slug: "huggingface",
    name: "Hugging Face",
    category: "ai_nlp",
    description: "Inference API for 100k+ open-source models.",
    authType: "bearer",
    baseUrl: "https://api-inference.huggingface.co/models",
    docUrl: "https://huggingface.co/docs/api-inference/",
  },
  {
    slug: "deepl",
    name: "DeepL",
    category: "ai_nlp",
    description: "High-quality machine translation across 30+ languages.",
    authType: "api_key_header",
    baseUrl: "https://api-free.deepl.com/v2",
    docUrl: "https://developers.deepl.com/docs",
  },

  // ─── Geocoding / Places / Weather ─────────────────────────────────────────
  {
    slug: "google-maps",
    name: "Google Maps Platform",
    category: "geocoding",
    description: "Geocoding, places, distance matrix, time zones.",
    authType: "api_key_query",
    baseUrl: "https://maps.googleapis.com/maps/api",
    docUrl: "https://developers.google.com/maps/documentation",
  },
  {
    slug: "mapbox",
    name: "Mapbox",
    category: "geocoding",
    description: "Geocoding, directions, isochrones, vector tiles.",
    authType: "api_key_query",
    baseUrl: "https://api.mapbox.com",
    docUrl: "https://docs.mapbox.com/api/",
  },
  {
    slug: "nominatim",
    name: "OpenStreetMap Nominatim",
    category: "geocoding",
    description: "Free OpenStreetMap geocoding. Heavy use requires self-hosting.",
    authType: "none",
    baseUrl: "https://nominatim.openstreetmap.org",
    docUrl: "https://nominatim.org/release-docs/develop/api/Overview/",
  },
  {
    slug: "openweathermap",
    name: "OpenWeatherMap",
    category: "geocoding",
    description: "Current weather, forecast, historical, climate.",
    authType: "api_key_query",
    baseUrl: "https://api.openweathermap.org/data/2.5",
    docUrl: "https://openweathermap.org/api",
  },
  {
    slug: "open-meteo",
    name: "Open-Meteo",
    category: "geocoding",
    description: "Free weather forecast — no API key required.",
    authType: "none",
    baseUrl: "https://api.open-meteo.com/v1",
    docUrl: "https://open-meteo.com/en/docs",
  },

  // ─── Calendars ────────────────────────────────────────────────────────────
  {
    slug: "google-calendar",
    name: "Google Calendar",
    category: "calendars",
    description: "Read / write calendar events. OAuth 2.0.",
    authType: "oauth2",
    baseUrl: "https://www.googleapis.com/calendar/v3",
    docUrl: "https://developers.google.com/calendar/api",
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/calendar.readonly",
      clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
      clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
      pkce: true,
    },
  },
  {
    slug: "microsoft-graph",
    name: "Microsoft Graph (Calendar / Mail)",
    category: "calendars",
    description: "Outlook calendar, mail, OneDrive — Microsoft 365 surface.",
    authType: "oauth2",
    baseUrl: "https://graph.microsoft.com/v1.0",
    docUrl: "https://learn.microsoft.com/graph/api/overview",
    oauth: {
      authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: "Calendars.Read offline_access",
      clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
      clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
      pkce: true,
    },
  },

  // ─── Communications ──────────────────────────────────────────────────────
  {
    slug: "sendgrid",
    name: "SendGrid",
    category: "comms",
    description: "Transactional email — send, templates, suppressions.",
    authType: "bearer",
    baseUrl: "https://api.sendgrid.com/v3",
    docUrl: "https://docs.sendgrid.com/api-reference",
  },
  {
    slug: "postmark",
    name: "Postmark",
    category: "comms",
    description: "Transactional email with strong deliverability.",
    authType: "api_key_header",
    baseUrl: "https://api.postmarkapp.com",
    docUrl: "https://postmarkapp.com/developer",
  },
  {
    slug: "mailgun",
    name: "Mailgun",
    category: "comms",
    description: "Transactional + bulk email API.",
    authType: "basic",
    baseUrl: "https://api.mailgun.net/v3",
    docUrl: "https://documentation.mailgun.com/",
  },
  {
    slug: "twilio",
    name: "Twilio",
    category: "comms",
    description: "SMS, voice, WhatsApp — programmable messaging.",
    authType: "basic",
    baseUrl: "https://api.twilio.com/2010-04-01",
    docUrl: "https://www.twilio.com/docs",
  },
  {
    slug: "slack",
    name: "Slack",
    category: "comms",
    description: "Post messages, manage channels, react to events.",
    authType: "bearer",
    baseUrl: "https://slack.com/api",
    docUrl: "https://api.slack.com/web",
  },
  {
    slug: "discord",
    name: "Discord",
    category: "comms",
    description: "Bots, channels, webhooks for the Discord platform.",
    authType: "bearer",
    baseUrl: "https://discord.com/api/v10",
    docUrl: "https://discord.com/developers/docs/intro",
  },
  {
    slug: "telegram",
    name: "Telegram Bot",
    category: "comms",
    description: "Telegram bot API for messaging, polls, inline queries.",
    authType: "api_key_query",
    baseUrl: "https://api.telegram.org",
    docUrl: "https://core.telegram.org/bots/api",
  },
  // ── Data rooms (PE / M&A diligence) ───────────────────────────────────────
  // These connectors stream CIM / data-room files into a diligence workspace.
  // We surface them in the hub so an admin can paste the auth credentials,
  // then the workspace UI lets the user pick which folder(s) to sync. The
  // ingest pipeline normalises each file via /api/workspaces/ingest and tags
  // the resulting source with origin="connector" + connectorSlug.
  {
    slug: "datasite",
    name: "Datasite (Merrill)",
    category: "data_room",
    description: "Sync CIMs, financials and management files from Datasite VDRs for PE / M&A diligence.",
    authType: "oauth2",
    baseUrl: "https://api.datasite.com",
    docUrl: "https://www.datasite.com/us/en/products/diligence.html",
    credentialNotes:
      "Datasite exposes its API only to enterprise customers under NDA. Generate an OAuth2 access token using your Datasite-issued client credentials and paste it below. The token is sent as a Bearer header on every list/download call. The sync picker requires the data-room id (the UUID in your Datasite URL).",
    credentialFields: [
      { key: "access_token", label: "Datasite access token", secret: true, help: "Bearer token issued by your Datasite OAuth2 token endpoint." },
      { key: "data_room_id", label: "Data-room id", placeholder: "e.g. 1234abcd-…", help: "UUID of the Datasite data room you want to mirror. Found in the Datasite app URL." },
    ],
  },
  {
    slug: "intralinks",
    name: "SS&C Intralinks",
    category: "data_room",
    description: "Pull deal-room contents from Intralinks VIA — folders, file versions, audit trails.",
    authType: "oauth2",
    baseUrl: "https://api.intralinks.com",
    docUrl: "https://developer.intralinks.com/",
    credentialNotes:
      "Intralinks IMO exposes a partner-only OAuth2 flow. Mint a bearer access token using your IMO client id + secret against the SS&C token endpoint and paste it here together with the workspace id of the deal room you want to sync.",
    credentialFields: [
      { key: "access_token", label: "Intralinks access token", secret: true, help: "OAuth2 bearer token from /services/oauth2/token." },
      { key: "workspace_id", label: "Deal-room workspace id", placeholder: "e.g. 4015551234", help: "Numeric Intralinks workspace id of the deal room you want to mirror." },
    ],
  },
  {
    slug: "securedocs",
    name: "SecureDocs",
    category: "data_room",
    description: "Mirror SecureDocs virtual data rooms into a diligence workspace with permissioned access.",
    authType: "api_key_header",
    baseUrl: "https://api.securedocs.com/v1",
    docUrl: "https://www.securedocs.com/api",
    credentialNotes:
      "SecureDocs issues an API key per administrator account. The key is sent as the `X-API-Key` header on every request. The sync picker needs the data-room id alongside the key.",
    credentialFields: [
      { key: "api_key", label: "SecureDocs API key", secret: true, help: "From the SecureDocs admin → API Keys panel." },
      { key: "data_room_id", label: "Data-room id", placeholder: "e.g. dr_abc123", help: "Identifier of the SecureDocs data room you want to mirror." },
    ],
    credentialDefaults: { header_name: "X-API-Key" },
  },
  {
    slug: "box",
    name: "Box",
    category: "data_room",
    description: "Connect a Box folder used as an ad-hoc data room. Syncs PDFs, decks and spreadsheets.",
    authType: "oauth2",
    baseUrl: "https://api.box.com/2.0",
    docUrl: "https://developer.box.com/reference/",
    oauth: {
      authorizeUrl: "https://account.box.com/api/oauth2/authorize",
      tokenUrl: "https://api.box.com/oauth2/token",
      // Box scopes are configured in the developer console for the app — the
      // request-time scope can be empty for the standard "View / download"
      // entitlement. We pass `root_readonly` for clarity in the consent screen.
      scopes: "root_readonly",
      clientIdEnv: "BOX_OAUTH_CLIENT_ID",
      clientSecretEnv: "BOX_OAUTH_CLIENT_SECRET",
    },
    credentialNotes:
      "After connecting via Box's OAuth flow the connector stores an access + refresh token pair. The sync picker uses the access token to walk the folder tree and download each file under the user's own permissions — no shared service account.",
  },
  {
    slug: "dropbox",
    name: "Dropbox Business",
    category: "data_room",
    description: "Sync a Dropbox Business folder as a diligence data room, with file-level audit trail.",
    authType: "oauth2",
    baseUrl: "https://api.dropboxapi.com/2",
    docUrl: "https://www.dropbox.com/developers/documentation/http/documentation",
    oauth: {
      authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      scopes: "files.metadata.read files.content.read account_info.read",
      clientIdEnv: "DROPBOX_OAUTH_CLIENT_ID",
      clientSecretEnv: "DROPBOX_OAUTH_CLIENT_SECRET",
      pkce: true,
    },
    credentialNotes:
      "Dropbox uses OAuth2 with PKCE. After connecting the connector stores an access + refresh token pair scoped to file metadata / content read. Each sync call uses the issuing user's own permissions.",
  },

  // ─── Alt Data & Scrapers ─────────────────────────────────────────────────
  // Single tile that fronts the Apify actor marketplace. Each operation is a
  // specific actor we publish as a Finsyt-blessed alt-data feed (Capitol
  // Trades, SEC EDGAR Filings Intelligence, Glassdoor reviews). The auth is
  // a per-user Apify API token validated against `users/me`. Actor calls go
  // through `run-sync-get-dataset-items` so the executor receives the
  // dataset rows inline; we cap the actor run at 20s via the `?timeout=`
  // query param so the call returns within the executor's 25s wall — longer
  // scrapes are out of scope here and tracked under the background-jobs
  // follow-up. Cache TTLs are documentation-only on POST ops (the executor
  // only caches GETs) but reflect intended freshness for downstream tiles.
  {
    slug: "apify-actors",
    name: "Apify Actors",
    category: "alt_data",
    description:
      "Run curated Apify actors as on-demand alt-data feeds — Capitol Trades disclosures, SEC EDGAR filings intelligence, Glassdoor company sentiment.",
    authType: "bearer",
    baseUrl: "https://api.apify.com",
    docUrl: "https://docs.apify.com/api/v2",
    isPremium: true,
    credentialNotes:
      "Paste an Apify API token from https://console.apify.com/account/integrations. The token is sent as Bearer auth and validated against /v2/users/me on connect. Each actor run is billed against your own Apify account.",
    credentialFields: [
      {
        key: "token",
        label: "Apify API token",
        secret: true,
        help: "Personal API token from console.apify.com → Settings → Integrations.",
      },
    ],
    validateOperation: "users_me",
    validateParams: {},
    validationMessages: {
      invalidCredentials: "Invalid Apify token",
      // Apify's /v2/users/me wraps the user payload under `data`, so the
      // username lives at `data.username` on a successful response.
      successIdentityPath: "data.username",
    },
    operationTemplates: [
      {
        name: "users_me",
        description:
          "Returns the authenticated Apify user's profile. Used as the credential check on connect.",
        method: "GET",
        path: "/v2/users/me",
        paramSchema: {},
        cacheTtlSeconds: 300,
        // Hidden from the agent / MCP tool registry — exists only so the
        // executor can run it as a credential probe on connect / Test.
        // Without this the connector would expose four tools instead of
        // the intended three actor operations.
        hidden: true,
      },
      {
        name: "capitol_trades",
        description:
          "Run the Capitol Trades scraper actor (saswave/capitol-trades-scraper). Returns recent U.S. Congress stock trades; supports ticker / politician filters.",
        method: "POST",
        path: "/v2/acts/saswave~capitol-trades-scraper/run-sync-get-dataset-items?timeout=20&memory=512&format=json",
        paramSchema: {
          ticker: {
            type: "string",
            description: "Optional ticker filter, e.g. 'NVDA'.",
          },
          politician: {
            type: "string",
            description: "Optional politician name filter, e.g. 'Nancy Pelosi'.",
          },
          limit: {
            type: "number",
            description: "Maximum number of disclosures to return (default 50).",
          },
        },
        cacheTtlSeconds: 900,
      },
      {
        name: "sec_filings_intelligence",
        description:
          "Run the SEC EDGAR Filings Intelligence actor (benthepythondev/sec-edgar-filings-intelligence). Returns parsed 10-K / 10-Q / 8-K / Form 4 highlights for a company.",
        method: "POST",
        path: "/v2/acts/benthepythondev~sec-edgar-filings-intelligence/run-sync-get-dataset-items?timeout=20&memory=1024&format=json",
        paramSchema: {
          ticker: {
            type: "string",
            description: "Issuer ticker, e.g. 'AAPL'. One of ticker / cik is required.",
          },
          cik: {
            type: "string",
            description: "Issuer CIK (zero-padded), e.g. '0000320193'.",
          },
          formType: {
            type: "string",
            description: "Filter by form type, e.g. '10-K', '10-Q', '8-K', '4'.",
          },
          limit: {
            type: "number",
            description: "Maximum number of filings to summarise (default 10).",
          },
        },
        cacheTtlSeconds: 3600,
      },
      {
        name: "glassdoor_company",
        description:
          "Run the Glassdoor company scraper actor (bitty-studio/glassdoor-reviews). Returns headline rating, recent reviews and pros/cons sentiment for a company.",
        method: "POST",
        path: "/v2/acts/bitty-studio~glassdoor-reviews/run-sync-get-dataset-items?timeout=20&memory=512&format=json",
        paramSchema: {
          companyName: {
            type: "string",
            required: true,
            description: "Company display name as it appears on Glassdoor, e.g. 'Apple'.",
          },
          country: {
            type: "string",
            description: "ISO country code or country name to scope reviews, e.g. 'us'.",
          },
          maxReviews: {
            type: "number",
            description: "Maximum number of reviews to return (default 30, hard cap 200).",
          },
        },
        cacheTtlSeconds: 3600,
      },
    ],
  },
];

export function findCatalogEntry(slug: string): CatalogEntry | null {
  return CATALOG.find((c) => c.slug === slug) || null;
}

export function catalogByCategory(): Record<CatalogCategory, CatalogEntry[]> {
  const out = {} as Record<CatalogCategory, CatalogEntry[]>;
  for (const c of CATALOG) {
    (out[c.category] = out[c.category] || []).push(c);
  }
  return out;
}
