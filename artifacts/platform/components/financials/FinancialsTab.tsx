'use client'
/**
 * FinancialsTab — replaces the inline financials block in the company page.
 *
 * Features:
 * - Standardized vs. as-reported presentation toggle
 * - Built-in prebuilt templates (Default, Banker Summary, Margins, Credit)
 * - Custom org-scoped templates persisted to /api/financial-templates
 * - Template builder: pick fields, reorder, add calculated rows and headers
 * - CSV export honours the active template's line items
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ── Types ────────────────────────────────────────────────────────────────────

export type StatementType = 'income' | 'balance' | 'cashflow'
export type Presentation  = 'standardized' | 'as-reported'
export type PeriodType    = 'annual' | 'quarterly'
/** Internal period display mode — LTM is computed from quarterly data, not fetched separately */
type DisplayPeriod = 'annual' | 'quarterly' | 'ltm'

type LineItemType = 'field' | 'calculated' | 'header' | 'spacer'

export interface TemplateLineItem {
  id: string
  type: LineItemType
  label: string
  key?: string
  operandA?: string
  operandB?: string
  operator?: '/' | '-' | '+' | '*'
  isPercent?: boolean
  isCurrency?: boolean
  isBold?: boolean
}

export interface FinancialTemplate {
  id: string
  name: string
  description: string
  isBuiltin: boolean
  /** 'all' means the template applies to whichever statement is active */
  statementType: StatementType | 'all'
  lineItems: TemplateLineItem[]
  periodLayout?: PeriodType
  numPeriods?: number
  presentation?: Presentation
  mine?: boolean
}

interface TemplateDto {
  id: string
  name: string
  description: string
  statementType: string
  presentation: string
  periodLayout: string
  numPeriods: number
  lineItems: TemplateLineItem[]
  authorUserId: string
  mine: boolean
  createdAt: string
  updatedAt: string
}

// ── Built-in templates ───────────────────────────────────────────────────────

const INCOME_FIELDS: [string, string][] = [
  ['Revenue',              'revenue'],
  ['Cost of Revenue',      'costOfRevenue'],
  ['Gross Profit',         'grossProfit'],
  ['Gross Margin %',       'grossProfitRatio'],
  ['Operating Expenses',   'operatingExpenses'],
  ['R&D',                  'researchAndDevelopmentExpenses'],
  ['SG&A',                 'sellingGeneralAndAdministrativeExpenses'],
  ['EBITDA',               'ebitda'],
  ['EBITDA Margin %',      'ebitdaratio'],
  ['EBIT / Op. Income',    'operatingIncome'],
  ['EBIT Margin %',        'operatingIncomeRatio'],
  ['Interest Expense',     'interestExpense'],
  ['Income Before Tax',    'incomeBeforeTax'],
  ['Income Tax',           'incomeTaxExpense'],
  ['Net Income',           'netIncome'],
  ['Net Margin %',         'netIncomeRatio'],
  ['EPS (Basic)',          'eps'],
  ['EPS (Diluted)',        'epsdiluted'],
  ['Shares (Diluted)',     'weightedAverageShsOutDil'],
]

const BALANCE_FIELDS: [string, string][] = [
  ['Cash & Equivalents',   'cashAndCashEquivalents'],
  ['Short-term Investments','shortTermInvestments'],
  ['Accounts Receivable',  'netReceivables'],
  ['Inventory',            'inventory'],
  ['Total Current Assets', 'totalCurrentAssets'],
  ['PP&E',                 'propertyPlantEquipmentNet'],
  ['Goodwill',             'goodwill'],
  ['Intangible Assets',    'intangibleAssets'],
  ['Total Assets',         'totalAssets'],
  ['Accounts Payable',     'accountPayables'],
  ['Short-term Debt',      'shortTermDebt'],
  ['Total Current Liabilities','totalCurrentLiabilities'],
  ['Long-term Debt',       'longTermDebt'],
  ['Total Liabilities',    'totalLiabilities'],
  ['Retained Earnings',    'retainedEarnings'],
  ['Total Equity',         'totalStockholdersEquity'],
  ['Net Debt',             'netDebt'],
]

const CASHFLOW_FIELDS: [string, string][] = [
  ['Net Income',           'netIncome'],
  ['Depreciation & Amort.','depreciationAndAmortization'],
  ['Stock-based Comp',     'stockBasedCompensation'],
  ['Change in Working Capital','changeInWorkingCapital'],
  ['Operating Cash Flow',  'operatingCashFlow'],
  ['CapEx',                'capitalExpenditure'],
  ['Acquisitions',         'acquisitionsNet'],
  ['Investing Cash Flow',  'netCashUsedForInvestingActivites'],
  ['Debt Issued/(Repaid)', 'debtRepayment'],
  ['Dividends Paid',       'dividendsPaid'],
  ['Share Buybacks',       'commonStockRepurchased'],
  ['Financing Cash Flow',  'netCashUsedProvidedByFinancingActivities'],
  ['Free Cash Flow',       'freeCashFlow'],
]

const ALL_FIELDS: Record<StatementType, [string, string][]> = {
  income:   INCOME_FIELDS,
  balance:  BALANCE_FIELDS,
  cashflow: CASHFLOW_FIELDS,
}

function fieldsToItems(fields: [string, string][]): TemplateLineItem[] {
  return fields.map(([label, key], i) => ({
    id: `f${i}`,
    type: 'field' as const,
    label,
    key,
    isPercent: /Margin|Ratio/.test(key) && /ratio/i.test(key),
    isCurrency: !/Ratio|ratio|epsd|eps$|weightedAvg|Shares/.test(key),
  }))
}

const BUILTIN_TEMPLATES: FinancialTemplate[] = [
  {
    id: 'builtin-default',
    name: 'Default',
    description: 'All standard line items for the active statement',
    isBuiltin: true,
    statementType: 'all',
    lineItems: [], // placeholder — uses ALL_FIELDS for the active statement
  },
  {
    id: 'builtin-banker',
    name: 'Banker Summary',
    description: 'Key P&L items for banking presentations',
    isBuiltin: true,
    statementType: 'income',
    lineItems: [
      { id: 'b1', type: 'header',     label: 'Revenue & Profitability' },
      { id: 'b2', type: 'field',      label: 'Revenue',          key: 'revenue',          isCurrency: true },
      { id: 'b3', type: 'field',      label: 'Gross Profit',     key: 'grossProfit',      isCurrency: true },
      { id: 'b4', type: 'field',      label: 'Gross Margin %',   key: 'grossProfitRatio', isPercent: true },
      { id: 'b5', type: 'field',      label: 'EBITDA',           key: 'ebitda',           isCurrency: true },
      { id: 'b6', type: 'field',      label: 'EBITDA Margin %',  key: 'ebitdaratio',      isPercent: true },
      { id: 'b7', type: 'field',      label: 'EBIT',             key: 'operatingIncome',  isCurrency: true },
      { id: 'b8', type: 'field',      label: 'EBIT Margin %',    key: 'operatingIncomeRatio', isPercent: true },
      { id: 'b9', type: 'spacer',     label: '' },
      { id: 'b10', type: 'header',    label: 'Bottom Line' },
      { id: 'b11', type: 'field',     label: 'Net Income',       key: 'netIncome',        isCurrency: true, isBold: true },
      { id: 'b12', type: 'field',     label: 'Net Margin %',     key: 'netIncomeRatio',   isPercent: true },
      { id: 'b13', type: 'field',     label: 'EPS (Diluted)',    key: 'epsdiluted' },
    ],
  },
  {
    id: 'builtin-margins',
    name: 'Margins Focused',
    description: 'Revenue, all margin lines, and R&D/SG&A spend',
    isBuiltin: true,
    statementType: 'income',
    lineItems: [
      { id: 'm1',  type: 'field',  label: 'Revenue',            key: 'revenue',                              isCurrency: true, isBold: true },
      { id: 'm2',  type: 'field',  label: 'Cost of Revenue',    key: 'costOfRevenue',                        isCurrency: true },
      { id: 'm3',  type: 'field',  label: 'Gross Profit',       key: 'grossProfit',                          isCurrency: true },
      { id: 'm4',  type: 'field',  label: 'Gross Margin %',     key: 'grossProfitRatio',                     isPercent: true },
      { id: 'm5',  type: 'spacer', label: '' },
      { id: 'm6',  type: 'field',  label: 'R&D',                key: 'researchAndDevelopmentExpenses',        isCurrency: true },
      { id: 'm7',  type: 'calculated', label: 'R&D % Revenue', operandA: 'researchAndDevelopmentExpenses', operandB: 'revenue', operator: '/', isPercent: true },
      { id: 'm8',  type: 'field',  label: 'SG&A',               key: 'sellingGeneralAndAdministrativeExpenses', isCurrency: true },
      { id: 'm9',  type: 'calculated', label: 'SG&A % Revenue', operandA: 'sellingGeneralAndAdministrativeExpenses', operandB: 'revenue', operator: '/', isPercent: true },
      { id: 'm10', type: 'spacer', label: '' },
      { id: 'm11', type: 'field',  label: 'EBITDA',             key: 'ebitda',                               isCurrency: true },
      { id: 'm12', type: 'field',  label: 'EBITDA Margin %',    key: 'ebitdaratio',                          isPercent: true },
      { id: 'm13', type: 'field',  label: 'EBIT',               key: 'operatingIncome',                      isCurrency: true },
      { id: 'm14', type: 'field',  label: 'EBIT Margin %',      key: 'operatingIncomeRatio',                 isPercent: true },
      { id: 'm15', type: 'field',  label: 'Net Income',         key: 'netIncome',                            isCurrency: true, isBold: true },
      { id: 'm16', type: 'field',  label: 'Net Margin %',       key: 'netIncomeRatio',                       isPercent: true },
    ],
  },
  {
    id: 'builtin-credit',
    name: 'Credit Analyst',
    description: 'Balance sheet, leverage, and liquidity metrics',
    isBuiltin: true,
    statementType: 'balance',
    lineItems: [
      { id: 'c1',  type: 'header', label: 'Liquidity' },
      { id: 'c2',  type: 'field',  label: 'Cash & Equivalents',    key: 'cashAndCashEquivalents',  isCurrency: true },
      { id: 'c3',  type: 'field',  label: 'Short-term Investments', key: 'shortTermInvestments',    isCurrency: true },
      { id: 'c4',  type: 'field',  label: 'Total Current Assets',  key: 'totalCurrentAssets',      isCurrency: true },
      { id: 'c5',  type: 'field',  label: 'Total Current Liab.',   key: 'totalCurrentLiabilities', isCurrency: true },
      { id: 'c6',  type: 'spacer', label: '' },
      { id: 'c7',  type: 'header', label: 'Capital Structure' },
      { id: 'c8',  type: 'field',  label: 'Short-term Debt',       key: 'shortTermDebt',           isCurrency: true },
      { id: 'c9',  type: 'field',  label: 'Long-term Debt',        key: 'longTermDebt',            isCurrency: true, isBold: true },
      { id: 'c10', type: 'field',  label: 'Total Debt',            key: 'totalDebt',               isCurrency: true },
      { id: 'c11', type: 'field',  label: 'Net Debt',              key: 'netDebt',                 isCurrency: true },
      { id: 'c12', type: 'field',  label: 'Total Assets',          key: 'totalAssets',             isCurrency: true },
      { id: 'c13', type: 'field',  label: 'Total Equity',          key: 'totalStockholdersEquity', isCurrency: true, isBold: true },
    ],
  },
  {
    id: 'builtin-fcf',
    name: 'FCF Focus',
    description: 'Cash generation and capital allocation',
    isBuiltin: true,
    statementType: 'cashflow',
    lineItems: [
      { id: 'fc1',  type: 'header', label: 'Operating' },
      { id: 'fc2',  type: 'field',  label: 'Operating Cash Flow', key: 'operatingCashFlow',   isCurrency: true, isBold: true },
      { id: 'fc3',  type: 'field',  label: 'Net Income',          key: 'netIncome',            isCurrency: true },
      { id: 'fc4',  type: 'field',  label: 'D&A',                 key: 'depreciationAndAmortization', isCurrency: true },
      { id: 'fc5',  type: 'field',  label: 'SBC',                 key: 'stockBasedCompensation', isCurrency: true },
      { id: 'fc6',  type: 'spacer', label: '' },
      { id: 'fc7',  type: 'header', label: 'Capital Allocation' },
      { id: 'fc8',  type: 'field',  label: 'CapEx',               key: 'capitalExpenditure',   isCurrency: true },
      { id: 'fc9',  type: 'field',  label: 'Free Cash Flow',      key: 'freeCashFlow',         isCurrency: true, isBold: true },
      { id: 'fc10', type: 'field',  label: 'Dividends Paid',      key: 'dividendsPaid',        isCurrency: true },
      { id: 'fc11', type: 'field',  label: 'Share Buybacks',      key: 'commonStockRepurchased', isCurrency: true },
    ],
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtB(n: any) {
  if (!n) return '—'
  const v = Number(n)
  if (!isFinite(v)) return '—'
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(0) + 'M'
  return '$' + v.toLocaleString()
}

function fmtCell(v: any, item: TemplateLineItem): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!isFinite(n)) return '—'
  if (item.isPercent) {
    const pct = Math.abs(n) <= 1.5 ? n * 100 : n
    return pct.toFixed(1) + '%'
  }
  if (item.key === 'eps' || item.key === 'epsdiluted') return n.toFixed(2)
  if (item.key === 'weightedAverageShsOutDil') {
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B'
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(0) + 'M'
    return n.toLocaleString()
  }
  return fmtB(v)
}

function calcCell(row: any, item: TemplateLineItem): number | null {
  if (!item.operandA || !item.operandB || !item.operator) return null
  const a = Number(row[item.operandA])
  const b = Number(row[item.operandB])
  if (!isFinite(a) || !isFinite(b)) return null
  if (item.operator === '/' && b === 0) return null
  const ops: Record<string, (a: number, b: number) => number> = { '/': (a, b) => a / b, '-': (a, b) => a - b, '+': (a, b) => a + b, '*': (a, b) => a * b }
  return ops[item.operator]!(a, b)
}

function fmtCalcCell(val: number | null, item: TemplateLineItem): string {
  if (val == null) return '—'
  if (item.isPercent) return (val * 100).toFixed(1) + '%'
  return fmtB(val)
}

const PCT_NATIVE = new Set(['grossProfitRatio', 'ebitdaratio', 'operatingIncomeRatio', 'netIncomeRatio'])

function fmtRaw(v: any, key: string): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!isFinite(n)) return String(v)
  if (PCT_NATIVE.has(key)) return (n * 100).toFixed(1) + '%'
  return fmtB(v)
}

function colLabel(r: any, period: PeriodType): string {
  if (period === 'quarterly') {
    const p  = r.period || ''
    const yr = r.calendarYear || r.fiscalYear || (r.date ? String(r.date).slice(2, 4) : '')
    return p ? `${p} '${yr}` : (r.date ? String(r.date).slice(0, 7) : '—')
  }
  return r.calendarYear || r.fiscalYear || r.year || (r.date ? String(r.date).slice(0, 4) : '—')
}

function yoy(latest: any, prior: any): number | null {
  const a = Number(latest), b = Number(prior)
  if (!isFinite(a) || !isFinite(b) || b === 0) return null
  return ((a - b) / Math.abs(b)) * 100
}

const LAST_TEMPLATE_KEY = 'finsyt:fin-template-id'

// ── LTM computation ───────────────────────────────────────────────────────────
// LTM = trailing 12 months, computed from the 4 most recent quarterly rows.
// Income / cashflow items are summed; balance sheet items use the latest quarter.
// Ratio/margin fields are averaged instead of summed.

const LTM_RATIO_PATTERN = /ratio|Ratio|margin|Margin/
const LTM_SKIP = new Set(['date', 'symbol', 'period', 'calendarYear', 'fiscalYear', 'cik', 'fillingDate', 'acceptedDate', 'reportedCurrency'])

function computeLtmRow(quarterlyRows: any[], stmtType: StatementType): any | null {
  const sorted = [...quarterlyRows]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 4)
  if (sorted.length === 0) return null
  // Balance sheet is point-in-time — use most recent quarter
  if (stmtType === 'balance') {
    return { ...sorted[0], calendarYear: 'LTM', period: 'LTM', date: 'LTM' }
  }
  // Flow statements: aggregate over 4 quarters
  const result: any = { calendarYear: 'LTM', period: 'LTM', date: 'LTM' }
  const allKeys = new Set(sorted.flatMap(r => Object.keys(r)))
  allKeys.forEach(key => {
    if (LTM_SKIP.has(key)) return
    const vals = sorted.map(r => Number(r[key])).filter(v => isFinite(v))
    if (!vals.length) return
    if (LTM_RATIO_PATTERN.test(key)) {
      result[key] = vals.reduce((s, v) => s + v, 0) / vals.length
    } else {
      result[key] = vals.reduce((s, v) => s + v, 0)
    }
  })
  return result
}

function Sparkline({ values }: { values: number[] }) {
  const nums = values.map(v => Number(v)).filter(v => isFinite(v))
  if (nums.length < 2) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
  const min = Math.min(...nums), max = Math.max(...nums)
  const span = max - min || 1
  const W = 64, H = 18
  const step = W / (nums.length - 1)
  const pts = nums.map((v, i) => `${(i * step).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`).join(' ')
  const trend = nums[nums.length - 1] >= nums[0]
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <polyline fill="none" strokeWidth={1.5} stroke={trend ? 'var(--pos)' : 'var(--neg)'} points={pts} />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  symbol: string
  financials: any
  period: PeriodType
  setPeriod: (p: PeriodType) => void
  finTab: StatementType
  setFinTab: (t: StatementType) => void
  periodLoading: boolean
  keyMetrics: any[]
  ratios: any[]
  growth: any[]
  segments: { product: any[]; geographic: any[] }
  industryKpis: any
  drillRow: any
  setDrillRow: (row: any) => void
}

export default function FinancialsTab({
  symbol, financials, period, setPeriod, finTab, setFinTab,
  periodLoading, keyMetrics, ratios, growth, segments, industryKpis,
  drillRow, setDrillRow,
}: Props) {
  const [customTemplates, setCustomTemplates] = useState<TemplateDto[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('builtin-default')
  const [presentation, setPresentation] = useState<Presentation>('standardized')
  const [displayPeriod, setDisplayPeriod] = useState<DisplayPeriod>(period)
  const [asReportedData, setAsReportedData] = useState<Record<string, any[]>>({})
  const [asReportedLoading, setAsReportedLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<FinancialTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Restore last-used template from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_TEMPLATE_KEY)
      if (saved) setSelectedTemplateId(saved)
    } catch { /* ignore */ }
  }, [])

  // Load custom templates
  useEffect(() => {
    fetch(`${BASE}/api/financial-templates`)
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(d => { setCustomTemplates(d.templates ?? []); setTemplatesLoaded(true) })
      .catch(() => setTemplatesLoaded(true))
  }, [])

  // Close picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch as-reported data when toggled
  useEffect(() => {
    if (presentation !== 'as-reported') return
    const p = period === 'quarterly' ? 'quarter' : 'annual'
    const cacheKey = `${finTab}:${p}`
    if (asReportedData[cacheKey]?.length) return
    const EP: Record<StatementType, string> = {
      income:   'income-statement-as-reported',
      balance:  'balance-sheet-statement-as-reported',
      cashflow: 'cash-flow-statement-as-reported',
    }
    setAsReportedLoading(true)
    fetch(`${BASE}/api/financials/statements?symbol=${symbol}&statement=${EP[finTab]}&period=${p}&limit=8`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(d => {
        setAsReportedData(prev => ({ ...prev, [cacheKey]: d?.rows || [] }))
      })
      .catch(() => {})
      .finally(() => setAsReportedLoading(false))
  }, [presentation, finTab, symbol, period])

  function selectTemplate(id: string) {
    setSelectedTemplateId(id)
    try { localStorage.setItem(LAST_TEMPLATE_KEY, id) } catch { /* ignore */ }
    setShowPicker(false)

    // Apply template's saved period layout and presentation preference
    const custom = customTemplates.find(t => t.id === id)
    if (custom) {
      const tplAny = custom as any
      if (tplAny.presentation && (tplAny.presentation === 'standardized' || tplAny.presentation === 'as-reported')) {
        setPresentation(tplAny.presentation as Presentation)
      }
      if (tplAny.periodLayout) {
        const layout = tplAny.periodLayout as DisplayPeriod
        setDisplayPeriod(layout)
        if (layout === 'ltm' || layout === 'quarterly') {
          setPeriod('quarterly')
        } else {
          setPeriod('annual')
        }
      }
    }
  }

  // Resolve the active template's line items for the current statement
  function resolveActiveItems(): TemplateLineItem[] | null {
    if (selectedTemplateId === 'builtin-default') return null // use default cols

    const builtin = BUILTIN_TEMPLATES.find(t => t.id === selectedTemplateId)
    if (builtin) return builtin.lineItems

    const custom = customTemplates.find(t => t.id === selectedTemplateId)
    if (custom) return custom.lineItems as TemplateLineItem[]

    return null
  }

  const activeItems = resolveActiveItems()
  const activeTemplate =
    BUILTIN_TEMPLATES.find(t => t.id === selectedTemplateId) ||
    customTemplates.find(t => t.id === selectedTemplateId)

  // Build the data rows — for LTM, compute a single synthetic row from quarterly data
  const allRows: any[] = (financials?.[finTab]?.[period] || []) as any[]
  const maxCols = displayPeriod === 'annual' ? 5 : 8
  const tplNumPeriods = (activeTemplate && !(activeTemplate as any).isBuiltin)
    ? Math.min((activeTemplate as any).numPeriods ?? 5, maxCols)
    : maxCols

  let dataRows: any[]
  if (displayPeriod === 'ltm') {
    // Use quarterly rows for the LTM computation; show as a single "LTM" column
    const qRows = (financials?.[finTab]?.quarterly || []) as any[]
    const ltmRow = computeLtmRow(qRows, finTab)
    dataRows = ltmRow ? [ltmRow] : []
  } else {
    dataRows = [...allRows]
      .sort((a, b) => String(b.date || b.calendarYear || b.year || '').localeCompare(String(a.date || a.calendarYear || a.year || '')))
      .slice(0, tplNumPeriods)
      .reverse()
  }
  const yearLabels = dataRows.map(r => displayPeriod === 'ltm' ? 'LTM' : colLabel(r, period))

  // As-reported rows (cache keyed by statement + period so switching periods refetches)
  const arCacheKey = `${finTab}:${period === 'quarterly' ? 'quarter' : 'annual'}`
  const arRows = presentation === 'as-reported' ? [...(asReportedData[arCacheKey] || [])]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, tplNumPeriods).reverse() : []
  const arKeys: string[] = arRows.length
    ? Object.keys(arRows[0]).filter(k => !['date', 'symbol', 'period', 'calendarYear', 'fiscalYear', 'cik', 'fillingDate', 'acceptedDate', 'reportedCurrency'].includes(k))
    : []

  // ── Exports ───────────────────────────────────────────────────────────────

  function exportCsv() {
    const EP_STD: Record<StatementType, string> = {
      income: 'income-statement', balance: 'balance-sheet-statement', cashflow: 'cash-flow-statement',
    }
    const EP_AR: Record<StatementType, string> = {
      income: 'income-statement-as-reported', balance: 'balance-sheet-statement-as-reported', cashflow: 'cash-flow-statement-as-reported',
    }
    async function doExport() {
      const isAsReported = presentation === 'as-reported'

      // --- As-reported export ---
      if (isAsReported) {
        let exportRows = arRows
        if (!exportRows.length) {
          try {
            const p = period === 'quarterly' ? 'quarter' : 'annual'
            const r = await fetch(`${BASE}/api/financials/statements?symbol=${symbol}&statement=${EP_AR[finTab]}&period=${p}&limit=10`)
            if (r.ok) { const d = await r.json(); exportRows = d?.rows || [] }
          } catch { /* ignore */ }
        }
        if (!exportRows.length) return
        const exportKeys = Object.keys(exportRows[0]).filter(k => !LTM_SKIP.has(k))
        const header = ['Field', ...exportRows.map(r => r.calendarYear || r.date || '')]
        const csvRows = [header.join(',')]
        exportKeys.forEach(key => {
          csvRows.push([key, ...exportRows.map((r: any) => r[key] != null ? r[key] : '')].join(','))
        })
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${symbol}-${finTab}-as-reported.csv`; a.click()
        URL.revokeObjectURL(url)
        return
      }

      // --- Standardized / LTM export ---
      let years = dataRows
      if (!years.length) {
        try {
          const periodParam = displayPeriod === 'annual' ? 'annual' : 'quarter'
          const r = await fetch(`${BASE}/api/financials/statements?symbol=${symbol}&statement=${EP_STD[finTab]}&period=${periodParam}&limit=10`)
          if (r.ok) { const d = await r.json(); years = d?.rows || [] }
        } catch { /* ignore */ }
      }
      if (displayPeriod === 'ltm' && years.length) {
        const ltm = computeLtmRow(years, finTab)
        years = ltm ? [ltm] : years
      }
      const items = activeItems && activeItems.length
        ? activeItems.filter(i => i.type === 'field' || i.type === 'calculated')
        : (ALL_FIELDS[finTab] || []).map(([label, key]) => ({ id: key, type: 'field' as const, label, key }))

      const header = ['Metric', ...years.map(y => displayPeriod === 'ltm' ? 'LTM' : (y.calendarYear || y.year || y.period || y.date || ''))]
      const rows = [header.join(',')]
      items.forEach(item => {
        if (item.type === 'field' && item.key) {
          rows.push([item.label, ...years.map((y: any) => y[item.key!] != null ? y[item.key!] : '')].join(','))
        } else if (item.type === 'calculated') {
          rows.push([item.label, ...years.map((y: any) => {
            const v = calcCell(y, item)
            return v != null ? (item.isPercent ? (v * 100).toFixed(1) + '%' : v) : ''
          })].join(','))
        }
      })
      const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${symbol}-${finTab}${activeTemplate && !(activeTemplate as any).isBuiltin ? '-' + activeTemplate.name.replace(/\s+/g, '-') : ''}${displayPeriod === 'ltm' ? '-ltm' : ''}.csv`; a.click()
      URL.revokeObjectURL(url)
    }
    doExport()
  }

  // ── Delete custom template ────────────────────────────────────────────────

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return
    await fetch(`${BASE}/api/financial-templates/${id}`, { method: 'DELETE' })
    setCustomTemplates(prev => prev.filter(t => t.id !== id))
    if (selectedTemplateId === id) selectTemplate('builtin-default')
  }

  // ── Template builder save ─────────────────────────────────────────────────

  async function saveTemplate(tpl: FinancialTemplate) {
    setSaving(true); setSaveError(null)
    try {
      const isEdit = !tpl.isBuiltin && tpl.id && !tpl.id.startsWith('builtin-')
      const url    = isEdit ? `${BASE}/api/financial-templates/${tpl.id}` : `${BASE}/api/financial-templates`
      const method = isEdit ? 'PATCH' : 'POST'
      const tplAny = tpl as any
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tpl.name,
          description: tpl.description,
          statementType: tpl.statementType === 'all' ? 'income' : tpl.statementType,
          lineItems: tpl.lineItems,
          periodLayout: tplAny.periodLayout ?? 'annual',
          numPeriods: tplAny.numPeriods ?? 5,
          presentation: tplAny.presentation ?? 'standardized',
        }),
      })
      if (!r.ok) { const t = await r.text(); setSaveError(t.slice(0, 160)); return }
      const j = await r.json()
      const saved: TemplateDto = j.template
      setCustomTemplates(prev => {
        const without = prev.filter(t => t.id !== saved.id)
        return [saved, ...without]
      })
      selectTemplate(saved.id)
      setShowBuilder(false)
      setEditingTemplate(null)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fade-up">
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Statement tabs */}
        {(['income', 'balance', 'cashflow'] as const).map(t => (
          <button key={t} onClick={() => setFinTab(t)}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1.5px solid', cursor: 'pointer',
              background: finTab === t ? 'var(--text-primary)' : 'var(--bg-card)',
              color: finTab === t ? '#fff' : 'var(--text-secondary)',
              borderColor: finTab === t ? 'var(--text-primary)' : 'var(--border)', transition: 'all 0.12s' }}>
            {t === 'income' ? 'Income Statement' : t === 'balance' ? 'Balance Sheet' : 'Cash Flow'}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Template picker */}
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPicker(p => !p)}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11 }}>◈</span>
              <span>{activeTemplate ? activeTemplate.name : 'Default'}</span>
              <span style={{ fontSize: 10 }}>▾</span>
            </button>
            {showPicker && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 40,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)', minWidth: 220, padding: '6px 0',
              }}>
                <div style={{ padding: '4px 12px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Built-in</div>
                {BUILTIN_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => selectTemplate(t.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none', cursor: 'pointer',
                      background: selectedTemplateId === t.id ? 'var(--accent-dim, #e8f0fe)' : 'transparent',
                      color: selectedTemplateId === t.id ? 'var(--accent, #2563eb)' : 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                    {t.name}
                    {t.description && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, marginTop: 1 }}>{t.description}</div>}
                  </button>
                ))}
                {customTemplates.length > 0 && (
                  <>
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <div style={{ padding: '4px 12px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your templates</div>
                    {customTemplates.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center' }}>
                        <button onClick={() => selectTemplate(t.id)}
                          style={{ flex: 1, textAlign: 'left', padding: '7px 14px', border: 'none', cursor: 'pointer',
                            background: selectedTemplateId === t.id ? 'var(--accent-dim, #e8f0fe)' : 'transparent',
                            color: selectedTemplateId === t.id ? 'var(--accent, #2563eb)' : 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                          {t.name}
                        </button>
                        {t.mine && (
                          <button onClick={() => { setShowPicker(false); setEditingTemplate(dtoToTemplate(t)); setShowBuilder(true) }}
                            style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }} title="Edit">✎</button>
                        )}
                        {t.mine && (
                          <button onClick={() => { setShowPicker(false); deleteTemplate(t.id) }}
                            style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--danger, #c0392b)' }} title="Delete">✕</button>
                        )}
                      </div>
                    ))}
                  </>
                )}
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <button onClick={() => { setShowPicker(false); setEditingTemplate(newTemplate(finTab)); setShowBuilder(true) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--accent, #2563eb)', fontSize: 13, fontWeight: 700 }}>
                  + Create custom template
                </button>
              </div>
            )}
          </div>

          {/* Presentation toggle */}
          <div style={{ display: 'flex', borderRadius: 6, border: '1.5px solid var(--border)', overflow: 'hidden' }}>
            {(['standardized', 'as-reported'] as const).map(p => (
              <button key={p} onClick={() => setPresentation(p)}
                style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: presentation === p ? 'var(--text-primary)' : 'var(--bg-card)',
                  color: presentation === p ? '#fff' : 'var(--text-secondary)' }}>
                {p === 'standardized' ? 'Standardized' : 'As Reported'}
              </button>
            ))}
          </div>

          {/* Period toggle */}
          {(['annual', 'quarterly', 'ltm'] as const).map(p => {
            const isActive = p === displayPeriod
            return (
              <button key={p} onClick={() => {
                setDisplayPeriod(p)
                if (p === 'ltm') {
                  // LTM needs quarterly data for its 4-quarter aggregation
                  setPeriod('quarterly')
                } else {
                  setPeriod(p)
                }
              }}
                style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1.5px solid', cursor: 'pointer',
                  background: isActive ? 'var(--accent)' : 'var(--bg-card)',
                  color: isActive ? '#fff' : 'var(--text-secondary)', borderColor: isActive ? 'var(--accent)' : 'var(--border)', transition: 'all 0.12s' }}>
                {p === 'annual' ? 'Annual' : p === 'quarterly' ? 'Quarterly' : 'LTM'}
              </button>
            )
          })}

          <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
          <Link href={`/app/company/${symbol}/peers`}
            style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-primary)', textDecoration: 'none' }}>
            ⚖ Peer compare
          </Link>
          <button onClick={exportCsv}
            style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            ⬇ CSV
          </button>
        </div>
      </div>

      {/* Active template badge */}
      {activeTemplate && activeTemplate.id !== 'builtin-default' && (
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 6, background: 'var(--accent-dim, #e8f0fe)', color: 'var(--accent, #2563eb)', border: '1px solid var(--accent, #2563eb)33' }}>
            ◈ {activeTemplate.name}
          </span>
          {activeTemplate.description && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{activeTemplate.description}</span>
          )}
          {!(activeTemplate as any).isBuiltin && (activeTemplate as any).mine && (
            <button onClick={() => { setEditingTemplate(dtoToTemplate(customTemplates.find(t => t.id === activeTemplate.id)!)); setShowBuilder(true) }}
              style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Edit ✎
            </button>
          )}
          <button onClick={() => selectTemplate('builtin-default')}
            style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 4 }}>
            Reset ×
          </button>
        </div>
      )}

      {/* ── Statement table ── */}
      {presentation === 'as-reported' ? (
        <AsReportedTable
          rows={arRows}
          keys={arKeys}
          yearLabels={arRows.map(r => colLabel(r, period))}
          loading={asReportedLoading}
          finTab={finTab}
        />
      ) : (
        <StandardizedTable
          dataRows={dataRows}
          yearLabels={yearLabels}
          activeItems={activeItems}
          finTab={finTab}
          period={period}
          periodLoading={periodLoading}
          onDrillRow={setDrillRow}
        />
      )}

      {/* ── Industry KPIs ── */}
      {industryKpis?.kpis?.length > 0 && (
        <div className="card" style={{ padding: 18, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Industry KPIs · {industryKpis.sector || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{industryKpis.industry || ''}</div>
            </div>
            <span className="badge badge-blue" style={{ fontSize: 10 }}>{industryKpis.kpiSet || 'Generic'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {industryKpis.kpis.map((k: any) => (
              <div key={k.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{k.display ?? '—'}</div>
                {k.hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{k.hint}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Key Metrics & Ratios ── */}
      {(keyMetrics.length > 0 || ratios.length > 0) && (() => {
        const km: any = keyMetrics[0] || {}
        const rt: any = ratios[0] || {}
        const fmtPctVal = (n: number) => (n * 100).toFixed(2) + '%'
        const fmtX      = (n: number) => n.toFixed(2) + 'x'
        const fmtNumB   = (n: number) => fmtB(n)
        const fmtN2     = (n: number) => n.toFixed(2)
        const tile = (label: string, raw: any, fn: (n: number) => string) => {
          if (raw == null || raw === '' || (typeof raw === 'number' && !isFinite(raw))) return { label, value: '—' }
          const n = Number(raw)
          if (!isFinite(n)) return { label, value: '—' }
          return { label, value: fn(n) }
        }
        const tiles = [
          tile('Enterprise Value', km.enterpriseValue, fmtNumB),
          tile('EV / EBITDA',      km.enterpriseValueOverEBITDA ?? km.evToEbitda, fmtX),
          tile('EV / Sales',       km.evToSales ?? km.enterpriseValueOverRevenue, fmtX),
          tile('ROIC',             km.roic ?? km.returnOnInvestedCapital, fmtPctVal),
          tile('ROE',              rt.returnOnEquity ?? km.roe, fmtPctVal),
          tile('ROA',              rt.returnOnAssets ?? km.roa, fmtPctVal),
          tile('FCF / Share',      km.freeCashFlowPerShare, fmtN2),
          tile('Working Capital',  km.workingCapital, fmtNumB),
          tile('Debt / Equity',    rt.debtEquityRatio ?? km.debtToEquity, fmtX),
          tile('Current Ratio',    rt.currentRatio ?? km.currentRatio, fmtX),
          tile('P / E',            rt.priceEarningsRatio ?? km.peRatio, fmtX),
          tile('P / B',            rt.priceToBookRatio ?? rt.priceBookValueRatio ?? km.priceToBookRatio, fmtX),
          tile('P / S',            rt.priceToSalesRatio ?? km.priceToSalesRatio, fmtX),
          tile('Gross Margin',     rt.grossProfitMargin, fmtPctVal),
          tile('Operating Margin', rt.operatingProfitMargin, fmtPctVal),
          tile('Net Margin',       rt.netProfitMargin, fmtPctVal),
          tile('Asset Turnover',   rt.assetTurnover, fmtX),
          tile('Payout Ratio',     rt.payoutRatio, fmtPctVal),
          tile('Dividend Yield',   rt.dividendYield, fmtPctVal),
        ]
        return (
          <div className="card" style={{ padding: 0, marginTop: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Key Metrics & Ratios</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{km.calendarYear || km.date || rt.calendarYear || rt.date || ''}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {tiles.map(t => (
                <div key={t.label} style={{ padding: '12px 14px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{t.value}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Growth Rates ── */}
      {growth.length > 0 && (() => {
        const sorted = [...growth]
          .sort((a, b) => String(b.date || b.calendarYear || '').localeCompare(String(a.date || a.calendarYear || '')))
          .slice(0, 5).reverse()
        const headers = sorted.map((r: any) => r.calendarYear || (r.date ? String(r.date).slice(0, 4) : '—'))
        const ROWS: [string, string][] = [
          ['Revenue Growth',            'revenueGrowth'],
          ['Gross Profit Growth',       'grossProfitGrowth'],
          ['EBIT Growth',               'ebitgrowth'],
          ['Net Income Growth',         'netIncomeGrowth'],
          ['EPS Growth',                'epsgrowth'],
          ['Free Cash Flow Growth',     'freeCashFlowGrowth'],
          ['Operating Cash Flow Growth','operatingCashFlowGrowth'],
          ['Dividends / Share Growth',  'dividendsperShareGrowth'],
        ]
        return (
          <div className="card" style={{ marginTop: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Growth Rates · YoY</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Metric</th>{headers.map((h, i) => <th key={i} className="right">{h}</th>)}</tr></thead>
                <tbody>
                  {ROWS.map(([label, key]) => (
                    <tr key={key}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</td>
                      {sorted.map((r: any, i: number) => {
                        const v = r[key]
                        const n = Number(v)
                        const ok = v != null && v !== '' && isFinite(n)
                        return <td key={i} className="right" style={{ color: !ok ? 'var(--text-muted)' : n >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 600 }}>
                          {!ok ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`}
                        </td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── Revenue Segments ── */}
      {(() => {
        const renderSeg = (rows: any[], title: string) => {
          if (rows.length === 0) {
            return (
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
                <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Not reported</div>
              </div>
            )
          }
          const latest: any = [...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]
          const segObj: any = latest?.data || latest?.segments || latest || {}
          const entries: [string, number][] = Object.entries(segObj)
            .filter(([k, v]) => typeof v === 'number' && k !== 'date' && k !== 'symbol' && k !== 'period' && k !== 'fiscalYear' && k !== 'calendarYear') as [string, number][]
          const total = entries.reduce((s, [, v]) => s + Number(v), 0) || 1
          const sorted = entries.sort((a, b) => b[1] - a[1])
          if (!sorted.length) return (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
              <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No breakdown values returned for the latest period.</div>
            </div>
          )
          return (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{latest?.date || ''}</span>
              </div>
              <div style={{ padding: '8px 16px 12px' }}>
                {sorted.map(([k, v]) => {
                  const pct = (Number(v) / total) * 100
                  return (
                    <div key={k} style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, gap: 8 }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{fmtB(Number(v))} · {pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-elevated)' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: 'var(--accent)', borderRadius: 2 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }
        return (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {renderSeg(segments.product,    'Revenue by Product / Segment')}
            {renderSeg(segments.geographic, 'Revenue by Geography')}
          </div>
        )
      })()}

      {/* ── Drill-down modal ── */}
      {drillRow && (() => {
        const labels = drillRow.rows.map((r: any) => period === 'quarterly'
          ? `${r.period || ''} ${r.calendarYear || r.fiscalYear || ''}`.trim()
          : (r.calendarYear || r.fiscalYear || (r.date ? String(r.date).slice(0,4) : '')))
        const nums = drillRow.cells.map((v: any) => Number(v)).filter((v: number) => isFinite(v))
        const min = nums.length ? Math.min(...nums) : 0
        const max = nums.length ? Math.max(...nums) : 1
        const span = (max - min) || 1
        const W = 720, H = 280, PAD = 36
        const step = nums.length > 1 ? (W - PAD * 2) / (nums.length - 1) : 0
        const pts = nums.map((v: number, i: number) => `${(PAD + i * step).toFixed(1)},${(H - PAD - ((v - min) / span) * (H - PAD * 2)).toFixed(1)}`)
        return (
          <div onClick={() => setDrillRow(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
            <div onClick={e => e.stopPropagation()} className="card" style={{ width: 780, maxWidth: '95vw', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{drillRow.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{symbol} · {period === 'annual' ? 'Annual' : 'Quarterly'} · {finTab}</div>
                </div>
                <button onClick={() => setDrillRow(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
              </div>
              {nums.length < 2 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Not enough data points to chart.</div>
              ) : (
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
                  <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border)" />
                  <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--border)" />
                  <polyline fill="none" stroke="var(--accent)" strokeWidth={2} points={pts.join(' ')} />
                  {nums.map((v: number, i: number) => {
                    const [x, y] = pts[i].split(',').map(Number)
                    return <circle key={i} cx={x} cy={y} r={3} fill="var(--accent)" />
                  })}
                  {labels.map((lab: string, i: number) => (
                    <text key={i} x={PAD + i * step} y={H - PAD + 16} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{lab}</text>
                  ))}
                  <text x={PAD - 4} y={PAD + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">{fmtB(max)}</text>
                  <text x={PAD - 4} y={H - PAD + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">{fmtB(min)}</text>
                </svg>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Template builder modal ── */}
      {showBuilder && editingTemplate && (
        <TemplateBuilder
          template={editingTemplate}
          statementFields={ALL_FIELDS}
          saving={saving}
          error={saveError}
          onSave={saveTemplate}
          onClose={() => { setShowBuilder(false); setEditingTemplate(null); setSaveError(null) }}
        />
      )}
    </div>
  )
}

// ── Standardized table ────────────────────────────────────────────────────────

function StandardizedTable({ dataRows, yearLabels, activeItems, finTab, period, periodLoading, onDrillRow }: {
  dataRows: any[]
  yearLabels: string[]
  activeItems: TemplateLineItem[] | null
  finTab: StatementType
  period: PeriodType
  periodLoading: boolean
  onDrillRow: (row: any) => void
}) {
  const defaultItems = fieldsToItems(ALL_FIELDS[finTab])
  const items = activeItems && activeItems.length ? activeItems : defaultItems

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {periodLoading && period === 'quarterly' && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Loading quarterly data…</div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Metric</th>
              <th style={{ width: 80 }}>Trend</th>
              {yearLabels.map((y, i) => <th key={i} className="right">{y}</th>)}
              <th className="right" style={{ minWidth: 80 }}>{period === 'annual' ? 'YoY %' : 'QoQ %'}</th>
            </tr>
          </thead>
          <tbody>
            {dataRows.length === 0 && (
              <tr><td colSpan={3 + yearLabels.length} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                No {finTab === 'income' ? 'income statement' : finTab === 'balance' ? 'balance sheet' : 'cash flow'} {period} data available from the provider.
              </td></tr>
            )}
            {dataRows.length > 0 && items.map((item, idx) => {
              if (item.type === 'spacer') {
                return <tr key={`spacer-${idx}`}><td colSpan={3 + yearLabels.length} style={{ padding: 6 }} /></tr>
              }
              if (item.type === 'header') {
                return (
                  <tr key={`hdr-${idx}`} style={{ background: 'var(--bg-elevated)' }}>
                    <td colSpan={3 + yearLabels.length} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {item.label}
                    </td>
                  </tr>
                )
              }

              if (item.type === 'calculated') {
                const cells = dataRows.map(r => calcCell(r, item))
                const last = cells[cells.length - 1], prev = cells[cells.length - 2]
                const change = (last != null && prev != null && prev !== 0) ? ((last - prev) / Math.abs(prev)) * 100 : null
                const sparkVals = cells.map(v => v != null ? (item.isPercent ? (v * 100) : v) : NaN).filter(isFinite)
                return (
                  <tr key={item.id} style={{ cursor: 'default', opacity: 0.9 }}>
                    <td style={{ fontWeight: item.isBold ? 700 : 500, color: 'var(--text-primary)', fontStyle: 'italic' }}>{item.label}</td>
                    <td><Sparkline values={sparkVals} /></td>
                    {cells.map((v, i) => (
                      <td key={i} className="right" style={{ color: 'var(--text-primary)' }}>{fmtCalcCell(v, item)}</td>
                    ))}
                    <td className="right" style={{ color: change == null ? 'var(--text-muted)' : change >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 700 }}>
                      {change == null ? '—' : (change >= 0 ? '+' : '') + change.toFixed(1) + '%'}
                    </td>
                  </tr>
                )
              }

              // type = 'field'
              if (!item.key) return null
              const cells = dataRows.map((r: any) => r[item.key!])
              const hasAny = cells.some(v => v != null && v !== '')
              const last = cells[cells.length - 1], prev = cells[cells.length - 2]
              const change = yoy(last, prev)
              const sparkVals = cells.map(v => Number(v)).filter(isFinite)
              return (
                <tr key={item.id} style={{ cursor: 'pointer', opacity: hasAny ? 1 : 0.45 }}
                  onClick={() => hasAny && onDrillRow({ label: item.label, key: item.key, rows: dataRows, cells })}
                  title={hasAny ? 'Click to expand chart' : 'No data for this metric'}>
                  <td style={{ fontWeight: item.isBold ? 700 : 600, color: 'var(--text-primary)' }}>
                    {item.label}
                    {!hasAny && <span style={{ fontSize: 9, marginLeft: 6, color: 'var(--text-muted)' }}>(not reported)</span>}
                  </td>
                  <td><Sparkline values={sparkVals} /></td>
                  {cells.map((v: any, i: number) => (
                    <td key={i} className="right" style={{ color: 'var(--text-primary)' }}>{fmtCell(v, item)}</td>
                  ))}
                  <td className="right" style={{ color: change == null ? 'var(--text-muted)' : change >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 700 }}>
                    {change == null ? '—' : (change >= 0 ? '+' : '') + change.toFixed(1) + '%'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── As-reported table ─────────────────────────────────────────────────────────

function AsReportedTable({ rows, keys, yearLabels, loading, finTab }: {
  rows: any[]
  keys: string[]
  yearLabels: string[]
  loading: boolean
  finTab: StatementType
}) {
  if (loading) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading as-reported data…
      </div>
    )
  }
  if (!rows.length) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        No as-reported data available for this company and period. FMP requires an active API key that supports as-reported XBRL data.
      </div>
    )
  }
  // Format key from camelCase/XBRL to human readable
  function humanize(k: string): string {
    return k
      .replace(/^us-gaap_|^us_gaap_|^dei_/, '')
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
        As-reported view — raw XBRL line items as filed with the SEC. Field names may vary by company and filing period.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: 260 }}>XBRL Line Item</th>
              {yearLabels.map((y, i) => <th key={i} className="right">{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {keys.map(key => {
              const cells = rows.map(r => r[key])
              const hasAny = cells.some(v => v != null && v !== '')
              if (!hasAny) return null
              return (
                <tr key={key} style={{ opacity: hasAny ? 1 : 0.4 }}>
                  <td style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 12 }}>
                    <div>{humanize(key)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{key}</div>
                  </td>
                  {cells.map((v, i) => (
                    <td key={i} className="right" style={{ color: 'var(--text-primary)' }}>{fmtRaw(v, key)}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Template builder modal ────────────────────────────────────────────────────

let _seq = 0
function uid() { return `li${Date.now().toString(36)}${++_seq}` }

function newTemplate(stmtType: StatementType): FinancialTemplate {
  return {
    id: '',
    name: '',
    description: '',
    isBuiltin: false,
    statementType: stmtType,
    lineItems: fieldsToItems(ALL_FIELDS[stmtType]),
  }
}

function dtoToTemplate(dto: TemplateDto): FinancialTemplate {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    isBuiltin: false,
    statementType: (dto.statementType as StatementType) || 'income',
    lineItems: dto.lineItems,
    periodLayout: (dto.periodLayout as PeriodType) || 'annual',
    numPeriods: dto.numPeriods,
    presentation: (dto.presentation as Presentation) || 'standardized',
    mine: dto.mine,
  }
}

function TemplateBuilder({ template, statementFields, saving, error, onSave, onClose }: {
  template: FinancialTemplate
  statementFields: Record<StatementType, [string, string][]>
  saving: boolean
  error: string | null
  onSave: (t: FinancialTemplate) => void
  onClose: () => void
}) {
  const tplAny = template as any
  const [name, setName]             = useState(template.name)
  const [desc, setDesc]             = useState(template.description)
  const [stmtType, setStmtType]     = useState<StatementType>(
    template.statementType === 'all' ? 'income' : template.statementType as StatementType
  )
  const [periodLayout, setPeriodLayout] = useState<DisplayPeriod>(tplAny.periodLayout ?? 'annual')
  const [numPeriodsVal, setNumPeriodsVal] = useState<number>(tplAny.numPeriods ?? 5)
  const [tplPresentation, setTplPresentation] = useState<Presentation>(tplAny.presentation ?? 'standardized')
  const [items, setItems]           = useState<TemplateLineItem[]>(template.lineItems.length
    ? template.lineItems
    : fieldsToItems(statementFields[stmtType] || INCOME_FIELDS))
  const [addCalcOpen, setAddCalcOpen] = useState(false)
  const [calcForm, setCalcForm] = useState({ label: '', operandA: '', operandB: '', operator: '/' as '/'|'-'|'+'|'*', isPercent: true })
  const dragIdx = useRef<number | null>(null)

  const availableFields = statementFields[stmtType] || INCOME_FIELDS

  function addField(label: string, key: string) {
    if (items.find(i => i.type === 'field' && i.key === key)) return
    setItems(prev => [...prev, { id: uid(), type: 'field', label, key, isCurrency: true }])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function moveItem(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    setItems(prev => { const n = prev.slice(); [n[idx], n[j]] = [n[j], n[idx]]; return n })
  }

  function addHeader() {
    setItems(prev => [...prev, { id: uid(), type: 'header', label: 'Section', isBold: true }])
  }

  function addSpacer() {
    setItems(prev => [...prev, { id: uid(), type: 'spacer', label: '' }])
  }

  function addCalc() {
    if (!calcForm.label || !calcForm.operandA || !calcForm.operandB) return
    setItems(prev => [...prev, {
      id: uid(), type: 'calculated', label: calcForm.label,
      operandA: calcForm.operandA, operandB: calcForm.operandB,
      operator: calcForm.operator, isPercent: calcForm.isPercent,
    }])
    setCalcForm({ label: '', operandA: '', operandB: '', operator: '/', isPercent: true })
    setAddCalcOpen(false)
  }

  function updateLabel(idx: number, val: string) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, label: val } : it))
  }

  function submit() {
    if (!name.trim()) return
    onSave({
      ...template,
      name: name.trim(),
      description: desc.trim(),
      statementType: stmtType,
      lineItems: items,
      // extra fields stored on the object and sent by saveTemplate()
      ...(({ periodLayout: periodLayout, numPeriods: numPeriodsVal, presentation: tplPresentation }) as any),
    } as any)
  }

  const selectedKeys = new Set(items.filter(i => i.type === 'field').map(i => i.key))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="card"
        style={{ width: 860, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
            {template.id ? 'Edit Template' : 'Create Template'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Metadata — row 1 */}
          <div style={{ padding: '14px 20px 0', borderBottom: 'none', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 200 }}>
              <span style={MINI_LABEL}>Template name *</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Banker Template"
                style={INPUT_STYLE} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
              <span style={MINI_LABEL}>Statement type</span>
              <select value={stmtType} onChange={e => { const s = e.target.value as StatementType; setStmtType(s); setItems(fieldsToItems(statementFields[s])) }}
                style={INPUT_STYLE}>
                <option value="income">Income Statement</option>
                <option value="balance">Balance Sheet</option>
                <option value="cashflow">Cash Flow</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 160 }}>
              <span style={MINI_LABEL}>Description (optional)</span>
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description"
                style={INPUT_STYLE} />
            </label>
          </div>
          {/* Metadata — row 2: period & presentation prefs */}
          <div style={{ padding: '10px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
              <span style={MINI_LABEL}>Default period</span>
              <select value={periodLayout} onChange={e => setPeriodLayout(e.target.value as DisplayPeriod)}
                style={INPUT_STYLE}>
                <option value="annual">Annual</option>
                <option value="quarterly">Quarterly</option>
                <option value="ltm">LTM (Trailing 12M)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
              <span style={MINI_LABEL}>Periods shown</span>
              <input type="number" min={1} max={20} value={numPeriodsVal}
                onChange={e => setNumPeriodsVal(Math.min(20, Math.max(1, parseInt(e.target.value) || 5)))}
                style={{ ...INPUT_STYLE, width: 80 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
              <span style={MINI_LABEL}>Presentation</span>
              <select value={tplPresentation} onChange={e => setTplPresentation(e.target.value as Presentation)}
                style={INPUT_STYLE}>
                <option value="standardized">Standardized</option>
                <option value="as-reported">As Reported (XBRL)</option>
              </select>
            </label>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', flex: 1, alignSelf: 'flex-end', paddingBottom: 6 }}>
              These preferences are applied automatically when this template is selected.
            </p>
          </div>

          {/* Split pane */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
            {/* Left — available fields */}
            <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto', padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.06em' }}>Available Fields</div>
              {availableFields.map(([label, key]) => {
                const alreadyIn = selectedKeys.has(key)
                return (
                  <button key={key} onClick={() => addField(label, key)} disabled={alreadyIn}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', marginBottom: 2, borderRadius: 6,
                      border: '1px solid var(--border)', cursor: alreadyIn ? 'not-allowed' : 'pointer',
                      background: alreadyIn ? 'var(--bg-elevated)' : 'var(--bg-card)',
                      color: alreadyIn ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: 12, fontWeight: 500 }}>
                    {label}
                    {alreadyIn && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-muted)' }}>✓</span>}
                  </button>
                )
              })}
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={addHeader} style={GHOST_BTN}>+ Header</button>
                <button onClick={addSpacer} style={GHOST_BTN}>+ Spacer</button>
                <button onClick={() => setAddCalcOpen(o => !o)} style={GHOST_BTN}>+ Calculated row</button>
              </div>
              {addCalcOpen && (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Calculated Row</div>
                  <input placeholder="Label (e.g. Gross Margin %)" value={calcForm.label} onChange={e => setCalcForm(f => ({ ...f, label: e.target.value }))} style={INPUT_STYLE} />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select value={calcForm.operandA} onChange={e => setCalcForm(f => ({ ...f, operandA: e.target.value }))} style={{ ...INPUT_STYLE, flex: 1 }}>
                      <option value="">Field A</option>
                      {availableFields.map(([l, k]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <select value={calcForm.operator} onChange={e => setCalcForm(f => ({ ...f, operator: e.target.value as any }))} style={{ ...INPUT_STYLE, width: 50 }}>
                      {['/', '-', '+', '*'].map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <select value={calcForm.operandB} onChange={e => setCalcForm(f => ({ ...f, operandB: e.target.value }))} style={{ ...INPUT_STYLE, flex: 1 }}>
                      <option value="">Field B</option>
                      {availableFields.map(([l, k]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={calcForm.isPercent} onChange={e => setCalcForm(f => ({ ...f, isPercent: e.target.checked }))} />
                    Display as percentage
                  </label>
                  <button onClick={addCalc} style={{ ...PRIMARY_BTN, alignSelf: 'flex-start' }}>Add row</button>
                </div>
              )}
            </div>

            {/* Right — selected items */}
            <div style={{ overflow: 'auto', padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.06em' }}>Template Preview ({items.length} rows)</div>
              {items.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Add fields from the left panel</div>
              )}
              {items.map((item, idx) => (
                <div key={item.id}
                  draggable
                  onDragStart={() => { dragIdx.current = idx }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    if (dragIdx.current == null || dragIdx.current === idx) return
                    const from = dragIdx.current
                    setItems(prev => {
                      const n = prev.slice(); const [moved] = n.splice(from, 1); n.splice(idx, 0, moved); return n
                    })
                    dragIdx.current = null
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px dashed var(--border)' }}>
                  <span style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 14, userSelect: 'none' }}>⠿</span>
                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-muted)', minWidth: 52, textAlign: 'center' }}>
                    {item.type}
                  </span>
                  {item.type === 'header' || item.type === 'field' ? (
                    <input value={item.label} onChange={e => updateLabel(idx, e.target.value)}
                      style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 12, fontWeight: item.type === 'header' ? 700 : 500, padding: 0 }} />
                  ) : item.type === 'calculated' ? (
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label} = {item.operandA} {item.operator} {item.operandB}
                    </span>
                  ) : (
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>(spacer)</span>
                  )}
                  <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} style={ICON_BTN} title="Move up">↑</button>
                  <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} style={ICON_BTN} title="Move down">↓</button>
                  <button onClick={() => removeItem(idx)} style={{ ...ICON_BTN, color: 'var(--danger, #c0392b)' }} title="Remove">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {error ? <div style={{ fontSize: 12, color: 'var(--danger, #c0392b)', flex: 1 }}>{error}</div> : <div style={{ flex: 1 }} />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={GHOST_BTN}>Cancel</button>
            <button onClick={submit} disabled={!name.trim() || saving}
              style={{ ...PRIMARY_BTN, opacity: name.trim() && !saving ? 1 : 0.5 }}>
              {saving ? 'Saving…' : template.id ? 'Save template' : 'Create template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PRIMARY_BTN: React.CSSProperties = {
  padding: '8px 15px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'var(--gradient-brand, var(--accent, #2563eb))', color: '#fff', fontSize: 13, fontWeight: 700,
}
const GHOST_BTN: React.CSSProperties = {
  padding: '6px 11px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer',
  background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
}
const ICON_BTN: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', cursor: 'pointer',
  background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
}
const INPUT_STYLE: React.CSSProperties = {
  padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--bg-input, var(--bg-card))', color: 'var(--text-primary)', fontSize: 13, width: '100%',
}
const MINI_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase',
}
