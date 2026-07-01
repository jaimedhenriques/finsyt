/**
 * Field Auto-Mapper Engine
 * ─────────────────────────
 * Given a set of source field names (from schema introspection) and a target
 * domain, this module auto-maps source fields to canonical datapoints by
 * name similarity and type compatibility.
 *
 * Algorithm:
 *   1. Exact match (case-insensitive, normalised).
 *   2. Common alias lookup (e.g. "net_income" → "netIncome").
 *   3. Fuzzy substring match (canonical key is a substring of source field, or vice versa).
 *   4. Levenshtein distance ≤ 2 for short tokens.
 *
 * The result is a field map `{ sourceField → canonicalKey }` plus a
 * coverage report. The data team can review and override this in the UI.
 */

import type { RoutingDomain } from "./routing-policy";
import { CANONICAL_DATAPOINTS, computeCoverage } from "./canonical-datapoints";

export interface SourceField {
  name: string;
  /** Optional type hint from the schema (e.g. "float", "varchar", "bigint"). */
  rawType?: string;
}

export interface AutoMapResult {
  /** Source field name → canonical datapoint key. */
  fieldMap: Record<string, string>;
  coverage: { covered: string[]; uncovered: string[]; pct: number };
  /** How confident the mapper is (0–1, based on match quality). */
  confidence: number;
}

// ── Alias tables ─────────────────────────────────────────────────────────────
// Covers common FMP/CapIQ/Bloomberg/FactSet field naming conventions.

const FIELD_ALIASES: Record<string, string> = {
  // quotes
  last_price: "price", last_sale: "price", close: "price", last: "price",
  pct_change: "changePercent", price_change_pct: "changePercent", ret_1d: "changePercent",
  daily_volume: "volume", vol: "volume",
  market_capitalization: "marketCap", mktcap: "marketCap", mkt_cap: "marketCap",
  price_earnings: "pe", pe_ratio: "pe", trailing_pe: "pe",
  earnings_per_share: "eps", basic_eps: "epsBasic",
  "52_week_high": "high52w", week_52_high: "high52w", fiftytwo_week_high: "high52w",
  "52_week_low": "low52w",  week_52_low: "low52w",  fiftytwo_week_low: "low52w",
  shares_outstanding: "sharesOutstanding", shares_os: "sharesOutstanding",
  dividend_yield_pct: "dividendYield", div_yield: "dividendYield",

  // fundamentals
  total_revenue: "revenue", net_revenue: "revenue", revenues: "revenue",
  gross_income: "grossProfit", gross_profit_loss: "grossProfit",
  gross_profit_margin: "grossMargin", gpm: "grossMargin",
  operating_profit: "operatingIncome", ebit: "operatingIncome",
  operating_profit_margin: "operatingMargin",
  net_profit: "netIncome", net_earnings: "netIncome", bottom_line: "netIncome",
  net_profit_margin: "netMargin",
  diluted_eps: "eps", eps_diluted: "eps",
  fcf: "freeCashFlow", free_cash_flow: "freeCashFlow",
  cfo: "operatingCashFlow", cash_from_operations: "operatingCashFlow",
  capital_expenditures: "capex", capex_total: "capex",
  total_assets_value: "totalAssets",
  total_liabilities_and_equity: "totalEquity", shareholders_equity: "totalEquity",
  long_term_debt: "totalDebt", net_debt_value: "netDebt",
  cash_equivalents: "cash", cash_and_cash_equivalents: "cash",
  current_ratio_value: "currentRatio", debt_equity_ratio: "debtToEquity",
  roe: "returnOnEquity", roa: "returnOnAssets",
  research_development: "researchExpenses", rd_expense: "researchExpenses",
  selling_general_admin: "sgaExpenses", sga: "sgaExpenses",
  weighted_average_shares: "weightedSharesDiluted",

  // estimates
  eps_estimate: "epsMean", consensus_eps: "epsMean", mean_eps: "epsMean",
  eps_estimate_low: "epsLow", eps_estimate_high: "epsHigh",
  revenue_estimate: "revenueMean", consensus_revenue: "revenueMean",
  number_of_analysts: "numAnalysts", analyst_count: "numAnalysts",
  consensus_rating: "rating", analyst_rating: "rating",
  average_price_target: "priceTarget", mean_price_target: "priceTarget",
  eps_surprise_pct: "epsSurprise",

  // news
  headline: "title", article_title: "title",
  article_summary: "summary", snippet: "summary", body: "summary",
  article_url: "url", link: "url",
  published_date: "publishedAt", publication_date: "publishedAt", pub_date: "publishedAt",
  sentiment_label: "sentiment",
  image: "imageUrl", thumbnail: "imageUrl",

  // filings
  form_type: "type", filing_type: "type",
  filed_date: "filedAt", filing_date: "filedAt",
  period_of_report: "periodEnd",
  filing_url: "url", document_url: "url",

  // ownership
  holder: "holderName", institution_name: "holderName",
  shares_held: "shares", position_size: "shares",
  market_value: "value", position_value: "value",
  pct_of_portfolio: "portfolioPct",
  change_in_shares: "changeShares",
  report_date: "reportDate", filing_date_ownership: "reportDate",

  // deals
  target_company: "targetName", target: "targetName",
  acquirer: "acquirerName", buyer: "acquirerName",
  deal_value: "value", transaction_value: "value", enterprise_value_deal: "value",
  announced: "announcedDate", announcement_date: "announcedDate",
  close_date: "closedDate", completion_date: "closedDate",
  deal_status: "status",
  transaction_type: "dealType", deal_type: "dealType",
  acquisition_premium: "premium",

  // macro
  series_id: "seriesId", indicator_id: "seriesId",
  series_name: "seriesName", indicator_name: "seriesName",
  observation_date: "date", data_date: "date",
  observation_value: "value", data_value: "value",
  frequency_code: "frequency",
};

// ── Normalise a field name to a canonical lowercase form ─────────────────────
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ── Levenshtein distance (simple DP, short strings only) ─────────────────────
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length > 20 || b.length > 20) return 999;
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// ── Try to match one source field to a canonical key ─────────────────────────
function tryMatch(
  sourceNorm: string,
  canonicalKeys: string[],
): { key: string; score: number } | null {
  // 1. Alias table exact match.
  const alias = FIELD_ALIASES[sourceNorm];
  if (alias && canonicalKeys.includes(alias)) {
    return { key: alias, score: 1.0 };
  }

  // 2. Exact match after normalisation.
  for (const ck of canonicalKeys) {
    if (normalise(ck) === sourceNorm) return { key: ck, score: 1.0 };
  }

  // 3. Substring match (at least 4 chars).
  let bestSub: { key: string; score: number } | null = null;
  if (sourceNorm.length >= 4) {
    for (const ck of canonicalKeys) {
      const cn = normalise(ck);
      if (cn.includes(sourceNorm) || sourceNorm.includes(cn)) {
        const shorter = Math.min(sourceNorm.length, cn.length);
        const longer = Math.max(sourceNorm.length, cn.length);
        const score = 0.85 * (shorter / longer);
        if (!bestSub || score > bestSub.score) bestSub = { key: ck, score };
      }
    }
  }
  if (bestSub && bestSub.score >= 0.6) return bestSub;

  // 4. Levenshtein ≤ 2 (only for short tokens).
  if (sourceNorm.length <= 15) {
    let bestLev: { key: string; score: number; dist: number } | null = null;
    for (const ck of canonicalKeys) {
      const cn = normalise(ck);
      const d = levenshtein(sourceNorm, cn);
      if (d <= 2) {
        const score = 0.7 * (1 - d / Math.max(sourceNorm.length, cn.length));
        if (!bestLev || score > bestLev.score) bestLev = { key: ck, score, dist: d };
      }
    }
    if (bestLev) return { key: bestLev.key, score: bestLev.score };
  }

  return null;
}

/**
 * Auto-map a list of source field names to canonical datapoints for a domain.
 * Returns the field map + coverage report.
 */
export function autoMap(
  domain: RoutingDomain,
  sourceFields: SourceField[],
): AutoMapResult {
  const datapoints = CANONICAL_DATAPOINTS[domain] ?? [];
  const canonicalKeys = datapoints.map((d) => d.key);
  const fieldMap: Record<string, string> = {};
  const usedCanonical = new Set<string>();
  let totalScore = 0;
  let matched = 0;

  for (const sf of sourceFields) {
    const norm = normalise(sf.name);
    // Only try against keys not yet claimed by a higher-quality match.
    const available = canonicalKeys.filter((k) => !usedCanonical.has(k));
    const match = tryMatch(norm, available);
    if (match) {
      fieldMap[sf.name] = match.key;
      usedCanonical.add(match.key);
      totalScore += match.score;
      matched++;
    }
  }

  const coverage = computeCoverage(domain, fieldMap);
  const confidence = matched > 0 ? totalScore / matched : 0;

  return { fieldMap, coverage, confidence };
}

/**
 * Apply a field map to a raw row of source data, emitting only canonical keys.
 * Source keys not in the map are dropped. Canonical keys not covered by the
 * map are absent from the output (never backfilled).
 */
export function applyFieldMap(
  raw: Record<string, unknown>,
  fieldMap: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [sourceKey, canonicalKey] of Object.entries(fieldMap)) {
    if (sourceKey in raw) {
      out[canonicalKey] = raw[sourceKey];
    }
  }
  return out;
}

/**
 * Apply a field map to an array of raw rows.
 */
export function applyFieldMapToRows(
  rows: Record<string, unknown>[],
  fieldMap: Record<string, string>,
): Record<string, unknown>[] {
  return rows.map((row) => applyFieldMap(row, fieldMap));
}

/**
 * Introspect source fields from a sample response.
 * Accepts an array of rows or a single object and returns the union of all
 * top-level keys (non-nested) as SourceField list.
 */
export function introspectFromSample(data: unknown): SourceField[] {
  const rows: Record<string, unknown>[] = [];
  if (Array.isArray(data)) {
    rows.push(...(data.slice(0, 5) as Record<string, unknown>[]));
  } else if (data && typeof data === "object") {
    // Some providers wrap arrays in a key ("data", "results", "items", etc.).
    const obj = data as Record<string, unknown>;
    const arrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (arrayKey && Array.isArray(obj[arrayKey])) {
      rows.push(...((obj[arrayKey] as Record<string, unknown>[]).slice(0, 5)));
    } else {
      rows.push(obj);
    }
  }
  const keySet = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === "object") {
      for (const k of Object.keys(row)) {
        if (typeof (row as Record<string,unknown>)[k] !== "object") keySet.add(k);
      }
    }
  }
  return Array.from(keySet).map((name) => ({ name }));
}
