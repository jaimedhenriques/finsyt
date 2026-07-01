import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { OPENAI_BASE, OPENAI_KEY, OPENAI_MODEL } from '@/lib/agent-core'
import { runDcf, dcfSensitivity, type DcfAssumptions } from '@/lib/dcf-model'
import { runLbo } from '@/lib/lbo-model'
import { auditDcf, auditLbo, auditTxComps } from '@/lib/model-audit'
import { GET as financialsHandler } from '@/app/api/financials/route'
import { INTERNAL_BYPASS_HEADER, internalBypassHeaderValue } from '@/lib/internal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Model spec types ────────────────────────────────────────────────────────

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

// ── LLM parse helpers ───────────────────────────────────────────────────────

const PARSE_SYSTEM = `You are a financial model spec parser for an institutional research platform.
Parse the user's natural-language model request into a structured JSON object.

Output ONLY a raw JSON object (no markdown, no code fences) matching this schema:
{
  "type": "dcf" | "comps" | "both" | "lbo" | "tx-comps" | "audit",
  "ticker": "AAPL",               // primary ticker symbol (uppercase)
  "peerSymbols": ["MSFT","GOOG"], // peer / comp symbols (up to 8, uppercase)
  "assumptions": {
    "wacc": 0.09,                 // discount rate (decimal, default 0.09)
    "terminalGrowth": 0.025,      // terminal growth rate (decimal, default 0.025)
    "growthStage1": 0.10,         // stage-1 FCF growth (decimal)
    "growthStage2": 0.05,         // stage-2 FCF growth (decimal, fade from stage1 to terminal)
    "stage1Years": 5,             // years in stage 1 (default 5)
    "stage2Years": 5              // years in stage 2 (default 5)
  },
  "lboAssumptions": {             // only when type is "lbo"
    "entryMultiple": 12.0,        // EV/EBITDA entry multiple
    "exitMultiple": 12.0,         // EV/EBITDA exit multiple (default = entry)
    "holdPeriod": 5,              // years (default 5)
    "ebitdaGrowth": 0.08,         // EBITDA CAGR decimal (default 0.08)
    "totalLeverage": 4.5,         // total debt as multiple of EBITDA (default 4.5)
    "seniorRate": 0.075,          // senior TLB coupon (decimal, default 0.075)
    "subRate": 0.10,              // subordinated / 2L coupon (decimal, default 0.10)
    "taxRate": 0.25               // effective tax rate (default 0.25)
  },
  "reasoning": "Brief 1-2 sentence explanation of why these assumptions were chosen."
}

Rules:
- Use type "lbo" when user says LBO, leveraged buyout, private equity model, PE model, debt schedule, IRR, MOIC
- Use type "tx-comps" when user asks for precedent transactions, transaction comps, M&A comps, deal multiples, acquisition multiples
- Use type "audit" when user asks to audit, check, review, or validate a model
- Use type "both" when user says "build a model" without specifying, or asks for DCF + comps
- If the user says "12% WACC" → wacc: 0.12
- If the user mentions "top 5 peers" or "comparable companies" without naming them, infer plausible peers for the sector
- Stage-1 growth: if not specified, use sector-appropriate estimate (tech: 0.12-0.20, mature/industrial: 0.04-0.08)
- Peers: if ticker is NVDA, peers could be AMD, INTC, QCOM, AVGO, TSM, MRVL
- If ticker is MSFT, peers could be GOOGL, AMZN, META, AAPL, CRM, ORCL
- For LBO: if entry multiple not specified, use sector median (tech: 15-25x, industrial: 8-12x, consumer: 10-14x)
- For LBO: total leverage split 2/3 senior (7.5% rate), 1/3 sub (10% rate) unless user specifies`

async function parsePropmt(prompt: string, contextTicker?: string): Promise<ModelSpec> {
  if (!OPENAI_KEY) throw new Error('No AI key configured — set OPENAI_API_KEY or enable the OpenAI Replit integration.')

  const userMsg = contextTicker
    ? `Context: user is currently viewing ticker ${contextTicker}.\n\nRequest: ${prompt}`
    : prompt

  const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PARSE_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.1,
      max_tokens: 800,
    }),
  })

  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(`LLM parse failed: ${r.status} — ${txt.slice(0, 200)}`)
  }

  const j = await r.json()
  const content = j.choices?.[0]?.message?.content
  if (!content) throw new Error('LLM returned empty content')

  let parsed: any
  try { parsed = JSON.parse(content) } catch { throw new Error('LLM did not return valid JSON') }

  // Validate and normalise
  const ticker = (String(parsed.ticker || contextTicker || 'AAPL')).toUpperCase()
  const peerSymbols: string[] = Array.isArray(parsed.peerSymbols)
    ? parsed.peerSymbols.map((s: any) => String(s).toUpperCase()).filter((s: string) => s !== ticker).slice(0, 8)
    : []
  const a = parsed.assumptions || {}
  const assumptions: ModelAssumptions = {
    wacc:           clamp(num(a.wacc, 0.09), 0.01, 0.40),
    terminalGrowth: clamp(num(a.terminalGrowth, 0.025), 0.005, 0.06),
    growthStage1:   clamp(num(a.growthStage1, 0.10), -0.20, 0.60),
    growthStage2:   clamp(num(a.growthStage2, a.growthStage1 != null ? a.growthStage1 / 2 : 0.05), -0.10, 0.40),
    stage1Years:    Math.round(clamp(num(a.stage1Years, 5), 1, 10)),
    stage2Years:    Math.round(clamp(num(a.stage2Years, 5), 0, 10)),
    terminalExitMultiple: a.terminalExitMultiple ? clamp(num(a.terminalExitMultiple, 0), 1, 100) : undefined,
  }

  let lboAssumptions: LboAssumptionsSpec | undefined
  if (parsed.type === 'lbo' && parsed.lboAssumptions) {
    const la = parsed.lboAssumptions || {}
    lboAssumptions = {
      entryMultiple: clamp(num(la.entryMultiple, 12), 4, 40),
      exitMultiple:  clamp(num(la.exitMultiple, la.entryMultiple ?? 12), 4, 40),
      holdPeriod:    Math.round(clamp(num(la.holdPeriod, 5), 1, 15)),
      ebitdaGrowth:  clamp(num(la.ebitdaGrowth, 0.08), -0.20, 0.60),
      totalLeverage: clamp(num(la.totalLeverage, 4.5), 1, 10),
      seniorRate:    clamp(num(la.seniorRate, 0.075), 0.01, 0.25),
      subRate:       clamp(num(la.subRate, 0.10), 0.01, 0.30),
      taxRate:       clamp(num(la.taxRate, 0.25), 0.05, 0.50),
    }
  }

  const VALID_TYPES = ['dcf', 'comps', 'both', 'lbo', 'tx-comps', 'audit'] as const
  const type = VALID_TYPES.includes(parsed.type) ? parsed.type : 'both'
  return { type, ticker, peerSymbols, assumptions, lboAssumptions, reasoning: String(parsed.reasoning || '') }
}

function num(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : dflt
}
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)) }

// ── DCF runner (mirrors POST /api/dcf logic) ────────────────────────────────

async function runDcfForSpec(spec: ModelSpec): Promise<Record<string, unknown>> {
  const sym = spec.ticker
  const a = spec.assumptions

  let fin: Record<string, unknown> | null = null
  try {
    const finUrl = new URL(
      `http://internal/api/financials?symbol=${encodeURIComponent(sym)}`
      + `&metrics=iq_free_cash_flow,iq_total_debt,iq_cash_st_invest,iq_diluted_shares&period=A&limit=1`,
    )
    const finRes = await financialsHandler(
      new NextRequest(finUrl.toString(), { headers: { [INTERNAL_BYPASS_HEADER]: internalBypassHeaderValue() } }),
    )
    const t = await finRes.text()
    try { fin = t ? JSON.parse(t) as Record<string, unknown> : null } catch { fin = null }
  } catch { /* financials optional */ }

  const baseFcf = extractFinNumber(fin, 'iq_free_cash_flow')
  const totalDebt = extractFinNumber(fin, 'iq_total_debt') ?? 0
  const cash = extractFinNumber(fin, 'iq_cash_st_invest') ?? 0
  const netDebt = totalDebt - cash
  const sharesOutstanding = extractFinNumber(fin, 'iq_diluted_shares')

  if (baseFcf == null) {
    return {
      error: `Could not derive trailing FCF for ${sym} from financials provider. The DCF could not run.`,
      ticker: sym,
      derivedFromFinancials: null,
    }
  }

  const dcfA: DcfAssumptions = {
    baseFcf,
    growthStage1: a.growthStage1,
    growthStage2: a.growthStage2,
    stage1Years: a.stage1Years,
    stage2Years: a.stage2Years,
    terminalGrowth: a.terminalGrowth,
    discountRate: a.wacc,
    netDebt,
    sharesOutstanding,
    terminalExitMultiple: a.terminalExitMultiple,
  }

  const financialsProvider: string = (fin && typeof fin === 'object' && typeof (fin as any).source === 'string')
    ? (fin as any).source
    : 'financials'
  const fcfRecord = fin && typeof fin === 'object' ? (fin as any)['iq_free_cash_flow'] : null
  const asOf: string | null = fcfRecord?.date ?? fcfRecord?.asOf ?? null

  try {
    const result = runDcf(dcfA)
    const sensitivity = dcfSensitivity(dcfA)
    return {
      ticker: sym,
      derivedFromFinancials: {
        baseFcf,
        totalDebt,
        cash,
        netDebt,
        sharesOutstanding,
        provider: financialsProvider,
        asOf,
        sourceUrl: financialsProvider === 'fmp'
          ? `https://financialmodelingprep.com/financial-statements/${encodeURIComponent(sym)}`
          : undefined,
      },
      source: 'finsyt_dcf',
      ...result,
      sensitivity,
    }
  } catch (e) {
    return { error: (e as Error).message, ticker: sym }
  }
}

function extractFinNumber(fin: unknown, mnemonic: string): number | undefined {
  if (!fin || typeof fin !== 'object') return undefined
  const f = fin as Record<string, unknown>
  const top = f[mnemonic]
  if (top && typeof top === 'object' && !Array.isArray(top)) {
    const v = (top as { value?: number | string | null }).value
    if (v != null) {
      const n = typeof v === 'number' ? v : Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  const fromMetrics = (f.metrics as Record<string, unknown> | undefined)?.[mnemonic]
  if (fromMetrics && typeof fromMetrics === 'object') {
    const arr = (fromMetrics as { values?: Array<{ value?: number | string }> }).values
    if (Array.isArray(arr) && arr.length) {
      const v = arr[0].value
      const n = typeof v === 'number' ? v : Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

// ── Comps runner ─────────────────────────────────────────────────────────────

async function runCompsForSpec(
  spec: ModelSpec,
  origin: string,
  fwdHeaders: Record<string, string>,
): Promise<Record<string, unknown>> {
  if (spec.peerSymbols.length === 0) return { skipped: true, reason: 'No peer symbols in spec.' }
  const symbols = [spec.ticker, ...spec.peerSymbols].slice(0, 9).join(',')
  const url = `${origin}/api/peers/compare`
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...fwdHeaders },
      body: JSON.stringify({ subject: spec.ticker, symbols }),
      cache: 'no-store',
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      return { error: `Comps fetch failed (${r.status}): ${txt.slice(0, 200)}` }
    }
    return await r.json()
  } catch (e) {
    return { error: String((e as Error).message || e) }
  }
}

// ── LBO runner ────────────────────────────────────────────────────────────────

async function runLboForSpec(spec: ModelSpec): Promise<Record<string, unknown>> {
  const sym = spec.ticker
  const la = spec.lboAssumptions

  // Pull EBITDA from financials for the real number
  let ebitda: number | null = null
  try {
    const finUrl = new URL(
      `http://internal/api/financials?symbol=${encodeURIComponent(sym)}`
      + `&metrics=iq_ebitda&period=A&limit=1`,
    )
    const finRes = await financialsHandler(
      new NextRequest(finUrl.toString(), { headers: { [INTERNAL_BYPASS_HEADER]: internalBypassHeaderValue() } }),
    )
    const t = await finRes.text()
    const fin = t ? JSON.parse(t) : null
    const v = extractFinNumber(fin, 'iq_ebitda')
    if (v != null && v > 0) ebitda = v
  } catch { /* optional */ }

  // Fallback EBITDA if provider has no data (use FCF as proxy for demo)
  if (ebitda == null) {
    const finUrl2 = new URL(
      `http://internal/api/financials?symbol=${encodeURIComponent(sym)}`
      + `&metrics=iq_free_cash_flow&period=A&limit=1`,
    )
    try {
      const finRes2 = await financialsHandler(
        new NextRequest(finUrl2.toString(), { headers: { [INTERNAL_BYPASS_HEADER]: internalBypassHeaderValue() } }),
      )
      const t2 = await finRes2.text()
      const fin2 = t2 ? JSON.parse(t2) : null
      const v2 = extractFinNumber(fin2, 'iq_free_cash_flow')
      if (v2 != null && v2 > 0) ebitda = v2 * 1.3  // rough FCF → EBITDA uplift
    } catch { /* ignore */ }
  }

  if (ebitda == null || ebitda <= 0) {
    return {
      error: `Could not obtain a positive EBITDA for ${sym}. The LBO model requires EBITDA > 0.`,
      ticker: sym,
    }
  }

  // Build debt tranches from spec
  const totalLeverage = la?.totalLeverage ?? 4.5
  const seniorLev = totalLeverage * (2 / 3)
  const subLev    = totalLeverage * (1 / 3)

  const lboInput = {
    ebitda,
    entryMultiple: la?.entryMultiple ?? 12,
    exitMultiple:  la?.exitMultiple  ?? (la?.entryMultiple ?? 12),
    holdPeriod:    la?.holdPeriod    ?? 5,
    ebitdaGrowth:  la?.ebitdaGrowth  ?? 0.08,
    taxRate:       la?.taxRate       ?? 0.25,
    tranches: [
      { name: 'Senior TLB',        leverage: seniorLev, rate: la?.seniorRate ?? 0.075, amortization: 0.01 },
      { name: 'Subordinated / 2L', leverage: subLev,    rate: la?.subRate    ?? 0.10,  amortization: 0.00 },
    ],
  }

  try {
    const result = runLbo(lboInput)
    return { ticker: sym, ebitdaFromProvider: ebitda, ...result }
  } catch (e) {
    return { error: (e as Error).message, ticker: sym }
  }
}

// ── Transaction comps runner ───────────────────────────────────────────────────

async function runTxCompsForSpec(
  spec: ModelSpec,
  origin: string,
): Promise<Record<string, unknown>> {
  const sym = spec.ticker

  // Pull deals for this ticker (acquirer or target)
  let deals: any[] = []
  let source = 'none'
  try {
    const r = await fetch(`${origin}/api/deals?symbol=${encodeURIComponent(sym)}&limit=50`, { cache: 'no-store' })
    if (r.ok) {
      const j = await r.json()
      deals = Array.isArray(j.deals) ? j.deals : []
      source = j.source ?? 'fmp'
    }
  } catch { /* pass */ }

  // Also pull deals for any explicitly named peer symbols to widen the comp set
  if (spec.peerSymbols.length > 0) {
    await Promise.all(spec.peerSymbols.slice(0, 4).map(async (p) => {
      try {
        const r = await fetch(`${origin}/api/deals?symbol=${encodeURIComponent(p)}&limit=20`, { cache: 'no-store' })
        if (r.ok) {
          const j = await r.json()
          const extra: any[] = Array.isArray(j.deals) ? j.deals : []
          for (const d of extra) {
            if (!deals.some(existing => existing.id === d.id)) deals.push(d)
          }
        }
      } catch { /* ignore */ }
    }))
  }

  if (deals.length === 0) {
    return { skipped: true, ticker: sym, source }
  }

  // Enrich deals with target-company financials to compute real multiples.
  // We fetch EBITDA + revenue for each deal that has a known targetSymbol,
  // then compute evEbitda = dealValue / ebitda and evRevenue = dealValue / revenue.
  // Deals with no targetSymbol or no financials data surface as null.
  const enriched = await Promise.all(deals.map(async (d: any) => {
    const dealValue: number | null = (d.value != null && Number.isFinite(Number(d.value))) ? Number(d.value) : null
    let ebitda: number | null = null
    let revenue: number | null = null
    let evEbitda: number | null = null
    let evRevenue: number | null = null

    if (d.targetSymbol && typeof d.targetSymbol === 'string' && d.targetSymbol.length > 0 && dealValue != null) {
      try {
        const finUrl = new URL(
          `http://internal/api/financials?symbol=${encodeURIComponent(d.targetSymbol)}`
          + `&metrics=iq_ebitda,iq_total_revenue&period=A&limit=1`,
        )
        const finRes = await financialsHandler(
          new NextRequest(finUrl.toString(), { headers: { [INTERNAL_BYPASS_HEADER]: internalBypassHeaderValue() } }),
        )
        if (finRes.ok) {
          const t = await finRes.text()
          const fin = t ? JSON.parse(t) : null
          const rawEbitda  = extractFinNumber(fin, 'iq_ebitda')
          const rawRevenue = extractFinNumber(fin, 'iq_total_revenue')
          if (rawEbitda  != null && rawEbitda  > 0) { ebitda  = rawEbitda;  evEbitda  = dealValue / rawEbitda }
          if (rawRevenue != null && rawRevenue > 0) { revenue = rawRevenue; evRevenue = dealValue / rawRevenue }
        }
      } catch { /* best-effort — missing multiples are fine */ }
    }

    return {
      id:            d.id,
      acquirer:      d.acquirer,
      acquirerSymbol: d.acquirerSymbol,
      target:        d.target,
      targetSymbol:  d.targetSymbol,
      announceDate:  d.announceDate,
      status:        d.status,
      type:          d.type,
      dealValue,
      evEbitda,
      evRevenue,
      ebitda,
      revenue,
      premium:       d.premium ?? null,
      source,
    }
  }))

  // Compute simple stats on non-null multiples
  const evEbitdas = enriched.map(d => d.evEbitda).filter((v): v is number => v != null && Number.isFinite(v))
  const evRevenues = enriched.map(d => d.evRevenue).filter((v): v is number => v != null && Number.isFinite(v))
  const dealValues = enriched.map(d => d.dealValue).filter((v): v is number => v != null && Number.isFinite(v))

  function median(arr: number[]) {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!
  }
  function mean(arr: number[]) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null }
  function q1(arr: number[]) {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor(s.length * 0.25)] ?? null
  }
  function q3(arr: number[]) {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor(s.length * 0.75)] ?? null
  }

  return {
    ticker: sym,
    deals: enriched,
    stats: {
      count:          enriched.length,
      medianEvEbitda: median(evEbitdas),
      meanEvEbitda:   mean(evEbitdas),
      q1EvEbitda:     q1(evEbitdas),
      q3EvEbitda:     q3(evEbitdas),
      medianEvRevenue: median(evRevenues),
      meanDealValue:  mean(dealValues),
    },
    source,
  }
}

// ── Audit runner ───────────────────────────────────────────────────────────────

async function runAuditForSpec(
  spec: ModelSpec,
  dcfResult: Record<string, unknown> | null,
  lboResult: Record<string, unknown> | null,
  txCompsResult: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const sym = spec.ticker

  // ── Transaction comps audit ───────────────────────────────────────────────
  if (spec.type === 'tx-comps' && txCompsResult && !txCompsResult.error && !txCompsResult.skipped) {
    const deals: any[] = Array.isArray(txCompsResult.deals) ? txCompsResult.deals : []
    const multiples = deals.map((d: any) => ({
      label:     d.target ?? d.acquirer ?? String(d.id),
      evEbitda:  typeof d.evEbitda  === 'number' ? d.evEbitda  : null,
      evRevenue: typeof d.evRevenue === 'number' ? d.evRevenue : null,
      dealValue: typeof d.dealValue === 'number' ? d.dealValue : null,
    }))
    const auditResult = auditTxComps({ multiples }, sym)
    return { ...auditResult }
  }

  // ── LBO audit ─────────────────────────────────────────────────────────────
  if (lboResult && !lboResult.error && spec.lboAssumptions) {
    const la = spec.lboAssumptions
    const lboInput = {
      ebitda: (lboResult as any).ebitdaFromProvider ?? 100,
      entryMultiple: la.entryMultiple,
      exitMultiple:  la.exitMultiple,
      holdPeriod:    la.holdPeriod,
      ebitdaGrowth:  la.ebitdaGrowth,
      taxRate:       la.taxRate,
    }
    const auditResult = auditLbo(lboInput, lboResult as any, sym)
    return { ...auditResult }
  }

  // ── DCF audit ─────────────────────────────────────────────────────────────
  if (dcfResult && !dcfResult.error) {
    const a = spec.assumptions
    const dcfA: DcfAssumptions = {
      baseFcf: (dcfResult.derivedFromFinancials as any)?.baseFcf ?? 100,
      discountRate: a.wacc,
      terminalGrowth: a.terminalGrowth,
      growthStage1: a.growthStage1,
      growthStage2: a.growthStage2,
      stage1Years: a.stage1Years,
      stage2Years: a.stage2Years,
      netDebt: (dcfResult.derivedFromFinancials as any)?.netDebt,
      sharesOutstanding: (dcfResult.derivedFromFinancials as any)?.sharesOutstanding,
      terminalExitMultiple: a.terminalExitMultiple,
    }
    const auditResult = auditDcf(dcfA, dcfResult as any, sym)
    return { ...auditResult }
  }

  // ── Cold audit (explicit audit request with no model data) ────────────────
  // Only run for explicit audit-type requests so we never return a false-clean
  // score based on stub EBITDA values.
  if (spec.type === 'audit') {
    const a = spec.assumptions
    const dcfA: DcfAssumptions = {
      baseFcf: 100,
      discountRate: a.wacc,
      terminalGrowth: a.terminalGrowth,
      growthStage1: a.growthStage1,
      growthStage2: a.growthStage2,
      stage1Years: a.stage1Years,
      stage2Years: a.stage2Years,
      terminalExitMultiple: a.terminalExitMultiple,
    }
    const auditResult = auditDcf(dcfA, {}, sym)
    return { ...auditResult }
  }

  // No applicable model to audit yet
  return { skipped: true, reason: 'No model data available to audit.' }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — sign in to use Model Builder.' }, { status: 401 })
  }

  let body: { prompt?: string; context?: { symbol?: string }; spec?: ModelSpec } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const prompt = String(body.prompt || '').trim()
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

  const contextTicker = body.context?.symbol?.toUpperCase()

  // Forward caller auth so comps can execute under the user's session
  const { cookies: ck, headers: hd } = { cookies: req.cookies, headers: req.headers }
  const fwdHeaders: Record<string, string> = {}
  const cookieStr = ck.getAll().map(c => `${c.name}=${c.value}`).join('; ')
  if (cookieStr) fwdHeaders.cookie = cookieStr
  const authHdr = hd.get('authorization')
  if (authHdr) fwdHeaders.authorization = authHdr

  // Step 1: parse with LLM
  let spec: ModelSpec
  try {
    spec = await parsePropmt(prompt, contextTicker)
  } catch (e) {
    return NextResponse.json({ error: `Model spec parse failed: ${(e as Error).message}` }, { status: 500 })
  }

  const origin = req.nextUrl.origin

  // Step 2: run the appropriate model(s) in parallel
  const runDcfFlag   = spec.type === 'dcf' || spec.type === 'both' || spec.type === 'audit'
  const runCompsFlag = spec.type === 'comps' || spec.type === 'both'
  const runLboFlag   = spec.type === 'lbo'
  const runTxFlag    = spec.type === 'tx-comps'

  const [dcfResult, compsResult, lboResult, txCompsResult] = await Promise.all([
    runDcfFlag   ? runDcfForSpec(spec)                     : Promise.resolve(null),
    runCompsFlag ? runCompsForSpec(spec, origin, fwdHeaders) : Promise.resolve(null),
    runLboFlag   ? runLboForSpec(spec)                     : Promise.resolve(null),
    runTxFlag    ? runTxCompsForSpec(spec, origin)         : Promise.resolve(null),
  ])

  // Step 3: always run audit on whatever model we just built
  const auditResult = await runAuditForSpec(spec, dcfResult, lboResult, txCompsResult)

  return NextResponse.json({
    spec,
    dcf:    dcfResult,
    comps:  compsResult,
    lbo:    lboResult,
    txComps: txCompsResult,
    audit:  auditResult,
    generatedAt: new Date().toISOString(),
  })
}

// ── Recompute endpoint (pure math, no upstream calls) ────────────────────────
// PUT /api/model-builder — recompute DCF from updated assumptions + cached financials.

export async function PUT(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const { baseFcf, netDebt, sharesOutstanding, wacc, terminalGrowth, growthStage1, growthStage2, stage1Years, stage2Years, terminalExitMultiple } = body

  if (baseFcf == null || wacc == null || terminalGrowth == null || growthStage1 == null) {
    return NextResponse.json({ error: 'baseFcf, wacc, terminalGrowth, growthStage1 required' }, { status: 400 })
  }

  const a: DcfAssumptions = {
    baseFcf: Number(baseFcf),
    growthStage1: Number(growthStage1),
    growthStage2: growthStage2 != null ? Number(growthStage2) : undefined,
    stage1Years:  stage1Years  != null ? Number(stage1Years)  : undefined,
    stage2Years:  stage2Years  != null ? Number(stage2Years)  : undefined,
    terminalGrowth: Number(terminalGrowth),
    discountRate: Number(wacc),
    netDebt:    netDebt    != null ? Number(netDebt)    : 0,
    sharesOutstanding: sharesOutstanding != null ? Number(sharesOutstanding) : undefined,
    terminalExitMultiple: terminalExitMultiple != null ? Number(terminalExitMultiple) : undefined,
  }

  try {
    const result = runDcf(a)
    const sensitivity = dcfSensitivity(a)
    // Include audit on recomputed DCF
    const auditResult = auditDcf(a, result)
    return NextResponse.json({ source: 'finsyt_dcf', ...result, sensitivity, audit: auditResult })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
