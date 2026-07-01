// Shared types for the Model Builder surface

export interface ModelAssumptions {
  wacc: number
  terminalGrowth: number
  growthStage1: number
  growthStage2: number
  stage1Years: number
  stage2Years: number
  terminalExitMultiple?: number
}

export interface LboAssumptionsSpec {
  entryMultiple: number
  exitMultiple: number
  holdPeriod: number
  ebitdaGrowth: number
  totalLeverage: number
  seniorRate: number
  subRate: number
  taxRate: number
}

export interface ModelSpec {
  type: 'dcf' | 'comps' | 'both' | 'lbo' | 'tx-comps' | 'audit'
  ticker: string
  peerSymbols: string[]
  assumptions: ModelAssumptions
  lboAssumptions?: LboAssumptionsSpec
  reasoning: string
}

export interface DcfYear {
  year: number
  fcf: number
  growth: number
  discountFactor: number
  presentValue: number
}

export interface SensitivityGrid {
  rowLabel: string
  colLabel: string
  rowValues: number[]
  colValues: number[]
  values: number[][]
}

export interface DcfResult {
  ticker?: string
  error?: string
  assumptions?: ModelAssumptions & { discountRate?: number; baseFcf?: number; netDebt?: number; sharesOutstanding?: number; stage1Years?: number; stage2Years?: number; terminalGrowth?: number }
  years?: DcfYear[]
  pvOfExplicitFcf?: number
  terminalValue?: number
  pvOfTerminalValue?: number
  enterpriseValue?: number
  equityValue?: number
  intrinsicValuePerShare?: number | null
  terminalValuePctOfEv?: number
  sensitivity?: SensitivityGrid
  derivedFromFinancials?: {
    baseFcf: number | null
    totalDebt: number | null
    cash: number | null
    netDebt: number
    sharesOutstanding: number | null
    provider?: string
    asOf?: string | null
    sourceUrl?: string
  }
}

export interface CompareCell { value: number | null; display: string; demo?: boolean; source?: string }
export interface CompareRow { symbol: string; name: string; ok: boolean; cells: Record<string, CompareCell>; source?: string }
export interface CompareMetricMeta { key: string; label: string; demo: boolean; ntm: boolean }

export interface CompsResult {
  error?: string
  skipped?: boolean
  setId?: string | null
  setName?: string | null
  subject?: string | null
  symbols?: string[]
  metrics?: string[]
  metricsMeta?: CompareMetricMeta[]
  rows?: CompareRow[]
}

// ── LBO types ────────────────────────────────────────────────────────────────

export interface LboTrancheDetail {
  name: string
  principal: number
  rate: number
  amortization: number
  leverage: number
}

export interface LboSourcesUses {
  purchaseEv: number
  transactionFees: number
  totalUses: number
  tranches: LboTrancheDetail[]
  totalDebt: number
  managementRollover: number
  sponsorEquity: number
  equityPct: number
}

export interface LboScheduleRow {
  year: number
  ebitda: number
  lFcf: number
  totalInterest: number
  totalAmortization: number
  debtBalance: number
  equityValue: number
  trancheBalances: Record<string, number>
}

export interface LboSensitivityGrid {
  rowLabel: string
  colLabel: string
  rowValues: number[]
  colValues: number[]
  irrGrid: number[][]
  moicGrid: number[][]
}

export interface LboResult {
  error?: string
  ticker?: string
  sourcesUses?: LboSourcesUses
  schedule?: LboScheduleRow[]
  returns?: {
    exitEv: number
    netEquityProceeds: number
    moic: number
    irr: number
    residualDebt: number
  }
  sensitivity?: LboSensitivityGrid
  warnings?: string[]
}

// ── Transaction comps types ───────────────────────────────────────────────────

export interface TxCompsDeal {
  id: string
  acquirer: string
  acquirerSymbol: string | null
  target: string
  targetSymbol: string | null
  announceDate: string | null
  status: string
  type: string
  dealValue: number | null
  evEbitda: number | null
  evRevenue: number | null
  ebitda: number | null
  revenue: number | null
  premium: number | null
  source: string
}

export interface TxCompsResult {
  error?: string
  skipped?: boolean
  ticker?: string
  deals?: TxCompsDeal[]
  stats?: {
    count: number
    medianEvEbitda: number | null
    meanEvEbitda: number | null
    q1EvEbitda: number | null
    q3EvEbitda: number | null
    medianEvRevenue: number | null
    meanDealValue: number | null
  }
  source?: string
}

// ── Audit types ───────────────────────────────────────────────────────────────

export type AuditSeverity = 'error' | 'warning' | 'info'

export interface AuditFinding {
  id: string
  severity: AuditSeverity
  field: string
  label: string
  message: string
  suggestion?: string
  observed?: string
  benchmark?: string
}

export interface AuditResult {
  error?: string
  skipped?: boolean
  modelType?: 'dcf' | 'lbo' | 'comps'
  ticker?: string
  findings?: AuditFinding[]
  score?: number
  hasErrors?: boolean
  summary?: string
}

// ── Full response ─────────────────────────────────────────────────────────────

export interface ModelBuilderResponse {
  spec: ModelSpec
  dcf: DcfResult | null
  comps: CompsResult | null
  lbo: LboResult | null
  txComps: TxCompsResult | null
  audit: AuditResult | null
  generatedAt: string
}
