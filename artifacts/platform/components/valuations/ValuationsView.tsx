'use client'
/**
 * ValuationsView — composes the FootballFieldChart with the inputs strip
 * (peer picker, WACC + terminal-growth inputs, band toggles), the
 * "How this is calculated" popover, and a loading skeleton.
 *
 * Mounted by both /app/valuations/[symbol] and the new Valuations tab on
 * the company page.
 */
import { useMemo, useState } from 'react'
import { Card } from '@/components/ui'
import { FootballFieldChart, type ValuationBand } from './FootballFieldChart'
import { useValuationBands, defaultPeersFor } from './useValuationBands'

interface ValuationsViewProps {
  symbol: string
  /**
   * Optional pre-fetched subject quote (the company page already has it,
   * so passing it in avoids a duplicate /api/quote request).
   */
  initialQuote?: any
  /** Initial peer list. Defaults to the same set PeerCompareModal seeds. */
  initialPeers?: string[]
  /** Optional CSS class on the outer wrapper. */
  className?: string
}

const PEER_ROW_LABELS = ['TEV/EBITDA', 'TEV/Revenue', 'Price/Earnings', 'TEV/EBIT']

export default function ValuationsView({ symbol, initialQuote, initialPeers, className }: ValuationsViewProps) {
  const SYM = symbol.toUpperCase()
  const [peers, setPeers] = useState<string[]>(() => initialPeers ?? defaultPeersFor(SYM))
  const [peerInput, setPeerInput] = useState('')
  const [waccPct, setWaccPct] = useState<number>(9.0)
  const [tgPct, setTgPct] = useState<number>(2.5)
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    '52w': true,
    'peer:TEV/EBITDA': true,
    'peer:TEV/Revenue': true,
    'peer:Price/Earnings': true,
    'peer:TEV/EBIT': true,
    'dcf': true,
  })
  const [howOpen, setHowOpen] = useState(false)

  const result = useValuationBands(SYM, {
    peers,
    wacc: waccPct / 100,
    terminalGrowth: tgPct / 100,
    initialQuote,
    enabled,
  })

  const { bands, currentPrice, weightedValuation, weightedFrom, loading, quote } = result

  // Empty state: subject quote could not be loaded after fetching settled.
  // We show a clear "no quote data" surface with a back-link to the picker
  // rather than render fabricated placeholder bars as the primary experience.
  const noQuote = !loading && !quote

  function addPeer() {
    const s = peerInput.trim().toUpperCase()
    if (!s || peers.includes(s) || s === SYM || peers.length >= 3) return
    setPeers([...peers, s])
    setPeerInput('')
  }
  function removePeer(p: string) { setPeers(peers.filter(x => x !== p)) }

  const toggleKeys: Array<{ key: string; label: string }> = useMemo(() => ([
    { key: '52w',                  label: '52W Stock Price' },
    ...PEER_ROW_LABELS.map(l => ({ key: `peer:${l}`, label: `Peer · ${l}` })),
    { key: 'dcf',                  label: 'DCF' },
  ]), [])

  return (
    <div className={className} style={{ display: 'grid', gap: 14 }}>
      {/* Inputs strip */}
      <Card padding="14px 16px">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
          {/* Peers */}
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Peers (max 3)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {peers.map(p => (
                <span key={p} style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--accent-dim)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {p}
                  <button onClick={() => removePeer(p)} aria-label={`Remove ${p}`}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                </span>
              ))}
              {peers.length < 3 && (
                <>
                  <input
                    value={peerInput}
                    onChange={e => setPeerInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPeer() } }}
                    placeholder="Add ticker"
                    aria-label="Add peer ticker"
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none', width: 100 }}
                  />
                  <button onClick={addPeer} disabled={!peerInput.trim()}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: peerInput.trim() ? 'pointer' : 'not-allowed', opacity: peerInput.trim() ? 1 : 0.5 }}>+</button>
                </>
              )}
            </div>
          </div>

          {/* WACC */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>WACC</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                step={0.25}
                min={1}
                max={25}
                value={waccPct}
                onChange={e => setWaccPct(Number(e.target.value) || 0)}
                style={{ width: 72, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }}>%</span>
            </div>
          </div>

          {/* Terminal growth */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Terminal Growth</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                step={0.25}
                min={0}
                max={6}
                value={tgPct}
                onChange={e => setTgPct(Number(e.target.value) || 0)}
                style={{ width: 72, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }}>%</span>
            </div>
          </div>

          {/* Band toggles */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Bands</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {toggleKeys.map(t => {
                const on = enabled[t.key] !== false
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setEnabled(prev => ({ ...prev, [t.key]: !on }))}
                    aria-pressed={on}
                    style={{
                      padding: '4px 10px', borderRadius: 999,
                      fontSize: 11, fontWeight: 700,
                      border: '1px solid',
                      borderColor: on ? 'var(--accent-dim)' : 'var(--border)',
                      background: on ? 'var(--accent-dim)' : 'transparent',
                      color: on ? 'var(--accent-text)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {on ? '●' : '○'} {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Chart */}
      {loading && !result.quote ? (
        <Card padding={16}>
          <div className="skeleton" style={{ width: '40%', height: 14, marginBottom: 16 }} />
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div className="skeleton" style={{ width: 140, height: 10 }} />
              <div className="skeleton" style={{ flex: 1, height: 10 }} />
            </div>
          ))}
        </Card>
      ) : noQuote ? (
        <Card padding="32px 24px">
          <div style={{ display: 'grid', gap: 10, justifyItems: 'start', maxWidth: 520 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              No quote data for {SYM}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              We could not load a real quote for this ticker.
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>
              The Football Field chart only renders bands that are anchored to real market data —
              we will not fabricate a chart from placeholder values. Double-check the symbol or pick
              another ticker from the picker.
            </div>
            <a
              href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/app/valuations`}
              style={{
                marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8,
                background: 'var(--accent)', color: 'var(--accent-text-on)', fontWeight: 700,
                fontSize: 13, textDecoration: 'none',
              }}
            >
              ← Back to ticker picker
            </a>
          </div>
        </Card>
      ) : (
        <FootballFieldChart
          bands={bands}
          currentPrice={currentPrice}
          weightedValuation={weightedValuation}
          height={520}
          minWidth={760}
          title={`Valuation Overview · ${SYM}`}
          titleRight={
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setHowOpen(o => !o)}
                aria-expanded={howOpen}
                aria-label="How weighted valuation is calculated"
                style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 10px',
                  borderRadius: 999, background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)', color: 'var(--text-secondary)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ⓘ How this is calculated
              </button>
              {howOpen && (
                <>
                  <div onClick={() => setHowOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                  <div role="dialog" aria-label="Weighted valuation calculation"
                    style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                      width: 320, padding: '12px 14px', borderRadius: 10,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-strong)',
                      boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
                      color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.55,
                      zIndex: 40,
                    }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>How Weighted Valuation is calculated</div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      Equal-weighted average of the median ticks of every band that has real data.
                      Transaction Comps placeholders and rows missing data are excluded so the result
                      can never be confused with a proprietary model.
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contributing rows</div>
                    {weightedFrom.length === 0 ? (
                      <div style={{ marginTop: 4, color: 'var(--text-muted)', fontStyle: 'italic' }}>None yet — waiting on data.</div>
                    ) : (
                      <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px', color: 'var(--text-secondary)' }}>
                        {weightedFrom.map(r => <li key={r}>{r}</li>)}
                      </ul>
                    )}
                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Methodology caveats</div>
                    <ul style={{ margin: '4px 0 0', padding: '0 0 0 16px', color: 'var(--text-secondary)', fontSize: 11.5, lineHeight: 1.5 }}>
                      <li><b>TEV/Revenue</b> uses Price/Sales as a proxy because the upstream provider does not expose a clean TEV/Revenue field. Materially levered peers may distort the band.</li>
                      <li><b>TEV/EBIT</b> is not exposed by the data provider and renders as a placeholder row.</li>
                      <li><b>Transaction Comps</b> are placeholders pending an M&A deals data source.</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          }
        />
      )}
    </div>
  )
}

export type { ValuationBand }
