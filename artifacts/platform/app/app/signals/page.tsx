'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
  BarChart, Bar, Cell,
} from 'recharts'
import {
  Card, Button, Drawer, EmptyState, Skeleton, Select, Input, FieldLabel, ContextualAskBar,
} from '@/components/ui'
import {
  FACTORS, BACKTEST_UNIVERSES, REBALANCE_FREQS,
  type FactorKey, type RebalanceFreq, type BacktestResult, type BacktestEmpty,
} from '@/lib/backtest'

const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

export default function SignalsPage() {
  const [methodologyOpen, setMethodologyOpen] = useState(false)

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Signals & Returns</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Back-test price-derived factors across curated universes — decile spreads, equity curves and risk stats over real history.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => setMethodologyOpen(true)}>
            How factor back-tests work
          </Button>
        </div>
      </div>

      <ContextualAskBar
        context="Signals & Returns"
        contextData={{ page: 'signals' }}
        chips={[
          { label: 'Top decile this run',    prompt: 'Which names land in the top quantile of my chosen factor in the latest rebalance, and what is driving each rank?' },
          { label: 'Backtest a hypothesis',  prompt: 'Sketch a factor back-test for buying the top quantile and shorting the bottom quantile — what window and rebalance cadence?' },
          { label: 'Factor decay',           prompt: 'How quickly does momentum decay after entry? Give me the realistic holding-period sweet-spot.' },
          { label: 'Combine two factors',    prompt: 'Suggest a sensible composite of two price factors and explain why the combination should outperform either alone.' },
        ]}
        placeholder="Ask Finsyt about factors and back-tests…"
        style={{ margin: '0 0 16px' }}
      />

      <FactorLabView />

      <Drawer open={methodologyOpen} onClose={() => setMethodologyOpen(false)} title="How factor back-tests work" width={500}>
        <MethodologyContent />
      </Drawer>
    </div>
  )
}

interface SavedStrategy {
  id: string; name: string; description: string;
  config: { factor: FactorKey; quantiles: number; rebalance: RebalanceFreq; years: number; benchmark: string; universeKey?: string; symbols?: string[] };
  authorUserId: string; createdAt: number; updatedAt: number;
}

const QUANTILE_OPTIONS = [3, 4, 5, 10]
const YEAR_OPTIONS = [1, 2, 3, 5, 10]

function FactorLabView() {
  const [factor, setFactor]       = useState<FactorKey>('mom_12_1')
  const [universeKey, setUniverseKey] = useState<string>(BACKTEST_UNIVERSES[0].key)
  const [customMode, setCustomMode]   = useState(false)
  const [customTickers, setCustomTickers] = useState('')
  const [quantiles, setQuantiles] = useState(5)
  const [rebalance, setRebalance] = useState<RebalanceFreq>('quarterly')
  const [years, setYears]         = useState(3)
  const [benchmark, setBenchmark] = useState('SPY')

  const [result, setResult]   = useState<BacktestResult | null>(null)
  const [empty, setEmpty]     = useState<BacktestEmpty | { reason: string; message?: string } | null>(null)
  const [running, setRunning] = useState(false)

  const [saved, setSaved]       = useState<SavedStrategy[]>([])
  const [savedLoading, setSavedLoading] = useState(true)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving]     = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)

  const factorDef = FACTORS.find(f => f.key === factor)!

  const parsedTickers = useMemo(
    () => Array.from(new Set(customTickers.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean))),
    [customTickers],
  )

  const loadSaved = () => {
    setSavedLoading(true)
    fetch('/api/signals/factors')
      .then(r => r.ok ? r.json() : { strategies: [] })
      .then(d => setSaved(d.strategies ?? []))
      .catch(() => setSaved([]))
      .finally(() => setSavedLoading(false))
  }
  useEffect(loadSaved, [])

  function buildConfig() {
    return {
      factor, quantiles, rebalance, years, benchmark: benchmark.trim().toUpperCase() || 'SPY',
      ...(customMode ? { symbols: parsedTickers } : { universeKey }),
    }
  }

  async function run() {
    if (customMode && parsedTickers.length < 2) {
      setResult(null); setEmpty({ reason: 'no_universe', message: 'Enter at least two tickers (comma or space separated).' }); return
    }
    setRunning(true); setEmpty(null)
    try {
      const r = await fetch('/api/signals/backtest', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildConfig()),
      })
      const d = await r.json()
      if (d?.ok) { setResult(d as BacktestResult); setEmpty(null) }
      else { setResult(null); setEmpty(d ?? { reason: 'fetch_failed', message: 'Back-test failed.' }) }
    } catch {
      setResult(null); setEmpty({ reason: 'fetch_failed', message: 'Could not reach the back-test service.' })
    } finally {
      setRunning(false)
    }
  }

  async function saveStrategy() {
    const name = saveName.trim()
    if (!name) return
    setSaving(true); setLibraryError(null)
    try {
      const r = await fetch('/api/signals/factors', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, config: buildConfig() }),
      })
      if (r.ok) { setSaveName(''); loadSaved() }
      else { const d = await r.json().catch(() => ({})); setLibraryError(d?.error || 'Could not save strategy.') }
    } catch {
      setLibraryError('Could not save strategy.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteStrategy(id: string) {
    setSaved(s => s.filter(x => x.id !== id))
    await fetch(`/api/signals/factors/${id}`, { method: 'DELETE' }).catch(() => {})
    loadSaved()
  }

  function applyStrategy(s: SavedStrategy) {
    const c = s.config
    setFactor(c.factor); setQuantiles(c.quantiles); setRebalance(c.rebalance)
    setYears(c.years); setBenchmark(c.benchmark)
    if (c.symbols && c.symbols.length) { setCustomMode(true); setCustomTickers(c.symbols.join(', ')) }
    else if (c.universeKey) { setCustomMode(false); setUniverseKey(c.universeKey) }
  }

  function exportCsv() {
    if (!result) return
    const lines: string[] = []
    lines.push('Equity curve')
    lines.push('date,top_quantile,bottom_quantile,long_short,benchmark')
    for (const p of result.series) lines.push([p.date, p.topQ.toFixed(6), p.bottomQ.toFixed(6), p.longShort.toFixed(6), p.benchmark.toFixed(6)].join(','))
    lines.push('')
    lines.push('Quantile average returns')
    lines.push('quantile,label,avg_period_return,cagr')
    for (const q of result.quantileBuckets) lines.push([q.quantile, q.label, q.avgReturn.toFixed(6), q.cagr.toFixed(6)].join(','))
    lines.push('')
    lines.push('Summary statistics')
    lines.push('portfolio,cagr,vol,sharpe,sortino,max_drawdown,calmar,hit_rate,total_return')
    for (const [k, s] of [['Long (top quantile)', result.summary.long], ['Long-short', result.summary.longShort], ['Benchmark', result.summary.benchmark]] as const) {
      lines.push([k, s.cagr.toFixed(6), s.vol.toFixed(6), s.sharpe.toFixed(4), s.sortino.toFixed(4), s.maxDrawdown.toFixed(6), s.calmar.toFixed(4), s.hitRate.toFixed(4), s.totalReturn.toFixed(6)].join(','))
    }
    lines.push('')
    lines.push(`Factor ranking (latest rebalance ${result.rankingDate})`)
    lines.push('rank,symbol,score,quantile')
    for (const r of result.ranking) lines.push([r.rank, r.symbol, r.score.toFixed(6), r.quantile].join(','))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `factor-lab-${factor}-${result.from}-to-${result.to}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  const equityData = useMemo(
    () => result?.series.map(p => ({
      date: p.date,
      top: (p.topQ - 1) * 100,
      bottom: (p.bottomQ - 1) * 100,
      longShort: (p.longShort - 1) * 100,
      benchmark: (p.benchmark - 1) * 100,
    })) ?? [],
    [result],
  )

  return (
    <>
      <Card padding={14} style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, alignItems: 'end' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <FieldLabel>Factor</FieldLabel>
            <Select fieldSize="sm" value={factor} onChange={e => setFactor(e.target.value as FactorKey)}>
              {FACTORS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </Select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <FieldLabel>Universe</FieldLabel>
            <Select fieldSize="sm" value={customMode ? '__custom' : universeKey} onChange={e => {
              if (e.target.value === '__custom') setCustomMode(true)
              else { setCustomMode(false); setUniverseKey(e.target.value) }
            }}>
              {BACKTEST_UNIVERSES.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
              <option value="__custom">Custom tickers…</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Quantiles</FieldLabel>
            <Select fieldSize="sm" value={String(quantiles)} onChange={e => setQuantiles(Number(e.target.value))}>
              {QUANTILE_OPTIONS.map(q => <option key={q} value={q}>{q === 10 ? 'Deciles (10)' : q === 5 ? 'Quintiles (5)' : q === 4 ? 'Quartiles (4)' : 'Terciles (3)'}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Rebalance</FieldLabel>
            <Select fieldSize="sm" value={rebalance} onChange={e => setRebalance(e.target.value as RebalanceFreq)}>
              {REBALANCE_FREQS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Lookback</FieldLabel>
            <Select fieldSize="sm" value={String(years)} onChange={e => setYears(Number(e.target.value))}>
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Benchmark</FieldLabel>
            <Input fieldSize="sm" value={benchmark} onChange={e => setBenchmark(e.target.value)} placeholder="SPY" />
          </div>
          {customMode && (
            <div style={{ gridColumn: 'span 4' }}>
              <FieldLabel>Custom tickers ({parsedTickers.length})</FieldLabel>
              <Input fieldSize="sm" value={customTickers} onChange={e => setCustomTickers(e.target.value)} placeholder="AAPL, MSFT, NVDA, GOOGL, AMZN…" />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'end', gridColumn: customMode ? 'span 2' : 'span 6', justifyContent: 'flex-end' }}>
            {result && <Button variant="ghost" size="sm" onClick={exportCsv}>Export CSV</Button>}
            <Button variant="primary" size="sm" onClick={run} disabled={running}>{running ? 'Running…' : 'Run back-test'}</Button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>{factorDef.help}</div>
      </Card>

      <Card padding={14} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: savedLoading || saved.length ? 10 : 0, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Saved factor library</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input fieldSize="sm" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Name this strategy…" style={{ width: 200 }} />
            <Button variant="secondary" size="sm" onClick={saveStrategy} disabled={saving || !saveName.trim()}>{saving ? 'Saving…' : 'Save current'}</Button>
          </div>
        </div>
        {libraryError && <div style={{ fontSize: 12, color: 'var(--neg)', marginBottom: 8 }}>{libraryError}</div>}
        {savedLoading ? (
          <Skeleton width="100%" height={36} />
        ) : saved.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No saved strategies yet. Configure a back-test above and click “Save current” to add it to your workspace library.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {saved.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-subtle)' }}>
                <button onClick={() => applyStrategy(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-text)' }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {FACTORS.find(f => f.key === s.config.factor)?.short ?? s.config.factor} · {s.config.symbols?.length ? `${s.config.symbols.length} tickers` : (BACKTEST_UNIVERSES.find(u => u.key === s.config.universeKey)?.label ?? s.config.universeKey)} · {s.config.years}y
                  </div>
                </button>
                <button onClick={() => deleteStrategy(s.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1, padding: 2 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {running ? (
        <Card padding={20}><Skeleton width="100%" height={320} /></Card>
      ) : !result ? (
        <Card padding={0}>
          <EmptyState
            icon="∅"
            title={empty ? (empty.reason === 'insufficient_data' ? 'Not enough price history' : empty.reason === 'no_universe' ? 'Pick a universe' : 'No back-test yet') : 'Run a factor back-test'}
            hint={empty?.message || 'Choose a factor and universe above, then click “Run back-test” to compute decile spreads, an equity curve and risk stats over real price history.'}
          />
        </Card>
      ) : (
        <>
          <Card padding={18} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Factor back-test</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Inter Tight', 'Inter', sans-serif" }}>
                  {result.factorLabel} · {result.benchmarkLabel} · {result.windows} windows
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {result.from} → {result.to} · {result.universeSize} names{result.droppedSymbols.length ? ` · ${result.droppedSymbols.length} dropped (no history)` : ''}
                </div>
              </div>
              <StatCard label="CAGR (long)" value={fmtPct(result.summary.long.cagr * 100)} tone={result.summary.long.cagr >= 0 ? 'pos' : 'neg'} />
              <StatCard label="Sharpe (long)" value={result.summary.long.sharpe.toFixed(2)} />
              <StatCard label="Max drawdown" value={fmtPct(result.summary.long.maxDrawdown * 100)} tone="neg" />
              <StatCard label="Long-short CAGR" value={fmtPct(result.summary.longShort.cagr * 100)} tone={result.summary.longShort.cagr >= 0 ? 'pos' : 'neg'} highlight />
            </div>
          </Card>

          <Card padding={18} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>Equity curve — cumulative return (%)</div>
            <div style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} minTickGap={40} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                    formatter={(v: number, n: string) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, n === 'top' ? 'Top quantile' : n === 'bottom' ? 'Bottom quantile' : n === 'longShort' ? 'Long-short' : 'Benchmark']}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} formatter={(v: string) => v === 'top' ? 'Top quantile' : v === 'bottom' ? 'Bottom quantile' : v === 'longShort' ? 'Long-short' : 'Benchmark'} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Line type="monotone" dataKey="top" stroke="var(--pos)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="bottom" stroke="var(--neg)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="longShort" stroke="var(--accent-text)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="benchmark" stroke="var(--text-secondary)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card padding={18} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>Average return by quantile (annualised %)</div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.quantileBuckets.map(q => ({ label: q.label, cagr: q.cagr * 100 }))} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, 'CAGR']} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Bar dataKey="cagr" radius={[4, 4, 0, 0]}>
                    {result.quantileBuckets.map((q, i) => <Cell key={i} fill={q.cagr >= 0 ? 'var(--pos)' : 'var(--neg)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card padding={0} style={{ overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Risk & return summary</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Portfolio</th>
                  <th className="right">CAGR</th>
                  <th className="right">Vol</th>
                  <th className="right">Sharpe</th>
                  <th className="right">Sortino</th>
                  <th className="right">Max DD</th>
                  <th className="right">Calmar</th>
                  <th className="right">Hit rate</th>
                  <th className="right">Total</th>
                </tr>
              </thead>
              <tbody>
                {([['Long (top quantile)', result.summary.long], ['Long-short', result.summary.longShort], ['Benchmark', result.summary.benchmark]] as const).map(([label, s]) => (
                  <tr key={label}>
                    <td><b>{label}</b></td>
                    <td className="right"><span className={s.cagr >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(s.cagr * 100)}</span></td>
                    <td className="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{(s.vol * 100).toFixed(1)}%</td>
                    <td className="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.sharpe.toFixed(2)}</td>
                    <td className="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.sortino.toFixed(2)}</td>
                    <td className="right"><span className="neg" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtPct(s.maxDrawdown * 100)}</span></td>
                    <td className="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.calmar.toFixed(2)}</td>
                    <td className="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{(s.hitRate * 100).toFixed(0)}%</td>
                    <td className="right"><span className={s.totalReturn >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(s.totalReturn * 100)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card padding={0} style={{ overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Factor ranking — latest rebalance</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Ranked by {result.factorLabel} as of {result.rankingDate} · {result.ranking.length} names</span>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>#</th>
                    <th>Symbol</th>
                    <th className="right">Score</th>
                    <th className="right">Quantile</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ranking.map(r => (
                    <tr key={r.symbol}>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', fontWeight: 600 }}>{r.rank}</td>
                      <td>
                        <Link href={`/app/company/${r.symbol}`} style={{ fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>{r.symbol}</Link>
                      </td>
                      <td className="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.score.toFixed(4)}</td>
                      <td className="right">
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                          background: r.quantile === 1 ? 'var(--pos-dim)' : r.quantile === quantiles ? 'var(--neg-dim)' : 'var(--bg-subtle)',
                          color: r.quantile === 1 ? 'var(--pos)' : r.quantile === quantiles ? 'var(--neg)' : 'var(--text-secondary)',
                          fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 12,
                        }}>Q{r.quantile}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', padding: '0 4px' }}>
            <b style={{ color: 'var(--text-primary)' }}>Methodology.</b> On every rebalance date the universe is ranked by <i>{result.factorLabel}</i> and split into {quantiles} equal-weight quantile portfolios, each held until the next rebalance. The top quantile is the long book; long-short buys the top and sells the bottom. Stats are annualised from {REBALANCE_FREQS.find(f => f.key === rebalance)?.label.toLowerCase()} returns, gross of fees. Universes are fixed-membership snapshots (survivorship bias applies) and factors are price-derived only. Past performance does not predict future results.
          </div>
        </>
      )}
    </>
  )
}

function StatCard({ label, value, tone, highlight }: { label: string; value: string; tone?: 'pos' | 'neg'; highlight?: boolean }) {
  const color = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--text-primary)'
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: highlight ? 22 : 18, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', fontFamily: "'Inter Tight', 'Inter', sans-serif" }}>{value}</div>
    </div>
  )
}

function MethodologyContent() {
  return (
    <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
      <p style={{ marginTop: 0 }}>
        The Factor Lab back-tests <b>price-derived factors</b> the way a quant desk would: it ranks a
        universe on each rebalance date, splits it into equal-weight quantile portfolios, holds each
        until the next rebalance, and reports decile spreads, an equity curve and the standard risk
        statistics over real historical prices.
      </p>
      <h4 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginTop: 18, marginBottom: 8 }}>Factors</h4>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        {FACTORS.map(f => (
          <li key={f.key} style={{ marginBottom: 8 }}>
            <b style={{ color: 'var(--accent-text)' }}>{f.label}.</b> {f.help}
          </li>
        ))}
      </ul>
      <h4 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginTop: 18, marginBottom: 8 }}>How decile back-tests work</h4>
      <p style={{ margin: 0 }}>
        On every rebalance date the chosen universe is sorted by the chosen factor. The top quantile
        forms the long book and the bottom quantile the short book; both are equal-weighted and held
        until the next rebalance. The chart and tables show cumulative and average returns versus the
        benchmark. A persistently positive top-minus-bottom spread indicates the factor carries
        information about future returns within that universe.
      </p>
      <h4 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginTop: 18, marginBottom: 8 }}>Coverage & limitations</h4>
      <p style={{ margin: 0 }}>
        Universes are fixed-membership snapshots, so survivorship bias applies. Only price-derived
        factors are offered because daily bars are the one input we can source honestly for every
        covered name; point-in-time fundamentals are intentionally out of scope rather than synthesised.
      </p>
      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
        Returns are gross of fees, slippage and borrow costs. This is research, not trade
        execution — the platform does not route orders.
      </p>
    </div>
  )
}
