import { NextResponse } from "next/server"

// Full Finsyt metric catalog — maps our keys to CIQ mnemonics + EODHD fields
// This powers the Formula Engine and the /api/financials endpoint
const CATALOG = [
  // INCOME STATEMENT
  { key: "iq_total_rev",    ciq: "IQ_TOTAL_REV",    name: "Total Revenue",          cat: "income_statement", unit: "USD" },
  { key: "iq_gross_profit", ciq: "IQ_GROSS_PROFIT",  name: "Gross Profit",           cat: "income_statement", unit: "USD" },
  { key: "iq_gross_profit_margin", ciq: "IQ_GROSS_PROFIT_MARGIN", name: "Gross Margin %", cat: "income_statement", unit: "%" },
  { key: "iq_ebitda",       ciq: "IQ_EBITDA",        name: "EBITDA",                 cat: "income_statement", unit: "USD" },
  { key: "iq_ebitda_margin",ciq: "IQ_EBITDA_MARGIN", name: "EBITDA Margin %",        cat: "income_statement", unit: "%" },
  { key: "iq_ebit",         ciq: "IQ_EBIT",          name: "EBIT",                   cat: "income_statement", unit: "USD" },
  { key: "iq_ebit_margin",  ciq: "IQ_EBIT_MARGIN",   name: "EBIT Margin %",          cat: "income_statement", unit: "%" },
  { key: "iq_net_inc",      ciq: "IQ_NET_INC",       name: "Net Income",             cat: "income_statement", unit: "USD" },
  { key: "iq_eps_diluted",  ciq: "IQ_EPS_DILUTED",   name: "Diluted EPS",            cat: "income_statement", unit: "USD" },
  { key: "iq_sga",          ciq: "IQ_SGA",           name: "SG&A Expense",           cat: "income_statement", unit: "USD" },
  { key: "iq_rd_exp",       ciq: "IQ_RD_EXP",        name: "R&D Expense",            cat: "income_statement", unit: "USD" },
  { key: "iq_da_suppl",     ciq: "IQ_DA_SUPPL",      name: "D&A",                    cat: "income_statement", unit: "USD" },
  { key: "iq_int_exp",      ciq: "IQ_INT_EXP",       name: "Interest Expense",       cat: "income_statement", unit: "USD" },
  // BALANCE SHEET
  { key: "iq_total_assets", ciq: "IQ_TOTAL_ASSETS",  name: "Total Assets",           cat: "balance_sheet",    unit: "USD" },
  { key: "iq_cash_equiv",   ciq: "IQ_CASH_EQUIV",    name: "Cash & Equivalents",     cat: "balance_sheet",    unit: "USD" },
  { key: "iq_total_debt",   ciq: "IQ_TOTAL_DEBT",    name: "Total Debt",             cat: "balance_sheet",    unit: "USD" },
  { key: "iq_net_debt",     ciq: "IQ_NET_DEBT",      name: "Net Debt",               cat: "balance_sheet",    unit: "USD" },
  { key: "iq_total_equity", ciq: "IQ_TOTAL_EQUITY",  name: "Total Equity",           cat: "balance_sheet",    unit: "USD" },
  { key: "iq_lt_debt",      ciq: "IQ_LT_DEBT",       name: "Long-Term Debt",         cat: "balance_sheet",    unit: "USD" },
  { key: "iq_book_val_share",ciq:"IQ_BOOK_VAL_SHARE",name: "Book Value Per Share",   cat: "balance_sheet",    unit: "USD" },
  // CASH FLOW
  { key: "iq_net_cash_ops", ciq: "IQ_NET_CASH_OPS",  name: "Operating Cash Flow",    cat: "cash_flow",        unit: "USD" },
  { key: "iq_capex",        ciq: "IQ_CAPEX",         name: "Capital Expenditure",    cat: "cash_flow",        unit: "USD" },
  { key: "iq_free_cash_flow",ciq:"IQ_FREE_CASH_FLOW",name: "Free Cash Flow",         cat: "cash_flow",        unit: "USD" },
  // VALUATION
  { key: "iq_marketcap",    ciq: "IQ_MARKETCAP",     name: "Market Cap",             cat: "valuation",        unit: "USD" },
  { key: "iq_tev",          ciq: "IQ_TEV",           name: "Enterprise Value",       cat: "valuation",        unit: "USD" },
  { key: "iq_tev_ebitda",   ciq: "IQ_TEV_EBITDA",   name: "EV / EBITDA",            cat: "valuation",        unit: "x" },
  { key: "iq_pe_excl",      ciq: "IQ_PE_EXCL",       name: "P/E Ratio",              cat: "valuation",        unit: "x" },
  { key: "iq_tev_rev",      ciq: "IQ_TEV_REV",       name: "EV / Revenue",           cat: "valuation",        unit: "x" },
  { key: "iq_pb",           ciq: "IQ_PB",            name: "P/B Ratio",              cat: "valuation",        unit: "x" },
  { key: "iq_ps",           ciq: "IQ_PS",            name: "P/S Ratio",              cat: "valuation",        unit: "x" },
  { key: "iq_div_yield",    ciq: "IQ_DIV_YIELD",     name: "Dividend Yield",         cat: "valuation",        unit: "%" },
  // ESTIMATES
  { key: "iq_eps_agg_est",  ciq: "IQ_EPS_AGG_EST",  name: "EPS Estimate (consensus)",cat: "estimates",       unit: "USD" },
  { key: "iq_total_rev_agg_est", ciq: "IQ_TOTAL_REV_AGG_EST", name: "Revenue Estimate",cat: "estimates",     unit: "USD" },
]

export async function GET() {
  const grouped = CATALOG.reduce((acc, m) => {
    if (!acc[m.cat]) acc[m.cat] = []
    acc[m.cat].push(m)
    return acc
  }, {} as Record<string, typeof CATALOG>)

  return NextResponse.json({
    total: CATALOG.length,
    usage: "GET /api/financials?symbol=AAPL&metric=iq_total_rev&period=A&offset=0",
    batch_usage: "GET /api/financials?symbol=AAPL&metrics=iq_total_rev,iq_ebitda,iq_net_inc&period=A",
    periods: { A: "Annual", Q: "Quarterly", LTM: "Last Twelve Months" },
    catalog: grouped,
  })
}
