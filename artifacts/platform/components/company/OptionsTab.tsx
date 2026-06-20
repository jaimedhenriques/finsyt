"use client"
/**
 * OptionsTab — options & derivatives analytics for a single ticker.
 *
 * Three surfaces, all driven by /api/options (provider-attributed, never
 * fabricated):
 *   1. Chain    — calls/puts by strike for a chosen expiry, with bid/ask,
 *                 volume, OI, IV and per-contract Greeks (Black–Scholes filled
 *                 when the upstream omits them).
 *   2. IV Smile — implied volatility by strike (calls vs puts) at the chosen
 *                 expiry, rendered as a pure-SVG smile.
 *   3. Strategy — payoff builder for covered call / vertical spread / straddle
 *                 with payoff diagram + max profit/loss/breakevens, computed
 *                 client-side via lib/options-math.
 *
 * When no provider returns a chain the tab shows an honest empty state.
 */
import { useEffect, useMemo, useState } from "react"
import { Card, Badge, Skeleton, EmptyState, Select, FieldLabel, Button } from "@/components/ui"
import {
  strategyMetrics,
  type StrategyLeg,
} from "@/lib/options-math"

type GreeksSource = "upstream" | "computed" | "none"

interface OptionContract {
  contractTicker: string | null
  type: "call" | "put"
  expiration: string
  strike: number
  bid: number | null
  ask: number | null
  mid: number | null
  last: number | null
  volume: number | null
  openInterest: number | null
  impliedVolatility: number | null
  delta: number | null
  gamma: number | null
  theta: number | null
  vega: number | null
  rho: number | null
  greeksSource: GreeksSource
}

interface OptionsResponse {
  symbol: string
  source: string
  underlyingPrice: number | null
  rate: number
  expirations: string[]
  expiry: string | null
  asOf: string
  contracts: OptionContract[]
  message?: string
}

type Props = { symbol: string; spotPrice?: number | null }

type SubTab = "chain" | "smile" | "strategy"

// ─── formatting helpers ──────────────────────────────────────────────────────
const fmtNum = (v: number | null | undefined, dp = 2): string =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
const fmtInt = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("en-US")
const fmtPct = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`
const fmtMoney = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`

const SOURCE_LABEL: Record<string, string> = {
  massive: "Polygon",
  eodhd: "EODHD",
  finnhub: "Finnhub",
  financialdatasets: "Financial Datasets",
  none: "No provider",
}
const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s

export default function OptionsTab({ symbol, spotPrice }: Props) {
  const [data, setData] = useState<OptionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expiry, setExpiry] = useState<string>("")
  const [subTab, setSubTab] = useState<SubTab>("chain")

  // Initial load (nearest expiry).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/options?symbol=${encodeURIComponent(symbol)}`)
      .then(async r => {
        const body = await r.json().catch(() => null)
        if (!r.ok || !body || !Array.isArray((body as OptionsResponse).contracts)) {
          throw new Error((body as { error?: string } | null)?.error || `Options request failed (HTTP ${r.status})`)
        }
        return body as OptionsResponse
      })
      .then((res: OptionsResponse) => {
        if (cancelled) return
        setData(res)
        setExpiry(res.expiry ?? "")
      })
      .catch(e => { if (!cancelled) setError(String(e?.message || e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol])

  // Re-fetch when the user picks a different expiry.
  useEffect(() => {
    if (!expiry || !data || expiry === data.expiry) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/options?symbol=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(expiry)}`)
      .then(async r => {
        const body = await r.json().catch(() => null)
        if (!r.ok || !body || !Array.isArray((body as OptionsResponse).contracts)) {
          throw new Error((body as { error?: string } | null)?.error || `Options request failed (HTTP ${r.status})`)
        }
        return body as OptionsResponse
      })
      .then((res: OptionsResponse) => { if (!cancelled) setData(res) })
      .catch(e => { if (!cancelled) setError(String(e?.message || e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [expiry, symbol, data])

  const spot = data?.underlyingPrice ?? spotPrice ?? null

  if (loading && !data) {
    return (
      <Card>
        <Skeleton height={22} width={220} style={{ marginBottom: 16 }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} height={28} style={{ marginBottom: 8 }} />
        ))}
      </Card>
    )
  }

  if (error) {
    return <Card><EmptyState title="Couldn’t load options" hint={error} /></Card>
  }

  if (!data || data.source === "none" || !data.contracts?.length) {
    return (
      <Card>
        <EmptyState
          icon="⛓"
          title="No options chain available"
          hint={
            data?.message ||
            "None of the configured market-data providers returned an options chain for this symbol. Connect a provider with options coverage (e.g. Polygon) to populate this view."
          }
        />
      </Card>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header strip */}
      <Card padding={14}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Underlying</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{spot != null ? `$${fmtNum(spot)}` : "—"}</span>
          </div>
          <div style={{ height: 32, width: 1, background: "var(--border)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <FieldLabel>Expiry</FieldLabel>
            <Select fieldSize="sm" value={expiry} onChange={e => setExpiry(e.target.value)}>
              {data.expirations.map(x => (
                <option key={x} value={x}>{x}</option>
              ))}
            </Select>
          </div>
          <div style={{ flex: 1 }} />
          <Badge tone="blue">source: {sourceLabel(data.source)}</Badge>
        </div>
        {/* Sub-tab switcher */}
        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
          {([["chain", "Chain"], ["smile", "IV Smile"], ["strategy", "Strategy Builder"]] as [SubTab, string][]).map(([key, label]) => (
            <Button
              key={key}
              variant={subTab === key ? "primary" : "ghost"}
              size="sm"
              onClick={() => setSubTab(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </Card>

      {loading && <Card padding={12}><Skeleton height={20} width={180} /></Card>}

      {subTab === "chain" && <ChainView contracts={data.contracts} spot={spot} />}
      {subTab === "smile" && <SmileView contracts={data.contracts} spot={spot} expiry={expiry} />}
      {subTab === "strategy" && <StrategyView contracts={data.contracts} spot={spot} symbol={symbol} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain view — calls | strike | puts
// ─────────────────────────────────────────────────────────────────────────────
function ChainView({ contracts, spot }: { contracts: OptionContract[]; spot: number | null }) {
  const strikes = useMemo(() => {
    const set = new Set(contracts.map(c => c.strike))
    return Array.from(set).sort((a, b) => a - b)
  }, [contracts])

  const byKey = useMemo(() => {
    const m = new Map<string, OptionContract>()
    for (const c of contracts) m.set(`${c.type}:${c.strike}`, c)
    return m
  }, [contracts])

  // Nearest strike to spot for highlight.
  const atmStrike = useMemo(() => {
    if (spot == null) return null
    let best: number | null = null
    let bestD = Infinity
    for (const s of strikes) {
      const d = Math.abs(s - spot)
      if (d < bestD) { bestD = d; best = s }
    }
    return best
  }, [strikes, spot])

  const cell = (v: string, align: "left" | "right" = "right", muted = false) => (
    <td style={{ textAlign: align, padding: "5px 8px", color: muted ? "var(--text-muted)" : undefined, whiteSpace: "nowrap" }}>{v}</td>
  )

  return (
    <Card padding={0}>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th colSpan={6} style={{ textAlign: "center", padding: "8px", background: "rgba(56,189,248,0.08)", color: "#38bdf8", fontWeight: 700 }}>CALLS</th>
              <th style={{ textAlign: "center", padding: "8px", background: "var(--hover)" }}>Strike</th>
              <th colSpan={6} style={{ textAlign: "center", padding: "8px", background: "rgba(251,146,60,0.08)", color: "#fb923c", fontWeight: 700 }}>PUTS</th>
            </tr>
            <tr style={{ fontSize: 11, color: "var(--text-muted)" }}>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>IV</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Δ</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>OI</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Vol</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Bid</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Ask</th>
              <th style={{ textAlign: "center", padding: "4px 8px" }}>—</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Bid</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Ask</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Vol</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>OI</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Δ</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>IV</th>
            </tr>
          </thead>
          <tbody>
            {strikes.map(strike => {
              const call = byKey.get(`call:${strike}`)
              const put = byKey.get(`put:${strike}`)
              const isAtm = strike === atmStrike
              const itmCall = spot != null && strike < spot
              const itmPut = spot != null && strike > spot
              return (
                <tr key={strike} style={{ borderTop: "1px solid var(--border)" }}>
                  {cell(fmtPct(call?.impliedVolatility), "right", true)}
                  {cell(fmtNum(call?.delta))}
                  {cell(fmtInt(call?.openInterest), "right", true)}
                  {cell(fmtInt(call?.volume), "right", true)}
                  <td style={{ textAlign: "right", padding: "5px 8px", background: itmCall ? "rgba(56,189,248,0.06)" : undefined }}>{fmtNum(call?.bid)}</td>
                  <td style={{ textAlign: "right", padding: "5px 8px", background: itmCall ? "rgba(56,189,248,0.06)" : undefined }}>{fmtNum(call?.ask)}</td>
                  <td style={{ textAlign: "center", padding: "5px 8px", fontWeight: 700, background: isAtm ? "var(--accent-bg, rgba(99,102,241,0.12))" : "var(--hover)" }}>
                    {fmtNum(strike, strike % 1 === 0 ? 0 : 1)}
                  </td>
                  <td style={{ textAlign: "right", padding: "5px 8px", background: itmPut ? "rgba(251,146,60,0.06)" : undefined }}>{fmtNum(put?.bid)}</td>
                  <td style={{ textAlign: "right", padding: "5px 8px", background: itmPut ? "rgba(251,146,60,0.06)" : undefined }}>{fmtNum(put?.ask)}</td>
                  {cell(fmtInt(put?.volume), "right", true)}
                  {cell(fmtInt(put?.openInterest), "right", true)}
                  {cell(fmtNum(put?.delta))}
                  {cell(fmtPct(put?.impliedVolatility), "right", true)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
        Highlighted strike ≈ at-the-money. Greeks shown verbatim from the provider where supplied, otherwise filled via Black–Scholes.
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// IV smile view (pure SVG)
// ─────────────────────────────────────────────────────────────────────────────
function SmileView({ contracts, spot, expiry }: { contracts: OptionContract[]; spot: number | null; expiry: string }) {
  const points = useMemo(() => {
    const calls = contracts
      .filter(c => c.type === "call" && c.impliedVolatility != null && c.impliedVolatility > 0)
      .map(c => ({ strike: c.strike, iv: c.impliedVolatility as number }))
      .sort((a, b) => a.strike - b.strike)
    const puts = contracts
      .filter(c => c.type === "put" && c.impliedVolatility != null && c.impliedVolatility > 0)
      .map(c => ({ strike: c.strike, iv: c.impliedVolatility as number }))
      .sort((a, b) => a.strike - b.strike)
    return { calls, puts }
  }, [contracts])

  const all = [...points.calls, ...points.puts]
  if (all.length < 2) {
    return <Card><EmptyState icon="∿" title="Not enough IV data" hint="The provider didn’t return enough implied-volatility points to draw a smile for this expiry." /></Card>
  }

  const W = 720, H = 320, padL = 52, padR = 16, padT = 20, padB = 40
  const strikes = all.map(p => p.strike)
  const ivs = all.map(p => p.iv)
  const minK = Math.min(...strikes), maxK = Math.max(...strikes)
  const minIv = Math.min(...ivs), maxIv = Math.max(...ivs)
  const ivPad = (maxIv - minIv) * 0.1 || 0.02
  const loIv = Math.max(0, minIv - ivPad), hiIv = maxIv + ivPad

  const x = (k: number) => padL + ((k - minK) / (maxK - minK || 1)) * (W - padL - padR)
  const y = (iv: number) => padT + (1 - (iv - loIv) / (hiIv - loIv || 1)) * (H - padT - padB)

  const path = (pts: { strike: number; iv: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.strike).toFixed(1)},${y(p.iv).toFixed(1)}`).join(" ")

  const yTicks = 5
  const xTicks = 6

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Implied volatility smile — {expiry}</h3>
        <div style={{ display: "flex", gap: 12, fontSize: 11.5 }}>
          <span style={{ color: "#38bdf8" }}>● Calls</span>
          <span style={{ color: "#fb923c" }}>● Puts</span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 480, display: "block" }}>
          {/* Y gridlines + labels */}
          {Array.from({ length: yTicks + 1 }).map((_, i) => {
            const iv = loIv + ((hiIv - loIv) * i) / yTicks
            const yy = y(iv)
            return (
              <g key={`y${i}`}>
                <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--border)" strokeWidth={1} />
                <text x={padL - 8} y={yy + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{(iv * 100).toFixed(0)}%</text>
              </g>
            )
          })}
          {/* X labels */}
          {Array.from({ length: xTicks + 1 }).map((_, i) => {
            const k = minK + ((maxK - minK) * i) / xTicks
            const xx = x(k)
            return (
              <text key={`x${i}`} x={xx} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{k.toFixed(0)}</text>
            )
          })}
          {/* Spot marker */}
          {spot != null && spot >= minK && spot <= maxK && (
            <line x1={x(spot)} y1={padT} x2={x(spot)} y2={H - padB} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 3" />
          )}
          {/* Curves */}
          <path d={path(points.calls)} fill="none" stroke="#38bdf8" strokeWidth={2} />
          <path d={path(points.puts)} fill="none" stroke="#fb923c" strokeWidth={2} />
          {points.calls.map((p, i) => <circle key={`c${i}`} cx={x(p.strike)} cy={y(p.iv)} r={2.5} fill="#38bdf8" />)}
          {points.puts.map((p, i) => <circle key={`p${i}`} cx={x(p.strike)} cy={y(p.iv)} r={2.5} fill="#fb923c" />)}
          <text x={padL} y={H - 6} fontSize={11} fill="var(--text-muted)">Strike</text>
        </svg>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy builder
// ─────────────────────────────────────────────────────────────────────────────
type PresetKey = "covered_call" | "vertical_spread" | "straddle"

function nearestContract(contracts: OptionContract[], type: "call" | "put", target: number): OptionContract | null {
  let best: OptionContract | null = null
  let bestD = Infinity
  for (const c of contracts) {
    if (c.type !== type) continue
    const d = Math.abs(c.strike - target)
    if (d < bestD) { bestD = d; best = c }
  }
  return best
}

const contractPrice = (c: OptionContract | null): number => {
  if (!c) return 0
  return c.mid ?? c.last ?? (c.bid != null && c.ask != null ? (c.bid + c.ask) / 2 : 0) ?? 0
}

function buildLegs(preset: PresetKey, contracts: OptionContract[], spot: number): { legs: StrategyLeg[]; desc: string } | null {
  if (preset === "covered_call") {
    const call = nearestContract(contracts, "call", spot * 1.05)
    if (!call) return null
    return {
      legs: [
        { kind: "stock", side: "long", premium: spot, quantity: 100 },
        { kind: "call", side: "short", strike: call.strike, premium: contractPrice(call), quantity: 1 },
      ],
      desc: `Long 100 shares @ $${fmtNum(spot)}, short ${fmtNum(call.strike, 0)} call @ $${fmtNum(contractPrice(call))}`,
    }
  }
  if (preset === "vertical_spread") {
    const lower = nearestContract(contracts, "call", spot)
    const upper = nearestContract(contracts, "call", spot * 1.1)
    if (!lower || !upper || lower.strike === upper.strike) return null
    return {
      legs: [
        { kind: "call", side: "long", strike: lower.strike, premium: contractPrice(lower), quantity: 1 },
        { kind: "call", side: "short", strike: upper.strike, premium: contractPrice(upper), quantity: 1 },
      ],
      desc: `Long ${fmtNum(lower.strike, 0)} call @ $${fmtNum(contractPrice(lower))}, short ${fmtNum(upper.strike, 0)} call @ $${fmtNum(contractPrice(upper))}`,
    }
  }
  // straddle
  const call = nearestContract(contracts, "call", spot)
  const put = nearestContract(contracts, "put", spot)
  if (!call || !put) return null
  return {
    legs: [
      { kind: "call", side: "long", strike: call.strike, premium: contractPrice(call), quantity: 1 },
      { kind: "put", side: "long", strike: put.strike, premium: contractPrice(put), quantity: 1 },
    ],
    desc: `Long ${fmtNum(call.strike, 0)} call @ $${fmtNum(contractPrice(call))}, long ${fmtNum(put.strike, 0)} put @ $${fmtNum(contractPrice(put))}`,
  }
}

function StrategyView({ contracts, spot, symbol }: { contracts: OptionContract[]; spot: number | null; symbol: string }) {
  const [preset, setPreset] = useState<PresetKey>("covered_call")

  const built = useMemo(() => (spot == null ? null : buildLegs(preset, contracts, spot)), [preset, contracts, spot])
  const metrics = useMemo(() => (built && spot != null ? strategyMetrics(built.legs, { spot, samples: 161 }) : null), [built, spot])

  if (spot == null) {
    return <Card><EmptyState title="No underlying price" hint="A spot price is required to build strategies; none was returned for this symbol." /></Card>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card padding={14}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <FieldLabel>Strategy</FieldLabel>
            <Select fieldSize="sm" value={preset} onChange={e => setPreset(e.target.value as PresetKey)}>
              <option value="covered_call">Covered call</option>
              <option value="vertical_spread">Vertical spread (bull call)</option>
              <option value="straddle">Long straddle</option>
            </Select>
          </div>
          {built && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{built.desc}</span>}
        </div>
      </Card>

      {!built || !metrics ? (
        <Card><EmptyState title="Can’t build this strategy" hint={`The chain for ${symbol} doesn’t have the strikes needed for a ${preset.replace("_", " ")}.`} /></Card>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Metric label="Net cost / credit" value={fmtMoney(metrics.netCashflow)} tone={metrics.netCashflow >= 0 ? "green" : "gray"} />
            <Metric label="Max profit" value={metrics.maxProfit == null ? "Unlimited" : fmtMoney(metrics.maxProfit)} tone="green" />
            <Metric label="Max loss" value={metrics.maxLoss == null ? "Unlimited" : fmtMoney(metrics.maxLoss)} tone="red" />
            <Metric label="Breakeven(s)" value={metrics.breakevens.length ? metrics.breakevens.map(b => `$${fmtNum(b)}`).join(", ") : "—"} />
          </div>
          <PayoffChart metrics={metrics} spot={spot} />
        </>
      )}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" | "gray" }) {
  const color = tone === "green" ? "#22c55e" : tone === "red" ? "#ef4444" : undefined
  return (
    <Card padding={12}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </Card>
  )
}

function PayoffChart({ metrics, spot }: { metrics: ReturnType<typeof strategyMetrics>; spot: number }) {
  const { curve, breakevens } = metrics
  const W = 720, H = 300, padL = 56, padR = 16, padT = 16, padB = 36
  const prices = curve.map(p => p.price)
  const pnls = curve.map(p => p.pnl)
  const minX = Math.min(...prices), maxX = Math.max(...prices)
  const minY = Math.min(...pnls, 0), maxY = Math.max(...pnls, 0)
  const padY = (maxY - minY) * 0.08 || 1
  const loY = minY - padY, hiY = maxY + padY

  const x = (p: number) => padL + ((p - minX) / (maxX - minX || 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - loY) / (hiY - loY || 1)) * (H - padT - padB)

  const zeroY = y(0)
  // Split curve into profit (green) and loss (red) fills around zero.
  const linePath = curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.price).toFixed(1)},${y(p.pnl).toFixed(1)}`).join(" ")

  const yTicks = 5
  const xTicks = 6

  return (
    <Card>
      <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Payoff at expiry</h3>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 480, display: "block" }}>
          {/* Y grid + labels */}
          {Array.from({ length: yTicks + 1 }).map((_, i) => {
            const v = loY + ((hiY - loY) * i) / yTicks
            const yy = y(v)
            return (
              <g key={`y${i}`}>
                <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--border)" strokeWidth={1} />
                <text x={padL - 8} y={yy + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{fmtMoney(v)}</text>
              </g>
            )
          })}
          {/* X labels */}
          {Array.from({ length: xTicks + 1 }).map((_, i) => {
            const p = minX + ((maxX - minX) * i) / xTicks
            return <text key={`x${i}`} x={x(p)} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{p.toFixed(0)}</text>
          })}
          {/* Zero P/L line */}
          <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--text-muted)" strokeWidth={1.25} />
          {/* Spot marker */}
          {spot >= minX && spot <= maxX && (
            <>
              <line x1={x(spot)} y1={padT} x2={x(spot)} y2={H - padB} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={x(spot)} y={padT + 10} textAnchor="middle" fontSize={10} fill="#22c55e">spot</text>
            </>
          )}
          {/* Breakeven markers */}
          {breakevens.map((b, i) => b >= minX && b <= maxX && (
            <line key={`be${i}`} x1={x(b)} y1={padT} x2={x(b)} y2={H - padB} stroke="#a78bfa" strokeWidth={1} strokeDasharray="2 3" />
          ))}
          {/* Payoff line */}
          <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2.25} />
          <text x={padL} y={H - 4} fontSize={11} fill="var(--text-muted)">Underlying price at expiry</text>
        </svg>
      </div>
    </Card>
  )
}
