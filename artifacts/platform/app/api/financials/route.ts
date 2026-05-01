import { NextRequest, NextResponse } from "next/server"
import { PROVIDERS, financialDatasetsIncome, financialDatasetsBalanceSheet } from "@/lib/data-providers"

const FMP   = process.env.FMP_API_KEY || ""
const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api || ""

const FMP_BASE   = "https://financialmodelingprep.com"
const EODHD_BASE = "https://eodhd.com/api"

// ─── FMP field maps ───────────────────────────────────────────────────────────
// FMP income-statement fields (stable endpoint returns camelCase)
const FMP_IS: Record<string, string> = {
  iq_total_rev:        "revenue",
  iq_gross_profit:     "grossProfit",
  iq_gross_profit_margin: "grossProfitRatio",
  iq_ebitda:           "ebitda",
  iq_ebitda_margin:    "ebitdaratio",
  iq_ebit:             "operatingIncome",
  iq_ebit_margin:      "operatingIncomeRatio",
  iq_net_inc:          "netIncome",
  iq_net_inc_margin:   "netIncomeRatio",
  iq_eps_diluted:      "epsdiluted",
  iq_eps_basic:        "eps",
  iq_sga:              "sellingGeneralAndAdministrativeExpenses",
  iq_rd_exp:           "researchAndDevelopmentExpenses",
  iq_da_suppl:         "depreciationAndAmortization",
  iq_int_exp:          "interestExpense",
  iq_tax_exp:          "incomeTaxExpense",
  iq_cost_rev:         "costOfRevenue",
  iq_diluted_shares:   "weightedAverageShsOutDil",
  iq_operating_exp:    "operatingExpenses",
}

// FMP balance-sheet fields
const FMP_BS: Record<string, string> = {
  iq_total_assets:     "totalAssets",
  iq_cash_equiv:       "cashAndCashEquivalents",
  iq_cash_st_invest:   "cashAndShortTermInvestments",
  iq_ar:               "netReceivables",
  iq_inventory:        "inventory",
  iq_total_current_assets: "totalCurrentAssets",
  iq_ppe_net:          "propertyPlantEquipmentNet",
  iq_goodwill:         "goodwill",
  iq_intangibles:      "intangibleAssets",
  iq_total_liab:       "totalLiabilities",
  iq_total_current_liab: "totalCurrentLiabilities",
  iq_st_debt:          "shortTermDebt",
  iq_lt_debt:          "longTermDebt",
  iq_total_debt:       "totalDebt",
  iq_net_debt:         "netDebt",
  iq_total_equity:     "totalStockholdersEquity",
  iq_book_val_share:   "bookValuePerShare",
  iq_retained_earnings:"retainedEarnings",
}

// FMP cash-flow fields
const FMP_CF: Record<string, string> = {
  iq_net_cash_ops:     "operatingCashFlow",
  iq_capex:            "capitalExpenditure",
  iq_free_cash_flow:   "freeCashFlow",
  iq_net_cash_inv:     "netCashUsedForInvestingActivites",
  iq_net_cash_finan:   "netCashUsedProvidedByFinancingActivities",
  iq_div_paid:         "dividendsPaid",
  iq_da_cf:            "depreciationAndAmortization",
  iq_stock_comp:       "stockBasedCompensation",
  iq_buy_back:         "commonStockRepurchased",
  iq_net_change_cash:  "netChangeInCash",
}

// FMP key-metrics / ratios
const FMP_KM: Record<string, string> = {
  iq_marketcap:        "marketCap",
  iq_tev:              "enterpriseValue",
  iq_tev_ebitda:       "evToEbitda",
  iq_pe_excl:          "peRatio",
  iq_tev_rev:          "evToSales",
  iq_pb:               "pbRatio",
  iq_ps:               "priceToSalesRatio",
  iq_div_yield:        "dividendYield",
  iq_fcf_yield:        "freeCashFlowYield",
  iq_roe:              "roe",
  iq_roa:              "roa",
  iq_roic:             "roic",
  iq_peg:              "pegRatio",
  iq_net_debt_ebitda:  "netDebtToEBITDA",
  iq_current_ratio:    "currentRatio",
  iq_debt_equity:      "debtToEquity",
  iq_interest_cov:     "interestCoverage",
}

// Quick lookup: which statement is this mnemonic in?
const ALL_MAPS = [
  { map: FMP_IS, stmt: "income-statement" },
  { map: FMP_BS, stmt: "balance-sheet-statement" },
  { map: FMP_CF, stmt: "cash-flow-statement" },
  { map: FMP_KM, stmt: "key-metrics" },
] as const

function findMapping(metric: string): { stmt: string; field: string } | null {
  for (const { map, stmt } of ALL_MAPS) {
    if (map[metric]) return { stmt, field: map[metric] }
  }
  return null
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────
async function fmpFetch(path: string) {
  const sep = path.includes("?") ? "&" : "?"
  const res = await fetch(`${FMP_BASE}${path}${sep}apikey=${FMP}`, { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`FMP ${res.status}: ${path}`)
  return res.json()
}

// period: "annual" | "quarter"
async function fetchStatement(symbol: string, stmt: string, period: string, limit: number) {
  const useStable = ["income-statement","balance-sheet-statement","cash-flow-statement"].includes(stmt)
  if (useStable) {
    // FMP stable endpoint
    return fmpFetch(`/stable/${stmt}?symbol=${symbol}&period=${period}&limit=${limit}`)
  }
  // key-metrics
  return fmpFetch(`/stable/key-metrics?symbol=${symbol}&period=${period}&limit=${limit}`)
}

// ─── EODHD fallback ───────────────────────────────────────────────────────────
const EODHD_MAP: Record<string, { section: string; field: string }> = {
  iq_total_rev:    { section: "Income_Statement", field: "totalRevenue" },
  iq_gross_profit: { section: "Income_Statement", field: "grossProfit" },
  iq_ebitda:       { section: "Highlights",       field: "EBITDA" },
  iq_net_inc:      { section: "Income_Statement", field: "netIncome" },
  iq_total_assets: { section: "Balance_Sheet",    field: "totalAssets" },
  iq_total_debt:   { section: "Balance_Sheet",    field: "shortLongTermDebtTotal" },
  iq_total_equity: { section: "Balance_Sheet",    field: "totalStockholderEquity" },
  iq_net_cash_ops: { section: "Cash_Flow",        field: "totalCashFromOperatingActivities" },
  iq_capex:        { section: "Cash_Flow",        field: "capitalExpenditures" },
  iq_free_cash_flow:{ section:"Highlights",       field: "FreeCashflow" },
  iq_marketcap:    { section: "Highlights",       field: "MarketCapitalization" },
  iq_tev:          { section: "Highlights",       field: "EnterpriseValue" },
  iq_pe_excl:      { section: "Highlights",       field: "PERatio" },
}

async function fetchEODHD(symbol: string, metric: string, period: string) {
  const eodSymbol = symbol.includes(".") ? symbol : `${symbol}.US`
  const freq = period === "annual" ? "yearly" : "quarterly"
  const data = await fetch(`${EODHD_BASE}/fundamentals/${eodSymbol}?api_token=${EODHD}`).then(r => r.json())
  const mapping = EODHD_MAP[metric]
  if (!mapping) return null

  if (mapping.section === "Highlights") {
    return [{ date: "latest", value: data?.Highlights?.[mapping.field] ?? null }]
  }
  const sectionMap: Record<string, string> = { Income_Statement: "Income_Statement", Balance_Sheet: "Balance_Sheet", Cash_Flow: "Cash_Flow" }
  const records = data?.Financials?.[sectionMap[mapping.section]]?.[freq] || {}
  return Object.entries(records)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rec]: any) => ({ date, value: rec?.[mapping.field] ?? null }))
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams
  const symbol  = sp.get("symbol")?.toUpperCase()
  const metric  = sp.get("metric")?.toLowerCase()
  const metrics = sp.get("metrics")  // comma-separated batch
  const period  = (sp.get("period") || "A").toUpperCase()
  const offset  = parseInt(sp.get("offset") || "0")
  const limit   = parseInt(sp.get("limit") || "5")

  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 })

  // Map period param → FMP period string
  const fmpPeriod = ["Q", "Q1", "Q2", "Q3", "Q4", "QUARTERLY"].includes(period) ? "quarter" : "annual"

  // ── SNAPSHOT mode (no metric) ─────────────────────────────────────────────
  if (!metric && !metrics) {
    try {
      const [profile, ratios, income, balanceSheet] = await Promise.all([
        fmpFetch(`/stable/profile?symbol=${symbol}`),
        fmpFetch(`/stable/ratios?symbol=${symbol}&period=${fmpPeriod}&limit=1`),
        fmpFetch(`/stable/income-statement?symbol=${symbol}&period=${fmpPeriod}&limit=1`),
        fmpFetch(`/stable/balance-sheet-statement?symbol=${symbol}&period=${fmpPeriod}&limit=1`),
      ])
      const p  = Array.isArray(profile) ? profile[0] : profile
      const r  = (Array.isArray(ratios) ? ratios : [])[0] || {}
      const is = (Array.isArray(income) ? income : [])[0] || {}
      const bs = (Array.isArray(balanceSheet) ? balanceSheet : [])[0] || {}

      return NextResponse.json({
        symbol,
        period: fmpPeriod,
        asOf: is.date || r.date || null,
        snapshot: {
          name:             p?.companyName,
          sector:           p?.sector,
          industry:         p?.industry,
          currency:         p?.currency || "USD",
          marketCap:        p?.mktCap,
          enterpriseValue:  p?.enterpriseValue ?? null,
          price:            p?.price,
          // Income
          revenue:          is.revenue,
          grossProfit:      is.grossProfit,
          grossMargin:      is.grossProfitRatio,
          ebitda:           is.ebitda,
          ebitdaMargin:     is.ebitdaratio,
          ebit:             is.operatingIncome,
          ebitMargin:       is.operatingIncomeRatio,
          netIncome:        is.netIncome,
          netMargin:        is.netIncomeRatio,
          epsDiluted:       is.epsdiluted,
          // Balance
          totalAssets:      bs.totalAssets,
          totalDebt:        bs.totalDebt,
          netDebt:          bs.netDebt,
          totalEquity:      bs.totalStockholdersEquity,
          cash:             bs.cashAndCashEquivalents,
          // Ratios
          pe:               r.priceEarningsRatio ?? p?.pe,
          evEbitda:         r.enterpriseValueMultiple,
          evRevenue:        r.evToSales ?? r.priceToSalesRatio,
          pb:               r.priceToBookRatio,
          ps:               r.priceToSalesRatio,
          roe:              r.returnOnEquity,
          roa:              r.returnOnAssets,
          roic:             r.returnOnCapitalEmployed,
          currentRatio:     r.currentRatio,
          debtEquity:       r.debtEquityRatio,
          fcfYield:         r.freeCashFlowYield,
          dividendYield:    r.dividendYield,
        },
        source: "fmp",
      })
    } catch (e) {
      console.error("FMP snapshot failed, trying Financial Datasets:", e)
    }
  }

  // Snapshot fallback: synthesise from Financial Datasets income + balance sheet
  if (!metric && !metrics && PROVIDERS.financialdatasets) {
    try {
      const [income, balance] = await Promise.all([
        financialDatasetsIncome(symbol, fmpPeriod === 'annual' ? 'annual' : 'quarterly', 1),
        financialDatasetsBalanceSheet(symbol, fmpPeriod === 'annual' ? 'annual' : 'quarterly', 1),
      ])
      const is = (income || [])[0] || {}
      const bs = (balance || [])[0] || {}
      if (is.revenue || bs.totalAssets) {
        return NextResponse.json({
          symbol, period: fmpPeriod, asOf: is.date || bs.date || null,
          snapshot: {
            currency: is.reportedCurrency || 'USD',
            revenue: is.revenue, grossProfit: is.grossProfit, grossMargin: is.grossProfitRatio,
            ebitda: is.ebitda, ebitdaMargin: is.ebitdaratio,
            ebit: is.operatingIncome, ebitMargin: is.operatingIncomeRatio,
            netIncome: is.netIncome, netMargin: is.netIncomeRatio,
            epsDiluted: is.epsdiluted,
            totalAssets: bs.totalAssets, totalDebt: bs.totalDebt, netDebt: bs.netDebt,
            totalEquity: bs.totalStockholdersEquity, cash: bs.cashAndCashEquivalents,
          },
          source: 'financialdatasets',
        })
      }
    } catch (e) {
      console.error("Financial Datasets snapshot fallback failed:", e)
    }
  }
  if (!metric && !metrics) {
    return NextResponse.json({
      error: "Snapshot exhausted: no fundamentals provider returned data",
      symbol, mode: 'snapshot',
      triedProviders: [
        ...(FMP ? ['fmp'] : []),
        ...(PROVIDERS.financialdatasets ? ['financialdatasets'] : []),
      ],
    }, { status: 503 })
  }

  // ── BATCH mode ────────────────────────────────────────────────────────────
  if (metrics) {
    const keys = metrics.split(",").map(m => m.trim().toLowerCase())
    // Group by statement to minimise API calls
    const stmtGroups: Record<string, string[]> = {}
    for (const key of keys) {
      const mapping = findMapping(key)
      if (!mapping) continue
      if (!stmtGroups[mapping.stmt]) stmtGroups[mapping.stmt] = []
      stmtGroups[mapping.stmt].push(key)
    }
    try {
      const fetched: Record<string, any[]> = {}
      await Promise.all(
        Object.keys(stmtGroups).map(async stmt => {
          const rows = await fetchStatement(symbol, stmt, fmpPeriod, limit + Math.abs(offset))
          fetched[stmt] = Array.isArray(rows) ? rows : []
        })
      )
      const results: Record<string, any> = { symbol, period, source: "fmp" }
      for (const key of keys) {
        const mapping = findMapping(key)
        if (!mapping) { results[key] = { value: null, error: "unknown metric" }; continue }
        const rows = fetched[mapping.stmt] || []
        const idx  = Math.abs(offset)
        if (idx >= rows.length) { results[key] = { value: null, error: "period out of range" }; continue }
        results[key] = { value: rows[idx]?.[mapping.field] ?? null, date: rows[idx]?.date, currency: rows[idx]?.reportedCurrency || "USD" }
      }
      return NextResponse.json(results)
    } catch (e) {
      console.error("FMP batch failed, trying Financial Datasets:", e)
    }
  }

  // Batch fallback: pull each statement once from Financial Datasets and map
  if (metrics && PROVIDERS.financialdatasets) {
    const keys = metrics.split(",").map(m => m.trim().toLowerCase())
    try {
      const stmtGroups: Record<string, string[]> = {}
      for (const key of keys) {
        const mapping = findMapping(key)
        if (!mapping) continue
        if (!stmtGroups[mapping.stmt]) stmtGroups[mapping.stmt] = []
        stmtGroups[mapping.stmt].push(key)
      }
      const fetched: Record<string, any[]> = {}
      await Promise.all(Object.keys(stmtGroups).map(async stmt => {
        if (stmt === 'income-statement') {
          fetched[stmt] = await financialDatasetsIncome(symbol, fmpPeriod === 'annual' ? 'annual' : 'quarterly', limit + Math.abs(offset))
        } else if (stmt === 'balance-sheet-statement') {
          fetched[stmt] = await financialDatasetsBalanceSheet(symbol, fmpPeriod === 'annual' ? 'annual' : 'quarterly', limit + Math.abs(offset))
        } else {
          fetched[stmt] = []
        }
      }))
      const results: Record<string, any> = { symbol, period, source: 'financialdatasets' }
      let hadAny = false
      for (const key of keys) {
        const mapping = findMapping(key)
        if (!mapping) { results[key] = { value: null, error: 'unknown metric' }; continue }
        const rows = fetched[mapping.stmt] || []
        const idx  = Math.abs(offset)
        if (idx >= rows.length) { results[key] = { value: null, error: 'period out of range' }; continue }
        const v = rows[idx]?.[mapping.field] ?? null
        if (v != null) hadAny = true
        results[key] = { value: v, date: rows[idx]?.date, currency: rows[idx]?.reportedCurrency || 'USD' }
      }
      if (hadAny) return NextResponse.json(results)
    } catch (e) {
      console.error("Financial Datasets batch fallback failed:", e)
    }
  }
  if (metrics) {
    return NextResponse.json({
      error: "Batch metrics exhausted: no fundamentals provider returned data",
      symbol, mode: 'batch',
      triedProviders: [
        ...(FMP ? ['fmp'] : []),
        ...(PROVIDERS.financialdatasets ? ['financialdatasets'] : []),
      ],
    }, { status: 503 })
  }

  // ── SINGLE metric mode ────────────────────────────────────────────────────
  const mapping = findMapping(metric!)
  if (!mapping) {
    return NextResponse.json({ error: `Unknown metric: ${metric}. See /api/financials/metrics` }, { status: 400 })
  }

  // Try FMP first
  if (FMP) {
    try {
      const rows = await fetchStatement(symbol, mapping.stmt, fmpPeriod, limit + Math.abs(offset))
      const data  = Array.isArray(rows) ? rows : []
      const series = data.map((r: any) => ({ date: r.date, value: r[mapping.field] ?? null, currency: r.reportedCurrency || "USD" }))
      const single  = series[Math.abs(offset)] || null

      return NextResponse.json({
        symbol, metric, period, offset,
        value:    single?.value ?? null,
        date:     single?.date  ?? null,
        currency: single?.currency || "USD",
        series,   // all periods
        source:   "fmp",
      })
    } catch (e) {
      console.error("FMP single metric failed:", e)
    }
  }

  // Financial Datasets fallback (AI-friendly fundamentals, mapped to FMP shape)
  if (PROVIDERS.financialdatasets && (mapping.stmt === 'income-statement' || mapping.stmt === 'balance-sheet-statement')) {
    try {
      const rows = mapping.stmt === 'income-statement'
        ? await financialDatasetsIncome(symbol, fmpPeriod === 'annual' ? 'annual' : 'quarterly', limit + Math.abs(offset))
        : await financialDatasetsBalanceSheet(symbol, fmpPeriod === 'annual' ? 'annual' : 'quarterly', limit + Math.abs(offset))
      const series = (rows || []).map((r: any) => ({ date: r.date, value: r[mapping.field] ?? null, currency: r.reportedCurrency || 'USD' }))
      const single = series[Math.abs(offset)] || null
      if (single?.value !== undefined) {
        return NextResponse.json({ symbol, metric, period, offset, value: single?.value ?? null, date: single?.date ?? null, currency: single?.currency || 'USD', series, source: 'financialdatasets' })
      }
    } catch (e) {
      console.error('Financial Datasets fallback failed:', e)
    }
  }

  // EODHD fallback
  if (EODHD) {
    try {
      const series = await fetchEODHD(symbol, metric!, fmpPeriod)
      if (series) {
        const single = series[Math.abs(offset)]
        return NextResponse.json({ symbol, metric, period, offset, value: single?.value ?? null, date: single?.date ?? null, series, source: "eodhd" })
      }
    } catch (e) {
      console.error("EODHD fallback failed:", e)
    }
  }

  return NextResponse.json({
    error: "All financials providers exhausted or no API keys configured",
    symbol, metric,
    triedProviders: ['fmp', 'financialdatasets', 'eodhd'].filter(p => {
      if (p === 'fmp') return !!FMP
      if (p === 'eodhd') return !!EODHD
      if (p === 'financialdatasets') return !!PROVIDERS.financialdatasets
      return false
    }),
  }, { status: 503 })
}

export async function POST() {
  // Catalog
  const catalog = [
    ...Object.entries(FMP_IS).map(([k, v]) => ({ key: k, field: v, statement: "income_statement" })),
    ...Object.entries(FMP_BS).map(([k, v]) => ({ key: k, field: v, statement: "balance_sheet" })),
    ...Object.entries(FMP_CF).map(([k, v]) => ({ key: k, field: v, statement: "cash_flow" })),
    ...Object.entries(FMP_KM).map(([k, v]) => ({ key: k, field: v, statement: "key_metrics" })),
  ]
  return NextResponse.json({ count: catalog.length, source: "fmp_primary", catalog })
}
