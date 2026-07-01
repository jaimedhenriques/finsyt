/**
 * Routing Policy — shared types and constants for vendor-neutral best-source routing.
 *
 * Imported by the router, API routes, and the admin UI (client & server).
 */

// ── Data domains ─────────────────────────────────────────────────────────────
// Each domain corresponds to a category of financial data. The router picks
// one per-domain source-priority list from `routing_policies` to decide which
// connection or built-in provider to try first.

export const ROUTING_DOMAINS = [
  "quotes",
  "fundamentals",
  "news",
  "filings",
  "estimates",
  "transcripts",
  "macro",
  "ownership",
  "deals",
] as const;

export type RoutingDomain = (typeof ROUTING_DOMAINS)[number];

export const DOMAIN_LABELS: Record<RoutingDomain, string> = {
  quotes:       "Quotes & Prices",
  fundamentals: "Fundamentals",
  news:         "News",
  filings:      "Filings & Regulatory",
  estimates:    "Estimates",
  transcripts:  "Earnings Transcripts",
  macro:        "Macro & Economic",
  ownership:    "Ownership & Insiders",
  deals:        "M&A Deals",
};

export const DOMAIN_DESCRIPTIONS: Record<RoutingDomain, string> = {
  quotes:       "Real-time and end-of-day price quotes, OHLCV, market cap.",
  fundamentals: "Income statement, balance sheet, cash flow, ratios.",
  news:         "Company and sector news headlines and full articles.",
  filings:      "SEC filings (10-K, 10-Q, 8-K, DEF 14A, Form 4).",
  estimates:    "Sell-side consensus EPS, revenue, and other estimates.",
  transcripts:  "Earnings call transcripts and investor day recordings.",
  macro:        "GDP, CPI, rates, unemployment and other economic series.",
  ownership:    "Institutional holders, insider transactions, 13F / Form 4.",
  deals:        "M&A transactions, LBOs, private-placement rounds.",
};

// ── Built-in provider slugs per domain ────────────────────────────────────────
// These are the built-in (first-party) providers that Finsyt already wires
// via `data-providers.ts`. They appear as default fallback sources in the
// routing UI.

export const BUILTIN_SOURCES_BY_DOMAIN: Record<RoutingDomain, PolicySource[]> = {
  quotes: [
    { type: "builtin", id: "fmp",        label: "Financial Modeling Prep",  catalogSlug: "finsyt-fmp" },
    { type: "builtin", id: "eodhd",      label: "EODHD",                    catalogSlug: "finsyt-eodhd" },
    { type: "builtin", id: "finnhub",    label: "Finnhub",                  catalogSlug: "finsyt-finnhub" },
    { type: "builtin", id: "massive",    label: "Polygon.io",               catalogSlug: "finsyt-massive" },
    { type: "builtin", id: "yahoo",      label: "Yahoo Finance" },
  ],
  fundamentals: [
    { type: "builtin", id: "fmp",        label: "Financial Modeling Prep",  catalogSlug: "finsyt-fmp" },
    { type: "builtin", id: "eodhd",      label: "EODHD",                    catalogSlug: "finsyt-eodhd" },
    { type: "builtin", id: "finnhub",    label: "Finnhub",                  catalogSlug: "finsyt-finnhub" },
  ],
  news: [
    { type: "builtin", id: "fmp",        label: "Financial Modeling Prep",  catalogSlug: "finsyt-fmp" },
    { type: "builtin", id: "finnhub",    label: "Finnhub",                  catalogSlug: "finsyt-finnhub" },
    { type: "builtin", id: "eodhd",      label: "EODHD",                    catalogSlug: "finsyt-eodhd" },
  ],
  filings: [
    { type: "builtin", id: "sec",        label: "SEC EDGAR" },
    { type: "builtin", id: "fmp",        label: "Financial Modeling Prep",  catalogSlug: "finsyt-fmp" },
  ],
  estimates: [
    { type: "builtin", id: "fmp",        label: "Financial Modeling Prep",  catalogSlug: "finsyt-fmp" },
    { type: "builtin", id: "finnhub",    label: "Finnhub",                  catalogSlug: "finsyt-finnhub" },
  ],
  transcripts: [
    { type: "builtin", id: "fmp",        label: "Financial Modeling Prep",  catalogSlug: "finsyt-fmp" },
    { type: "builtin", id: "eodhd",      label: "EODHD",                    catalogSlug: "finsyt-eodhd" },
  ],
  macro: [
    { type: "builtin", id: "fred",       label: "FRED (St. Louis Fed)",     catalogSlug: "finsyt-fred" },
    { type: "builtin", id: "worldbank",  label: "World Bank Open Data" },
  ],
  ownership: [
    { type: "builtin", id: "fmp",        label: "Financial Modeling Prep",  catalogSlug: "finsyt-fmp" },
    { type: "builtin", id: "finnhub",    label: "Finnhub",                  catalogSlug: "finsyt-finnhub" },
  ],
  deals: [
    { type: "builtin", id: "fmp",        label: "Financial Modeling Prep",  catalogSlug: "finsyt-fmp" },
  ],
};

// ── PolicySource ─────────────────────────────────────────────────────────────
// One entry in the ordered source list for a routing policy.

export interface PolicySource {
  /** "connection" = a tenant-connected external API; "builtin" = Finsyt built-in. */
  type: "connection" | "builtin";
  /**
   * For connections: the connection UUID.
   * For builtins: the provider slug used in `PROVIDER_META` (e.g. 'fmp').
   */
  id: string;
  /** Human-readable label shown in the admin UI and attribution. */
  label: string;
  /**
   * For connection sources: the catalog slug of the connector definition
   * (e.g. 'factset', 'spglobal-capiq'). Matches `connectorDefinitions.slug`.
   */
  catalogSlug?: string;
  /**
   * Which operation on the connection to invoke for this domain.
   * Required for connection sources; ignored for builtins.
   * Examples: "prices" (FactSet quotes), "financials_snapshot" (CapIQ).
   */
  operationName?: string;
  /**
   * When true the source is kept in the list (preserving its position) but
   * skipped by the router without affecting the order of other sources.
   * Useful for temporarily suspending a source without losing the policy.
   */
  disabled?: boolean;
}

// ── Well-known domain→operation mappings ─────────────────────────────────────
// When a user adds a premium connection to a domain policy without choosing
// an operation, the router uses these defaults to make the suggestion obvious.

export const DEFAULT_OPERATION_BY_DOMAIN: Partial<Record<
  RoutingDomain,
  Partial<Record<string, string>>  // catalogSlug → operationName
>> = {
  quotes: {
    factset:       "prices",
    "spglobal-capiq": "reference_quote",
    "refinitiv-lseg": "pricing_snapshot",
    pitchbook:     "company_search",
  },
  fundamentals: {
    factset:       "estimates_consensus",
    "spglobal-capiq": "financials_snapshot",
  },
  news: {
    "refinitiv-lseg": "news_headlines",
  },
  deals: {
    "spglobal-capiq": "transactions_search",
    pitchbook:     "deal_search",
  },
  ownership: {
    pitchbook:     "company_detail",
  },
};

/**
 * Suggest an `operationName` for a connection source being added to a domain,
 * based on the catalog slug and the domain. Falls back to undefined.
 */
export function suggestOperation(
  catalogSlug: string | undefined,
  domain: RoutingDomain,
): string | undefined {
  if (!catalogSlug) return undefined;
  return DEFAULT_OPERATION_BY_DOMAIN[domain]?.[catalogSlug];
}

// ── Priority quality scoring ──────────────────────────────────────────────────
// Used by the router to sort a raw candidate list when no explicit policy row
// exists yet. Connections are preferred over builtins when they're premium
// (the tenant paid for higher quality data).

export function defaultSourceQuality(source: PolicySource): number {
  if (source.type === "connection") {
    // Premium BYO-license connections get highest default priority.
    const premiumSlugs = ["factset", "spglobal-capiq", "refinitiv-lseg", "bloomberg-dl", "pitchbook"];
    if (source.catalogSlug && premiumSlugs.includes(source.catalogSlug)) return 100;
    return 80;
  }
  // Builtin priorities from data-providers.ts waterfall order.
  const builtinRank: Record<string, number> = {
    fmp: 60, eodhd: 55, finnhub: 50, massive: 45, fred: 60,
    sec: 70, worldbank: 55, yahoo: 30,
  };
  return builtinRank[source.id] ?? 40;
}
