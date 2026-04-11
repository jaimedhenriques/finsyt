import { NextRequest, NextResponse } from "next/server"

const EODHD_KEY = process.env.EODHD_API_KEY || ""
const BASE = "https://eodhd.com/api"

// ── Finsyt mnemonic → EODHD field mapping ────────────────────────────────────
const METRIC_MAP: Record<string, { path: string; statement: "income_statement" | "balance_sheet" | "cash_flow" | "highlights" | "valuation"; transform?: (v: any) => any }> = {
  // Income Statement
  iq_total_rev:       { path: "totalRevenue",                    statement: "income_statement" },
  iq_rev:             { path: "totalRevenue",                    statement: "income_statement" },
  iq_gross_profit:    { path: "grossProfit",                     statement: "income_statement" },
  iq_gross_profit_margin: { path: "grossProfit",                 statement: "income_statement", transform: (v, data) => data?.income_statement?.yearly?.[0] ? (v / data.income_statement.yearly[0].totalRevenue * 100).toFixed(2) : null },
  iq_ebitda:          { path: "ebitda",                          statement: "highlights" },
  iq_ebitda_margin:   { path: "EBITDAM",                         statement: "highlights" },
  iq_ebit:            { path: "ebit",                            statement: "income_statement" },
  iq_ebit_margin:     { path: "ebit",                            statement: "income_statement" },
  iq_net_inc:         { path: "netIncome",                       statement: "income_statement" },
  iq_net_inc_margin:  { path: "profitMargin",                    statement: "highlights" },
  iq_eps_diluted:     { path: "dilutedEps",                      statement: "income_statement" },
  iq_sga:             { path: "sellingGeneralAdministrative",    statement: "income_statement" },
  iq_rd_exp:          { path: "researchDevelopment",             statement: "income_statement" },
  iq_da_suppl:        { path: "depreciationAndAmortization",     statement: "cash_flow" },
  iq_int_exp:         { path: "interestExpense",                 statement: "income_statement" },
  iq_tax_exp:         { path: "incomeTaxExpense",                statement: "income_statement" },
  // Balance Sheet
  iq_total_assets:    { path: "totalAssets",                     statement: "balance_sheet" },
  iq_cash_equiv:      { path: "cash",                            statement: "balance_sheet" },
  iq_cash_st_invest:  { path: "shortTermInvestments",            statement: "balance_sheet" },
  iq_ar:              { path: "netReceivables",                  statement: "balance_sheet" },
  iq_total_debt:      { path: "shortLongTermDebtTotal",          statement: "balance_sheet" },
  iq_st_debt:         { path: "shortTermDebt",                   statement: "balance_sheet" },
  iq_lt_debt:         { path: "longTermDebtTotal",               statement: "balance_sheet" },
  iq_net_debt:        { path: "netDebt",                         statement: "highlights" },
  iq_total_equity:    { path: "totalStockholderEquity",          statement: "balance_sheet" },
  iq_total_liab:      { path: "totalLiab",                       statement: "balance_sheet" },
  iq_book_val_share:  { path: "bookValue",                       statement: "highlights" },
  // Cash Flow
  iq_net_cash_ops:    { path: "totalCashFromOperatingActivities",statement: "cash_flow" },
  iq_capex:           { path: "capitalExpenditures",             statement: "cash_flow" },
  iq_free_cash_flow:  { path: "freeCashFlow",                    statement: "highlights" },
  iq_net_cash_inv:    { path: "totalCashflowsFromInvestingActivities", statement: "cash_flow" },
  iq_net_cash_finan:  { path: "totalCashFromFinancingActivities",statement: "cash_flow" },
  iq_div_paid:        { path: "dividendsPaid",                   statement: "cash_flow" },
  iq_da_cf:           { path: "depreciationAndAmortization",     statement: "cash_flow" },
  // Valuation / Market
  iq_marketcap:       { path: "marketCapitalization",            statement: "highlights" },
  iq_tev:             { path: "enterpriseValue",                 statement: "highlights" },
  iq_tev_ebitda:      { path: "EnterpriseValueEbitda",           statement: "highlights" },
  iq_pe_excl:         { path: "PERatio",                         statement: "highlights" },
  iq_tev_rev:         { path: "EnterpriseValueRevenue",          statement: "highlights" },
  iq_pb:              { path: "PriceBookMRQ",                    statement: "highlights" },
  iq_ps:              { path: "PriceSalesTTM",                   statement: "highlights" },
  iq_div_yield:       { path: "DividendYield",                   statement: "highlights" },
  iq_diluted_shares:  { path: "SharesOutstanding",               statement: "highlights" },
  // Estimates (from EODHD earnings)
  iq_eps_agg_est:     { path: "epsEstimate",                     statement: "highlights" },
  iq_total_rev_agg_est: { path: "revenueEstimate",               statement: "highlights" },
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchFinancials(symbol: string, exchange = "US") {
  const url = `${BASE}/fundamentals/${symbol}.${exchange}?api_token=${EODHD_KEY}&filter=Financials,Highlights,Valuation`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`EODHD error: ${res.status}`)
  return res.json()
}

function extractPeriods(data: any, statement: string, period: string, offset: number, fieldPath: string) {
  const isAnnual = period === "A" || period === "annual"
  const freq = isAnnual ? "yearly" : "quarterly"
  
  const stmtData = data?.Financials?.[statement === "income_statement" ? "Income_Statement" : statement === "balance_sheet" ? "Balance_Sheet" : "Cash_Flow"]
  const highlights = data?.Highlights
  const valuation = data?.Valuation
  
  // Highlights/Valuation are single-period (current)
  if (statement === "highlights") {
    const val = highlights?.[fieldPath] ?? valuation?.[fieldPath] ?? null
    return { value: val, period: "latest", currency: "USD" }
  }
  
  const records = stmtData?.[freq]
  if (!records) return { value: null, period: null, currency: "USD" }
  
  const dates = Object.keys(records).sort().reverse()
  const idx = Math.abs(offset)
  if (idx >= dates.length) return { value: null, period: null, currency: "USD" }
  
  const date = dates[idx]
  const record = records[date]
  const value = record?.[fieldPath] ?? null
  
  return { value, period: date, currency: record?.currency_symbol || "USD" }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get("symbol")?.toUpperCase()
  const metric = searchParams.get("metric")?.toLowerCase()  // e.g. iq_total_rev or revenue
  const period = searchParams.get("period") || "A"           // A, Q, LTM, NTM
  const offset = parseInt(searchParams.get("offset") || "0") // 0=current, -1=prior, etc.
  const exchange = searchParams.get("exchange") || "US"
  const currency = searchParams.get("currency") || "USD"

  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 })

  // Multi-metric mode: ?metrics=revenue,ebitda,net_income
  const metricsParam = searchParams.get("metrics")

  try {
    const raw = await fetchFinancials(symbol, exchange)

    if (metricsParam) {
      // Batch mode — return multiple metrics at once
      const metricKeys = metricsParam.split(",").map(m => m.trim().toLowerCase())
      const results: Record<string, any> = { symbol, period, exchange }
      
      for (const key of metricKeys) {
        const mapping = METRIC_MAP[key] || METRIC_MAP[`iq_${key}`]
        if (!mapping) { results[key] = { value: null, error: "unknown metric" }; continue }
        const extracted = extractPeriods(raw, mapping.statement, period, offset, mapping.path)
        results[key] = extracted
      }
      
      return NextResponse.json(results)
    }

    if (!metric) {
      // Return full financial snapshot
      const h = raw?.Highlights || {}
      const v = raw?.Valuation || {}
      return NextResponse.json({
        symbol,
        exchange,
        snapshot: {
          marketCap: h.MarketCapitalization,
          revenue: h.RevenueTTM,
          ebitda: h.EBITDA,
          eps: h.DilutedEpsTTM,
          pe: h.PERatio,
          evEbitda: h.EnterpriseValueEbitda,
          grossMargin: h.GrossProfitTTM,
          profitMargin: h.ProfitMargin,
          roe: h.ReturnOnEquityTTM,
          bookValue: h.BookValue,
          freeCashFlow: h.FreeCashflow,
          enterpriseValue: h.EnterpriseValue,
          dividendYield: h.DividendYield,
          sharesOutstanding: h.SharesOutstanding,
        },
        currency: "USD",
      })
    }

    // Single metric
    const mapping = METRIC_MAP[metric] || METRIC_MAP[`iq_${metric}`]
    if (!mapping) {
      return NextResponse.json({ error: `Unknown metric: ${metric}. Check /api/financials/metrics for available metrics.` }, { status: 400 })
    }

    const extracted = extractPeriods(raw, mapping.statement, period, offset, mapping.path)
    return NextResponse.json({ symbol, metric, ...extracted, exchange })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── Metrics catalog endpoint ──────────────────────────────────────────────────
// GET /api/financials?catalog=true  → returns all supported metrics
export async function POST(req: NextRequest) {
  // Return the full metric catalog
  const catalog = Object.entries(METRIC_MAP).map(([key, val]) => ({
    finsyt_key: key,
    ciq_mnemonic: key.toUpperCase(),
    statement: val.statement,
    eodhd_field: val.path,
  }))
  return NextResponse.json({ count: catalog.length, metrics: catalog })
}
