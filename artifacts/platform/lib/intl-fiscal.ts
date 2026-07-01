/**
 * intl-fiscal.ts
 * ──────────────
 * International filing & fiscal-calendar normalization utilities.
 *
 * Goals:
 *  - Correctly label fiscal periods (Q1–Q4, FY) for non-calendar fiscal years.
 *  - Format monetary amounts with the correct currency symbol / code.
 *  - Provide a static coverage database for a seed basket of European and
 *    Japanese companies so the UI can show a coverage-quality indicator.
 *  - Expose a `coverageLevel()` helper the API and UI can call without an
 *    additional provider round-trip.
 */

// ─── Fiscal period label ─────────────────────────────────────────────────────

/**
 * Given the ISO date a financial period ends and the fiscal-year-end month
 * (1 = January … 12 = December), return the correct quarter label relative
 * to the company's own fiscal calendar.
 *
 * Examples:
 *   Toyota (FY ends March = month 3):
 *     Period ending 2024-06-30 → Q1 FY2025  (Apr–Jun is their first quarter)
 *     Period ending 2024-09-30 → Q2 FY2025
 *     Period ending 2024-12-31 → Q3 FY2025
 *     Period ending 2025-03-31 → Q4 FY2025 (full year)
 *
 *   SAP (FY ends December = month 12, same as calendar):
 *     Period ending 2024-03-31 → Q1 FY2024
 *     Period ending 2024-06-30 → Q2 FY2024
 *
 * @param periodEndDate  ISO date string of the period end (YYYY-MM-DD)
 * @param fyEndMonth     Month (1–12) in which the fiscal year ends
 * @returns              Label like "Q1", "Q2", "Q3", "Q4" (annual = caller's choice)
 */
export function fiscalQuarterLabel(periodEndDate: string, fyEndMonth: number): string {
  const d = new Date(periodEndDate)
  if (isNaN(d.getTime())) return 'Q?'
  const periodMonth = d.getUTCMonth() + 1 // 1–12

  // Number of months from FY start to the period end (0–11).
  // FY starts the month after fyEndMonth wraps around.
  // Example: fyEndMonth=3 → FY starts April (month 4).
  // periodMonth=6 (June): offset = (6 - 4 + 12) % 12 = 2 → months 0,1,2 = Q1.
  const fyStartMonth = (fyEndMonth % 12) + 1
  const offset = (periodMonth - fyStartMonth + 12) % 12

  if (offset <= 2)  return 'Q1'
  if (offset <= 5)  return 'Q2'
  if (offset <= 8)  return 'Q3'
  return 'Q4'
}

/**
 * Return the fiscal year that a period end date falls into, given the
 * fiscal-year-end month.
 *
 * Example: Toyota FY ends March. A period ending 2024-06-30 belongs to FY2025
 * because the fiscal year runs April 2024 → March 2025.
 */
export function fiscalYear(periodEndDate: string, fyEndMonth: number): number {
  const d = new Date(periodEndDate)
  if (isNaN(d.getTime())) return new Date().getUTCFullYear()
  const periodMonth = d.getUTCMonth() + 1
  const calYear     = d.getUTCFullYear()
  // If the period ends AFTER the FY end month, the FY year is calYear + 1.
  // e.g. FY end = March (3), period ending June (6): 6 > 3 → FY year = calYear + 1
  return periodMonth > fyEndMonth ? calYear + 1 : calYear
}

/**
 * Produce a combined label like "Q2 FY2025" or "FY2024".
 */
export function fiscalPeriodLabel(
  periodEndDate: string,
  fyEndMonth: number,
  annual = false,
): string {
  const fy = fiscalYear(periodEndDate, fyEndMonth)
  if (annual) return `FY${fy}`
  const q  = fiscalQuarterLabel(periodEndDate, fyEndMonth)
  return `${q} FY${fy}`
}

// ─── Currency formatting ─────────────────────────────────────────────────────

/** ISO-4217 currency codes that have well-known symbols. Others fall back to
 *  the three-letter code as a prefix. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CHF: 'Fr',
  AUD: 'A$',
  CAD: 'C$',
  CNY: '¥',
  HKD: 'HK$',
  KRW: '₩',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  SGD: 'S$',
  INR: '₹',
  BRL: 'R$',
  MXN: 'MX$',
  TWD: 'NT$',
}

/** Return a short currency prefix for a given ISO currency code. */
export function currencySymbol(currency: string): string {
  if (!currency) return '$'
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase() + ' '
}

/** Format a large monetary value with the correct currency prefix/suffix and
 *  scale abbreviation (T / B / M). */
export function fmtCurrencyLarge(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || isNaN(Number(value))) return '—'
  const v   = Number(value)
  const sym = currencySymbol(currency)
  if (v >= 1e12) return sym + (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return sym + (v / 1e9).toFixed(1)  + 'B'
  if (v >= 1e6)  return sym + (v / 1e6).toFixed(0)  + 'M'
  return sym + v.toLocaleString()
}

/** Format a per-share price with the correct currency prefix. */
export function fmtCurrencyPrice(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || isNaN(Number(value))) return '—'
  const sym = currencySymbol(currency)
  return sym + Number(value).toFixed(2)
}

// ─── Coverage database ────────────────────────────────────────────────────────

export type CoverageLevel = 'full' | 'partial' | 'none'

export interface IntlCompanyMeta {
  symbol: string
  name: string
  exchange: string
  country: string
  currency: string
  /** Month (1–12) when the fiscal year ends. 12 = December (calendar year). */
  fyEndMonth: number
  /** Whether we have full real-data coverage on this name via the provider waterfall. */
  coverage: CoverageLevel
}

/**
 * Seed basket of well-known European and Japanese companies.
 * This is the verification basket for the initial rollout — it grows
 * as providers confirm coverage. Each entry is the canonical EODHD / FMP
 * symbol (with exchange suffix).
 */
export const INTL_COVERAGE_DB: IntlCompanyMeta[] = [
  // ── Europe ──────────────────────────────────────────────────────────
  { symbol: 'ASML.AS',    name: 'ASML Holding',           exchange: 'Euronext Amsterdam', country: 'NL', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'MC.PA',      name: 'LVMH',                   exchange: 'Euronext Paris',    country: 'FR', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'SAP.DE',     name: 'SAP SE',                 exchange: 'Xetra',             country: 'DE', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'NESN.SW',    name: 'Nestlé',                 exchange: 'SIX Swiss',         country: 'CH', currency: 'CHF', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'NOVN.SW',    name: 'Novartis',               exchange: 'SIX Swiss',         country: 'CH', currency: 'USD', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'SHELL.AS',   name: 'Shell',                  exchange: 'Euronext Amsterdam', country: 'GB', currency: 'USD', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'TTE.PA',     name: 'TotalEnergies',          exchange: 'Euronext Paris',    country: 'FR', currency: 'USD', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'HSBA.L',     name: 'HSBC Holdings',          exchange: 'LSE',               country: 'GB', currency: 'USD', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'AZN.L',      name: 'AstraZeneca',            exchange: 'LSE',               country: 'GB', currency: 'USD', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'GSK.L',      name: 'GSK',                    exchange: 'LSE',               country: 'GB', currency: 'GBP', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'BP.L',       name: 'BP',                     exchange: 'LSE',               country: 'GB', currency: 'USD', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'BARC.L',     name: 'Barclays',               exchange: 'LSE',               country: 'GB', currency: 'GBP', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'ULVR.L',     name: 'Unilever',               exchange: 'LSE',               country: 'GB', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'RIO.L',      name: 'Rio Tinto',              exchange: 'LSE',               country: 'GB', currency: 'USD', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'LLOY.L',     name: 'Lloyds Banking Group',   exchange: 'LSE',               country: 'GB', currency: 'GBP', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'VOW3.DE',    name: 'Volkswagen AG',          exchange: 'Xetra',             country: 'DE', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'BMW.DE',     name: 'BMW AG',                 exchange: 'Xetra',             country: 'DE', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'SIE.DE',     name: 'Siemens AG',             exchange: 'Xetra',             country: 'DE', currency: 'EUR', fyEndMonth:  9, coverage: 'full' },
  { symbol: 'BAS.DE',     name: 'BASF SE',                exchange: 'Xetra',             country: 'DE', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'OR.PA',      name: "L'Oréal",                exchange: 'Euronext Paris',    country: 'FR', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'BNP.PA',     name: 'BNP Paribas',            exchange: 'Euronext Paris',    country: 'FR', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'ENEL.MI',    name: 'Enel SpA',               exchange: 'Borsa Italiana',    country: 'IT', currency: 'EUR', fyEndMonth: 12, coverage: 'partial' },
  { symbol: 'ENI.MI',     name: 'ENI SpA',                exchange: 'Borsa Italiana',    country: 'IT', currency: 'EUR', fyEndMonth: 12, coverage: 'partial' },
  { symbol: 'INGA.AS',    name: 'ING Group',              exchange: 'Euronext Amsterdam', country: 'NL', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },
  { symbol: 'PHIA.AS',    name: 'Philips',                exchange: 'Euronext Amsterdam', country: 'NL', currency: 'EUR', fyEndMonth: 12, coverage: 'full' },

  // ── Japan ────────────────────────────────────────────────────────────
  // Japanese FY typically ends March (month 3); exceptions noted.
  { symbol: '7203.T',     name: 'Toyota Motor',           exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
  { symbol: '9984.T',     name: 'SoftBank Group',         exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
  { symbol: '6758.T',     name: 'Sony Group',             exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
  { symbol: '8306.T',     name: 'Mitsubishi UFJ Financial', exchange: 'TSE',             country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
  { symbol: '7267.T',     name: 'Honda Motor',            exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
  { symbol: '6861.T',     name: 'Keyence',                exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
  { symbol: '4519.T',     name: 'Chugai Pharmaceutical',  exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth: 12, coverage: 'partial' },
  { symbol: '8035.T',     name: 'Tokyo Electron',         exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
  { symbol: '6501.T',     name: 'Hitachi',                exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
  { symbol: '9432.T',     name: 'NTT',                    exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
  { symbol: '6954.T',     name: 'Fanuc',                  exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
  { symbol: '7751.T',     name: 'Canon',                  exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth: 12, coverage: 'partial' },
  { symbol: '4543.T',     name: 'Terumo',                 exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'partial' },
  { symbol: '6098.T',     name: 'Recruit Holdings',       exchange: 'TSE',               country: 'JP', currency: 'JPY', fyEndMonth:  3, coverage: 'full' },
]

/** Index the coverage DB by symbol for O(1) lookups. */
const _bySymbol = new Map<string, IntlCompanyMeta>(
  INTL_COVERAGE_DB.map((e) => [e.symbol.toUpperCase(), e]),
)

/**
 * Look up a symbol in the coverage DB and return its metadata, or null if the
 * symbol is not in the seed basket.
 */
export function intlMeta(symbol: string): IntlCompanyMeta | null {
  return _bySymbol.get(symbol.toUpperCase()) ?? null
}

/**
 * Return the coverage level for a symbol.
 *
 * - 'full'    → in the seed basket with a confirmed real-data provider path
 * - 'partial' → in the seed basket but some data points (e.g. quarterly
 *               statements) may fall back to EODHD only
 * - 'none'    → not in the seed basket; international data may still be
 *               available via the provider waterfall but is not verified
 */
export function coverageLevel(symbol: string): CoverageLevel {
  return intlMeta(symbol)?.coverage ?? 'none'
}

/**
 * Return the fiscal-year-end month for a symbol from the coverage DB, or
 * null when unknown (caller should fall back to the profile API).
 */
export function knownFyEndMonth(symbol: string): number | null {
  return intlMeta(symbol)?.fyEndMonth ?? null
}

// ─── Exchange-country mapping ─────────────────────────────────────────────────

/**
 * Infer the two-letter country ISO code from a common exchange suffix.
 * Used when the provider returns no country field.
 */
export const SUFFIX_TO_COUNTRY: Record<string, string> = {
  '.L':   'GB',
  '.IL':  'GB',
  '.TO':  'CA',
  '.V':   'CA',
  '.AX':  'AU',
  '.NZ':  'NZ',
  '.HK':  'HK',
  '.T':   'JP',
  '.OS':  'JP',
  '.NS':  'IN',
  '.BO':  'IN',
  '.KS':  'KR',
  '.KQ':  'KR',
  '.SS':  'CN',
  '.SZ':  'CN',
  '.TW':  'TW',
  '.PA':  'FR',
  '.AS':  'NL',
  '.DE':  'DE',
  '.BE':  'DE',
  '.MI':  'IT',
  '.SW':  'CH',
  '.VX':  'CH',
  '.MC':  'ES',
  '.BR':  'BE',
  '.ST':  'SE',
  '.OL':  'NO',
  '.CO':  'DK',
  '.HE':  'FI',
  '.LS':  'PT',
  '.IR':  'IE',
  '.AT':  'AT',
  '.WA':  'PL',
  '.PR':  'CZ',
  '.BU':  'HU',
  '.MX':  'MX',
  '.SA':  'BR',
  '.SN':  'CL',
  '.BA':  'AR',
  '.SG':  'SG',
  '.SI':  'SG',
}

/**
 * Infer the two-letter country ISO code from a symbol's exchange suffix.
 * Returns 'US' when the suffix is not recognised (default assumption).
 */
export function countryFromSymbol(symbol: string): string {
  const upper = symbol.toUpperCase()
  for (const [suffix, cc] of Object.entries(SUFFIX_TO_COUNTRY)) {
    if (upper.endsWith(suffix.toUpperCase())) return cc
  }
  return 'US'
}

// ─── Fiscal-year-end inference from profile data ──────────────────────────────

/**
 * Parse a fiscal-year-end string as returned by FMP/EODHD into a month number
 * (1–12).  FMP returns it as a date string like "2024-12-31" or as a
 * month abbreviation "December". EODHD's `Highlights.FiscalYearEnd` is a
 * month abbreviation in English.
 *
 * Returns null when the value cannot be parsed.
 */
export function parseFyEndMonth(raw: string | undefined | null): number | null {
  if (!raw) return null
  const s = raw.trim()

  // ISO date YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const m = parseInt(s.slice(5, 7), 10)
    return m >= 1 && m <= 12 ? m : null
  }

  // Month number as a bare string e.g. "12"
  if (/^\d{1,2}$/.test(s)) {
    const m = parseInt(s, 10)
    return m >= 1 && m <= 12 ? m : null
  }

  // English month name (full or abbreviated)
  const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  }
  const key = s.toLowerCase().slice(0, 3)
  return MONTHS[key] ?? null
}
