'use client'
/**
 * FootballFieldChart — banker-style multi-methodology valuation overview.
 *
 * Each `band` is a horizontal range bar (low → high) on a shared $-price
 * axis, with an optional white tick at the median/point estimate. Bands are
 * grouped by `group` (e.g. "Peer Comps", "Transaction Comps") with the
 * group label rendered on the left edge. Two vertical guide lines overlay
 * the chart: a solid green "Current Price" line and a dashed white
 * "Weighted Valuation" line.
 *
 * Pure presentational component — no data fetching.
 */
import { CSSProperties, ReactNode, useMemo } from 'react'

export interface ValuationBand {
  /** Group heading shown once on the left for all rows that share it. */
  group: string
  /** Row label, e.g. "TEV/EBITDA". */
  label: string
  /** Range low (price). */
  low: number | null
  /** Range high (price). */
  high: number | null
  /** Median / point-estimate tick (price). */
  median: number | null
  /** Token to drive the bar fill — picks from the band-color palette. */
  color: 'gray' | 'teal' | 'amber' | 'violet'
  /** Optional small annotation rendered below the row label (e.g. WACC). */
  annotation?: string
  /** When true the row renders as a faint placeholder bar with caption. */
  placeholder?: boolean
  /** Optional caption for placeholder rows. Defaults to "Not yet wired up". */
  placeholderCaption?: string
}

export interface FootballFieldChartProps {
  bands: ValuationBand[]
  currentPrice: number | null
  weightedValuation: number | null
  /** Chart height in px. Bands flex to fill. */
  height?: number
  /** Optional minimum width to enable horizontal scrolling on narrow viewports. */
  minWidth?: number
  /** Title shown in the top-left of the chart area. Defaults to "Valuation Overview". */
  title?: string
  /** Right-side ReactNode rendered next to the title (e.g. info popover trigger). */
  titleRight?: ReactNode
  style?: CSSProperties
}

const BAND_FILL = {
  gray:   { bar: 'rgba(160,170,185,0.55)', solid: '#a4adbf' },
  teal:   { bar: 'rgba(56,189,248,0.55)',  solid: '#38bdf8' },
  amber:  { bar: 'rgba(251,146,60,0.55)',  solid: '#fb923c' },
  violet: { bar: 'rgba(167,139,250,0.55)', solid: '#a78bfa' },
} as const

const LEGEND_ITEMS: Array<{ label: string; color: keyof typeof BAND_FILL | 'median' }> = [
  { label: 'Median Value',           color: 'median' },
  { label: 'Peer Comps Range',       color: 'teal' },
  { label: 'Transaction Comps Range', color: 'amber' },
  { label: 'DCF Range',              color: 'violet' },
]

// Build a "nice" axis with sensible step + min/max ticks padded slightly
// past the data extremes. Keeps the axis from feeling clipped at either end.
function niceTicks(values: number[], targetCount = 6): { ticks: number[]; min: number; max: number } {
  const finite = values.filter(v => Number.isFinite(v) && v > 0)
  if (finite.length === 0) return { ticks: [0, 50, 100, 150, 200], min: 0, max: 200 }
  const dataMin = Math.min(...finite)
  const dataMax = Math.max(...finite)
  const span = Math.max(dataMax - dataMin, dataMax * 0.2, 1)
  const padded = { lo: dataMin - span * 0.08, hi: dataMax + span * 0.08 }
  const rawStep = (padded.hi - padded.lo) / Math.max(1, targetCount - 1)
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const candidates = [1, 2, 2.5, 5, 10].map(m => m * pow)
  const step = candidates.find(s => s >= rawStep) || candidates[candidates.length - 1]
  const niceMin = Math.floor(padded.lo / step) * step
  const niceMax = Math.ceil(padded.hi / step) * step
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return { ticks, min: niceMin, max: niceMax }
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 100)  return '$' + v.toFixed(0)
  return '$' + v.toFixed(2)
}

/**
 * Pure SVG implementation. We avoid Recharts here because the chart needs
 * very specific row alignment, group labels with rotated headers, and
 * non-overlapping guide-line labels — all easier to express directly in SVG.
 */
export function FootballFieldChart({
  bands, currentPrice, weightedValuation,
  height = 480, minWidth = 720,
  title = 'Valuation Overview',
  titleRight,
  style,
}: FootballFieldChartProps) {
  const allValues = useMemo(() => {
    const vs: number[] = []
    for (const b of bands) {
      if (!b.placeholder) {
        if (b.low != null && Number.isFinite(b.low))   vs.push(b.low)
        if (b.high != null && Number.isFinite(b.high)) vs.push(b.high)
        if (b.median != null && Number.isFinite(b.median)) vs.push(b.median)
      }
    }
    if (currentPrice != null && Number.isFinite(currentPrice)) vs.push(currentPrice)
    if (weightedValuation != null && Number.isFinite(weightedValuation)) vs.push(weightedValuation)
    return vs
  }, [bands, currentPrice, weightedValuation])

  const { ticks, min: axisMin, max: axisMax } = useMemo(() => niceTicks(allValues, 6), [allValues])

  // Layout in SVG user-space units. We render at 1000 wide and let the
  // parent CSS scale it for fluid responsiveness via viewBox.
  const W = 1000
  const H = height
  const PAD = { top: 64, right: 40, bottom: 64, left: 200 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const rowCount = Math.max(bands.length, 1)
  const rowH = innerH / rowCount
  const barH = Math.min(14, rowH * 0.42)

  const xFor = (price: number) => {
    if (!Number.isFinite(price)) return PAD.left
    const t = (price - axisMin) / Math.max(axisMax - axisMin, 1e-9)
    return PAD.left + t * innerW
  }

  // Determine whether the two overlay labels would collide so we can stagger
  // them vertically rather than letting them stack on top of each other.
  const cpX = currentPrice != null ? xFor(currentPrice) : null
  const wvX = weightedValuation != null ? xFor(weightedValuation) : null
  const overlap = cpX != null && wvX != null && Math.abs(cpX - wvX) < 140
  const cpLabelY = 28
  const wvLabelY = overlap ? 48 : 28

  // Group runs (consecutive rows that share the same `group`) for the
  // left-edge group label.
  const groups = useMemo(() => {
    const out: Array<{ group: string; startIdx: number; endIdx: number }> = []
    let cur: { group: string; startIdx: number; endIdx: number } | null = null
    bands.forEach((b, i) => {
      if (!cur || cur.group !== b.group) {
        if (cur) out.push(cur)
        cur = { group: b.group, startIdx: i, endIdx: i }
      } else {
        cur.endIdx = i
      }
    })
    if (cur) out.push(cur)
    return out
  }, [bands])

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        overflowX: 'auto',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, padding: '0 4px', minWidth }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
        {titleRight}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Football field valuation chart with ${bands.length} bands`}
        style={{ width: '100%', minWidth, height: 'auto', display: 'block', overflow: 'visible' }}
      >
        {/* Vertical gridlines per axis tick (subtle) */}
        {ticks.map(t => {
          const x = xFor(t)
          return (
            <line
              key={`grid-${t}`}
              x1={x} x2={x}
              y1={PAD.top} y2={H - PAD.bottom}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          )
        })}

        {/* Horizontal divider above each new group */}
        {groups.map((g, gi) => {
          if (gi === 0) return null
          const y = PAD.top + g.startIdx * rowH
          return (
            <line
              key={`div-${gi}`}
              x1={PAD.left - 180} x2={W - PAD.right}
              y1={y} y2={y}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={1}
            />
          )
        })}

        {/* Group labels rotated on the left edge */}
        {groups.map((g, gi) => {
          const yMid = PAD.top + ((g.startIdx + g.endIdx + 1) / 2) * rowH
          const xLabel = 22
          return (
            <text
              key={`group-${gi}`}
              x={xLabel} y={yMid}
              transform={`rotate(-90 ${xLabel} ${yMid})`}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={700}
              fontFamily="Inter, system-ui, sans-serif"
              fill="var(--text-secondary)"
              letterSpacing={0.6}
            >
              {g.group}
            </text>
          )
        })}

        {/* Rows */}
        {bands.map((b, i) => {
          const yMid = PAD.top + (i + 0.5) * rowH
          const labelX = PAD.left - 12
          const isPlaceholder = !!b.placeholder || b.low == null || b.high == null
          const fill = BAND_FILL[b.color]
          const x1 = isPlaceholder ? PAD.left + 8 : xFor(b.low as number)
          const x2 = isPlaceholder ? PAD.left + innerW * 0.18 : xFor(b.high as number)
          const barX = Math.min(x1, x2)
          const barW = Math.max(2, Math.abs(x2 - x1))

          return (
            <g key={`row-${i}`}>
              {/* Row label */}
              <text
                x={labelX} y={yMid - (b.annotation ? 4 : 0)}
                textAnchor="end"
                fontSize={11.5}
                fontWeight={600}
                fontFamily="Inter, system-ui, sans-serif"
                fill="var(--text-primary)"
                dominantBaseline="middle"
              >
                {b.label}
              </text>
              {b.annotation && (
                <text
                  x={labelX} y={yMid + 12}
                  textAnchor="end"
                  fontSize={9.5}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill="var(--text-muted)"
                  dominantBaseline="middle"
                >
                  {b.annotation}
                </text>
              )}

              {/* Bar */}
              {isPlaceholder ? (
                <>
                  <rect
                    x={PAD.left + 8} y={yMid - 3}
                    width={innerW * 0.16} height={6} rx={3}
                    fill="rgba(255,255,255,0.04)"
                    stroke="rgba(255,255,255,0.10)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={PAD.left + 8 + innerW * 0.16 + 8}
                    y={yMid}
                    fontSize={10}
                    fontFamily="Inter, system-ui, sans-serif"
                    fill="var(--text-muted)"
                    dominantBaseline="middle"
                  >
                    {b.placeholderCaption || 'Not yet wired up'}
                  </text>
                </>
              ) : (
                <>
                  <rect
                    x={barX} y={yMid - barH / 2}
                    width={barW} height={barH} rx={barH / 2}
                    fill={fill.bar}
                    stroke={fill.solid}
                    strokeOpacity={0.8}
                    strokeWidth={1}
                  />
                  {/* Median tick */}
                  {b.median != null && Number.isFinite(b.median) && (
                    <rect
                      x={xFor(b.median) - 1.5}
                      y={yMid - barH / 2 - 3}
                      width={3} height={barH + 6} rx={1}
                      fill="#ffffff"
                    />
                  )}
                </>
              )}
            </g>
          )
        })}

        {/* Axis ticks */}
        {ticks.map(t => {
          const x = xFor(t)
          return (
            <g key={`tick-${t}`}>
              <line
                x1={x} x2={x}
                y1={H - PAD.bottom} y2={H - PAD.bottom + 5}
                stroke="rgba(255,255,255,0.25)"
              />
              <text
                x={x} y={H - PAD.bottom + 18}
                textAnchor="middle"
                fontSize={10.5}
                fontFamily="Inter, system-ui, sans-serif"
                fill="var(--text-muted)"
              >
                {fmtPrice(t)}
              </text>
            </g>
          )
        })}
        <line
          x1={PAD.left} x2={W - PAD.right}
          y1={H - PAD.bottom} y2={H - PAD.bottom}
          stroke="rgba(255,255,255,0.18)"
        />

        {/* Overlay: Current Price (solid green) */}
        {cpX != null && (
          <g>
            <line
              x1={cpX} x2={cpX}
              y1={PAD.top - 12} y2={H - PAD.bottom}
              stroke="var(--pos)"
              strokeWidth={1.5}
            />
            <circle cx={cpX} cy={cpLabelY + 6} r={3} fill="var(--pos)" />
            <text
              x={cpX + 8} y={cpLabelY + 6}
              fontSize={11.5}
              fontWeight={700}
              fontFamily="Inter, system-ui, sans-serif"
              fill="var(--pos)"
              dominantBaseline="middle"
            >
              Current Price {fmtPrice(currentPrice as number)}
            </text>
          </g>
        )}

        {/* Overlay: Weighted Valuation (dashed) */}
        {wvX != null && (
          <g>
            <line
              x1={wvX} x2={wvX}
              y1={PAD.top - 12} y2={H - PAD.bottom}
              stroke="rgba(220,225,235,0.85)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text
              x={wvX + 8} y={wvLabelY + 6}
              fontSize={11.5}
              fontWeight={700}
              fontFamily="Inter, system-ui, sans-serif"
              fill="rgba(220,225,235,0.95)"
              dominantBaseline="middle"
            >
              Weighted Valuation {fmtPrice(weightedValuation as number)}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
        padding: '10px 4px 0', minWidth,
      }}>
        {LEGEND_ITEMS.map(item => (
          <div key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {item.color === 'median' ? (
              <span style={{ width: 3, height: 14, background: '#fff', borderRadius: 1, display: 'inline-block' }} />
            ) : (
              <span style={{
                width: 22, height: 8, borderRadius: 4,
                background: BAND_FILL[item.color].bar,
                border: `1px solid ${BAND_FILL[item.color].solid}`,
                display: 'inline-block',
              }} />
            )}
            {item.label}
          </div>
        ))}
      </div>
    </div>
  )
}
