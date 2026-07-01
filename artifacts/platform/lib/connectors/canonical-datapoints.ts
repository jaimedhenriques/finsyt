/**
 * Canonical Datapoint Registry
 * ─────────────────────────────
 * The authoritative schema spine for the Bring-Your-Own-Source engine.
 * Every domain surface (company page, screener, estimates, etc.) reads
 * canonical field keys; each source adapter must map its raw fields to
 * these before the data reaches the renderer.
 *
 * Datapoint metadata includes:
 *   - key:     stable camelCase identifier (never changes)
 *   - label:   UI display name
 *   - type:    "number" | "string" | "date" | "percent" | "boolean"
 *   - unit:    optional unit hint (currency, %, shares, etc.)
 *   - required: if true, the source must provide this field to be considered
 *              usable for the domain
 */

import type { RoutingDomain } from "./routing-policy";

export type DatapointType = "number" | "string" | "date" | "percent" | "boolean";

export interface CanonicalDatapoint {
  key: string;
  label: string;
  type: DatapointType;
  unit?: string;
  required?: boolean;
  /** Brief description of what this field represents. */
  description?: string;
}

/** Registry: domain → ordered list of canonical datapoints. */
export const CANONICAL_DATAPOINTS: Record<RoutingDomain, CanonicalDatapoint[]> = {
  quotes: [
    { key: "symbol",        label: "Symbol",              type: "string",  required: true  },
    { key: "price",         label: "Price",               type: "number",  unit: "USD",    required: true  },
    { key: "change",        label: "Change ($)",          type: "number",  unit: "USD"     },
    { key: "changePercent", label: "Change (%)",          type: "percent"                  },
    { key: "volume",        label: "Volume",              type: "number",  unit: "shares"  },
    { key: "avgVolume",     label: "Avg Volume",          type: "number",  unit: "shares"  },
    { key: "marketCap",     label: "Market Cap",          type: "number",  unit: "USD"     },
    { key: "pe",            label: "P/E Ratio",           type: "number"                   },
    { key: "eps",           label: "EPS",                 type: "number",  unit: "USD"     },
    { key: "high",          label: "Day High",            type: "number",  unit: "USD"     },
    { key: "low",           label: "Day Low",             type: "number",  unit: "USD"     },
    { key: "open",          label: "Open",                type: "number",  unit: "USD"     },
    { key: "previousClose", label: "Previous Close",      type: "number",  unit: "USD"     },
    { key: "high52w",       label: "52-Week High",        type: "number",  unit: "USD"     },
    { key: "low52w",        label: "52-Week Low",         type: "number",  unit: "USD"     },
    { key: "beta",          label: "Beta",                type: "number"                   },
    { key: "dividendYield", label: "Dividend Yield",      type: "percent"                  },
    { key: "sharesOutstanding", label: "Shares Outstanding", type: "number", unit: "shares" },
    { key: "timestamp",     label: "Quote Timestamp",     type: "date"                     },
  ],

  fundamentals: [
    { key: "period",            label: "Period",                 type: "string",  required: true  },
    { key: "reportedDate",      label: "Report Date",            type: "date"                     },
    { key: "revenue",           label: "Revenue",                type: "number",  unit: "USD",    required: true  },
    { key: "grossProfit",       label: "Gross Profit",           type: "number",  unit: "USD"     },
    { key: "grossMargin",       label: "Gross Margin",           type: "percent"                  },
    { key: "ebitda",            label: "EBITDA",                 type: "number",  unit: "USD"     },
    { key: "ebitdaMargin",      label: "EBITDA Margin",          type: "percent"                  },
    { key: "operatingIncome",   label: "Operating Income",       type: "number",  unit: "USD"     },
    { key: "operatingMargin",   label: "Operating Margin",       type: "percent"                  },
    { key: "netIncome",         label: "Net Income",             type: "number",  unit: "USD"     },
    { key: "netMargin",         label: "Net Margin",             type: "percent"                  },
    { key: "eps",               label: "EPS (Diluted)",          type: "number",  unit: "USD"     },
    { key: "epsBasic",          label: "EPS (Basic)",            type: "number",  unit: "USD"     },
    { key: "freeCashFlow",      label: "Free Cash Flow",         type: "number",  unit: "USD"     },
    { key: "operatingCashFlow", label: "Operating Cash Flow",    type: "number",  unit: "USD"     },
    { key: "capex",             label: "Capital Expenditure",    type: "number",  unit: "USD"     },
    { key: "totalAssets",       label: "Total Assets",           type: "number",  unit: "USD"     },
    { key: "totalDebt",         label: "Total Debt",             type: "number",  unit: "USD"     },
    { key: "netDebt",           label: "Net Debt",               type: "number",  unit: "USD"     },
    { key: "totalEquity",       label: "Total Equity",           type: "number",  unit: "USD"     },
    { key: "cash",              label: "Cash & Equivalents",     type: "number",  unit: "USD"     },
    { key: "currentRatio",      label: "Current Ratio",          type: "number"                   },
    { key: "debtToEquity",      label: "Debt / Equity",          type: "number"                   },
    { key: "returnOnEquity",    label: "ROE",                    type: "percent"                  },
    { key: "returnOnAssets",    label: "ROA",                    type: "percent"                  },
    { key: "researchExpenses",  label: "R&D Expenses",           type: "number",  unit: "USD"     },
    { key: "sgaExpenses",       label: "SG&A Expenses",          type: "number",  unit: "USD"     },
    { key: "weightedSharesDiluted", label: "Diluted Shares",     type: "number",  unit: "shares"  },
  ],

  estimates: [
    { key: "period",        label: "Period",              type: "string",  required: true  },
    { key: "periodType",    label: "Period Type",         type: "string"                   },
    { key: "epsMean",       label: "EPS Estimate (Mean)", type: "number",  unit: "USD",    required: true  },
    { key: "epsLow",        label: "EPS Estimate (Low)",  type: "number",  unit: "USD"     },
    { key: "epsHigh",       label: "EPS Estimate (High)", type: "number",  unit: "USD"     },
    { key: "revenueMean",   label: "Revenue Estimate (Mean)", type: "number", unit: "USD"  },
    { key: "revenueLow",    label: "Revenue Estimate (Low)",  type: "number", unit: "USD"  },
    { key: "revenueHigh",   label: "Revenue Estimate (High)", type: "number", unit: "USD"  },
    { key: "ebitdaMean",    label: "EBITDA Estimate (Mean)",  type: "number", unit: "USD"  },
    { key: "numAnalysts",   label: "# Analysts",          type: "number"                   },
    { key: "rating",        label: "Consensus Rating",    type: "string"                   },
    { key: "priceTarget",   label: "Price Target (Mean)", type: "number",  unit: "USD"     },
    { key: "priceTargetHigh", label: "Price Target (High)", type: "number", unit: "USD"   },
    { key: "priceTargetLow",  label: "Price Target (Low)",  type: "number", unit: "USD"   },
    { key: "epsActual",     label: "EPS Actual",          type: "number",  unit: "USD"     },
    { key: "epsSurprise",   label: "EPS Surprise (%)",    type: "percent"                  },
    { key: "revenueActual", label: "Revenue Actual",      type: "number",  unit: "USD"     },
    { key: "revenueSurprise", label: "Revenue Surprise (%)", type: "percent"               },
  ],

  news: [
    { key: "id",          label: "Article ID",     type: "string",  required: true  },
    { key: "title",       label: "Headline",       type: "string",  required: true  },
    { key: "summary",     label: "Summary",        type: "string"                   },
    { key: "url",         label: "URL",            type: "string"                   },
    { key: "source",      label: "Source",         type: "string"                   },
    { key: "publishedAt", label: "Published At",   type: "date",    required: true  },
    { key: "sentiment",   label: "Sentiment",      type: "string"                   },
    { key: "sentimentScore", label: "Sentiment Score", type: "number"               },
    { key: "imageUrl",    label: "Image URL",      type: "string"                   },
    { key: "tickers",     label: "Related Tickers", type: "string"                  },
  ],

  filings: [
    { key: "accessionNumber", label: "Accession Number", type: "string", required: true },
    { key: "type",       label: "Form Type",      type: "string",  required: true  },
    { key: "filedAt",    label: "Filed At",       type: "date",    required: true  },
    { key: "periodEnd",  label: "Period End",     type: "date"                     },
    { key: "url",        label: "Filing URL",     type: "string"                   },
    { key: "description", label: "Description",  type: "string"                   },
    { key: "cik",        label: "CIK",            type: "string"                   },
    { key: "companyName", label: "Company Name",  type: "string"                   },
  ],

  transcripts: [
    { key: "date",       label: "Call Date",      type: "date",    required: true  },
    { key: "quarter",    label: "Quarter",         type: "string"                   },
    { key: "year",       label: "Year",            type: "number"                   },
    { key: "content",    label: "Full Text",       type: "string",  required: true  },
    { key: "speaker",    label: "Speaker",         type: "string"                   },
    { key: "segment",    label: "Segment Type",    type: "string"                   },
    { key: "url",        label: "Source URL",      type: "string"                   },
  ],

  macro: [
    { key: "seriesId",   label: "Series ID",      type: "string",  required: true  },
    { key: "seriesName", label: "Series Name",    type: "string"                   },
    { key: "date",       label: "Date",            type: "date",    required: true  },
    { key: "value",      label: "Value",           type: "number",  required: true  },
    { key: "unit",       label: "Unit",            type: "string"                   },
    { key: "frequency",  label: "Frequency",       type: "string"                   },
    { key: "source",     label: "Source",          type: "string"                   },
    { key: "notes",      label: "Notes",           type: "string"                   },
  ],

  ownership: [
    { key: "holderName",    label: "Holder Name",    type: "string",  required: true  },
    { key: "holderCik",     label: "Holder CIK",     type: "string"                   },
    { key: "shares",        label: "Shares Held",    type: "number",  unit: "shares", required: true },
    { key: "value",         label: "Market Value",   type: "number",  unit: "USD"     },
    { key: "portfolioPct",  label: "% of Portfolio", type: "percent"                  },
    { key: "changeShares",  label: "Change (Shares)", type: "number", unit: "shares"  },
    { key: "changePct",     label: "Change (%)",     type: "percent"                  },
    { key: "reportDate",    label: "Report Date",    type: "date"                     },
    { key: "holderType",    label: "Holder Type",    type: "string"                   },
  ],

  deals: [
    { key: "dealId",       label: "Deal ID",        type: "string",  required: true  },
    { key: "targetName",   label: "Target Company", type: "string",  required: true  },
    { key: "acquirerName", label: "Acquirer",       type: "string"                   },
    { key: "value",        label: "Deal Value",     type: "number",  unit: "USD"     },
    { key: "announcedDate", label: "Announced",     type: "date",    required: true  },
    { key: "closedDate",   label: "Closed",         type: "date"                     },
    { key: "status",       label: "Status",         type: "string"                   },
    { key: "dealType",     label: "Deal Type",      type: "string"                   },
    { key: "premium",      label: "Premium (%)",    type: "percent"                  },
    { key: "currency",     label: "Currency",       type: "string"                   },
    { key: "advisors",     label: "Advisors",       type: "string"                   },
  ],
};

/**
 * Return all canonical datapoints for a domain as a flat key set.
 */
export function datapointKeys(domain: RoutingDomain): string[] {
  return (CANONICAL_DATAPOINTS[domain] ?? []).map((d) => d.key);
}

/**
 * Return only the required canonical datapoints for a domain.
 */
export function requiredDatapointKeys(domain: RoutingDomain): string[] {
  return (CANONICAL_DATAPOINTS[domain] ?? [])
    .filter((d) => d.required)
    .map((d) => d.key);
}

/**
 * Look up a single canonical datapoint by key within a domain.
 */
export function findDatapoint(domain: RoutingDomain, key: string): CanonicalDatapoint | undefined {
  return (CANONICAL_DATAPOINTS[domain] ?? []).find((d) => d.key === key);
}

/**
 * Coverage summary: which canonical fields does a given field-map cover?
 * Returns both covered and uncovered canonical keys.
 */
export function computeCoverage(
  domain: RoutingDomain,
  fieldMap: Record<string, string>,
): { covered: string[]; uncovered: string[]; pct: number } {
  const all = datapointKeys(domain);
  const mappedCanonical = new Set(Object.values(fieldMap));
  const covered = all.filter((k) => mappedCanonical.has(k));
  const uncovered = all.filter((k) => !mappedCanonical.has(k));
  const pct = all.length > 0 ? Math.round((covered.length / all.length) * 100) : 0;
  return { covered, uncovered, pct };
}
