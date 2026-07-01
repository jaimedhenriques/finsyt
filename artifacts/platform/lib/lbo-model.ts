/**
 * LBO Model Engine
 * ────────────────
 * Implements a leveraged-buyout model at IB/PE depth:
 *   - Sources & Uses table
 *   - Debt schedule (multiple tranches: Senior, Subordinated, Mezzanine)
 *   - Year-by-year free cash flow projection
 *   - Equity returns: IRR and MOIC
 *   - Exit sensitivity grid across entry and exit multiples
 *
 * All calculations are pure functions with no external dependencies.
 * Inspired by standard PE/IB LBO frameworks (Harrison/Rosenbaum, BIWS).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────────────────────────────────────

export interface LboDebtTranche {
  name: string
  /** Notional as a multiple of EBITDA (e.g. 3.5 = 3.5x EBITDA). */
  leverage: number
  /** Coupon / interest rate (decimal, e.g. 0.07 = 7%). */
  rate: number
  /** Annual mandatory amortization as % of initial principal (decimal, 0.05 = 5%/yr). */
  amortization: number
}

export interface LboAssumptions {
  /** Target company trailing EBITDA (in millions). */
  ebitda: number
  /** Entry EV / EBITDA multiple paid. */
  entryMultiple: number
  /** Projected exit EV / EBITDA multiple. */
  exitMultiple: number
  /** Hold period in years. */
  holdPeriod: number
  /** EBITDA CAGR over the hold period (decimal, 0.08 = 8%). */
  ebitdaGrowth: number
  /** CapEx as % of revenue (decimal). Used to derive Unlevered FCF. */
  capexPctRevenue?: number
  /** Revenue if available (for CapEx calc). If omitted, CapEx defaults to 3% of EBITDA. */
  revenue?: number
  /** Net working capital change as % of revenue (decimal). Default 0.5%. */
  nwcChangePct?: number
  /** Tax rate (decimal, default 0.25). */
  taxRate?: number
  /**
   * Debt tranches. If omitted, a standard 4.5x Leverage stack is used:
   * 3.0x Senior TLB at 7%, 1.5x Sub/2L at 10%.
   */
  tranches?: LboDebtTranche[]
  /** Transaction fees as % of EV (arranger, advisory, etc.). Default 2%. */
  transactionFeePct?: number
  /** Management rollover equity (in millions). Treated as non-cash use of funds but reduces sponsor equity. */
  managementRollover?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface LboSourcesUses {
  /** Total enterprise value at purchase. */
  purchaseEv: number
  /** Transaction fees (advisory, financing). */
  transactionFees: number
  /** Total uses of funds. */
  totalUses: number
  tranches: Array<{
    name: string
    principal: number
    rate: number
    amortization: number
    leverage: number
  }>
  /** Total debt raised. */
  totalDebt: number
  /** Management rollover (if any). */
  managementRollover: number
  /** Sponsor equity contribution (cash equity check). */
  sponsorEquity: number
  /** Equity as % of total uses (equity cushion). */
  equityPct: number
}

export interface LboDebtScheduleRow {
  year: number
  ebitda: number
  /** Levered free cash flow (after tax, interest, capex, nwc). */
  lFcf: number
  /** Debt service: total interest paid across all tranches. */
  totalInterest: number
  /** Total mandatory amortization paid. */
  totalAmortization: number
  /** Ending total debt balance. */
  debtBalance: number
  /** Ending equity value (EV − debt). */
  equityValue: number
  /** Per-tranche balances. */
  trancheBalances: Record<string, number>
}

export interface LboReturns {
  /** Exit enterprise value. */
  exitEv: number
  /** Net equity proceeds (exit EV − residual debt). */
  netEquityProceeds: number
  /** MOIC: net proceeds / sponsor equity invested. */
  moic: number
  /** IRR (internal rate of return): annualized. */
  irr: number
  /** Residual total debt at exit. */
  residualDebt: number
}

export interface LboSensitivityGrid {
  rowLabel: string
  colLabel: string
  rowValues: number[]
  colValues: number[]
  /** values[row][col]: IRR at each (entryMultiple, exitMultiple) combination. */
  irrGrid: number[][]
  /** values[row][col]: MOIC at each combination. */
  moicGrid: number[][]
}

export interface LboResult {
  assumptions: LboAssumptions & {
    tranches: LboDebtTranche[]
    taxRate: number
    transactionFeePct: number
  }
  sourcesUses: LboSourcesUses
  schedule: LboDebtScheduleRow[]
  returns: LboReturns
  sensitivity: LboSensitivityGrid
  /** Warnings from the model (non-fatal). */
  warnings: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Default tranches
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TRANCHES: LboDebtTranche[] = [
  { name: 'Senior TLB',       leverage: 3.0, rate: 0.075, amortization: 0.01 },
  { name: 'Subordinated / 2L', leverage: 1.5, rate: 0.100, amortization: 0.00 },
]

// ─────────────────────────────────────────────────────────────────────────────
// IRR solver (Newton-Raphson on NPV)
// ─────────────────────────────────────────────────────────────────────────────

function solveIrr(cashFlows: number[]): number {
  if (cashFlows.length < 2) return NaN
  // Initial guess via XIRR heuristic
  let r = 0.20
  for (let i = 0; i < 100; i++) {
    let npv = 0
    let dnpv = 0
    for (let t = 0; t < cashFlows.length; t++) {
      const disc = Math.pow(1 + r, t)
      npv  += cashFlows[t] / disc
      dnpv -= t * cashFlows[t] / (disc * (1 + r))
    }
    if (Math.abs(dnpv) < 1e-12) break
    const rNew = r - npv / dnpv
    if (Math.abs(rNew - r) < 1e-8) { r = rNew; break }
    r = rNew
    // Clamp to avoid divergence
    if (r < -0.99) r = -0.99
    if (r > 10) r = 10
  }
  return r
}

// ─────────────────────────────────────────────────────────────────────────────
// Core LBO computation (no sensitivity grid — prevents recursion)
// ─────────────────────────────────────────────────────────────────────────────

interface LboCore {
  sourcesUses: LboSourcesUses
  schedule: LboDebtScheduleRow[]
  returns: LboReturns
  warnings: string[]
  resolvedAssumptions: LboResult['assumptions']
}

function runLboCore(a: LboAssumptions): LboCore {
  const warnings: string[] = []

  const taxRate          = a.taxRate          ?? 0.25
  const transactionFeePct = a.transactionFeePct ?? 0.02
  const tranches         = a.tranches          ?? DEFAULT_TRANCHES
  const managementRollover = a.managementRollover ?? 0

  // ── Sources & Uses ─────────────────────────────────────────────────────────
  const purchaseEv      = a.ebitda * a.entryMultiple
  const transactionFees = purchaseEv * transactionFeePct

  const trancheDetails = tranches.map((t) => ({
    name:         t.name,
    principal:    a.ebitda * t.leverage,
    rate:         t.rate,
    amortization: t.amortization,
    leverage:     t.leverage,
  }))

  const totalDebt   = trancheDetails.reduce((s, t) => s + t.principal, 0)
  const totalUses   = purchaseEv + transactionFees
  const sponsorEquity = totalUses - totalDebt - managementRollover

  if (sponsorEquity < 0) {
    warnings.push('Debt tranches exceed total uses — sponsor equity is negative. Reduce leverage or entry multiple.')
  }

  const sourcesUses: LboSourcesUses = {
    purchaseEv,
    transactionFees,
    totalUses,
    tranches: trancheDetails,
    totalDebt,
    managementRollover,
    sponsorEquity,
    equityPct: totalUses > 0 ? sponsorEquity / totalUses : 0,
  }

  // ── Debt schedule & FCF projection ────────────────────────────────────────
  const schedule: LboDebtScheduleRow[] = []

  const balances: Record<string, number> = {}
  for (const t of trancheDetails) balances[t.name] = t.principal

  let ebitda = a.ebitda

  for (let yr = 1; yr <= a.holdPeriod; yr++) {
    ebitda = ebitda * (1 + a.ebitdaGrowth)

    let totalInterest = 0
    for (const t of trancheDetails) {
      totalInterest += (balances[t.name] ?? 0) * t.rate
    }

    const capex = a.revenue
      ? (a.revenue * Math.pow(1 + a.ebitdaGrowth, yr)) * (a.capexPctRevenue ?? 0.05)
      : ebitda * 0.08

    const nwcChange = a.revenue
      ? (a.revenue * Math.pow(1 + a.ebitdaGrowth, yr)) * (a.nwcChangePct ?? 0.005)
      : ebitda * 0.01

    const ebit = ebitda - (ebitda * 0.15)
    const ebt  = ebit - totalInterest
    const nopat = Math.max(ebt, 0) * (1 - taxRate)
    const lFcf  = nopat + (ebitda * 0.15) - capex - nwcChange

    let totalAmortization = 0
    const trancheBalances: Record<string, number> = {}
    for (const t of trancheDetails) {
      const amort = Math.min(balances[t.name] ?? 0, (t.principal * t.amortization))
      totalAmortization += amort
      balances[t.name] = (balances[t.name] ?? 0) - amort
      trancheBalances[t.name] = balances[t.name]
    }

    let cashSweep = Math.max(0, lFcf - totalAmortization)
    for (const t of trancheDetails) {
      if (cashSweep <= 0) break
      const paydown = Math.min(balances[t.name] ?? 0, cashSweep)
      balances[t.name] = (balances[t.name] ?? 0) - paydown
      trancheBalances[t.name] = balances[t.name]
      cashSweep -= paydown
    }

    const debtBalance = Object.values(balances).reduce((s, v) => s + v, 0)
    const evAtYear   = ebitda * a.exitMultiple
    const equityValue = Math.max(0, evAtYear - debtBalance)

    schedule.push({
      year: yr,
      ebitda,
      lFcf,
      totalInterest,
      totalAmortization,
      debtBalance,
      equityValue,
      trancheBalances: { ...trancheBalances },
    })
  }

  // ── Returns ────────────────────────────────────────────────────────────────
  const finalYear   = schedule[schedule.length - 1]!
  const exitEbitda  = finalYear.ebitda
  const exitEv      = exitEbitda * a.exitMultiple
  const residualDebt = finalYear.debtBalance
  const netEquityProceeds = Math.max(0, exitEv - residualDebt)
  const moic = sponsorEquity > 0 ? netEquityProceeds / sponsorEquity : 0

  const irrCashFlows = [-Math.max(sponsorEquity, 1e-6), ...Array(a.holdPeriod - 1).fill(0), netEquityProceeds]
  const irr = solveIrr(irrCashFlows)

  if (irr < 0.10) warnings.push('IRR below 10% — returns do not meet typical PE hurdle rates.')
  if (moic < 1.5) warnings.push('MOIC below 1.5x — marginal return on invested equity.')
  if (residualDebt > exitEv * 0.60) warnings.push('Residual debt still high at exit (>60% of exit EV) — may signal insufficient FCF generation.')

  const returns: LboReturns = { exitEv, netEquityProceeds, moic, irr, residualDebt }

  return {
    sourcesUses,
    schedule,
    returns,
    warnings,
    resolvedAssumptions: { ...a, tranches, taxRate, transactionFeePct },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public LBO runner — builds core result then adds sensitivity grid
// ─────────────────────────────────────────────────────────────────────────────

export function runLbo(a: LboAssumptions): LboResult {
  // Delegate all core math to runLboCore so the sensitivity grid below
  // can call runLboCore directly (not runLbo) to avoid infinite recursion.
  const core = runLboCore(a)

  // ── Sensitivity: IRR / MOIC vs entry × exit multiples ─────────────────────
  // Uses runLboCore (not runLbo) to prevent recursive calls.
  const entryRange = [a.entryMultiple - 1, a.entryMultiple - 0.5, a.entryMultiple, a.entryMultiple + 0.5, a.entryMultiple + 1]
    .filter(v => v > 0)
  const exitRange  = [a.exitMultiple - 1, a.exitMultiple - 0.5, a.exitMultiple, a.exitMultiple + 0.5, a.exitMultiple + 1]
    .filter(v => v > 0)

  const irrGrid: number[][]  = []
  const moicGrid: number[][] = []

  for (const entry of entryRange) {
    const irrRow: number[]  = []
    const moicRow: number[] = []
    for (const exit of exitRange) {
      try {
        const sub = runLboCore({ ...a, entryMultiple: entry, exitMultiple: exit })
        irrRow.push(sub.returns.irr)
        moicRow.push(sub.returns.moic)
      } catch {
        irrRow.push(NaN)
        moicRow.push(NaN)
      }
    }
    irrGrid.push(irrRow)
    moicGrid.push(moicRow)
  }

  const sensitivity: LboSensitivityGrid = {
    rowLabel:  'Entry EV/EBITDA',
    colLabel:  'Exit EV/EBITDA',
    rowValues: entryRange,
    colValues: exitRange,
    irrGrid,
    moicGrid,
  }

  return {
    assumptions: core.resolvedAssumptions,
    sourcesUses: core.sourcesUses,
    schedule:    core.schedule,
    returns:     core.returns,
    sensitivity,
    warnings:    core.warnings,
  }
}
