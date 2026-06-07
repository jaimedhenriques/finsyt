/**
 * Multi-Stage Discounted Cash Flow Model
 * ───────────────────────────────────────
 * Pure-function library that values a business by projecting free cash flow
 * (FCF) over an explicit forecast horizon, applying a terminal-value
 * formula, and discounting at WACC.
 *
 * Inspired by the "DCF model" capability listed in FinceptTerminal's CFA
 * analytics. Re-implemented from CFA / Damodaran formulas; no upstream code
 * copied.
 *
 * Used by:
 *   - /api/dcf endpoint (internal)
 *   - /api/v1/dcf endpoint (public, key-gated)
 *   - finsyt_dcf MCP tool
 */

export interface DcfAssumptions {
  /** Trailing-twelve-month free cash flow to firm (FCFF), in millions of currency units. */
  baseFcf: number
  /** Stage-1 growth rate, decimal (e.g. 0.10 = 10 %). Applied for `stage1Years`. */
  growthStage1: number
  /** Length of stage 1 in years. Default 5. */
  stage1Years?: number
  /** Optional stage-2 growth that linearly fades to terminal growth. Default same as stage1. */
  growthStage2?: number
  /** Length of stage 2. Default 5. */
  stage2Years?: number
  /** Perpetual ("terminal") growth rate, decimal. Must be < discountRate. */
  terminalGrowth: number
  /** Discount rate (WACC), decimal. */
  discountRate: number
  /** Net debt (debt − cash), in millions. Used to get equity value from EV. */
  netDebt?: number
  /** Diluted shares outstanding, in millions. Used to get per-share value. */
  sharesOutstanding?: number
  /** Optional terminal exit-multiple (EV / FCF). If provided, overrides Gordon growth terminal. */
  terminalExitMultiple?: number
}

export interface DcfYear {
  year: number
  fcf: number
  growth: number
  discountFactor: number
  presentValue: number
}

export interface DcfResult {
  assumptions: DcfAssumptions
  years: DcfYear[]
  /** Sum of PVs over the explicit forecast period. */
  pvOfExplicitFcf: number
  /** Terminal value as of end of last forecast year. */
  terminalValue: number
  /** Present value of terminal value. */
  pvOfTerminalValue: number
  /** Enterprise value = PV(explicit) + PV(terminal). */
  enterpriseValue: number
  /** Equity value = EV − net debt. */
  equityValue: number
  /** Per-share intrinsic value, if shares provided. */
  intrinsicValuePerShare: number | null
  /** What % of the EV comes from terminal value (a quality-of-DCF flag). */
  terminalValuePctOfEv: number
}

/**
 * Run a 2-stage (or 1-stage if `growthStage2` omitted) DCF.
 *
 * Default behaviour: stage 1 grows at `growthStage1` for `stage1Years`,
 * then stage 2 fades linearly from `growthStage1 → terminalGrowth` over
 * `stage2Years`, then a Gordon-growth perpetuity beyond.
 */
export function runDcf(a: DcfAssumptions): DcfResult {
  const stage1Years = a.stage1Years ?? 5
  const stage2Years = a.stage2Years ?? 5
  const r = a.discountRate
  if (r <= a.terminalGrowth && !a.terminalExitMultiple) {
    throw new Error(`DCF: discountRate (${r}) must exceed terminalGrowth (${a.terminalGrowth}) for Gordon growth, or supply a terminalExitMultiple`)
  }
  if (a.baseFcf == null) throw new Error('DCF: baseFcf is required')

  const years: DcfYear[] = []
  let fcf = a.baseFcf
  let yearIdx = 0

  // Stage 1 — constant growth
  for (let i = 0; i < stage1Years; i++) {
    yearIdx += 1
    const g = a.growthStage1
    fcf = fcf * (1 + g)
    const df = 1 / Math.pow(1 + r, yearIdx)
    years.push({ year: yearIdx, fcf, growth: g, discountFactor: df, presentValue: fcf * df })
  }

  // Stage 2 — linear fade to terminalGrowth
  if (stage2Years > 0) {
    const g0 = a.growthStage2 ?? a.growthStage1
    const gT = a.terminalGrowth
    for (let i = 1; i <= stage2Years; i++) {
      yearIdx += 1
      const g = g0 + ((gT - g0) * (i / stage2Years))
      fcf = fcf * (1 + g)
      const df = 1 / Math.pow(1 + r, yearIdx)
      years.push({ year: yearIdx, fcf, growth: g, discountFactor: df, presentValue: fcf * df })
    }
  }

  const pvOfExplicitFcf = years.reduce((s, y) => s + y.presentValue, 0)

  // Terminal value
  const lastFcf = years[years.length - 1]?.fcf ?? a.baseFcf
  let terminalValue: number
  if (a.terminalExitMultiple) {
    // Exit-multiple terminal: TV = lastFcf × multiple
    terminalValue = lastFcf * a.terminalExitMultiple
  } else {
    // Gordon growth terminal: TV = (lastFcf × (1 + g)) / (r − g)
    terminalValue = (lastFcf * (1 + a.terminalGrowth)) / (r - a.terminalGrowth)
  }
  const tvDf = 1 / Math.pow(1 + r, yearIdx)
  const pvOfTerminalValue = terminalValue * tvDf
  const enterpriseValue = pvOfExplicitFcf + pvOfTerminalValue
  const equityValue = enterpriseValue - (a.netDebt ?? 0)
  const intrinsicValuePerShare = a.sharesOutstanding && a.sharesOutstanding > 0
    ? equityValue / a.sharesOutstanding
    : null
  const terminalValuePctOfEv = enterpriseValue > 0 ? pvOfTerminalValue / enterpriseValue : 0

  return {
    assumptions: { ...a, stage1Years, stage2Years },
    years,
    pvOfExplicitFcf,
    terminalValue,
    pvOfTerminalValue,
    enterpriseValue,
    equityValue,
    intrinsicValuePerShare,
    terminalValuePctOfEv,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sensitivity table (a 2-D grid of intrinsic value across two inputs)
// ─────────────────────────────────────────────────────────────────────────────

export interface SensitivityGrid {
  rowLabel: string
  colLabel: string
  rowValues: number[]
  colValues: number[]
  /** values[row][col] = intrinsic value per share (or equity value if no shares). */
  values: number[][]
}

/** Build a discount-rate × terminal-growth sensitivity grid. */
export function dcfSensitivity(
  base: DcfAssumptions,
  opts: {
    discountRates?: number[]   // default ±2 % around base
    terminalGrowths?: number[] // default ±1 % around base
  } = {},
): SensitivityGrid {
  const drs = opts.discountRates ?? [base.discountRate - 0.02, base.discountRate - 0.01, base.discountRate, base.discountRate + 0.01, base.discountRate + 0.02]
  const tgs = opts.terminalGrowths ?? [base.terminalGrowth - 0.01, base.terminalGrowth - 0.005, base.terminalGrowth, base.terminalGrowth + 0.005, base.terminalGrowth + 0.01]
  const values: number[][] = []
  for (const dr of drs) {
    const row: number[] = []
    for (const tg of tgs) {
      try {
        const r = runDcf({ ...base, discountRate: dr, terminalGrowth: tg })
        row.push(r.intrinsicValuePerShare ?? r.equityValue)
      } catch {
        row.push(NaN)
      }
    }
    values.push(row)
  }
  return {
    rowLabel: 'Discount rate (WACC)',
    colLabel: 'Terminal growth',
    rowValues: drs,
    colValues: tgs,
    values,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WACC helper
// ─────────────────────────────────────────────────────────────────────────────

export interface WaccInputs {
  marketCapEquity: number   // E
  totalDebt: number         // D
  costOfEquity: number      // Re (decimal, e.g. 0.10)
  costOfDebt: number        // Rd (pre-tax, decimal)
  taxRate: number           // tc (decimal)
}

/** Capital-structure-weighted WACC = (E/V)·Re + (D/V)·Rd·(1−tc). */
export function wacc({ marketCapEquity, totalDebt, costOfEquity, costOfDebt, taxRate }: WaccInputs): number {
  const V = marketCapEquity + totalDebt
  if (V <= 0) return costOfEquity
  const we = marketCapEquity / V
  const wd = totalDebt / V
  return we * costOfEquity + wd * costOfDebt * (1 - taxRate)
}

/** CAPM cost of equity: Re = rf + β · ERP. */
export function capmCostOfEquity(riskFreeRate: number, beta: number, equityRiskPremium: number): number {
  return riskFreeRate + beta * equityRiskPremium
}
