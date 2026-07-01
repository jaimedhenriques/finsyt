'use client'
/**
 * TechnicalsChart — pure-SVG price + indicator chart.
 *
 * Renders a candlestick (or line) price pane with overlay indicators drawn on
 * the same price axis, plus a stack of oscillator sub-panes below (RSI, MACD,
 * Stochastic, ADX, OBV) — each with its own y-scale and reference lines. We use
 * raw SVG rather than a charting lib so candles, indicator bands (Bollinger /
 * Donchian / Ichimoku cloud) and multi-series oscillator panes can share one
 * index-based x-axis exactly.
 *
 * Purely presentational — all series are pre-computed by the caller via the
 * shared `lib/technical-indicators` engine.
 */
import { Fragment, useMemo } from 'react'
import type { Bar, ComputedIndicator, NumOrNull } from '@/lib/technical-indicators'

export interface TechnicalsChartProps {
  bars: Bar[]
  overlays: ComputedIndicator[]
  oscillators: ComputedIndicator[]
  chartType: 'candle' | 'line'
  height?: number
}

const W = 1000
const PAD = { top: 16, right: 64, bottom: 28, left: 8 }
const OSC_H = 132
const OSC_GAP = 10

// Distinct stroke colours for overlay lines (cycled).
const OVERLAY_COLORS = ['#38bdf8', '#a78bfa', '#fbbf24', '#f472b6', '#4ade80', '#60a5fa', '#fb7185']

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

function fmtCompact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + 'B'
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K'
  return v.toFixed(0)
}

function fmtDate(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear().toString().slice(2)}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** min/max over a set of nullable series, ignoring nulls. */
function extent(series: NumOrNull[][]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const s of series) {
    for (const v of s) {
      if (v == null || !Number.isFinite(v)) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1]
  if (lo === hi) return [lo - 1, hi + 1]
  return [lo, hi]
}

export function TechnicalsChart({ bars, overlays, oscillators, chartType, height = 380 }: TechnicalsChartProps) {
  const n = bars.length
  const priceH = height
  const totalH = priceH + oscillators.length * (OSC_H + OSC_GAP)

  const innerW = W - PAD.left - PAD.right
  const xFor = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * innerW)
  const candleW = Math.max(1, Math.min(10, (innerW / Math.max(n, 1)) * 0.7))

  // ── Price pane scale ──────────────────────────────────────────────────────
  const priceSeries = useMemo(() => {
    const series: NumOrNull[][] = [
      bars.map(b => b.h ?? b.c),
      bars.map(b => b.l ?? b.c),
      bars.map(b => b.c),
    ]
    for (const ov of overlays) {
      for (const key of Object.keys(ov.series)) series.push(ov.series[key])
    }
    return series
  }, [bars, overlays])

  const [pMin, pMax] = useMemo(() => {
    const [lo, hi] = extent(priceSeries)
    const pad = (hi - lo) * 0.06
    return [lo - pad, hi + pad]
  }, [priceSeries])

  const priceTop = PAD.top
  const priceBottom = priceTop + priceH - PAD.bottom - PAD.top
  const yPrice = (v: number) => {
    const t = (v - pMin) / Math.max(pMax - pMin, 1e-9)
    return priceBottom - t * (priceBottom - priceTop)
  }

  // Build a polyline path for a nullable series in the price pane.
  const pricePath = (s: NumOrNull[]) => buildPath(s, xFor, yPrice)

  // Axis ticks (price)
  const priceTicks = useMemo(() => niceTicks(pMin, pMax, 5), [pMin, pMax])
  // X date ticks
  const xTicks = useMemo(() => {
    if (n === 0) return [] as number[]
    const count = Math.min(6, n)
    const out: number[] = []
    for (let k = 0; k < count; k++) out.push(Math.round((k / Math.max(count - 1, 1)) * (n - 1)))
    return Array.from(new Set(out))
  }, [n])

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${totalH}`} role="img" aria-label="Technical analysis price chart"
        style={{ width: '100%', minWidth: 680, height: 'auto', display: 'block', overflow: 'visible', fontFamily: 'Inter, system-ui, sans-serif' }}>

        {/* Price gridlines + axis labels */}
        {priceTicks.map(t => {
          const y = yPrice(t)
          return (
            <g key={`pg-${t}`}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={PAD.left + innerW + 6} y={y} fontSize={10} fill="var(--text-muted)" dominantBaseline="middle">{fmtPrice(t)}</text>
            </g>
          )
        })}

        {/* Overlay bands (Bollinger / Donchian / Ichimoku cloud) drawn first */}
        {overlays.map((ov, oi) => <OverlayBands key={`ob-${oi}`} ov={ov} xFor={xFor} yPrice={yPrice} n={n} />)}

        {/* Price series */}
        {chartType === 'line' ? (
          <path d={pricePath(bars.map(b => b.c))} fill="none" stroke="var(--text-primary)" strokeWidth={1.4} />
        ) : (
          bars.map((b, i) => {
            const o = b.o ?? b.c
            const c = b.c
            const h = b.h ?? Math.max(o, c)
            const l = b.l ?? Math.min(o, c)
            const up = c >= o
            const color = up ? 'var(--pos)' : 'var(--neg)'
            const x = xFor(i)
            const yO = yPrice(o)
            const yC = yPrice(c)
            const top = Math.min(yO, yC)
            const bodyH = Math.max(1, Math.abs(yC - yO))
            return (
              <g key={`c-${i}`}>
                <line x1={x} x2={x} y1={yPrice(h)} y2={yPrice(l)} stroke={color} strokeWidth={1} />
                <rect x={x - candleW / 2} y={top} width={candleW} height={bodyH} fill={color} />
              </g>
            )
          })
        )}

        {/* Overlay lines (SMA/EMA/WMA/VWAP/Ichimoku lines/Bollinger mid) */}
        {overlays.map((ov, oi) => <OverlayLines key={`ol-${oi}`} ov={ov} oi={oi} pathFn={pricePath} />)}

        {/* X axis date labels */}
        {xTicks.map(i => (
          <text key={`xt-${i}`} x={xFor(i)} y={priceBottom + 16} fontSize={10} fill="var(--text-muted)" textAnchor="middle">
            {bars[i] ? fmtDate(bars[i].t) : ''}
          </text>
        ))}

        {/* Oscillator panes */}
        {oscillators.map((osc, idx) => {
          const top = priceH + idx * (OSC_H + OSC_GAP)
          return (
            <OscillatorPane
              key={`osc-${idx}`}
              osc={osc}
              top={top}
              height={OSC_H}
              xFor={xFor}
              innerW={innerW}
              n={n}
              bars={bars}
            />
          )
        })}
      </svg>
    </div>
  )
}

// ── Overlay band rendering ────────────────────────────────────────────────────
function OverlayBands({ ov, xFor, yPrice, n }: {
  ov: ComputedIndicator
  xFor: (i: number) => number
  yPrice: (v: number) => number
  n: number
}) {
  if (ov.type === 'bollinger' || ov.type === 'donchian') {
    const upper = ov.series.upper
    const lower = ov.series.lower
    if (!upper || !lower) return null
    const area = buildAreaBetween(upper, lower, xFor, yPrice)
    const color = ov.type === 'bollinger' ? 'rgba(56,189,248,0.10)' : 'rgba(251,191,36,0.10)'
    return (
      <g>
        <path d={area} fill={color} stroke="none" />
        <path d={buildPath(upper, xFor, yPrice)} fill="none" stroke={ov.type === 'bollinger' ? 'rgba(56,189,248,0.55)' : 'rgba(251,191,36,0.55)'} strokeWidth={1} strokeDasharray="3 2" />
        <path d={buildPath(lower, xFor, yPrice)} fill="none" stroke={ov.type === 'bollinger' ? 'rgba(56,189,248,0.55)' : 'rgba(251,191,36,0.55)'} strokeWidth={1} strokeDasharray="3 2" />
      </g>
    )
  }
  if (ov.type === 'ichimoku') {
    const spanA = ov.series.spanA
    const spanB = ov.series.spanB
    const disp = ov.meta?.displacement ?? 26
    if (!spanA || !spanB) return null
    // Shift spans forward by displacement for the cloud.
    const shiftedA = shiftForward(spanA, disp, n)
    const shiftedB = shiftForward(spanB, disp, n)
    const area = buildAreaBetween(shiftedA, shiftedB, xFor, yPrice)
    return <path d={area} fill="rgba(167,139,250,0.12)" stroke="none" />
  }
  return null
}

// ── Overlay line rendering ─────────────────────────────────────────────────────
function OverlayLines({ ov, oi, pathFn }: {
  ov: ComputedIndicator
  oi: number
  pathFn: (s: NumOrNull[]) => string
}) {
  const baseColor = OVERLAY_COLORS[oi % OVERLAY_COLORS.length]
  if (ov.type === 'sma' || ov.type === 'ema' || ov.type === 'wma') {
    const key = ov.type
    return <path d={pathFn(ov.series[key])} fill="none" stroke={baseColor} strokeWidth={1.4} />
  }
  if (ov.type === 'vwap') {
    return <path d={pathFn(ov.series.vwap)} fill="none" stroke="#22d3ee" strokeWidth={1.4} strokeDasharray="4 3" />
  }
  if (ov.type === 'bollinger') {
    return <path d={pathFn(ov.series.middle)} fill="none" stroke="rgba(56,189,248,0.85)" strokeWidth={1.2} />
  }
  if (ov.type === 'donchian') {
    return <path d={pathFn(ov.series.middle)} fill="none" stroke="rgba(251,191,36,0.85)" strokeWidth={1.2} strokeDasharray="2 2" />
  }
  if (ov.type === 'ichimoku') {
    return (
      <g>
        <path d={pathFn(ov.series.conversion)} fill="none" stroke="#38bdf8" strokeWidth={1.2} />
        <path d={pathFn(ov.series.base)} fill="none" stroke="#f472b6" strokeWidth={1.2} />
      </g>
    )
  }
  return null
}

// ── Oscillator pane ────────────────────────────────────────────────────────────
function OscillatorPane({ osc, top, height, xFor, innerW, n, bars }: {
  osc: ComputedIndicator
  top: number
  height: number
  xFor: (i: number) => number
  innerW: number
  n: number
  bars: Bar[]
}) {
  const padT = 18
  const padB = 6
  const innerTop = top + padT
  const innerBottom = top + height - padB

  // Determine y-scale + reference lines per oscillator type.
  let lo = 0
  let hi = 1
  let refLines: number[] = []
  let fixed = false
  if (osc.type === 'rsi') { lo = 0; hi = 100; refLines = [30, 70]; fixed = true }
  else if (osc.type === 'stochastic') { lo = 0; hi = 100; refLines = [20, 80]; fixed = true }
  else if (osc.type === 'adx') { lo = 0; hi = 100; refLines = [25]; fixed = true }

  if (!fixed) {
    const seriesVals = Object.values(osc.series)
    const [eLo, eHi] = extent(seriesVals)
    const pad = (eHi - eLo) * 0.08 || 1
    lo = eLo - pad
    hi = eHi + pad
    if (osc.type === 'macd' || osc.type === 'obv') refLines = [0]
  }

  const yFor = (v: number) => {
    const t = (v - lo) / Math.max(hi - lo, 1e-9)
    return innerBottom - t * (innerBottom - innerTop)
  }
  const path = (s: NumOrNull[]) => buildPath(s, xFor, yFor)

  const label = OSC_LABELS[osc.type](osc.params)

  return (
    <g>
      {/* Pane frame */}
      <rect x={PAD.left} y={top} width={innerW} height={height} fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.06)" strokeWidth={1} rx={4} />
      <text x={PAD.left + 6} y={top + 12} fontSize={10} fontWeight={700} fill="var(--text-secondary)">{label}</text>

      {/* Reference lines */}
      {refLines.map(r => (
        <g key={`ref-${r}`}>
          <line x1={PAD.left} x2={PAD.left + innerW} y1={yFor(r)} y2={yFor(r)} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3 3" />
          <text x={PAD.left + innerW + 6} y={yFor(r)} fontSize={9} fill="var(--text-muted)" dominantBaseline="middle">{osc.type === 'obv' ? fmtCompact(r) : r}</text>
        </g>
      ))}

      {/* Series per oscillator type */}
      {osc.type === 'rsi' && <path d={path(osc.series.rsi)} fill="none" stroke="#a78bfa" strokeWidth={1.3} />}

      {osc.type === 'macd' && (
        <>
          {/* histogram */}
          {bars.map((_, i) => {
            const v = osc.series.histogram?.[i]
            if (v == null) return null
            const y0 = yFor(0)
            const y1 = yFor(v)
            const x = xFor(i)
            const wBar = Math.max(1, (innerW / Math.max(n, 1)) * 0.6)
            return <rect key={`h-${i}`} x={x - wBar / 2} y={Math.min(y0, y1)} width={wBar} height={Math.max(1, Math.abs(y1 - y0))} fill={v >= 0 ? 'var(--pos)' : 'var(--neg)'} opacity={0.5} />
          })}
          <path d={path(osc.series.macd)} fill="none" stroke="#38bdf8" strokeWidth={1.3} />
          <path d={path(osc.series.signal)} fill="none" stroke="#fbbf24" strokeWidth={1.2} />
        </>
      )}

      {osc.type === 'stochastic' && (
        <>
          <path d={path(osc.series.k)} fill="none" stroke="#38bdf8" strokeWidth={1.3} />
          <path d={path(osc.series.d)} fill="none" stroke="#fbbf24" strokeWidth={1.2} />
        </>
      )}

      {osc.type === 'adx' && (
        <>
          <path d={path(osc.series.adx)} fill="none" stroke="var(--text-primary)" strokeWidth={1.4} />
          <path d={path(osc.series.plusDI)} fill="none" stroke="var(--pos)" strokeWidth={1.1} />
          <path d={path(osc.series.minusDI)} fill="none" stroke="var(--neg)" strokeWidth={1.1} />
        </>
      )}

      {osc.type === 'obv' && <path d={path(osc.series.obv)} fill="none" stroke="#4ade80" strokeWidth={1.3} />}
    </g>
  )
}

const OSC_LABELS: Record<string, (p: Record<string, number>) => string> = {
  rsi: p => `RSI (${p.period ?? 14})`,
  macd: p => `MACD (${p.fast ?? 12},${p.slow ?? 26},${p.signal ?? 9})`,
  stochastic: p => `Stochastic (${p.kPeriod ?? 14},${p.dPeriod ?? 3},${p.smooth ?? 3})`,
  adx: p => `ADX (${p.period ?? 14})  +DI / -DI`,
  obv: () => 'OBV',
}

// ── path helpers ────────────────────────────────────────────────────────────────
function buildPath(s: NumOrNull[], xFor: (i: number) => number, yFor: (v: number) => number): string {
  let d = ''
  let pen = false
  for (let i = 0; i < s.length; i++) {
    const v = s[i]
    if (v == null || !Number.isFinite(v)) { pen = false; continue }
    const x = xFor(i)
    const y = yFor(v)
    d += `${pen ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `
    pen = true
  }
  return d.trim()
}

/** Area between two series (upper forward, lower backward). Only segments where
 *  both are defined are filled. */
function buildAreaBetween(upper: NumOrNull[], lower: NumOrNull[], xFor: (i: number) => number, yFor: (v: number) => number): string {
  const segs: Array<[number, number]> = []
  let start = -1
  for (let i = 0; i < upper.length; i++) {
    const ok = upper[i] != null && lower[i] != null && Number.isFinite(upper[i] as number) && Number.isFinite(lower[i] as number)
    if (ok && start < 0) start = i
    if ((!ok || i === upper.length - 1) && start >= 0) {
      segs.push([start, ok ? i : i - 1])
      start = -1
    }
  }
  let d = ''
  for (const [a, b] of segs) {
    if (b <= a) continue
    let top = ''
    for (let i = a; i <= b; i++) top += `${i === a ? 'M' : 'L'}${xFor(i).toFixed(2)} ${yFor(upper[i] as number).toFixed(2)} `
    let bot = ''
    for (let i = b; i >= a; i--) bot += `L${xFor(i).toFixed(2)} ${yFor(lower[i] as number).toFixed(2)} `
    d += top + bot + 'Z '
  }
  return d.trim()
}

/** Shift a series forward by `disp` indices (for the Ichimoku cloud). */
function shiftForward(s: NumOrNull[], disp: number, n: number): NumOrNull[] {
  const out: NumOrNull[] = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    const src = i - disp
    if (src >= 0 && src < s.length) out[i] = s[src]
  }
  return out
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min]
  const step = (max - min) / Math.max(count - 1, 1)
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(min + step * i)
  return out
}
