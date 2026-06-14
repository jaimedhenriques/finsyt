'use client'
/**
 * TechnicalsView — the interactive Technicals surface mounted on the company
 * page's `Technicals` tab. Owns the controls (range + chart-type selectors,
 * overlay/oscillator toggles with editable parameters), fetches bars via
 * `useTechnicals`, computes indicators client-side with the shared engine, and
 * renders `TechnicalsChart` plus a latest-signal strip. Honest loading / empty
 * / error states — no fabricated series.
 */
import { useMemo, useState } from 'react'
import { Card } from '@/components/ui'
import { TechnicalsChart } from './TechnicalsChart'
import { useTechnicals, sourceLabel, type TechnicalsRange } from './useTechnicals'
import {
  computeIndicators,
  latestSignals,
  type IndicatorRequest,
  type IndicatorType,
  type OverlayType,
  type OscillatorType,
} from '@/lib/technical-indicators'

interface TechnicalsViewProps {
  symbol: string
  className?: string
}

const RANGES: TechnicalsRange[] = ['3M', '6M', '1Y', '2Y', '5Y', 'MAX']

type IndConfig = { type: IndicatorType; on: boolean; params: Record<string, number> }

const DEFAULT_OVERLAYS: IndConfig[] = [
  { type: 'sma', on: true, params: { period: 50 } },
  { type: 'ema', on: false, params: { period: 20 } },
  { type: 'wma', on: false, params: { period: 20 } },
  { type: 'bollinger', on: false, params: { period: 20, mult: 2 } },
  { type: 'vwap', on: false, params: {} },
  { type: 'donchian', on: false, params: { period: 20 } },
  { type: 'ichimoku', on: false, params: { conversion: 9, base: 26, spanB: 52, displacement: 26 } },
]

const DEFAULT_OSCILLATORS: IndConfig[] = [
  { type: 'rsi', on: true, params: { period: 14 } },
  { type: 'macd', on: true, params: { fast: 12, slow: 26, signal: 9 } },
  { type: 'stochastic', on: false, params: { kPeriod: 14, dPeriod: 3, smooth: 3 } },
  { type: 'adx', on: false, params: { period: 14 } },
  { type: 'obv', on: false, params: {} },
]

const IND_LABELS: Record<IndicatorType, string> = {
  sma: 'SMA', ema: 'EMA', wma: 'WMA', bollinger: 'Bollinger', vwap: 'VWAP',
  donchian: 'Donchian', ichimoku: 'Ichimoku',
  rsi: 'RSI', macd: 'MACD', stochastic: 'Stochastic', adx: 'ADX', obv: 'OBV',
}

// Which numeric params each indicator exposes for editing.
const PARAM_FIELDS: Partial<Record<IndicatorType, Array<{ key: string; label: string }>>> = {
  sma: [{ key: 'period', label: 'Period' }],
  ema: [{ key: 'period', label: 'Period' }],
  wma: [{ key: 'period', label: 'Period' }],
  bollinger: [{ key: 'period', label: 'Period' }, { key: 'mult', label: 'σ' }],
  donchian: [{ key: 'period', label: 'Period' }],
  ichimoku: [{ key: 'conversion', label: 'Conv' }, { key: 'base', label: 'Base' }, { key: 'spanB', label: 'SpanB' }],
  rsi: [{ key: 'period', label: 'Period' }],
  macd: [{ key: 'fast', label: 'Fast' }, { key: 'slow', label: 'Slow' }, { key: 'signal', label: 'Signal' }],
  stochastic: [{ key: 'kPeriod', label: '%K' }, { key: 'dPeriod', label: '%D' }, { key: 'smooth', label: 'Smooth' }],
  adx: [{ key: 'period', label: 'Period' }],
}

const SIGNAL_TONE: Record<string, string> = {
  bullish: 'var(--pos)', oversold: 'var(--pos)', trending: 'var(--accent-text)',
  bearish: 'var(--neg)', overbought: 'var(--neg)', ranging: 'var(--text-muted)',
  neutral: 'var(--text-secondary)',
}

export default function TechnicalsView({ symbol, className }: TechnicalsViewProps) {
  const SYM = symbol.toUpperCase()
  const [range, setRange] = useState<TechnicalsRange>('1Y')
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle')
  const [overlayCfg, setOverlayCfg] = useState<IndConfig[]>(DEFAULT_OVERLAYS)
  const [oscCfg, setOscCfg] = useState<IndConfig[]>(DEFAULT_OSCILLATORS)

  const { bars, source, loading, error } = useTechnicals(SYM, range)

  const overlayRequests: IndicatorRequest[] = useMemo(
    () => overlayCfg.filter(c => c.on).map(c => ({ type: c.type, params: c.params })),
    [overlayCfg],
  )
  const oscRequests: IndicatorRequest[] = useMemo(
    () => oscCfg.filter(c => c.on).map(c => ({ type: c.type, params: c.params })),
    [oscCfg],
  )

  const overlays = useMemo(() => (bars.length ? computeIndicators(bars, overlayRequests) : []), [bars, overlayRequests])
  const oscillators = useMemo(() => (bars.length ? computeIndicators(bars, oscRequests) : []), [bars, oscRequests])
  const signals = useMemo(() => (bars.length ? latestSignals(bars) : []), [bars])

  function toggle(kind: 'overlay' | 'osc', type: IndicatorType) {
    const setter = kind === 'overlay' ? setOverlayCfg : setOscCfg
    setter(prev => prev.map(c => (c.type === type ? { ...c, on: !c.on } : c)))
  }
  function setParam(kind: 'overlay' | 'osc', type: IndicatorType, key: string, value: number) {
    const setter = kind === 'overlay' ? setOverlayCfg : setOscCfg
    setter(prev => prev.map(c => (c.type === type ? { ...c, params: { ...c.params, [key]: value } } : c)))
  }

  return (
    <div className={className} style={{ display: 'grid', gap: 14 }}>
      {/* Controls */}
      <Card padding="14px 16px">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
          {/* Range */}
          <div>
            <div style={LABEL}>Range</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {RANGES.map(r => (
                <button key={r} onClick={() => setRange(r)} style={pill(range === r)}>{r}</button>
              ))}
            </div>
          </div>
          {/* Chart type */}
          <div>
            <div style={LABEL}>Chart</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setChartType('candle')} style={pill(chartType === 'candle')}>Candles</button>
              <button onClick={() => setChartType('line')} style={pill(chartType === 'line')}>Line</button>
            </div>
          </div>
        </div>

        {/* Overlays */}
        <div style={{ marginTop: 14 }}>
          <div style={LABEL}>Overlays</div>
          <IndicatorToggles cfg={overlayCfg} kind="overlay" onToggle={toggle} onParam={setParam} />
        </div>

        {/* Oscillators */}
        <div style={{ marginTop: 12 }}>
          <div style={LABEL}>Oscillators</div>
          <IndicatorToggles cfg={oscCfg} kind="osc" onToggle={toggle} onParam={setParam} />
        </div>
      </Card>

      {/* Chart / states */}
      {loading ? (
        <Card padding={16}>
          <div className="skeleton" style={{ width: '30%', height: 12, marginBottom: 14 }} />
          <div className="skeleton" style={{ width: '100%', height: 320 }} />
        </Card>
      ) : error || bars.length === 0 ? (
        <Card padding="32px 24px">
          <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              No price history for {SYM}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              We could not load real bars for this ticker.
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>
              {error || 'The provider waterfall returned no data.'} Technical indicators are only computed
              from real market data — we will not fabricate a chart from placeholder values.
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Source attribution + latest signals */}
          <Card padding="12px 16px">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{bars.length}</span> daily bars ·{' '}
                source: <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{sourceLabel(source)}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {signals.map(s => (
                  <span key={s.indicator} title={s.note}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: SIGNAL_TONE[s.signal] || 'var(--text-secondary)' }}>
                    {s.indicator}: {s.signal}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <TechnicalsChart bars={bars} overlays={overlays} oscillators={oscillators} chartType={chartType} />
        </>
      )}
    </div>
  )
}

// ── Toggle + param chip group ────────────────────────────────────────────────
function IndicatorToggles({ cfg, kind, onToggle, onParam }: {
  cfg: IndConfig[]
  kind: 'overlay' | 'osc'
  onToggle: (kind: 'overlay' | 'osc', type: IndicatorType) => void
  onParam: (kind: 'overlay' | 'osc', type: IndicatorType, key: string, value: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {cfg.map(c => {
        const fields = PARAM_FIELDS[c.type] || []
        return (
          <div key={c.type} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: c.on && fields.length ? '4px 8px 4px 4px' : 0, borderRadius: 999, border: c.on ? '1px solid var(--accent-dim)' : 'none', background: c.on && fields.length ? 'var(--accent-dim)' : 'transparent' }}>
            <button
              type="button"
              onClick={() => onToggle(kind, c.type)}
              aria-pressed={c.on}
              style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                borderColor: c.on ? 'transparent' : 'var(--border)',
                background: c.on ? (fields.length ? 'transparent' : 'var(--accent-dim)') : 'transparent',
                color: c.on ? 'var(--accent-text)' : 'var(--text-muted)',
              }}
            >
              {c.on ? '●' : '○'} {IND_LABELS[c.type]}
            </button>
            {c.on && fields.map(f => (
              <label key={f.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
                {f.label}
                <input
                  type="number"
                  value={c.params[f.key] ?? ''}
                  min={1}
                  onChange={e => onParam(kind, c.type, f.key, Number(e.target.value) || 0)}
                  style={{ width: 44, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'inherit', outline: 'none' }}
                />
              </label>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)',
  textTransform: 'uppercase', marginBottom: 6,
}

function pill(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: '1.5px solid', transition: 'all 0.12s',
    background: active ? 'var(--text-primary)' : 'var(--bg-card)',
    color: active ? 'var(--bg-base, #fff)' : 'var(--text-secondary)',
    borderColor: active ? 'var(--text-primary)' : 'var(--border)',
    fontFamily: 'inherit',
  }
}

export type { OverlayType, OscillatorType }
