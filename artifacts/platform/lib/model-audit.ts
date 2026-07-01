/**
 * Model Audit Engine
 * ──────────────────
 * Detects broken references, out-of-range assumptions, and inconsistencies
 * across DCF, LBO, and trading-comps models.  Returns structured findings
 * with severity, explanation, and (where applicable) a suggested fix.
 *
 * Severity levels:
 *   'error'   — model output is unreliable or invalid (e.g. WACC ≤ terminal growth)
 *   'warning' — assumption is unusual or suspect; review recommended
 *   'info'    — informational note (e.g. high TV%, terminal multiple vs Gordon)
 */

import type { DcfAssumptions, DcfResult } from './dcf-model'
import type { LboAssumptions, LboResult } from './lbo-model'

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export type AuditSeverity = 'error' | 'warning' | 'info'

export interface AuditFinding {
  id: string
  severity: AuditSeverity
  field: string
  label: string
  message: string
  /** If set, a concrete alternative the user should consider. */
  suggestion?: string
  /** The observed value (numeric or string) for inline display. */
  observed?: string
  /** A reference or benchmark for context. */
  benchmark?: string
}

export interface AuditResult {
  modelType: 'dcf' | 'lbo' | 'comps'
  ticker?: string
  findings: AuditFinding[]
  /** Aggregate quality score 0–100 (100 = clean model). */
  score: number
  /** True when any finding is severity === 'error'. */
  hasErrors: boolean
  /** Summary sentence. */
  summary: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function pct(n: number) { return (n * 100).toFixed(2) + '%' }
function mult(n: number) { return n.toFixed(1) + 'x' }
function dollar(n: number) { return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'M' }

// ─────────────────────────────────────────────────────────────────────────────
// DCF audit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Audit a DCF model. Accepts both the raw input assumptions and the
 * computed result (so we can flag things like TV/EV > 90%).
 */
export function auditDcf(
  a: DcfAssumptions,
  result?: Partial<DcfResult>,
  ticker?: string,
): AuditResult {
  const findings: AuditFinding[] = []

  // ── Fatal structural checks ────────────────────────────────────────────────

  if (!a.terminalExitMultiple && a.discountRate <= a.terminalGrowth) {
    findings.push({
      id: 'dcf-wacc-lt-tg',
      severity: 'error',
      field: 'discountRate / terminalGrowth',
      label: 'WACC ≤ Terminal Growth',
      message: 'The Gordon Growth formula requires WACC > terminal growth rate. The model will produce a negative or infinite terminal value.',
      observed: `WACC ${pct(a.discountRate)}, g ${pct(a.terminalGrowth)}`,
      suggestion: `Raise WACC above ${pct(a.terminalGrowth)} or reduce terminal growth below ${pct(a.discountRate)}.`,
    })
  }

  if (a.baseFcf != null && a.baseFcf <= 0) {
    findings.push({
      id: 'dcf-negative-fcf',
      severity: 'error',
      field: 'baseFcf',
      label: 'Negative or Zero Base FCF',
      message: 'A DCF starting from negative FCF will invert the model — stage-1 cash flows will be outflows, distorting terminal value.',
      observed: dollar(a.baseFcf),
      suggestion: 'Use normalized or run-rate FCF. If the company is pre-profit, consider an exit-multiple terminal instead.',
    })
  }

  // ── WACC range checks ──────────────────────────────────────────────────────

  if (a.discountRate < 0.04) {
    findings.push({
      id: 'dcf-wacc-too-low',
      severity: 'warning',
      field: 'discountRate',
      label: 'WACC Below 4%',
      message: 'A WACC below 4% is unusually low — even investment-grade firms in low-rate environments typically use 5-7%. This will inflate the DCF significantly.',
      observed: pct(a.discountRate),
      benchmark: '6–12% typical range',
      suggestion: 'Verify the WACC build-up (CAPM + capital structure). A floor of 6% is common in PE practice.',
    })
  }

  if (a.discountRate > 0.20) {
    findings.push({
      id: 'dcf-wacc-too-high',
      severity: 'warning',
      field: 'discountRate',
      label: 'WACC Above 20%',
      message: 'A WACC above 20% is more appropriate for distressed or very early-stage businesses. Applied to a mature cash-flowing company it will severely discount value.',
      observed: pct(a.discountRate),
      benchmark: '6–12% typical range',
    })
  }

  // ── Terminal growth range ──────────────────────────────────────────────────

  if (a.terminalGrowth > 0.05) {
    findings.push({
      id: 'dcf-tg-too-high',
      severity: 'warning',
      field: 'terminalGrowth',
      label: 'Terminal Growth Above 5%',
      message: 'A terminal growth rate above 5% implies the company will grow faster than the global economy in perpetuity — mechanically unsustainable. Common benchmarks are 1.5-3.5% (nominal GDP growth).',
      observed: pct(a.terminalGrowth),
      benchmark: '1.5–3.5%',
      suggestion: 'Cap terminal growth at long-run nominal GDP (≈2-3%) unless there is a strong sector-specific rationale.',
    })
  }

  if (a.terminalGrowth < 0) {
    findings.push({
      id: 'dcf-tg-negative',
      severity: 'warning',
      field: 'terminalGrowth',
      label: 'Negative Terminal Growth',
      message: 'Negative perpetual growth implies eventual zero revenue. This is valid for declining businesses but will produce a very low terminal value.',
      observed: pct(a.terminalGrowth),
    })
  }

  // ── Stage-1 growth ────────────────────────────────────────────────────────

  if (a.growthStage1 > 0.50) {
    findings.push({
      id: 'dcf-stage1-growth-extreme',
      severity: 'warning',
      field: 'growthStage1',
      label: 'Stage-1 Growth Exceeds 50%',
      message: 'Very high near-term growth assumptions are hard to sustain and sensitive to execution risk. At >50%, slight miss in a single year materially alters the model.',
      observed: pct(a.growthStage1),
      benchmark: '<30% for hyper-growth, <15% for large-caps',
    })
  }

  if (a.growthStage1 < a.terminalGrowth && !a.terminalExitMultiple) {
    findings.push({
      id: 'dcf-stage1-lt-terminal',
      severity: 'warning',
      field: 'growthStage1',
      label: 'Stage-1 Growth Below Terminal Growth',
      message: 'The near-term growth rate is below the terminal (perpetuity) growth rate, which implies the business accelerates in perpetuity — the reverse of the usual fading growth model.',
      observed: `Stage-1 ${pct(a.growthStage1)}, terminal ${pct(a.terminalGrowth)}`,
      suggestion: 'Ensure stage-1 growth ≥ terminal growth for a standard convergence model.',
    })
  }

  // ── Terminal-value concentration ──────────────────────────────────────────

  if (result?.terminalValuePctOfEv != null) {
    const tvPct = result.terminalValuePctOfEv
    if (tvPct > 0.90) {
      findings.push({
        id: 'dcf-tv-concentration',
        severity: 'warning',
        field: 'terminalValuePctOfEv',
        label: 'Terminal Value > 90% of EV',
        message: `${pct(tvPct)} of enterprise value is in the terminal value — the model is almost entirely dependent on perpetuity assumptions, making it extremely sensitive to WACC and growth rate changes.`,
        observed: pct(tvPct),
        benchmark: '60–80% is typical; >90% warrants scrutiny',
        suggestion: 'Extend the explicit forecast horizon, or validate with an exit-multiple terminal cross-check.',
      })
    } else if (tvPct > 0.80) {
      findings.push({
        id: 'dcf-tv-high',
        severity: 'info',
        field: 'terminalValuePctOfEv',
        label: 'Terminal Value 80–90% of EV',
        message: `${pct(tvPct)} of EV comes from the terminal value. This is within common range but warrants a sensitivity cross-check.`,
        observed: pct(tvPct),
      })
    }
  }

  // ── Net debt sanity ────────────────────────────────────────────────────────

  if (result?.enterpriseValue != null && a.netDebt != null) {
    const evRatio = Math.abs(a.netDebt) / result.enterpriseValue
    if (evRatio > 0.80) {
      findings.push({
        id: 'dcf-net-debt-large',
        severity: 'warning',
        field: 'netDebt',
        label: 'Net Debt > 80% of Enterprise Value',
        message: 'Net debt is more than 80% of EV, meaning the equity residual is highly levered. Small changes in EV swing equity value dramatically (high equity beta).',
        observed: dollar(a.netDebt),
        benchmark: '<60% of EV',
      })
    }
  }

  // ── Intrinsic vs current price gap ────────────────────────────────────────

  if (result?.intrinsicValuePerShare != null && (result as any)?.currentPrice != null) {
    const iv = result.intrinsicValuePerShare as number
    const cp = (result as any).currentPrice as number
    const gap = (iv - cp) / cp
    if (Math.abs(gap) > 1.0) {
      findings.push({
        id: 'dcf-large-price-gap',
        severity: 'info',
        field: 'intrinsicValuePerShare',
        label: `Intrinsic Value ${gap > 0 ? '+' : ''}${pct(gap)} vs Current Price`,
        message: `The model implies a ${Math.abs(gap * 100).toFixed(0)}% ${gap > 0 ? 'upside' : 'downside'} to the current market price. Gaps >100% typically indicate aggressive assumptions or a materially mispriced opportunity — both warrant scrutiny.`,
        observed: `IV $${iv.toFixed(2)} vs price $${cp.toFixed(2)}`,
      })
    }
  }

  return buildAuditResult('dcf', findings, ticker)
}

// ─────────────────────────────────────────────────────────────────────────────
// LBO audit
// ─────────────────────────────────────────────────────────────────────────────

export function auditLbo(a: LboAssumptions, result: LboResult, ticker?: string): AuditResult {
  const findings: AuditFinding[] = []

  // ── Leverage checks ────────────────────────────────────────────────────────

  const totalLeverage = (a.tranches ?? result.assumptions.tranches).reduce((s, t) => s + t.leverage, 0)
  if (totalLeverage > 7) {
    findings.push({
      id: 'lbo-leverage-extreme',
      severity: 'error',
      field: 'leverage',
      label: 'Total Leverage > 7x EBITDA',
      message: 'Combined leverage above 7x EBITDA is rarely achievable in leveraged-loan markets for most sectors and substantially elevates default risk.',
      observed: `${totalLeverage.toFixed(1)}x`,
      benchmark: '4–6x typical LBO market',
      suggestion: 'Reduce total leverage to 5–6x EBITDA maximum unless sector/credit profile justifies higher.',
    })
  } else if (totalLeverage > 5.5) {
    findings.push({
      id: 'lbo-leverage-high',
      severity: 'warning',
      field: 'leverage',
      label: 'Total Leverage > 5.5x EBITDA',
      message: 'Leverage above 5.5x is achievable but positions the deal in the riskier portion of the market. Covenant headroom and refinancing risk increase.',
      observed: `${totalLeverage.toFixed(1)}x`,
      benchmark: '4–5.5x is most common',
    })
  }

  // ── Equity cushion ─────────────────────────────────────────────────────────

  if (result.sourcesUses.equityPct < 0.20) {
    findings.push({
      id: 'lbo-thin-equity',
      severity: 'warning',
      field: 'equityPct',
      label: 'Equity Contribution Below 20%',
      message: `Only ${pct(result.sourcesUses.equityPct)} of the purchase price is funded by equity — very thin cushion against downside. Lenders typically require 30–40%.`,
      observed: pct(result.sourcesUses.equityPct),
      benchmark: '30–40%',
    })
  }

  // ── EBITDA growth vs leverage ──────────────────────────────────────────────

  if (a.ebitdaGrowth > 0.20) {
    findings.push({
      id: 'lbo-ebitda-growth-high',
      severity: 'warning',
      field: 'ebitdaGrowth',
      label: 'EBITDA CAGR Above 20%',
      message: 'An EBITDA CAGR assumption of >20% over the hold period is aggressive for a levered entity. High growth + high debt service is an execution-risk amplifier.',
      observed: pct(a.ebitdaGrowth),
      benchmark: '5–15% typical PE portco assumption',
    })
  }

  if (a.ebitdaGrowth < 0) {
    findings.push({
      id: 'lbo-ebitda-declining',
      severity: 'warning',
      field: 'ebitdaGrowth',
      label: 'Declining EBITDA in LBO',
      message: 'LBOs depend on FCF to service debt. A shrinking EBITDA profile means debt service will consume an increasing share of cash, risking a coverage breach.',
      observed: pct(a.ebitdaGrowth),
    })
  }

  // ── Returns checks ─────────────────────────────────────────────────────────

  if (result.returns.irr < 0.15) {
    findings.push({
      id: 'lbo-irr-low',
      severity: 'warning',
      field: 'irr',
      label: 'IRR Below 15%',
      message: 'Most buyout funds target 20–25% IRR. Returns below 15% may not clear the hurdle rate after management fees and carried interest.',
      observed: pct(result.returns.irr),
      benchmark: '20–25% typical PE hurdle',
    })
  }

  if (result.returns.moic < 2.0) {
    findings.push({
      id: 'lbo-moic-low',
      severity: 'warning',
      field: 'moic',
      label: 'MOIC Below 2.0x',
      message: '2x MOIC is roughly the minimum return that justifies the illiquidity and risk of a PE holding.',
      observed: `${result.returns.moic.toFixed(2)}x`,
      benchmark: '2.5–3.5x typical target',
    })
  }

  if (result.returns.irr > 0.50) {
    findings.push({
      id: 'lbo-irr-implausible',
      severity: 'info',
      field: 'irr',
      label: 'IRR > 50%',
      message: 'Returns above 50% may indicate a very low entry multiple, aggressive growth assumption, or arithmetic issue. Cross-check assumptions.',
      observed: pct(result.returns.irr),
    })
  }

  // ── Entry / exit multiple mismatch ─────────────────────────────────────────

  if (a.exitMultiple < a.entryMultiple * 0.7) {
    findings.push({
      id: 'lbo-exit-lt-entry',
      severity: 'warning',
      field: 'exitMultiple',
      label: 'Exit Multiple Significantly Below Entry',
      message: `Exiting at ${mult(a.exitMultiple)} vs entering at ${mult(a.entryMultiple)} (${pct((a.exitMultiple - a.entryMultiple) / a.entryMultiple)} multiple compression). This is a bearish exit scenario — make sure it is intentional.`,
      observed: `Entry ${mult(a.entryMultiple)} → Exit ${mult(a.exitMultiple)}`,
    })
  }

  if (a.exitMultiple > a.entryMultiple * 1.5) {
    findings.push({
      id: 'lbo-exit-gt-entry-large',
      severity: 'info',
      field: 'exitMultiple',
      label: 'Large Multiple Expansion Assumed',
      message: `Exit at ${mult(a.exitMultiple)} vs entry at ${mult(a.entryMultiple)} assumes meaningful multiple expansion. LBO returns driven by multiple expansion are less robust than those from debt paydown + EBITDA growth.`,
      observed: `Entry ${mult(a.entryMultiple)} → Exit ${mult(a.exitMultiple)}`,
    })
  }

  // ── Hold period ────────────────────────────────────────────────────────────

  if (a.holdPeriod < 3) {
    findings.push({
      id: 'lbo-short-hold',
      severity: 'info',
      field: 'holdPeriod',
      label: 'Short Hold Period (< 3 Years)',
      message: 'LBOs typically model a 4–7 year hold. A 1-2 year hold implies a quick flip and limits debt paydown runway.',
      observed: `${a.holdPeriod}y`,
      benchmark: '4–7 years typical',
    })
  }

  if (a.holdPeriod > 10) {
    findings.push({
      id: 'lbo-long-hold',
      severity: 'info',
      field: 'holdPeriod',
      label: 'Extended Hold Period (> 10 Years)',
      message: 'A 10+ year hold is rare for a PE buyout and may distort IRR vs MOIC comparisons. Consider whether this is a hold-co or GP-led continuation scenario.',
      observed: `${a.holdPeriod}y`,
    })
  }

  return buildAuditResult('lbo', findings, ticker)
}

// ─────────────────────────────────────────────────────────────────────────────
// Comps / transaction comps audit
// ─────────────────────────────────────────────────────────────────────────────

export interface TxCompsAuditInput {
  multiples: Array<{ label: string; evEbitda?: number | null; evRevenue?: number | null; dealValue?: number | null }>
  subjectEvEbitda?: number | null
  subjectEvRevenue?: number | null
}

export function auditTxComps(input: TxCompsAuditInput, ticker?: string): AuditResult {
  const findings: AuditFinding[] = []

  const valid = input.multiples.filter(m => m.evEbitda != null && Number.isFinite(m.evEbitda) && (m.evEbitda as number) > 0)

  if (valid.length < 3) {
    findings.push({
      id: 'comps-thin-set',
      severity: 'warning',
      field: 'comparableCount',
      label: 'Fewer Than 3 Valid Comparables',
      message: `Only ${valid.length} transaction(s) have usable EV/EBITDA data. IB convention requires at least 5–8 precedent transactions for a robust comp set.`,
      observed: `${valid.length} comps`,
      benchmark: '5–8 minimum',
    })
  }

  if (valid.length >= 3) {
    const evEbitdas = valid.map(m => m.evEbitda as number).sort((a, b) => a - b)
    const q1 = evEbitdas[Math.floor(evEbitdas.length * 0.25)]!
    const q3 = evEbitdas[Math.floor(evEbitdas.length * 0.75)]!
    const iqr = q3 - q1
    const outliers = evEbitdas.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr)

    if (outliers.length > 0) {
      findings.push({
        id: 'comps-outliers',
        severity: 'info',
        field: 'evEbitda',
        label: `${outliers.length} Outlier Transaction(s) in Comp Set`,
        message: `${outliers.length} transaction multiple(s) fall outside 1.5× IQR: ${outliers.map(v => mult(v)).join(', ')}. Consider trimming or explaining these outliers before citing the range.`,
        observed: `IQR ${mult(q1)}–${mult(q3)}`,
      })
    }

    // Subject vs comps gap
    if (input.subjectEvEbitda != null && Number.isFinite(input.subjectEvEbitda)) {
      const median = evEbitdas[Math.floor(evEbitdas.length / 2)]!
      const gap = ((input.subjectEvEbitda - median) / median)
      if (Math.abs(gap) > 0.30) {
        findings.push({
          id: 'comps-subject-outlier',
          severity: 'info',
          field: 'subjectEvEbitda',
          label: `Subject EV/EBITDA ${gap > 0 ? 'Premium' : 'Discount'} to Comps Median`,
          message: `The subject company's EV/EBITDA (${mult(input.subjectEvEbitda)}) is ${Math.abs(gap * 100).toFixed(0)}% ${gap > 0 ? 'above' : 'below'} the precedent transaction median (${mult(median)}). Document the premium/discount rationale.`,
          observed: mult(input.subjectEvEbitda),
          benchmark: `Comps median ${mult(median)}`,
        })
      }
    }
  }

  return buildAuditResult('comps', findings, ticker)
}

// ─────────────────────────────────────────────────────────────────────────────
// Score + result builder
// ─────────────────────────────────────────────────────────────────────────────

function buildAuditResult(
  modelType: AuditResult['modelType'],
  findings: AuditFinding[],
  ticker?: string,
): AuditResult {
  const hasErrors = findings.some(f => f.severity === 'error')
  const errorCount   = findings.filter(f => f.severity === 'error').length
  const warningCount = findings.filter(f => f.severity === 'warning').length
  const infoCount    = findings.filter(f => f.severity === 'info').length

  // Score: start at 100, deduct 30/10/3 per finding level
  const score = Math.max(0, 100 - errorCount * 30 - warningCount * 10 - infoCount * 3)

  let summary: string
  if (findings.length === 0) {
    summary = 'No issues detected. The model passes all standard checks.'
  } else if (hasErrors) {
    summary = `${errorCount} critical error${errorCount > 1 ? 's' : ''} found — model output is unreliable until resolved.`
  } else if (warningCount > 0) {
    summary = `${warningCount} warning${warningCount > 1 ? 's' : ''} found — assumptions should be reviewed before presenting.`
  } else {
    summary = `${infoCount} informational note${infoCount > 1 ? 's' : ''} — model looks structurally sound.`
  }

  return { modelType, ticker, findings, score, hasErrors, summary }
}
