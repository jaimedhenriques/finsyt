// Sector-aware KPI taxonomy. Maps the FMP sector / industry strings to a
// curated set of KPIs an analyst would actually look at for that vertical.
//
// We deliberately *do not* fabricate sub-KPIs we cannot derive from the
// public data (e.g. NIM for banks, AFFO for REITs). Where the underlying
// metric is not exposed by the standard FMP statements we still include the
// label so the taxonomy is visible, but we surface "—" so the user knows
// the field is unmapped rather than zero.

export type KpiResult = { label: string; display: string | null; hint?: string }
export type KpiBundle = {
  sector: string
  industry: string | null
  kpiSet: string
  kpis: KpiResult[]
}

export type FinancialBundle = {
  keyMetrics: any[]   // /stable/key-metrics rows, sorted newest-first
  ratios:     any[]   // /stable/ratios rows, sorted newest-first
  growth:     any[]   // /stable/financial-growth rows, sorted newest-first
  income:     any[]   // /stable/income-statement rows, sorted newest-first
}

// ── tiny formatters (no external deps) ──────────────────────────────────────
const isNum = (v: any) => v != null && v !== '' && typeof Number(v) === 'number' && isFinite(Number(v))
const num   = (v: any): number | null => isNum(v) ? Number(v) : null
const pct   = (v: any): string | null => { const n = num(v); return n == null ? null : (n * 100).toFixed(1) + '%' }
const pctRaw = (v: any): string | null => { const n = num(v); return n == null ? null : n.toFixed(1) + '%' }
const xMul  = (v: any): string | null => { const n = num(v); return n == null ? null : n.toFixed(2) + 'x' }
const ratio = (a: any, b: any): string | null => {
  const x = num(a), y = num(b)
  if (x == null || y == null || y === 0) return null
  return ((x / y) * 100).toFixed(1) + '%'
}
const big = (v: any): string | null => {
  const n = num(v); if (n == null) return null
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9)  return (n / 1e9).toFixed(2)  + 'B'
  if (abs >= 1e6)  return (n / 1e6).toFixed(1)  + 'M'
  return n.toLocaleString()
}

// ── sector → kpi-set resolution ─────────────────────────────────────────────
// Sector strings come from FMP /stable/profile.sector. We normalise to the
// internal kpiSet identifier used to pick the builder below.
export function sectorToKpiSet(sector?: string | null, industry?: string | null): string {
  const s = (sector || '').toLowerCase()
  const i = (industry || '').toLowerCase()
  if (/bank|insurance|capital markets|asset management/.test(i)) return 'Banks'
  if (/financial/.test(s)) return 'Financials'
  if (/reit|real estate/.test(s) || /reit/.test(i)) return 'REITs'
  if (/energy/.test(s) || /oil|gas|coal|petroleum/.test(i)) return 'Energy'
  if (/utilities/.test(s)) return 'Utilities'
  if (/health/.test(s) || /biotech|pharma|drug/.test(i)) return 'Healthcare'
  if (/technology/.test(s) || /software|saas|semiconductor|internet/.test(i)) return 'Tech'
  if (/communication/.test(s)) return 'Tech'
  if (/consumer/.test(s)) return 'Consumer'
  if (/industrial/.test(s)) return 'Industrials'
  if (/materials/.test(s)) return 'Materials'
  return 'Generic'
}

// ── per-set KPI builders ────────────────────────────────────────────────────
type Builder = (b: FinancialBundle) => KpiResult[]

// Generic helpers that operate on the latest year of each statement.
const latest = <T,>(arr: T[]): T | undefined => Array.isArray(arr) && arr.length ? arr[0] : undefined

const tech: Builder = (b) => {
  const km = latest(b.keyMetrics) || {}
  const rt = latest(b.ratios)     || {}
  const gr = latest(b.growth)     || {}
  const inc = latest(b.income)    || {}
  return [
    { label: 'Revenue Growth (YoY)', display: pct(gr.revenueGrowth) },
    { label: 'Gross Margin',         display: pct(rt.grossProfitMargin) },
    { label: 'Operating Margin',     display: pct(rt.operatingProfitMargin) },
    { label: 'R&D / Revenue',        display: ratio(inc.researchAndDevelopmentExpenses, inc.revenue) },
    { label: 'SG&A / Revenue',       display: ratio(inc.sellingGeneralAndAdministrativeExpenses, inc.revenue) },
    { label: 'FCF Margin',           display: ratio(inc.freeCashFlow, inc.revenue) },
    { label: 'ROIC',                 display: pct(km.roic ?? km.returnOnInvestedCapital) },
    { label: 'Rule of 40',           display: (() => {
      const rg = num(gr.revenueGrowth), om = num(rt.operatingProfitMargin)
      if (rg == null || om == null) return null
      return ((rg + om) * 100).toFixed(1)
    })(), hint: 'Revenue growth % + Op margin %' },
  ]
}

const banks: Builder = (b) => {
  const rt = latest(b.ratios)     || {}
  const km = latest(b.keyMetrics) || {}
  const gr = latest(b.growth)     || {}
  return [
    { label: 'Net Interest Margin', display: null,                     hint: 'Not exposed by FMP statements' },
    { label: 'Efficiency Ratio',    display: null,                     hint: 'Not exposed by FMP statements' },
    { label: 'NCO Ratio',           display: null,                     hint: 'Not exposed by FMP statements' },
    { label: 'CET1 Capital',        display: null,                     hint: 'Not exposed by FMP statements' },
    { label: 'ROE',                 display: pct(rt.returnOnEquity ?? km.roe) },
    { label: 'ROA',                 display: pct(rt.returnOnAssets ?? km.roa) },
    { label: 'Book Value / Share',  display: (() => { const v = num(km.bookValuePerShare); return v == null ? null : '$' + v.toFixed(2) })() },
    { label: 'Loan Growth (proxy)', display: pct(gr.revenueGrowth),    hint: 'Approx. via revenue growth' },
    { label: 'Dividend Yield',      display: pct(rt.dividendYield) },
    { label: 'Payout Ratio',        display: pct(rt.payoutRatio) },
  ]
}

const energy: Builder = (b) => {
  const km = latest(b.keyMetrics) || {}
  const rt = latest(b.ratios)     || {}
  const gr = latest(b.growth)     || {}
  return [
    { label: 'Production (BOE)',     display: null,                     hint: 'Not exposed by FMP standard statements' },
    { label: 'Lifting Cost',         display: null,                     hint: 'Not exposed by FMP standard statements' },
    { label: 'Revenue Growth (YoY)', display: pct(gr.revenueGrowth) },
    { label: 'Operating Margin',     display: pct(rt.operatingProfitMargin) },
    { label: 'FCF Yield',            display: pct(km.freeCashFlowYield) },
    { label: 'CapEx / Sales',        display: (() => {
      const inc = latest(b.income) || {}
      const cf = (inc as any).capitalExpenditure
      return ratio(cf != null ? Math.abs(Number(cf)) : null, inc.revenue)
    })() },
    { label: 'ROIC',                 display: pct(km.roic ?? km.returnOnInvestedCapital) },
    { label: 'Net Debt',             display: big((km as any).netDebtToEBITDA != null ? null : null) ?? big(km.netDebt) },
    { label: 'Debt / Equity',        display: xMul(rt.debtEquityRatio) },
    { label: 'Dividend Yield',       display: pct(rt.dividendYield) },
  ]
}

const consumer: Builder = (b) => {
  const km = latest(b.keyMetrics) || {}
  const rt = latest(b.ratios)     || {}
  const gr = latest(b.growth)     || {}
  return [
    { label: 'Comp Sales',          display: null,                     hint: 'Not exposed by FMP standard statements' },
    { label: 'Revenue Growth (YoY)', display: pct(gr.revenueGrowth) },
    { label: 'Gross Margin',         display: pct(rt.grossProfitMargin) },
    { label: 'Operating Margin',     display: pct(rt.operatingProfitMargin) },
    { label: 'Inventory Days',       display: (() => { const v = num(rt.daysOfInventoryOnHand); return v == null ? null : v.toFixed(0) })() },
    { label: 'Receivable Days',      display: (() => { const v = num(rt.daysOfSalesOutstanding); return v == null ? null : v.toFixed(0) })() },
    { label: 'ROIC',                 display: pct(km.roic ?? km.returnOnInvestedCapital) },
    { label: 'FCF Yield',            display: pct(km.freeCashFlowYield) },
    { label: 'Dividend Yield',       display: pct(rt.dividendYield) },
  ]
}

const industrials: Builder = (b) => {
  const km = latest(b.keyMetrics) || {}
  const rt = latest(b.ratios)     || {}
  const gr = latest(b.growth)     || {}
  return [
    { label: 'Revenue Growth (YoY)', display: pct(gr.revenueGrowth) },
    { label: 'Gross Margin',         display: pct(rt.grossProfitMargin) },
    { label: 'Operating Margin',     display: pct(rt.operatingProfitMargin) },
    { label: 'Working Capital',      display: big(km.workingCapital) },
    { label: 'CapEx Intensity',      display: (() => {
      const inc = latest(b.income) || {}
      const cf = (inc as any).capitalExpenditure
      return ratio(cf != null ? Math.abs(Number(cf)) : null, inc.revenue)
    })() },
    { label: 'ROIC',                 display: pct(km.roic ?? km.returnOnInvestedCapital) },
    { label: 'Asset Turnover',       display: xMul(rt.assetTurnover) },
    { label: 'FCF Yield',            display: pct(km.freeCashFlowYield) },
  ]
}

const healthcare: Builder = (b) => {
  const km = latest(b.keyMetrics) || {}
  const rt = latest(b.ratios)     || {}
  const gr = latest(b.growth)     || {}
  const inc = latest(b.income)    || {}
  return [
    { label: 'Revenue Growth (YoY)', display: pct(gr.revenueGrowth) },
    { label: 'R&D / Revenue',        display: ratio(inc.researchAndDevelopmentExpenses, inc.revenue) },
    { label: 'Gross Margin',         display: pct(rt.grossProfitMargin) },
    { label: 'Operating Margin',     display: pct(rt.operatingProfitMargin) },
    { label: 'ROIC',                 display: pct(km.roic ?? km.returnOnInvestedCapital) },
    { label: 'FCF Margin',           display: ratio(inc.freeCashFlow, inc.revenue) },
    { label: 'Net Debt / EBITDA',    display: xMul((km as any).netDebtToEBITDA) },
    { label: 'Dividend Yield',       display: pct(rt.dividendYield) },
  ]
}

const reits: Builder = (b) => {
  const rt = latest(b.ratios)     || {}
  const km = latest(b.keyMetrics) || {}
  return [
    { label: 'AFFO / Share',     display: null, hint: 'Not exposed by FMP standard statements' },
    { label: 'NAV / Share',      display: null, hint: 'Not exposed by FMP standard statements' },
    { label: 'Occupancy',        display: null, hint: 'Not exposed by FMP standard statements' },
    { label: 'Dividend Yield',   display: pct(rt.dividendYield) },
    { label: 'Payout Ratio',     display: pct(rt.payoutRatio) },
    { label: 'P / FFO (proxy)',  display: xMul(rt.priceCashFlowRatio), hint: 'Using P/CF as proxy' },
    { label: 'Debt / Equity',    display: xMul(rt.debtEquityRatio) },
    { label: 'ROE',              display: pct(rt.returnOnEquity ?? km.roe) },
  ]
}

const utilities: Builder = (b) => {
  const rt = latest(b.ratios)     || {}
  const km = latest(b.keyMetrics) || {}
  const gr = latest(b.growth)     || {}
  return [
    { label: 'Rate Base',           display: null, hint: 'Not exposed by FMP standard statements' },
    { label: 'Revenue Growth (YoY)', display: pct(gr.revenueGrowth) },
    { label: 'Operating Margin',    display: pct(rt.operatingProfitMargin) },
    { label: 'ROE',                 display: pct(rt.returnOnEquity ?? km.roe) },
    { label: 'Dividend Yield',      display: pct(rt.dividendYield) },
    { label: 'Payout Ratio',        display: pct(rt.payoutRatio) },
    { label: 'Debt / Equity',       display: xMul(rt.debtEquityRatio) },
    { label: 'Interest Coverage',   display: xMul(rt.interestCoverage) },
  ]
}

const generic: Builder = (b) => {
  const km = latest(b.keyMetrics) || {}
  const rt = latest(b.ratios)     || {}
  const gr = latest(b.growth)     || {}
  return [
    { label: 'Revenue Growth (YoY)', display: pct(gr.revenueGrowth) },
    { label: 'Gross Margin',         display: pct(rt.grossProfitMargin) },
    { label: 'Operating Margin',     display: pct(rt.operatingProfitMargin) },
    { label: 'Net Margin',           display: pct(rt.netProfitMargin) },
    { label: 'ROIC',                 display: pct(km.roic ?? km.returnOnInvestedCapital) },
    { label: 'ROE',                  display: pct(rt.returnOnEquity ?? km.roe) },
    { label: 'FCF Yield',            display: pct(km.freeCashFlowYield) },
    { label: 'Dividend Yield',       display: pct(rt.dividendYield) },
  ]
}

const BUILDERS: Record<string, Builder> = {
  Tech:        tech,
  Banks:       banks,
  Financials:  banks,
  Energy:      energy,
  Consumer:    consumer,
  Industrials: industrials,
  Healthcare:  healthcare,
  REITs:       reits,
  Utilities:   utilities,
  Materials:   industrials,
  Generic:     generic,
}

export function buildKpis(
  sector: string | null | undefined,
  industry: string | null | undefined,
  data: FinancialBundle,
): KpiBundle {
  const kpiSet = sectorToKpiSet(sector, industry)
  const builder = BUILDERS[kpiSet] || BUILDERS.Generic
  return {
    sector:   sector || 'Unknown',
    industry: industry ?? null,
    kpiSet,
    kpis:     builder(data),
  }
}

// Re-export for tests / local consumers
export const __internal = { latest, num, pct, pctRaw, xMul, ratio, big }
