import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { runDcf, dcfSensitivity, capmCostOfEquity, type DcfAssumptions } from '@/lib/dcf-model'
import { GET as financialsHandler } from '@/app/api/financials/route'
import { INTERNAL_BYPASS_HEADER, isInternalBypass } from '@/lib/internal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/dcf — quick valuation given inline assumptions.
 *  ?baseFcf=10000           (millions) trailing FCF to firm
 *  ?growthStage1=0.10
 *  ?growthStage2=0.05       (optional; defaults to growthStage1)
 *  ?stage1Years=5
 *  ?stage2Years=5
 *  ?terminalGrowth=0.025
 *  ?discountRate=0.09       (WACC)
 *  ?netDebt=0               (millions)
 *  ?sharesOutstanding=0     (millions)
 *  ?terminalExitMultiple=   optional EV/FCF exit multiple instead of Gordon
 *  ?sensitivity=true        return a 5×5 grid across ±2 % WACC × ±1 % g
 *
 * For a ticker-anchored DCF that pulls baseFcf / netDebt / shares from the
 * platform's financials provider, POST { symbol, growthStage1, ... }.
 *
 * This GET is pure math — no upstream calls — and remains unauthenticated.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const num = (k: string, dflt?: number): number | undefined => {
    const v = sp.get(k)
    if (v == null || v === '') return dflt
    const n = Number(v)
    return Number.isFinite(n) ? n : dflt
  }
  const baseFcf = num('baseFcf')
  const growthStage1 = num('growthStage1')
  const terminalGrowth = num('terminalGrowth')
  const discountRate = num('discountRate')
  if (baseFcf == null || growthStage1 == null || terminalGrowth == null || discountRate == null) {
    return NextResponse.json({
      error: 'missing required params',
      required: ['baseFcf', 'growthStage1', 'terminalGrowth', 'discountRate'],
      example: '/api/dcf?baseFcf=10000&growthStage1=0.10&terminalGrowth=0.025&discountRate=0.09&sharesOutstanding=1000&netDebt=2000',
    }, { status: 400 })
  }
  const a: DcfAssumptions = {
    baseFcf,
    growthStage1,
    growthStage2: num('growthStage2'),
    stage1Years: num('stage1Years'),
    stage2Years: num('stage2Years'),
    terminalGrowth,
    discountRate,
    netDebt: num('netDebt', 0),
    sharesOutstanding: num('sharesOutstanding'),
    terminalExitMultiple: num('terminalExitMultiple'),
  }
  try {
    const result = runDcf(a)
    const body: Record<string, unknown> = { source: 'finsyt_dcf', ...result }
    if (sp.get('sensitivity') === 'true') {
      body.sensitivity = dcfSensitivity(a)
    }
    return NextResponse.json(body)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

/**
 * POST /api/dcf — ticker-anchored DCF.
 *
 *   { "symbol": "AAPL",
 *     "growthStage1": 0.08,
 *     "growthStage2": 0.04,
 *     "stage1Years": 5,
 *     "stage2Years": 5,
 *     "terminalGrowth": 0.025,
 *     "discountRate": 0.09,            // optional — derived from CAPM if omitted
 *     "riskFreeRate": 0.04,            // CAPM input if discountRate omitted
 *     "equityRiskPremium": 0.055,
 *     "beta": 1.2,                     // CAPM input
 *     "sensitivity": true
 *   }
 *
 * Pulls baseFcf, netDebt, sharesOutstanding directly from the financials
 * provider (no self-fetch). Auth-gated because this consumes paid upstream
 * data-provider quota: requires either a Clerk workspace session OR a
 * Bearer API key that already passed `/api/v1/dcf` auth.
 *
 * The public mirror (/api/v1/dcf) attaches a per-process internal-bypass
 * token (see lib/internal-auth.ts) after a successful Bearer-key check, so
 * the mirror can compose this POST without re-running Clerk auth. The
 * token rotates on every process restart and never leaves this Node.js
 * process — external callers cannot spoof it.
 */
export async function POST(req: NextRequest) {
  // Auth: allow if (a) a Clerk session is present, or (b) the request was
  // composed in-process by /api/v1/dcf and carries a valid bypass token.
  if (!isInternalBypass(req.headers.get(INTERNAL_BYPASS_HEADER))) {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        error: 'Unauthorized — POST /api/dcf requires a workspace session or a Bearer API key via /api/v1/dcf (it consumes paid financial-data quota).',
      }, { status: 401 })
    }
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const symbol = String(body.symbol || '').toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 })

  const num = (k: string, dflt?: number): number | undefined => {
    const v = body[k]
    if (v == null || v === '') return dflt
    const n = Number(v)
    return Number.isFinite(n) ? n : dflt
  }
  let discountRate = num('discountRate')
  if (discountRate == null) {
    const rf = num('riskFreeRate', 0.04) as number
    const erp = num('equityRiskPremium', 0.055) as number
    const beta = num('beta', 1.0) as number
    discountRate = capmCostOfEquity(rf, beta, erp)
  }

  // Pull base FCF / net debt / shares directly from the financials handler
  // (no self-fetch, so this works regardless of origin and is one fewer
  // network hop). The mnemonics match what `/api/financials` exposes:
  // iq_free_cash_flow, iq_total_debt, iq_cash_st_invest, iq_diluted_shares.
  let fin: Record<string, unknown> | null = null
  try {
    const finUrl = new URL(
      `http://internal/api/financials?symbol=${encodeURIComponent(symbol)}`
      + `&metrics=iq_free_cash_flow,iq_total_debt,iq_cash_st_invest,iq_diluted_shares&period=A&limit=1`,
    )
    const finRes = await financialsHandler(new NextRequest(finUrl.toString()))
    const t = await finRes.text()
    try { fin = t ? JSON.parse(t) as Record<string, unknown> : null } catch { fin = null }
  } catch (e) {
    return NextResponse.json({ error: `financials provider failed: ${(e as Error).message}` }, { status: 502 })
  }

  const baseFcf = num('baseFcf') ?? extractFinNumber(fin, 'iq_free_cash_flow')
  const totalDebt = num('totalDebt') ?? extractFinNumber(fin, 'iq_total_debt') ?? 0
  const cash = num('cash') ?? extractFinNumber(fin, 'iq_cash_st_invest') ?? 0
  const netDebt = num('netDebt') ?? (totalDebt - cash)
  const sharesOutstanding = num('sharesOutstanding') ?? extractFinNumber(fin, 'iq_diluted_shares')

  if (baseFcf == null) {
    return NextResponse.json({
      error: `Could not derive baseFcf for ${symbol} from /api/financials. Provide baseFcf explicitly.`,
      financialsResponse: fin,
    }, { status: 400 })
  }

  const a: DcfAssumptions = {
    baseFcf,
    growthStage1: num('growthStage1', 0.08) as number,
    growthStage2: num('growthStage2'),
    stage1Years: num('stage1Years', 5),
    stage2Years: num('stage2Years', 5),
    terminalGrowth: num('terminalGrowth', 0.025) as number,
    discountRate,
    netDebt,
    sharesOutstanding,
    terminalExitMultiple: num('terminalExitMultiple'),
  }
  try {
    const result = runDcf(a)
    const out: Record<string, unknown> = {
      source: 'finsyt_dcf',
      symbol,
      derivedFromFinancials: {
        baseFcf: extractFinNumber(fin, 'iq_free_cash_flow'),
        totalDebt: extractFinNumber(fin, 'iq_total_debt'),
        cash: extractFinNumber(fin, 'iq_cash_st_invest'),
        sharesOutstanding: extractFinNumber(fin, 'iq_diluted_shares'),
      },
      ...result,
    }
    if (body.sensitivity === true) out.sensitivity = dcfSensitivity(a)
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

/**
 * Best-effort extraction of a single numeric value from a `/api/financials`
 * response. The actual response shape is:
 *   { symbol, period, source, [mnemonic]: { value, date?, currency?, error? } }
 * but we also tolerate two legacy shapes for forward compatibility:
 *   { metrics: { [mnemonic]: { values: [{ value }] } } }   // batch shape
 *   { metric: 'X', values: [{ value }] }                    // single-metric shape
 */
function extractFinNumber(fin: unknown, mnemonic: string): number | undefined {
  if (!fin || typeof fin !== 'object') return undefined
  const f = fin as Record<string, unknown>

  // Primary shape: top-level mnemonic key with { value }.
  const top = f[mnemonic]
  if (top && typeof top === 'object' && !Array.isArray(top)) {
    const v = (top as { value?: number | string | null }).value
    if (v != null) {
      const n = typeof v === 'number' ? v : Number(v)
      if (Number.isFinite(n)) return n
    }
  }

  // Legacy batch shape: { metrics: { mnemonic: { values: [{ value }] } } }
  const fromMetrics = (f.metrics as Record<string, unknown> | undefined)?.[mnemonic]
  if (fromMetrics && typeof fromMetrics === 'object') {
    const arr = (fromMetrics as { values?: Array<{ value?: number | string }> }).values
    if (Array.isArray(arr) && arr.length) {
      const v = arr[0].value
      const n = typeof v === 'number' ? v : Number(v)
      if (Number.isFinite(n)) return n
    }
  }

  // Legacy direct array shape: { mnemonic: [{ value }] }
  if (Array.isArray(top) && top.length) {
    const v = (top[0] as { value?: number | string })?.value
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) return n
  }

  // Single-metric shape: { metric: 'x', values: [...] }
  if (f.metric === mnemonic && Array.isArray(f.values) && f.values.length) {
    const v = (f.values[0] as { value?: number | string })?.value
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) return n
  }

  return undefined
}
