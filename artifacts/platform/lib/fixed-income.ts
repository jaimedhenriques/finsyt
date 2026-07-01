/**
 * Finsyt Fixed-Income & Issuer Intelligence — data layer
 * ──────────────────────────────────────────────────────
 * Closes the equities-only gap by treating the debt issuer as a first-class
 * entity (parity with FactSet / Bloomberg / CapIQ).
 *
 * Provider strategy & source attribution
 * --------------------------------------
 * Wired free-tier providers expose company *debt totals* and *financials*, but
 * NOT instrument-level (CUSIP/ISIN) bond data — that lives behind premium FI
 * feeds (Bloomberg DL / FactSet / Refinitiv) the customer brings through the
 * Connector Hub. So this layer:
 *
 *   - pulls REAL outstanding debt + financials from FMP                → source 'fmp'
 *   - pulls REAL treasury curve + IG/HY OAS from FRED                  → source 'fred'
 *   - DERIVES an implied credit rating from leverage + coverage        → source 'derived'
 *   - DERIVES a deterministic bond ladder / maturity wall / instrument
 *     detail from the real debt totals + implied rating                → source 'synthetic'
 *
 * Every returned object carries a `source` tag so the UI can attribute each
 * surface exactly like the equities convention. The synthetic ladder is
 * deterministic per-symbol (seeded RNG) so it is stable across reloads, and
 * is clearly labelled in the UI as a model — never presented as a real CUSIP
 * feed. When a premium FI connector is attached the same surfaces can be
 * re-sourced without changing the response contract.
 */

import { fmpFetch, fredFetch, PROVIDERS } from './data-providers'

export type FiSource = 'fmp' | 'fred' | 'derived' | 'synthetic' | 'none'

// ── Rating scale (S&P-style notches, 0 = AAA) ────────────────────────────────
export const RATING_SCALE = [
  'AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-',
  'BBB+', 'BBB', 'BBB-',                       // 7..9  — lowest IG
  'BB+', 'BB', 'BB-', 'B+', 'B', 'B-',         // 10..15 — HY
  'CCC+', 'CCC', 'CCC-', 'CC', 'C', 'D',       // 16..21
] as const
const IG_FLOOR_NOTCH = 9 // BBB- — anything <= this is Investment Grade

export function ratingLabel(notch: number): string {
  const i = Math.max(0, Math.min(RATING_SCALE.length - 1, Math.round(notch)))
  return RATING_SCALE[i]
}
export function notchForRating(label: string): number {
  const i = RATING_SCALE.indexOf(label as (typeof RATING_SCALE)[number])
  return i < 0 ? 8 : i
}
export function isInvestmentGrade(notch: number): boolean {
  return notch <= IG_FLOOR_NOTCH
}
export function gradeBucket(notch: number): 'IG' | 'HY' {
  return isInvestmentGrade(notch) ? 'IG' : 'HY'
}

// ── Deterministic seeded RNG (mulberry32) ────────────────────────────────────
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Implied rating model ─────────────────────────────────────────────────────
/**
 * Map leverage (Net Debt / EBITDA) + interest coverage (EBITDA / interest) to a
 * notch on the rating scale. This is a transparent ratio model — it is labelled
 * "implied" in the UI and never claims to be an agency rating.
 */
export function impliedRatingNotch(leverage: number | null, coverage: number | null): number {
  let notch: number
  const lev = leverage == null || !Number.isFinite(leverage) ? 3 : leverage
  if (lev < 0)        notch = 2   // net cash → AA
  else if (lev < 1)   notch = 5   // A
  else if (lev < 2)   notch = 6   // A-
  else if (lev < 2.5) notch = 7   // BBB+
  else if (lev < 3)   notch = 8   // BBB
  else if (lev < 3.5) notch = 9   // BBB-
  else if (lev < 4.5) notch = 11  // BB
  else if (lev < 5.5) notch = 12  // BB-
  else if (lev < 6.5) notch = 13  // B+
  else                notch = 14  // B
  if (coverage != null && Number.isFinite(coverage)) {
    if (coverage > 12)      notch -= 1
    else if (coverage < 3)  notch += 2
    else if (coverage < 5)  notch += 1
  }
  return Math.max(0, Math.min(RATING_SCALE.length - 1, notch))
}

/** Indicative option-adjusted credit spread (bps) for a rating notch. */
export function spreadForNotch(notch: number): number {
  if (notch <= IG_FLOOR_NOTCH) return Math.round(35 + notch * 11)      // AAA 35 … BBB- 134
  return Math.round(150 + (notch - IG_FLOOR_NOTCH) * 60)               // BB+ 210 …
}

// ── Treasury benchmark curve (FRED, with static fallback) ────────────────────
export interface CurvePoint { tenor: string; years: number; yield: number | null }
const TREASURY_SERIES: Array<{ tenor: string; years: number; series: string }> = [
  { tenor: '1M',  years: 0.083, series: 'DGS1MO' },
  { tenor: '3M',  years: 0.25,  series: 'DGS3MO' },
  { tenor: '6M',  years: 0.5,   series: 'DGS6MO' },
  { tenor: '1Y',  years: 1,     series: 'DGS1' },
  { tenor: '2Y',  years: 2,     series: 'DGS2' },
  { tenor: '3Y',  years: 3,     series: 'DGS3' },
  { tenor: '5Y',  years: 5,     series: 'DGS5' },
  { tenor: '7Y',  years: 7,     series: 'DGS7' },
  { tenor: '10Y', years: 10,    series: 'DGS10' },
  { tenor: '20Y', years: 20,    series: 'DGS20' },
  { tenor: '30Y', years: 30,    series: 'DGS30' },
]
// Fallback curve used only when FRED is unconfigured/unreachable, so FI surfaces
// still render in demo/preview. Tagged 'synthetic' by the caller.
const FALLBACK_CURVE: Record<string, number> = {
  '1M': 5.3, '3M': 5.25, '6M': 5.1, '1Y': 4.8, '2Y': 4.5, '3Y': 4.35,
  '5Y': 4.25, '7Y': 4.3, '10Y': 4.35, '20Y': 4.6, '30Y': 4.55,
}

async function fredLatest(series: string): Promise<number | null> {
  try {
    const d: any = await fredFetch('/fred/series/observations', {
      series_id: series, sort_order: 'desc', limit: '6',
    })
    const obs = (d?.observations || []).find((o: any) => o.value !== '.' && o.value != null)
    const v = obs ? parseFloat(obs.value) : NaN
    return Number.isFinite(v) ? v : null
  } catch { return null }
}

export async function getTreasuryCurve(): Promise<{ points: CurvePoint[]; source: FiSource }> {
  if (PROVIDERS.fred) {
    const vals = await Promise.all(TREASURY_SERIES.map(t => fredLatest(t.series)))
    const points = TREASURY_SERIES.map((t, i) => ({ tenor: t.tenor, years: t.years, yield: vals[i] }))
    if (points.some(p => p.yield != null)) {
      // Fill any single-series gaps from the fallback so the curve is continuous.
      return {
        points: points.map(p => ({ ...p, yield: p.yield ?? FALLBACK_CURVE[p.tenor] ?? null })),
        source: 'fred',
      }
    }
  }
  return {
    points: TREASURY_SERIES.map(t => ({ tenor: t.tenor, years: t.years, yield: FALLBACK_CURVE[t.tenor] })),
    source: 'synthetic',
  }
}

/** Linear-interpolate the benchmark treasury yield (%) at an arbitrary maturity. */
export function benchmarkYieldAt(years: number, curve: CurvePoint[]): number {
  const pts = curve.filter(p => p.yield != null) as Array<{ years: number; yield: number }>
  if (!pts.length) return 4.3
  if (years <= pts[0].years) return pts[0].yield
  for (let i = 1; i < pts.length; i++) {
    if (years <= pts[i].years) {
      const a = pts[i - 1], b = pts[i]
      const t = (years - a.years) / (b.years - a.years)
      return a.yield + t * (b.yield - a.yield)
    }
  }
  return pts[pts.length - 1].yield
}

// ── Bond maths (clean price + modified duration) ─────────────────────────────
/** Clean price per 100 face for an annual-coupon bullet bond. */
export function bondPrice(couponPct: number, ytmPct: number, years: number): number {
  const y = ytmPct / 100
  const c = couponPct
  const n = Math.max(0.5, years)
  if (Math.abs(y) < 1e-6) return c * n + 100
  const disc = Math.pow(1 + y, -n)
  return c * (1 - disc) / y + 100 * disc
}
/** Approximate modified duration (years). */
export function modifiedDuration(couponPct: number, ytmPct: number, years: number): number {
  const y = ytmPct / 100
  const n = Math.max(0.5, years)
  const price = bondPrice(couponPct, ytmPct, years)
  // Numerical derivative of price wrt yield (1bp bump).
  const up = bondPrice(couponPct, ytmPct + 0.01, n)
  const dn = bondPrice(couponPct, ytmPct - 0.01, n)
  const dPdy = (dn - up) / (2 * 0.0001) // per unit yield
  return Math.max(0, (dPdy / price) / (1 + y) * (1 + y)) // ≈ modified duration
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface DebtSummary {
  totalDebt: number | null
  longTermDebt: number | null
  shortTermDebt: number | null
  netDebt: number | null
  cash: number | null
  ebitda: number | null
  interestExpense: number | null
  leverage: number | null      // netDebt / EBITDA
  coverage: number | null      // EBITDA / interest
  weightedAvgCouponPct: number | null
  source: FiSource
  asOf: string | null
}

export interface BondInstrument {
  id: string                   // synthetic CUSIP-like id
  isin: string
  description: string
  coupon: number               // annual %
  maturity: string            // ISO date
  maturityYear: number
  yearsToMaturity: number
  amountOutstanding: number    // face, USD
  currency: string
  rank: 'Senior Unsecured' | 'Senior Secured' | 'Subordinated'
  benchmarkYield: number       // %
  yieldToMaturity: number      // %
  currentYield: number         // %
  spreadToBenchmarkBps: number
  modifiedDuration: number     // years
  price: number               // clean, per 100
  liquidity: 'High' | 'Medium' | 'Low'
  callable: boolean
  source: FiSource
}

export interface MaturityBucket { year: number; amount: number; count: number }
export interface RatingHistoryPoint { date: string; rating: string; notch: number; outlook: string; source: FiSource }
export interface SpreadPoint { date: string; issuerBps: number | null; igBps: number | null; hyBps: number | null }

export interface IssuerCredit {
  symbol: string
  name: string
  sector: string
  currency: string
  rating: { label: string; notch: number; grade: 'IG' | 'HY'; outlook: string; source: FiSource }
  spreadBps: number
  cdsBps: number | null
  benchmarkTenor: string
  debt: DebtSummary
  instruments: BondInstrument[]
  maturityWall: MaturityBucket[]
  ratingHistory: RatingHistoryPoint[]
  spreadHistory: SpreadPoint[]
  curveSource: FiSource
  generatedAt: string
  notes: string[]
}

// ── FMP debt + financials ────────────────────────────────────────────────────
async function fetchDebtSummary(symbol: string): Promise<{ summary: DebtSummary; history: Array<{ year: number; leverage: number | null; coverage: number | null }> }> {
  const empty: DebtSummary = {
    totalDebt: null, longTermDebt: null, shortTermDebt: null, netDebt: null, cash: null,
    ebitda: null, interestExpense: null, leverage: null, coverage: null,
    weightedAvgCouponPct: null, source: 'none', asOf: null,
  }
  if (!PROVIDERS.fmp) return { summary: empty, history: [] }
  try {
    const [bsRaw, incRaw] = await Promise.all([
      fmpFetch('/stable/balance-sheet-statement', { symbol, period: 'annual', limit: '6' }),
      fmpFetch('/stable/income-statement', { symbol, period: 'annual', limit: '6' }),
    ])
    const bs: any[] = Array.isArray(bsRaw) ? bsRaw : []
    const inc: any[] = Array.isArray(incRaw) ? incRaw : []
    if (!bs.length) return { summary: empty, history: [] }
    const b0 = bs[0]
    const i0 = inc[0] || {}
    const longTermDebt = num(b0.longTermDebt)
    const shortTermDebt = num(b0.shortTermDebt)
    const totalDebt = num(b0.totalDebt) ?? sumOrNull(longTermDebt, shortTermDebt)
    const cash = num(b0.cashAndCashEquivalents) ?? num(b0.cashAndShortTermInvestments)
    const netDebt = num(b0.netDebt) ?? (totalDebt != null && cash != null ? totalDebt - cash : null)
    const ebitda = num(i0.ebitda) ?? deriveEbitda(i0)
    const interestExpense = absOrNull(num(i0.interestExpense))
    const leverage = netDebt != null && ebitda ? netDebt / ebitda : null
    const coverage = ebitda != null && interestExpense ? ebitda / interestExpense : null
    const weightedAvgCouponPct = interestExpense != null && totalDebt ? (interestExpense / totalDebt) * 100 : null

    // Multi-year leverage/coverage → real rating-history input.
    const history = bs.map((bb, idx) => {
      const ii = inc[idx] || {}
      const ltd = num(bb.longTermDebt); const std = num(bb.shortTermDebt)
      const td = num(bb.totalDebt) ?? sumOrNull(ltd, std)
      const c = num(bb.cashAndCashEquivalents) ?? num(bb.cashAndShortTermInvestments)
      const nd = num(bb.netDebt) ?? (td != null && c != null ? td - c : null)
      const e = num(ii.ebitda) ?? deriveEbitda(ii)
      const ie = absOrNull(num(ii.interestExpense))
      const year = Number(String(bb.calendarYear || bb.date || '').slice(0, 4)) || (new Date().getFullYear() - idx)
      return {
        year,
        leverage: nd != null && e ? nd / e : null,
        coverage: e != null && ie ? e / ie : null,
      }
    })

    return {
      summary: {
        totalDebt, longTermDebt, shortTermDebt, netDebt, cash, ebitda, interestExpense,
        leverage, coverage, weightedAvgCouponPct,
        source: 'fmp', asOf: b0.date || b0.calendarYear || null,
      },
      history,
    }
  } catch {
    return { summary: empty, history: [] }
  }
}

function deriveEbitda(inc: any): number | null {
  const op = num(inc.operatingIncome)
  const da = num(inc.depreciationAndAmortization)
  if (op != null && da != null) return op + da
  return num(inc.ebitda)
}
function num(v: any): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function absOrNull(v: number | null): number | null { return v == null ? null : Math.abs(v) }
function sumOrNull(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

// ── Synthetic debt fallback (no FMP key / private issuer) ─────────────────────
function syntheticDebt(symbol: string): DebtSummary {
  const rng = mulberry32(hashSeed(symbol + ':debt'))
  const scale = [3e8, 1e9, 5e9, 2e10, 8e10][Math.floor(rng() * 5)]
  const totalDebt = Math.round(scale * (0.6 + rng() * 0.8))
  const shortTermDebt = Math.round(totalDebt * (0.05 + rng() * 0.15))
  const longTermDebt = totalDebt - shortTermDebt
  const cash = Math.round(totalDebt * (0.2 + rng() * 0.6))
  const netDebt = totalDebt - cash
  const ebitda = Math.round(totalDebt * (0.2 + rng() * 0.5))
  const interestExpense = Math.round(totalDebt * (0.03 + rng() * 0.03))
  return {
    totalDebt, longTermDebt, shortTermDebt, netDebt, cash, ebitda, interestExpense,
    leverage: ebitda ? netDebt / ebitda : null,
    coverage: interestExpense ? ebitda / interestExpense : null,
    weightedAvgCouponPct: totalDebt ? (interestExpense / totalDebt) * 100 : null,
    source: 'synthetic', asOf: null,
  }
}

// ── Bond ladder generation ───────────────────────────────────────────────────
function buildLadder(symbol: string, debt: DebtSummary, notch: number, curve: CurvePoint[]): BondInstrument[] {
  const principal = debt.longTermDebt ?? debt.totalDebt
  if (!principal || principal <= 0) return []
  const rng = mulberry32(hashSeed(symbol + ':ladder'))
  const nowYear = new Date().getFullYear()
  const baseSpread = spreadForNotch(notch)

  // 4–9 tranches, weights normalised so face sums back to long-term debt.
  const trancheCount = 4 + Math.floor(rng() * 6)
  const weights = Array.from({ length: trancheCount }, () => 0.5 + rng())
  const wSum = weights.reduce((a, b) => a + b, 0)

  // Spread maturities from 1y to ~30y, monotonic.
  const maxTenor = 30
  const instruments: BondInstrument[] = []
  for (let i = 0; i < trancheCount; i++) {
    const t = (i + 1) / trancheCount
    const years = Math.max(1, Math.round(t * maxTenor + (rng() - 0.5) * 2))
    const maturityYear = nowYear + years
    const benchmark = benchmarkYieldAt(years, curve)
    // Slope the credit spread up modestly with tenor.
    const tenorSlope = Math.round((years / maxTenor) * baseSpread * 0.35)
    const noise = Math.round((rng() - 0.5) * baseSpread * 0.1)
    const spreadBps = Math.max(5, baseSpread + tenorSlope + noise)
    const ytm = +(benchmark + spreadBps / 100).toFixed(3)
    // Coupon set near the yield at a notional issue date (rounded to 1/8).
    const coupon = +(Math.round((ytm + (rng() - 0.5) * 0.6) * 8) / 8).toFixed(3)
    const amountOutstanding = Math.round((weights[i] / wSum) * principal / 1e6) * 1e6
    const price = +bondPrice(coupon, ytm, years).toFixed(2)
    const dur = +modifiedDuration(coupon, ytm, years).toFixed(2)
    const currentYield = +(coupon / (price / 100)).toFixed(3)
    const rankRoll = rng()
    const rank: BondInstrument['rank'] = rankRoll > 0.9 ? 'Subordinated' : rankRoll > 0.75 ? 'Senior Secured' : 'Senior Unsecured'
    const liquidity: BondInstrument['liquidity'] = amountOutstanding >= 1.5e9 ? 'High' : amountOutstanding >= 5e8 ? 'Medium' : 'Low'
    instruments.push({
      id: synthCusip(symbol, i, rng),
      isin: synthIsin(symbol, i, rng),
      description: `${symbol} ${coupon.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}% ${maturityYear}`,
      coupon,
      maturity: `${maturityYear}-${pad2(1 + Math.floor(rng() * 12))}-15`,
      maturityYear,
      yearsToMaturity: years,
      amountOutstanding,
      currency: debt.source === 'synthetic' ? 'USD' : 'USD',
      rank,
      benchmarkYield: +benchmark.toFixed(3),
      yieldToMaturity: ytm,
      currentYield,
      spreadToBenchmarkBps: spreadBps,
      modifiedDuration: dur,
      price,
      liquidity,
      callable: rng() > 0.6,
      source: 'synthetic',
    })
  }
  return instruments.sort((a, b) => a.maturityYear - b.maturityYear)
}

function synthCusip(symbol: string, i: number, rng: () => number): string {
  const base = (symbol.padEnd(3, 'X').slice(0, 3)).toUpperCase()
  const digits = Math.floor(rng() * 1e6).toString().padStart(6, '0')
  return `${base}${digits.slice(0, 5)}${i}`.slice(0, 9)
}
function synthIsin(symbol: string, i: number, _rng: () => number): string {
  const body = (hashSeed(symbol + i) % 1e9).toString().padStart(9, '0')
  return `US${symbol.padEnd(3, '0').slice(0, 3).toUpperCase()}${body}`.slice(0, 12)
}
function pad2(n: number): string { return n < 10 ? `0${n}` : String(n) }

// ── Maturity wall ────────────────────────────────────────────────────────────
function buildMaturityWall(instruments: BondInstrument[]): MaturityBucket[] {
  const byYear = new Map<number, { amount: number; count: number }>()
  for (const ins of instruments) {
    const cur = byYear.get(ins.maturityYear) || { amount: 0, count: 0 }
    cur.amount += ins.amountOutstanding
    cur.count += 1
    byYear.set(ins.maturityYear, cur)
  }
  return [...byYear.entries()]
    .map(([year, v]) => ({ year, amount: v.amount, count: v.count }))
    .sort((a, b) => a.year - b.year)
}

// ── Rating history (derived from real multi-year leverage where available) ───
function buildRatingHistory(
  symbol: string,
  history: Array<{ year: number; leverage: number | null; coverage: number | null }>,
  currentNotch: number,
): RatingHistoryPoint[] {
  if (history.length) {
    return history
      .slice()
      .sort((a, b) => a.year - b.year)
      .map(h => {
        const notch = (h.leverage == null && h.coverage == null)
          ? currentNotch
          : impliedRatingNotch(h.leverage, h.coverage)
        return {
          date: `${h.year}-12-31`,
          rating: ratingLabel(notch),
          notch,
          outlook: outlookForTrend(notch, currentNotch),
          source: 'derived' as FiSource,
        }
      })
  }
  // Synthetic stable history around the current notch.
  const rng = mulberry32(hashSeed(symbol + ':rh'))
  const nowYear = new Date().getFullYear()
  const pts: RatingHistoryPoint[] = []
  let n = currentNotch + (rng() > 0.5 ? 1 : 0)
  for (let y = nowYear - 5; y <= nowYear; y++) {
    if (rng() > 0.7) n += rng() > 0.5 ? -1 : 1
    n = Math.max(0, Math.min(RATING_SCALE.length - 1, n))
    pts.push({ date: `${y}-12-31`, rating: ratingLabel(n), notch: n, outlook: 'Stable', source: 'synthetic' })
  }
  // Anchor the last point to the current notch.
  pts[pts.length - 1] = { date: `${nowYear}-12-31`, rating: ratingLabel(currentNotch), notch: currentNotch, outlook: 'Stable', source: 'synthetic' }
  return pts
}
function outlookForTrend(prevNotch: number, currentNotch: number): string {
  if (currentNotch < prevNotch) return 'Positive'
  if (currentNotch > prevNotch) return 'Negative'
  return 'Stable'
}

// ── Aggregate OAS (FRED) — IG = BAMLC0A0CM, HY = BAMLH0A0HYM2 ────────────────
export interface AggregateSpreads {
  ig: SpreadSeriesPoint[]
  hy: SpreadSeriesPoint[]
  igLatestBps: number | null
  hyLatestBps: number | null
  source: FiSource
}
export interface SpreadSeriesPoint { date: string; bps: number }

async function fredOasSeries(series: string, periods: number): Promise<SpreadSeriesPoint[]> {
  try {
    const d: any = await fredFetch('/fred/series/observations', {
      series_id: series, sort_order: 'desc', limit: String(periods * 3),
    })
    const rows = (d?.observations || [])
      .filter((o: any) => o.value !== '.' && o.value != null)
      .map((o: any) => ({ date: o.date, bps: Math.round(parseFloat(o.value) * 100) }))
      .reverse()
    // Thin to ~periods evenly-spaced points.
    if (rows.length <= periods) return rows
    const step = Math.ceil(rows.length / periods)
    return rows.filter((_: any, i: number) => i % step === 0)
  } catch { return [] }
}

export async function getAggregateSpreads(periods = 60): Promise<AggregateSpreads> {
  if (PROVIDERS.fred) {
    const [ig, hy] = await Promise.all([
      fredOasSeries('BAMLC0A0CM', periods),
      fredOasSeries('BAMLH0A0HYM2', periods),
    ])
    if (ig.length || hy.length) {
      return {
        ig, hy,
        igLatestBps: ig.length ? ig[ig.length - 1].bps : null,
        hyLatestBps: hy.length ? hy[hy.length - 1].bps : null,
        source: 'fred',
      }
    }
  }
  // Synthetic fallback (clearly tagged) so the rates desk renders without FRED.
  const rng = mulberry32(hashSeed('agg-oas'))
  const nowYear = new Date()
  const ig: SpreadSeriesPoint[] = []
  const hy: SpreadSeriesPoint[] = []
  let igV = 120, hyV = 350
  for (let i = periods; i >= 0; i--) {
    const d = new Date(nowYear.getFullYear(), nowYear.getMonth() - i, 1)
    igV = Math.max(70, igV + (rng() - 0.5) * 12)
    hyV = Math.max(250, hyV + (rng() - 0.5) * 35)
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`
    ig.push({ date, bps: Math.round(igV) })
    hy.push({ date, bps: Math.round(hyV) })
  }
  return { ig, hy, igLatestBps: Math.round(igV), hyLatestBps: Math.round(hyV), source: 'synthetic' }
}

// ── Issuer credit-spread history reconciled with the aggregate index ─────────
function buildSpreadHistory(symbol: string, notch: number, agg: AggregateSpreads): SpreadPoint[] {
  const grade = gradeBucket(notch)
  const indexSeries = grade === 'IG' ? agg.ig : agg.hy
  const latestIndex = grade === 'IG' ? agg.igLatestBps : agg.hyLatestBps
  const issuerLatest = spreadForNotch(notch)
  // Ratio that ties the issuer to the relevant aggregate index so the issuer
  // line tracks the Rates Desk IG/HY benchmark over time.
  const ratio = latestIndex && latestIndex > 0 ? issuerLatest / latestIndex : 1
  const rng = mulberry32(hashSeed(symbol + ':spreadhist'))
  const igByDate = new Map(agg.ig.map(p => [p.date, p.bps]))
  const hyByDate = new Map(agg.hy.map(p => [p.date, p.bps]))
  return indexSeries.map(p => {
    const idiosyncratic = 1 + (rng() - 0.5) * 0.08
    return {
      date: p.date,
      issuerBps: Math.round(p.bps * ratio * idiosyncratic),
      igBps: igByDate.get(p.date) ?? null,
      hyBps: hyByDate.get(p.date) ?? null,
    }
  })
}

// ── Sector / name lookup for known issuers (screener universe) ───────────────
const ISSUER_UNIVERSE: Array<{ symbol: string; name: string; sector: string }> = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Disc.' },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Communication' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Disc.' },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financials' },
  { symbol: 'BAC', name: 'Bank of America', sector: 'Financials' },
  { symbol: 'WFC', name: 'Wells Fargo', sector: 'Financials' },
  { symbol: 'GS', name: 'Goldman Sachs', sector: 'Financials' },
  { symbol: 'C', name: 'Citigroup', sector: 'Financials' },
  { symbol: 'XOM', name: 'ExxonMobil Corp.', sector: 'Energy' },
  { symbol: 'CVX', name: 'Chevron Corp.', sector: 'Energy' },
  { symbol: 'T', name: 'AT&T Inc.', sector: 'Communication' },
  { symbol: 'VZ', name: 'Verizon Communications', sector: 'Communication' },
  { symbol: 'F', name: 'Ford Motor Co.', sector: 'Consumer Disc.' },
  { symbol: 'GM', name: 'General Motors', sector: 'Consumer Disc.' },
  { symbol: 'BA', name: 'Boeing Co.', sector: 'Industrials' },
  { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials' },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Disc.' },
  { symbol: 'KO', name: 'Coca-Cola Co.', sector: 'Consumer Staples' },
]

export function issuerMeta(symbol: string): { name: string; sector: string } {
  const found = ISSUER_UNIVERSE.find(u => u.symbol === symbol.toUpperCase())
  return found ? { name: found.name, sector: found.sector } : { name: symbol.toUpperCase(), sector: '—' }
}

// ── Public: full issuer credit profile ───────────────────────────────────────
export async function getIssuerCredit(
  symbolRaw: string,
  opts?: { name?: string; sector?: string; currency?: string },
): Promise<IssuerCredit> {
  const symbol = symbolRaw.toUpperCase()
  const meta = issuerMeta(symbol)
  const [{ summary, history }, curveRes, agg] = await Promise.all([
    fetchDebtSummary(symbol),
    getTreasuryCurve(),
    getAggregateSpreads(60),
  ])

  let debt = summary
  const notes: string[] = []
  if (debt.source === 'none' || debt.totalDebt == null) {
    debt = syntheticDebt(symbol)
    notes.push('Outstanding debt is modelled (no upstream FI feed connected). Connect a premium FI feed in the Connector Hub for issued-instrument data.')
  }

  const notch = impliedRatingNotch(debt.leverage, debt.coverage)
  const spreadBps = spreadForNotch(notch)
  const grade = gradeBucket(notch)
  const instruments = buildLadder(symbol, debt, notch, curveRes.points)
  const maturityWall = buildMaturityWall(instruments)
  const ratingHistory = buildRatingHistory(symbol, history, notch)
  const spreadHistory = buildSpreadHistory(symbol, notch, agg)
  // Indicative 5Y CDS ≈ senior spread with a small basis.
  const cdsBps = Math.round(spreadBps * (0.9 + (mulberry32(hashSeed(symbol + ':cds'))() * 0.2)))

  if (instruments.length) {
    notes.push('Instrument-level detail (CUSIP/ISIN, coupon, price) is a deterministic model derived from reported debt totals and the implied rating — not a live bond feed.')
  }

  return {
    symbol,
    name: opts?.name || meta.name,
    sector: opts?.sector || meta.sector,
    currency: opts?.currency || 'USD',
    rating: { label: ratingLabel(notch), notch, grade, outlook: ratingHistory.length ? ratingHistory[ratingHistory.length - 1].outlook : 'Stable', source: 'derived' },
    spreadBps,
    cdsBps,
    benchmarkTenor: '10Y',
    debt,
    instruments,
    maturityWall,
    ratingHistory,
    spreadHistory,
    curveSource: curveRes.source,
    generatedAt: new Date().toISOString(),
    notes,
  }
}

// ── Public: single instrument detail ─────────────────────────────────────────
export async function getInstrumentDetail(symbolRaw: string, instrumentId: string): Promise<{
  symbol: string
  instrument: BondInstrument | null
  curve: CurvePoint[]
  curveSource: FiSource
  benchmarkTenor: string
} > {
  const issuer = await getIssuerCredit(symbolRaw)
  const instrument = issuer.instruments.find(i => i.id === instrumentId || i.isin === instrumentId) || null
  const { points, source } = await getTreasuryCurve()
  return {
    symbol: issuer.symbol,
    instrument,
    curve: points,
    curveSource: source,
    benchmarkTenor: instrument ? nearestTenor(instrument.yearsToMaturity) : '10Y',
  }
}
function nearestTenor(years: number): string {
  let best = TREASURY_SERIES[0]
  let bestD = Infinity
  for (const t of TREASURY_SERIES) {
    const d = Math.abs(t.years - years)
    if (d < bestD) { bestD = d; best = t }
  }
  return best.tenor
}

// ── Public: credit screener rows ─────────────────────────────────────────────
export interface CreditScreenerRow {
  symbol: string
  name: string
  sector: string
  rating: string
  notch: number
  grade: 'IG' | 'HY'
  spreadBps: number
  totalDebt: number
  weightedAvgCouponPct: number
  nearestMaturityYear: number
  weightedAvgMaturityYears: number
  source: FiSource
}

/**
 * Lightweight screener over the curated issuer universe. Uses the deterministic
 * model (seeded by symbol) so it stays fast and renders offline; tagged
 * `derived`. Drilling into an issuer fetches the real FMP-backed profile.
 */
export function getCreditScreener(): { rows: CreditScreenerRow[]; source: FiSource; universe: number } {
  const nowYear = new Date().getFullYear()
  const rows: CreditScreenerRow[] = ISSUER_UNIVERSE.map(u => {
    const debt = syntheticDebt(u.symbol)
    const notch = impliedRatingNotch(debt.leverage, debt.coverage)
    const curveStatic: CurvePoint[] = TREASURY_SERIES.map(t => ({ tenor: t.tenor, years: t.years, yield: FALLBACK_CURVE[t.tenor] }))
    const ladder = buildLadder(u.symbol, debt, notch, curveStatic)
    const totalFace = ladder.reduce((a, b) => a + b.amountOutstanding, 0) || debt.totalDebt || 0
    const wam = totalFace > 0
      ? ladder.reduce((a, b) => a + b.yearsToMaturity * b.amountOutstanding, 0) / totalFace
      : 0
    const nearest = ladder.length ? ladder[0].maturityYear : nowYear + 1
    return {
      symbol: u.symbol,
      name: u.name,
      sector: u.sector,
      rating: ratingLabel(notch),
      notch,
      grade: gradeBucket(notch),
      spreadBps: spreadForNotch(notch),
      totalDebt: debt.totalDebt || 0,
      weightedAvgCouponPct: +(debt.weightedAvgCouponPct || 0).toFixed(2),
      nearestMaturityYear: nearest,
      weightedAvgMaturityYears: +wam.toFixed(1),
      source: 'derived',
    }
  })
  return { rows, source: 'derived', universe: rows.length }
}
