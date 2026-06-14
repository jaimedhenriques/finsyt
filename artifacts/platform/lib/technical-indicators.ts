/**
 * Technical-indicator engine — pure, dependency-free helpers that compute a
 * library of common overlays and oscillators from a series of OHLCV bars.
 *
 * Every series helper returns an array of `(number | null)` aligned 1:1 with
 * the input bars: `null` marks warm-up periods where the indicator is not yet
 * defined. This makes the output trivial to plot against the same x-axis as
 * the price series and trivial to unit-test (deterministic, no I/O).
 *
 * Overlays (price pane):  SMA, EMA, WMA, Bollinger Bands, Ichimoku, VWAP,
 *                         Donchian Channels.
 * Oscillators (sub-pane): RSI, MACD, Stochastic, ADX (+DI/-DI), OBV.
 *
 * Nothing here fetches data or touches the database, so the same code path is
 * shared by the `/api/technicals` route, the `get_technicals` agent tool, and
 * the interactive client chart.
 */

export interface Bar {
  /** Epoch milliseconds. */
  t: number
  o?: number
  h?: number
  l?: number
  /** Close — the only required field. */
  c: number
  v?: number
}

export type NumOrNull = number | null

// ─────────────────────────────────────────────────────────────────────────────
// Small numeric helpers
// ─────────────────────────────────────────────────────────────────────────────

function closes(bars: Bar[]): number[] {
  return bars.map(b => b.c)
}

function round(v: number, dp = 4): number {
  const f = Math.pow(10, dp)
  return Math.round(v * f) / f
}

/** Round a nullable series in place-free fashion. */
function roundSeries(s: NumOrNull[], dp = 4): NumOrNull[] {
  return s.map(v => (v == null || !Number.isFinite(v) ? null : round(v, dp)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Moving averages
// ─────────────────────────────────────────────────────────────────────────────

/** Simple moving average over the last `period` values. */
export function sma(values: number[], period: number): NumOrNull[] {
  const out: NumOrNull[] = new Array(values.length).fill(null)
  if (period <= 0) return out
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/**
 * Exponential moving average. Seeded with the SMA of the first `period`
 * values (the conventional Wilder/most-charting-package seed), then smoothed
 * with multiplier 2/(period+1).
 */
export function ema(values: number[], period: number): NumOrNull[] {
  const out: NumOrNull[] = new Array(values.length).fill(null)
  if (period <= 0 || values.length < period) return out
  const k = 2 / (period + 1)
  let seed = 0
  for (let i = 0; i < period; i++) seed += values[i]
  let prev = seed / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** Linearly weighted moving average (most-recent value weighted highest). */
export function wma(values: number[], period: number): NumOrNull[] {
  const out: NumOrNull[] = new Array(values.length).fill(null)
  if (period <= 0) return out
  const denom = (period * (period + 1)) / 2
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0
    for (let j = 0; j < period; j++) acc += values[i - period + 1 + j] * (j + 1)
    out[i] = acc / denom
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Bollinger Bands
// ─────────────────────────────────────────────────────────────────────────────

export interface BollingerSeries {
  middle: NumOrNull[]
  upper: NumOrNull[]
  lower: NumOrNull[]
}

/** Bollinger Bands: SMA middle ± `mult` population standard deviations. */
export function bollinger(values: number[], period = 20, mult = 2): BollingerSeries {
  const middle = sma(values, period)
  const upper: NumOrNull[] = new Array(values.length).fill(null)
  const lower: NumOrNull[] = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i]
    if (mean == null) continue
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mean) ** 2
    const sd = Math.sqrt(variance / period)
    upper[i] = mean + mult * sd
    lower[i] = mean - mult * sd
  }
  return {
    middle: roundSeries(middle),
    upper: roundSeries(upper),
    lower: roundSeries(lower),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VWAP (anchored cumulative)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Anchored cumulative VWAP across the whole series: running
 * Σ(typicalPrice·volume) / Σ(volume). Falls back to close when high/low are
 * absent and to a flat cumulative average when volume is missing/zero.
 */
export function vwap(bars: Bar[]): NumOrNull[] {
  const out: NumOrNull[] = new Array(bars.length).fill(null)
  let cumPV = 0
  let cumV = 0
  let cumTP = 0
  let n = 0
  let sawVolume = false
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    const tp = (((b.h ?? b.c) + (b.l ?? b.c) + b.c) / 3)
    const v = b.v ?? 0
    cumPV += tp * v
    cumV += v
    cumTP += tp
    n += 1
    if (v > 0) sawVolume = true
    out[i] = cumV > 0 ? cumPV / cumV : (sawVolume ? null : cumTP / n)
  }
  return roundSeries(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// Donchian Channels
// ─────────────────────────────────────────────────────────────────────────────

export interface DonchianSeries {
  upper: NumOrNull[]
  lower: NumOrNull[]
  middle: NumOrNull[]
}

/** Donchian channel: highest high / lowest low over `period` bars. */
export function donchian(bars: Bar[], period = 20): DonchianSeries {
  const upper: NumOrNull[] = new Array(bars.length).fill(null)
  const lower: NumOrNull[] = new Array(bars.length).fill(null)
  const middle: NumOrNull[] = new Array(bars.length).fill(null)
  for (let i = period - 1; i < bars.length; i++) {
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, bars[j].h ?? bars[j].c)
      lo = Math.min(lo, bars[j].l ?? bars[j].c)
    }
    upper[i] = hi
    lower[i] = lo
    middle[i] = (hi + lo) / 2
  }
  return { upper: roundSeries(upper), lower: roundSeries(lower), middle: roundSeries(middle) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ichimoku Cloud
// ─────────────────────────────────────────────────────────────────────────────

export interface IchimokuSeries {
  /** Tenkan-sen (conversion line). */
  conversion: NumOrNull[]
  /** Kijun-sen (base line). */
  base: NumOrNull[]
  /** Senkou Span A — value computed at index i, conventionally plotted at i+displacement. */
  spanA: NumOrNull[]
  /** Senkou Span B — value computed at index i, conventionally plotted at i+displacement. */
  spanB: NumOrNull[]
  /** Chikou Span — close, conventionally plotted at i-displacement. */
  laggingSpan: NumOrNull[]
  displacement: number
}

function highLowMid(bars: Bar[], i: number, period: number): number | null {
  if (i < period - 1) return null
  let hi = -Infinity
  let lo = Infinity
  for (let j = i - period + 1; j <= i; j++) {
    hi = Math.max(hi, bars[j].h ?? bars[j].c)
    lo = Math.min(lo, bars[j].l ?? bars[j].c)
  }
  return (hi + lo) / 2
}

/** Ichimoku Cloud lines. Returns computed values aligned to bar index; the
 *  chart applies `displacement` when projecting the cloud forward / lagging
 *  span backward. */
export function ichimoku(
  bars: Bar[],
  conversionPeriod = 9,
  basePeriod = 26,
  spanBPeriod = 52,
  displacement = 26,
): IchimokuSeries {
  const conversion: NumOrNull[] = new Array(bars.length).fill(null)
  const base: NumOrNull[] = new Array(bars.length).fill(null)
  const spanA: NumOrNull[] = new Array(bars.length).fill(null)
  const spanB: NumOrNull[] = new Array(bars.length).fill(null)
  const laggingSpan: NumOrNull[] = new Array(bars.length).fill(null)
  for (let i = 0; i < bars.length; i++) {
    const conv = highLowMid(bars, i, conversionPeriod)
    const bse = highLowMid(bars, i, basePeriod)
    conversion[i] = conv
    base[i] = bse
    spanA[i] = conv != null && bse != null ? (conv + bse) / 2 : null
    spanB[i] = highLowMid(bars, i, spanBPeriod)
    laggingSpan[i] = bars[i].c
  }
  return {
    conversion: roundSeries(conversion),
    base: roundSeries(base),
    spanA: roundSeries(spanA),
    spanB: roundSeries(spanB),
    laggingSpan: roundSeries(laggingSpan),
    displacement,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RSI (Wilder)
// ─────────────────────────────────────────────────────────────────────────────

/** Relative Strength Index using Wilder's smoothing. */
export function rsi(values: number[], period = 14): NumOrNull[] {
  const out: NumOrNull[] = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) gain += diff
    else loss -= diff
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    const g = diff > 0 ? diff : 0
    const l = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return roundSeries(out, 2)
}

// ─────────────────────────────────────────────────────────────────────────────
// MACD
// ─────────────────────────────────────────────────────────────────────────────

export interface MacdSeries {
  macd: NumOrNull[]
  signal: NumOrNull[]
  histogram: NumOrNull[]
}

/** MACD line (EMAfast − EMAslow), signal (EMA of MACD) and histogram. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  const emaFast = ema(values, fast)
  const emaSlow = ema(values, slow)
  const macdLine: NumOrNull[] = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null,
  )
  // Signal EMA computed only over the defined tail of the MACD line.
  const firstDefined = macdLine.findIndex(v => v != null)
  const signal: NumOrNull[] = new Array(values.length).fill(null)
  if (firstDefined >= 0) {
    const tail = macdLine.slice(firstDefined).map(v => v as number)
    const sig = ema(tail, signalPeriod)
    for (let i = 0; i < sig.length; i++) signal[firstDefined + i] = sig[i]
  }
  const histogram: NumOrNull[] = values.map((_, i) =>
    macdLine[i] != null && signal[i] != null ? (macdLine[i] as number) - (signal[i] as number) : null,
  )
  return {
    macd: roundSeries(macdLine),
    signal: roundSeries(signal),
    histogram: roundSeries(histogram),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stochastic oscillator
// ─────────────────────────────────────────────────────────────────────────────

export interface StochasticSeries {
  k: NumOrNull[]
  d: NumOrNull[]
}

/**
 * Stochastic %K / %D. `smooth` smooths the raw %K (fast→slow stochastic);
 * %D is the SMA of the smoothed %K over `dPeriod`.
 */
export function stochastic(bars: Bar[], kPeriod = 14, dPeriod = 3, smooth = 3): StochasticSeries {
  const rawK: NumOrNull[] = new Array(bars.length).fill(null)
  for (let i = kPeriod - 1; i < bars.length; i++) {
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hi = Math.max(hi, bars[j].h ?? bars[j].c)
      lo = Math.min(lo, bars[j].l ?? bars[j].c)
    }
    const denom = hi - lo
    rawK[i] = denom === 0 ? 100 : ((bars[i].c - lo) / denom) * 100
  }
  const k = smoothNullable(rawK, smooth)
  const d = smoothNullable(k, dPeriod)
  return { k: roundSeries(k, 2), d: roundSeries(d, 2) }
}

/** SMA over a nullable series, ignoring leading nulls. */
function smoothNullable(series: NumOrNull[], period: number): NumOrNull[] {
  const out: NumOrNull[] = new Array(series.length).fill(null)
  if (period <= 1) return series.slice()
  for (let i = 0; i < series.length; i++) {
    if (i < period - 1) continue
    let sum = 0
    let ok = true
    for (let j = i - period + 1; j <= i; j++) {
      const v = series[j]
      if (v == null) { ok = false; break }
      sum += v
    }
    if (ok) out[i] = sum / period
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// ADX (+DI / -DI)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdxSeries {
  adx: NumOrNull[]
  plusDI: NumOrNull[]
  minusDI: NumOrNull[]
}

/** Average Directional Index with Wilder smoothing, plus the directional
 *  indicators +DI and -DI. */
export function adx(bars: Bar[], period = 14): AdxSeries {
  const n = bars.length
  const adxOut: NumOrNull[] = new Array(n).fill(null)
  const plusDI: NumOrNull[] = new Array(n).fill(null)
  const minusDI: NumOrNull[] = new Array(n).fill(null)
  if (n <= period * 2) {
    // Still attempt DI where possible, but ADX needs 2× warm-up.
  }
  const tr: number[] = new Array(n).fill(0)
  const plusDM: number[] = new Array(n).fill(0)
  const minusDM: number[] = new Array(n).fill(0)
  for (let i = 1; i < n; i++) {
    const h = bars[i].h ?? bars[i].c
    const l = bars[i].l ?? bars[i].c
    const ph = bars[i - 1].h ?? bars[i - 1].c
    const pl = bars[i - 1].l ?? bars[i - 1].c
    const pc = bars[i - 1].c
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
    const up = h - ph
    const down = pl - l
    plusDM[i] = up > down && up > 0 ? up : 0
    minusDM[i] = down > up && down > 0 ? down : 0
  }
  if (n <= period) return { adx: adxOut, plusDI, minusDI }
  // Wilder smoothing of TR / DM.
  let trS = 0
  let pdmS = 0
  let mdmS = 0
  for (let i = 1; i <= period; i++) { trS += tr[i]; pdmS += plusDM[i]; mdmS += minusDM[i] }
  const dx: NumOrNull[] = new Array(n).fill(null)
  const computeDX = (i: number) => {
    const pDI = trS === 0 ? 0 : (pdmS / trS) * 100
    const mDI = trS === 0 ? 0 : (mdmS / trS) * 100
    plusDI[i] = round(pDI, 2)
    minusDI[i] = round(mDI, 2)
    const sum = pDI + mDI
    dx[i] = sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100
  }
  computeDX(period)
  for (let i = period + 1; i < n; i++) {
    trS = trS - trS / period + tr[i]
    pdmS = pdmS - pdmS / period + plusDM[i]
    mdmS = mdmS - mdmS / period + minusDM[i]
    computeDX(i)
  }
  // ADX = Wilder-smoothed average of DX, starting after a second `period` warm-up.
  const dxStart = period
  const firstAdxIdx = dxStart + period - 1
  if (firstAdxIdx < n) {
    let sumDX = 0
    let count = 0
    for (let i = dxStart; i <= firstAdxIdx; i++) {
      if (dx[i] != null) { sumDX += dx[i] as number; count += 1 }
    }
    if (count > 0) {
      let prevADX = sumDX / count
      adxOut[firstAdxIdx] = round(prevADX, 2)
      for (let i = firstAdxIdx + 1; i < n; i++) {
        if (dx[i] == null) continue
        prevADX = (prevADX * (period - 1) + (dx[i] as number)) / period
        adxOut[i] = round(prevADX, 2)
      }
    }
  }
  return { adx: adxOut, plusDI, minusDI }
}

// ─────────────────────────────────────────────────────────────────────────────
// OBV
// ─────────────────────────────────────────────────────────────────────────────

/** On-Balance Volume — cumulative volume signed by close-to-close direction. */
export function obv(bars: Bar[]): NumOrNull[] {
  const out: NumOrNull[] = new Array(bars.length).fill(null)
  if (bars.length === 0) return out
  let cum = 0
  out[0] = 0
  for (let i = 1; i < bars.length; i++) {
    const v = bars[i].v ?? 0
    if (bars[i].c > bars[i - 1].c) cum += v
    else if (bars[i].c < bars[i - 1].c) cum -= v
    out[i] = cum
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator + signals
// ─────────────────────────────────────────────────────────────────────────────

export type OverlayType = 'sma' | 'ema' | 'wma' | 'bollinger' | 'ichimoku' | 'vwap' | 'donchian'
export type OscillatorType = 'rsi' | 'macd' | 'stochastic' | 'adx' | 'obv'
export type IndicatorType = OverlayType | OscillatorType

export const OVERLAY_TYPES: OverlayType[] = ['sma', 'ema', 'wma', 'bollinger', 'ichimoku', 'vwap', 'donchian']
export const OSCILLATOR_TYPES: OscillatorType[] = ['rsi', 'macd', 'stochastic', 'adx', 'obv']

export interface IndicatorRequest {
  type: IndicatorType
  /** Free-form numeric parameters; sensible defaults applied per indicator. */
  params?: Record<string, number>
}

export interface ComputedIndicator {
  type: IndicatorType
  pane: 'overlay' | 'oscillator'
  params: Record<string, number>
  /** Named series, each aligned 1:1 with the input bars. */
  series: Record<string, NumOrNull[]>
  /** Extra static metadata (e.g. ichimoku displacement). */
  meta?: Record<string, number>
}

const PANE: Record<IndicatorType, 'overlay' | 'oscillator'> = {
  sma: 'overlay', ema: 'overlay', wma: 'overlay', bollinger: 'overlay',
  ichimoku: 'overlay', vwap: 'overlay', donchian: 'overlay',
  rsi: 'oscillator', macd: 'oscillator', stochastic: 'oscillator', adx: 'oscillator', obv: 'oscillator',
}

/** Compute a single requested indicator from bars. */
export function computeIndicator(bars: Bar[], req: IndicatorRequest): ComputedIndicator {
  const c = closes(bars)
  const p = req.params || {}
  switch (req.type) {
    case 'sma': {
      const period = p.period ?? 50
      return { type: 'sma', pane: 'overlay', params: { period }, series: { sma: roundSeries(sma(c, period)) } }
    }
    case 'ema': {
      const period = p.period ?? 20
      return { type: 'ema', pane: 'overlay', params: { period }, series: { ema: roundSeries(ema(c, period)) } }
    }
    case 'wma': {
      const period = p.period ?? 20
      return { type: 'wma', pane: 'overlay', params: { period }, series: { wma: roundSeries(wma(c, period)) } }
    }
    case 'bollinger': {
      const period = p.period ?? 20
      const mult = p.mult ?? p.stddev ?? 2
      return { type: 'bollinger', pane: 'overlay', params: { period, mult }, series: bollinger(c, period, mult) as unknown as Record<string, NumOrNull[]> }
    }
    case 'vwap': {
      return { type: 'vwap', pane: 'overlay', params: {}, series: { vwap: vwap(bars) } }
    }
    case 'donchian': {
      const period = p.period ?? 20
      return { type: 'donchian', pane: 'overlay', params: { period }, series: donchian(bars, period) as unknown as Record<string, NumOrNull[]> }
    }
    case 'ichimoku': {
      const conversion = p.conversion ?? 9
      const base = p.base ?? 26
      const spanB = p.spanB ?? 52
      const displacement = p.displacement ?? 26
      const ich = ichimoku(bars, conversion, base, spanB, displacement)
      const { displacement: disp, ...series } = ich
      return {
        type: 'ichimoku', pane: 'overlay',
        params: { conversion, base, spanB, displacement },
        series: series as unknown as Record<string, NumOrNull[]>,
        meta: { displacement: disp },
      }
    }
    case 'rsi': {
      const period = p.period ?? 14
      return { type: 'rsi', pane: 'oscillator', params: { period }, series: { rsi: rsi(c, period) } }
    }
    case 'macd': {
      const fast = p.fast ?? 12
      const slow = p.slow ?? 26
      const signal = p.signal ?? 9
      return { type: 'macd', pane: 'oscillator', params: { fast, slow, signal }, series: macd(c, fast, slow, signal) as unknown as Record<string, NumOrNull[]> }
    }
    case 'stochastic': {
      const kPeriod = p.kPeriod ?? p.period ?? 14
      const dPeriod = p.dPeriod ?? 3
      const smooth = p.smooth ?? 3
      return { type: 'stochastic', pane: 'oscillator', params: { kPeriod, dPeriod, smooth }, series: stochastic(bars, kPeriod, dPeriod, smooth) as unknown as Record<string, NumOrNull[]> }
    }
    case 'adx': {
      const period = p.period ?? 14
      return { type: 'adx', pane: 'oscillator', params: { period }, series: adx(bars, period) as unknown as Record<string, NumOrNull[]> }
    }
    case 'obv': {
      return { type: 'obv', pane: 'oscillator', params: {}, series: { obv: obv(bars) } }
    }
  }
}

/** Compute many indicators at once. Unknown types are skipped. */
export function computeIndicators(bars: Bar[], requests: IndicatorRequest[]): ComputedIndicator[] {
  const out: ComputedIndicator[] = []
  for (const req of requests) {
    if (!PANE[req.type]) continue
    out.push(computeIndicator(bars, req))
  }
  return out
}

export interface IndicatorSignal {
  indicator: string
  value: number | null
  /** Coarse interpretation an LLM / human can quote. */
  signal: 'bullish' | 'bearish' | 'overbought' | 'oversold' | 'neutral' | 'trending' | 'ranging'
  note: string
}

function lastDefined(series: NumOrNull[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i]
    if (v != null && Number.isFinite(v)) return v
  }
  return null
}

/**
 * Derive a compact set of latest signals from the standard indicator set —
 * used by the agent tool so the model can cite an indicator reading rather
 * than re-deriving it from raw bars.
 */
export function latestSignals(bars: Bar[]): IndicatorSignal[] {
  const out: IndicatorSignal[] = []
  if (bars.length < 2) return out
  const c = closes(bars)
  const lastClose = c[c.length - 1]

  // RSI
  const rsiVal = lastDefined(rsi(c, 14))
  if (rsiVal != null) {
    out.push({
      indicator: 'RSI(14)',
      value: rsiVal,
      signal: rsiVal >= 70 ? 'overbought' : rsiVal <= 30 ? 'oversold' : 'neutral',
      note: `RSI is ${rsiVal.toFixed(1)}${rsiVal >= 70 ? ' — overbought territory' : rsiVal <= 30 ? ' — oversold territory' : ''}.`,
    })
  }

  // MACD
  const m = macd(c)
  const macdVal = lastDefined(m.macd)
  const sigVal = lastDefined(m.signal)
  const histVal = lastDefined(m.histogram)
  if (macdVal != null && sigVal != null) {
    out.push({
      indicator: 'MACD(12,26,9)',
      value: histVal,
      signal: macdVal > sigVal ? 'bullish' : 'bearish',
      note: `MACD line ${macdVal.toFixed(2)} is ${macdVal > sigVal ? 'above' : 'below'} its signal (${sigVal.toFixed(2)}); histogram ${histVal != null ? histVal.toFixed(2) : '—'}.`,
    })
  }

  // SMA50 / SMA200 trend
  const sma50 = lastDefined(sma(c, 50))
  const sma200 = lastDefined(sma(c, 200))
  if (sma50 != null) {
    out.push({
      indicator: 'SMA(50)',
      value: sma50,
      signal: lastClose > sma50 ? 'bullish' : 'bearish',
      note: `Price (${lastClose.toFixed(2)}) is ${lastClose > sma50 ? 'above' : 'below'} the 50-day SMA (${sma50.toFixed(2)}).`,
    })
  }
  if (sma50 != null && sma200 != null) {
    out.push({
      indicator: 'Golden/Death cross',
      value: sma50 - sma200,
      signal: sma50 > sma200 ? 'bullish' : 'bearish',
      note: `50-day SMA is ${sma50 > sma200 ? 'above' : 'below'} the 200-day SMA (${sma200.toFixed(2)}) — ${sma50 > sma200 ? 'golden-cross' : 'death-cross'} regime.`,
    })
  }

  // ADX trend strength
  const a = adx(bars, 14)
  const adxVal = lastDefined(a.adx)
  if (adxVal != null) {
    out.push({
      indicator: 'ADX(14)',
      value: adxVal,
      signal: adxVal >= 25 ? 'trending' : 'ranging',
      note: `ADX is ${adxVal.toFixed(1)} — ${adxVal >= 25 ? 'a trending market' : 'a weak / ranging market'}.`,
    })
  }

  // Stochastic
  const st = stochastic(bars)
  const kVal = lastDefined(st.k)
  if (kVal != null) {
    out.push({
      indicator: 'Stochastic %K(14,3,3)',
      value: kVal,
      signal: kVal >= 80 ? 'overbought' : kVal <= 20 ? 'oversold' : 'neutral',
      note: `Stochastic %K is ${kVal.toFixed(1)}${kVal >= 80 ? ' — overbought' : kVal <= 20 ? ' — oversold' : ''}.`,
    })
  }

  return out
}
