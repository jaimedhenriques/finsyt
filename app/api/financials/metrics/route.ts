import { NextResponse } from "next/server"

// ── Finsyt Query Language (FQL) — Proprietary metric catalog ──────────────────
// Syntax: =FQL("FX_REV", "AAPL", "A", 0)
//   Arg 1: FQL mnemonic
//   Arg 2: Ticker symbol or cell reference
//   Arg 3: Period — "A" annual | "Q" quarterly | "LTM" | "NTM"
//   Arg 4: Offset — 0 = most recent | -1 = 1 period back | etc.
//
// Prefix legend:
//   FX_  → Financial statement items
//   FV_  → Valuation multiples
//   FM_  → Market & price data
//   FE_  → Estimates & consensus
//   FG_  → Growth rates
//   FR_  → Ratios & margins
//   FD_  → Dividends

interface FqlMetric {
  key: string
  name: string
  category: string
  unit: "USD" | "%" | "x" | "shares" | "ratio"
  periodRequired: boolean
  fmpField: string
  description: string
}

const FQL_CATALOG: FqlMetric[] = [
  // ── Income Statement ────────────────────────────────────────────────────────
  { key: "FX_REV",        name: "Revenue",                  category: "income_statement", unit: "USD", periodRequired: true,  fmpField: "revenue",              description: "Total net revenue from all operations" },
  { key: "FX_GP",         name: "Gross Profit",             category: "income_statement", unit: "USD", periodRequired: true,  fmpField: "grossProfit",           description: "Revenue minus cost of goods sold" },
  { key: "FX_GP_MARGIN",  name: "Gross Margin",             category: "income_statement", unit: "%",   periodRequired: true,  fmpField: "grossProfitRatio",      description: "Gross profit as a % of revenue" },
  { key: "FX_EBITDA",     name: "EBITDA",                   category: "income_statement", unit: "USD", periodRequired: true,  fmpField: "ebitda",                description: "Earnings before interest, tax, D&A" },
  { key: "FX_EBITDA_M",   name: "EBITDA Margin",            category: "income_statement", unit: "%",   periodRequired: true,  fmpField: "ebitdaratio",           description: "EBITDA as a % of revenue" },
  { key: "FX_EBIT",       name: "EBIT",                     category: "income_statement", unit: "USD", periodRequired: true,  fmpField: "operatingIncome",       description: "Operating income (EBIT)" },
  { key: "FX_EBIT_M",     name: "EBIT Margin",              category: "income_statement", unit: "%",   periodRequired: true,  fmpField: "operatingIncomeRatio",  description: "EBIT as a % of revenue" },
  { key: "FX_NET_INC",    name: "Net Income",               category: "income_statement", unit: "USD", periodRequired: true,  fmpField: "netIncome",             description: "Net income attributable to shareholders" },
  { key: "FX_NET_M",      name: "Net Margin",               category: "income_statement", unit: "%",   periodRequired: true,  fmpField: "netIncomeRatio",        description: "Net income as a % of revenue" },
  { key: "FX_EPS",        name: "Diluted EPS",              category: "income_statement", unit: "USD", periodRequired: true,  fmpField: "epsdiluted",            description: "Earnings per diluted share" },
  { key: "FX_SGA",        name: "SG&A Expense",             category: "income_statement", unit: "USD", periodRequired: true,  fmpField: "sellingGeneralAndAdministrativeExpenses", description: "Selling, general & administrative costs" },
  { key: "FX_RD",         name: "R&D Expense",              category: "income_statement", unit: "USD", periodRequired: true,  fmpField: "researchAndDevelopmentExpenses",          description: "Research & development expenditure" },
  { key: "FX_DA",         name: "Depreciation & Amortisation", category: "income_statement", unit: "USD", periodRequired: true, fmpField: "depreciationAndAmortization", description: "D&A from income statement" },
  { key: "FX_INT_EXP",    name: "Interest Expense",         category: "income_statement", unit: "USD", periodRequired: true,  fmpField: "interestExpense",       description: "Cost of debt financing" },
  { key: "FX_TAX",        name: "Income Tax",               category: "income_statement", unit: "USD", periodRequired: true,  fmpField: "incomeTaxExpense",      description: "Total income tax expense" },

  // ── Balance Sheet ───────────────────────────────────────────────────────────
  { key: "FX_ASSETS",     name: "Total Assets",             category: "balance_sheet",    unit: "USD", periodRequired: true,  fmpField: "totalAssets",           description: "Total assets on balance sheet" },
  { key: "FX_CASH",       name: "Cash & Equivalents",       category: "balance_sheet",    unit: "USD", periodRequired: true,  fmpField: "cashAndCashEquivalents", description: "Cash and short-term liquid assets" },
  { key: "FX_DEBT",       name: "Total Debt",               category: "balance_sheet",    unit: "USD", periodRequired: true,  fmpField: "totalDebt",             description: "All interest-bearing debt" },
  { key: "FX_NET_DEBT",   name: "Net Debt",                 category: "balance_sheet",    unit: "USD", periodRequired: true,  fmpField: "netDebt",               description: "Total debt minus cash" },
  { key: "FX_EQUITY",     name: "Shareholders Equity",      category: "balance_sheet",    unit: "USD", periodRequired: true,  fmpField: "totalStockholdersEquity", description: "Book value of equity" },
  { key: "FX_LT_DEBT",    name: "Long-Term Debt",           category: "balance_sheet",    unit: "USD", periodRequired: true,  fmpField: "longTermDebt",          description: "Debt maturing beyond 12 months" },
  { key: "FX_BV_SH",      name: "Book Value Per Share",     category: "balance_sheet",    unit: "USD", periodRequired: true,  fmpField: "bookValuePerShare",     description: "Net asset value per diluted share" },
  { key: "FX_CA",         name: "Current Assets",           category: "balance_sheet",    unit: "USD", periodRequired: true,  fmpField: "totalCurrentAssets",    description: "Assets convertible within 12 months" },
  { key: "FX_CL",         name: "Current Liabilities",      category: "balance_sheet",    unit: "USD", periodRequired: true,  fmpField: "totalCurrentLiabilities", description: "Obligations due within 12 months" },
  { key: "FX_WC",         name: "Working Capital",          category: "balance_sheet",    unit: "USD", periodRequired: true,  fmpField: "netWorkingCapital",     description: "Current assets minus current liabilities" },

  // ── Cash Flow ───────────────────────────────────────────────────────────────
  { key: "FX_CFO",        name: "Operating Cash Flow",      category: "cash_flow",        unit: "USD", periodRequired: true,  fmpField: "operatingCashFlow",     description: "Net cash from operating activities" },
  { key: "FX_CAPEX",      name: "Capital Expenditure",      category: "cash_flow",        unit: "USD", periodRequired: true,  fmpField: "capitalExpenditure",    description: "Investment in PP&E" },
  { key: "FX_FCF",        name: "Free Cash Flow",           category: "cash_flow",        unit: "USD", periodRequired: true,  fmpField: "freeCashFlow",          description: "OCF minus CapEx" },
  { key: "FX_DIV_PAID",   name: "Dividends Paid",           category: "cash_flow",        unit: "USD", periodRequired: true,  fmpField: "dividendsPaid",         description: "Cash dividends to shareholders" },
  { key: "FX_BUYBACKS",   name: "Share Repurchases",        category: "cash_flow",        unit: "USD", periodRequired: true,  fmpField: "commonStockRepurchased", description: "Cash returned via buybacks" },

  // ── Valuation ───────────────────────────────────────────────────────────────
  { key: "FV_MCAP",       name: "Market Capitalisation",    category: "valuation",        unit: "USD", periodRequired: false, fmpField: "marketCap",             description: "Current market cap (price × shares out)" },
  { key: "FV_EV",         name: "Enterprise Value",         category: "valuation",        unit: "USD", periodRequired: false, fmpField: "enterpriseValue",       description: "Market cap + net debt" },
  { key: "FV_EV_EBITDA",  name: "EV / EBITDA",              category: "valuation",        unit: "x",   periodRequired: false, fmpField: "enterpriseValueMultiple", description: "Enterprise value divided by EBITDA" },
  { key: "FV_EV_REV",     name: "EV / Revenue",             category: "valuation",        unit: "x",   periodRequired: false, fmpField: "evToSales",             description: "Enterprise value divided by revenue" },
  { key: "FV_PE",         name: "P/E Ratio",                category: "valuation",        unit: "x",   periodRequired: false, fmpField: "priceEarningsRatio",    description: "Price divided by trailing earnings per share" },
  { key: "FV_PB",         name: "P/B Ratio",                category: "valuation",        unit: "x",   periodRequired: false, fmpField: "priceToBookRatio",      description: "Price divided by book value per share" },
  { key: "FV_PS",         name: "P/S Ratio",                category: "valuation",        unit: "x",   periodRequired: false, fmpField: "priceToSalesRatio",     description: "Price divided by revenue per share" },
  { key: "FV_FCF_YIELD",  name: "FCF Yield",                category: "valuation",        unit: "%",   periodRequired: false, fmpField: "freeCashFlowYield",     description: "Free cash flow per share / price" },

  // ── Market & Price ──────────────────────────────────────────────────────────
  { key: "FM_PRICE",      name: "Last Price",               category: "market",           unit: "USD", periodRequired: false, fmpField: "price",                 description: "Latest traded price" },
  { key: "FM_PRICE_52H",  name: "52-Week High",             category: "market",           unit: "USD", periodRequired: false, fmpField: "yearHigh",              description: "Highest price over the past 52 weeks" },
  { key: "FM_PRICE_52L",  name: "52-Week Low",              category: "market",           unit: "USD", periodRequired: false, fmpField: "yearLow",               description: "Lowest price over the past 52 weeks" },
  { key: "FM_VOL",        name: "Volume",                   category: "market",           unit: "shares", periodRequired: false, fmpField: "volume",              description: "Latest session trading volume" },
  { key: "FM_BETA",       name: "Beta",                     category: "market",           unit: "ratio", periodRequired: false, fmpField: "beta",                description: "Price sensitivity vs. market index" },
  { key: "FM_SHARES_OUT", name: "Shares Outstanding",       category: "market",           unit: "shares", periodRequired: false, fmpField: "sharesOutstanding",   description: "Total diluted shares outstanding" },
  { key: "FM_FLOAT",      name: "Float",                    category: "market",           unit: "shares", periodRequired: false, fmpField: "floatShares",         description: "Publicly tradeable shares" },

  // ── Growth ──────────────────────────────────────────────────────────────────
  { key: "FG_REV_YOY",    name: "Revenue Growth YoY",       category: "growth",           unit: "%",   periodRequired: true,  fmpField: "revenueGrowth",         description: "Year-over-year revenue growth rate" },
  { key: "FG_EBITDA_YOY", name: "EBITDA Growth YoY",        category: "growth",           unit: "%",   periodRequired: true,  fmpField: "ebitgrowth",            description: "Year-over-year EBITDA growth rate" },
  { key: "FG_EPS_YOY",    name: "EPS Growth YoY",           category: "growth",           unit: "%",   periodRequired: true,  fmpField: "epsgrowth",             description: "Year-over-year diluted EPS growth" },
  { key: "FG_FCF_YOY",    name: "FCF Growth YoY",           category: "growth",           unit: "%",   periodRequired: true,  fmpField: "freeCashFlowGrowth",    description: "Year-over-year free cash flow growth" },

  // ── Estimates ───────────────────────────────────────────────────────────────
  { key: "FE_REV_EST",    name: "Revenue Estimate",         category: "estimates",        unit: "USD", periodRequired: true,  fmpField: "revenueAvg",            description: "Consensus analyst revenue estimate" },
  { key: "FE_EBITDA_EST", name: "EBITDA Estimate",          category: "estimates",        unit: "USD", periodRequired: true,  fmpField: "ebitdaAvg",             description: "Consensus analyst EBITDA estimate" },
  { key: "FE_EPS_EST",    name: "EPS Estimate",             category: "estimates",        unit: "USD", periodRequired: true,  fmpField: "epsAvg",                description: "Consensus analyst EPS estimate" },
  { key: "FE_PT",         name: "Price Target",             category: "estimates",        unit: "USD", periodRequired: false, fmpField: "targetConsensus",       description: "Analyst consensus 12-month price target" },
  { key: "FE_PT_HIGH",    name: "Price Target High",        category: "estimates",        unit: "USD", periodRequired: false, fmpField: "targetHigh",            description: "Highest analyst price target" },
  { key: "FE_PT_LOW",     name: "Price Target Low",         category: "estimates",        unit: "USD", periodRequired: false, fmpField: "targetLow",             description: "Lowest analyst price target" },

  // ── Ratios ──────────────────────────────────────────────────────────────────
  { key: "FR_ROE",        name: "Return on Equity",         category: "ratios",           unit: "%",   periodRequired: true,  fmpField: "returnOnEquity",        description: "Net income / average shareholders equity" },
  { key: "FR_ROA",        name: "Return on Assets",         category: "ratios",           unit: "%",   periodRequired: true,  fmpField: "returnOnAssets",        description: "Net income / average total assets" },
  { key: "FR_ROIC",       name: "Return on Invested Capital", category: "ratios",         unit: "%",   periodRequired: true,  fmpField: "returnOnCapitalEmployed", description: "NOPAT / invested capital" },
  { key: "FR_CURRENT",    name: "Current Ratio",            category: "ratios",           unit: "ratio", periodRequired: true, fmpField: "currentRatio",          description: "Current assets / current liabilities" },
  { key: "FR_QUICK",      name: "Quick Ratio",              category: "ratios",           unit: "ratio", periodRequired: true, fmpField: "quickRatio",            description: "(Cash + receivables) / current liabilities" },
  { key: "FR_DEBT_EQ",    name: "Debt / Equity",            category: "ratios",           unit: "ratio", periodRequired: true, fmpField: "debtEquityRatio",       description: "Total debt / total shareholders equity" },

  // ── Dividends ───────────────────────────────────────────────────────────────
  { key: "FD_DPS",        name: "Dividends Per Share",      category: "dividends",        unit: "USD", periodRequired: true,  fmpField: "dividendsPerShare",     description: "Cash dividends per share declared" },
  { key: "FD_YIELD",      name: "Dividend Yield",           category: "dividends",        unit: "%",   periodRequired: false, fmpField: "dividendYield",         description: "Annual dividend / current price" },
  { key: "FD_PAYOUT",     name: "Payout Ratio",             category: "dividends",        unit: "%",   periodRequired: true,  fmpField: "payoutRatio",           description: "Dividends paid / net income" },
]

export async function GET() {
  const grouped = FQL_CATALOG.reduce<Record<string, FqlMetric[]>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = []
    acc[m.category].push(m)
    return acc
  }, {})

  return NextResponse.json({
    total: FQL_CATALOG.length,
    syntax: "=FQL(\"<mnemonic>\", \"<ticker>\", \"<period>\", <offset>)",
    periods: { A: "Annual", Q: "Quarterly (most recent)", LTM: "Last Twelve Months", NTM: "Next Twelve Months" },
    catalog: grouped,
    flat: FQL_CATALOG,
  })
}
