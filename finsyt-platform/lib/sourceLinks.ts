/**
 * sourceLinks.ts
 *
 * The auditability layer — maps every financial metric to its source filing.
 * This is Finsyt's equivalent of Daloopa's source-linked data points.
 *
 * Usage:
 *   import { buildSourceLink, formatCitation } from '@/lib/sourceLinks'
 *
 *   const link = buildSourceLink({
 *     metric: 'revenue',
 *     value: 39_330_000_000,
 *     period: 'Q4 2025',
 *     filingUrl: 'https://www.sec.gov/Archives/edgar/.../aapl-20251228.htm',
 *     formType: '10-K',
 *     filedAt: '2026-02-03',
 *     section: '8',  // Financial Statements
 *   })
 */

export interface SourceLink {
  metric:     string       // e.g. 'revenue', 'grossMargin', 'eps'
  value:      number | string
  period:     string       // e.g. 'Q4 2025', 'FY 2025'
  filingUrl:  string       // Direct EDGAR URL
  formType:   string       // '10-K', '10-Q', '8-K'
  filedAt:    string       // ISO date
  section?:   string       // Item number (e.g. '8', '2.02')
  sectionLabel?: string    // Human label (e.g. 'Financial Statements')
  companyName?: string
  ticker?:    string
}

export function buildSourceLink(data: Partial<SourceLink>): SourceLink {
  return {
    metric:       data.metric || 'unknown',
    value:        data.value ?? 0,
    period:       data.period || '',
    filingUrl:    data.filingUrl || '',
    formType:     data.formType || '',
    filedAt:      data.filedAt || '',
    section:      data.section,
    sectionLabel: data.sectionLabel || getSectionLabel(data.formType || '', data.section || ''),
    companyName:  data.companyName,
    ticker:       data.ticker,
  }
}

/**
 * Returns a human-readable citation string.
 * e.g. "AAPL 10-K (Filed 2026-02-03) — Item 8: Financial Statements"
 */
export function formatCitation(link: SourceLink): string {
  const parts: string[] = []
  if (link.ticker)      parts.push(link.ticker)
  if (link.formType)    parts.push(link.formType)
  if (link.filedAt)     parts.push(`(Filed ${link.filedAt.split('T')[0]})`)
  if (link.sectionLabel) parts.push(`— ${link.sectionLabel}`)
  return parts.join(' ')
}

/**
 * Annotates an array of financial statement rows with source links.
 * Accepts FMP-format rows and enriches them with EDGAR filing URLs.
 */
export function annotateStatements(
  statements: any[],
  filings: Array<{ periodOfReport: string; filedAt: string; htmlUrl: string; formType: string; ticker?: string; companyName?: string }>,
  formType: '10-K' | '10-Q' = '10-Q'
): any[] {
  return statements.map(stmt => {
    // Match statement period to closest filing
    const matchedFiling = filings.find(f => {
      if (!f.periodOfReport) return false
      const filingPeriod = f.periodOfReport.substring(0, 7) // YYYY-MM
      const stmtPeriod = (stmt.date || '').substring(0, 7)
      return filingPeriod === stmtPeriod
    }) || filings[0]

    return {
      ...stmt,
      _source: matchedFiling ? {
        formType:    matchedFiling.formType || formType,
        filedAt:     matchedFiling.filedAt,
        edgarUrl:    matchedFiling.htmlUrl,
        ticker:      matchedFiling.ticker,
        companyName: matchedFiling.companyName,
        citation:    matchedFiling.ticker
          ? `${matchedFiling.ticker} ${matchedFiling.formType || formType} (Filed ${(matchedFiling.filedAt || '').split('T')[0]})`
          : undefined,
      } : null,
    }
  })
}

/**
 * Given a metric name, returns the most likely filing section where it appears.
 */
export function getMetricSection(metric: string): { section: string; formType: string } {
  const incomeMetrics = ['revenue', 'grossProfit', 'ebitda', 'operatingIncome', 'netIncome', 'eps', 'epsDiluted']
  const balanceMetrics = ['totalAssets', 'totalLiabilities', 'totalEquity', 'cash', 'longTermDebt', 'totalDebt']
  const cashflowMetrics = ['operatingCashflow', 'capex', 'freeCashflow', 'dividendsPaid', 'stockRepurchase']
  const kpiMetrics = ['dau', 'mau', 'arpu', 'gmv', 'subscribers', 'eps_non_gaap', 'guidance_revenue']

  if (incomeMetrics.includes(metric))  return { section: '8', formType: '10-K' }
  if (balanceMetrics.includes(metric)) return { section: '8', formType: '10-K' }
  if (cashflowMetrics.includes(metric)) return { section: '8', formType: '10-K' }
  if (kpiMetrics.includes(metric))     return { section: '2.02', formType: '8-K' }
  return { section: '7', formType: '10-K' }
}

function getSectionLabel(formType: string, section: string): string {
  const tenK: Record<string, string> = {
    '1': 'Business', '1A': 'Risk Factors', '7': "Management's Discussion & Analysis",
    '7A': 'Quantitative Market Risk', '8': 'Financial Statements', '9A': 'Controls & Procedures',
  }
  const eightK: Record<string, string> = {
    '2.02': 'Results of Operations (Press Release)', '5.02': 'Executive Changes', '1.01': 'Material Agreement',
  }
  if (formType === '8-K') return eightK[section] || `Item ${section}`
  return tenK[section] || `Item ${section}`
}
