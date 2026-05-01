'use client'
import { useEffect, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

const DEFAULT_PEERS: Record<string, string[]> = {
  AAPL:  ['MSFT', 'GOOGL', 'META'],
  MSFT:  ['AAPL', 'GOOGL', 'AMZN'],
  GOOGL: ['MSFT', 'META',  'AMZN'],
  NVDA:  ['AMD',  'AVGO',  'INTC'],
  META:  ['GOOGL','SNAP',  'PINS'],
  AMZN:  ['MSFT', 'GOOGL', 'WMT'],
  TSLA:  ['F',    'GM',    'RIVN'],
}

function n(v: any): number | null { const x = Number(v); return v == null || Number.isNaN(x) ? null : x }
const ROWS = [
  { key: 'marketCap',   label: 'Market Cap',    fmt: (v: any) => { const x = n(v); return x == null ? '—' : x >= 1e12 ? '$' + (x/1e12).toFixed(2) + 'T' : x >= 1e9 ? '$' + (x/1e9).toFixed(1) + 'B' : '$' + x.toLocaleString() } },
  { key: 'pe',          label: 'P/E',           fmt: (v: any) => { const x = n(v); return x ? x.toFixed(1) + 'x' : '—' } },
  { key: 'evEbitda',    label: 'EV / EBITDA',   fmt: (v: any) => { const x = n(v); return x ? x.toFixed(1) + 'x' : '—' } },
  { key: 'ps',          label: 'P/S',           fmt: (v: any) => { const x = n(v); return x ? x.toFixed(2) + 'x' : '—' } },
  { key: 'grossMargin', label: 'Gross Margin',  fmt: (v: any) => { const x = n(v); return x ? (x * (x < 1.5 ? 100 : 1)).toFixed(1) + '%' : '—' } },
  { key: 'netMargin',   label: 'Net Margin',    fmt: (v: any) => { const x = n(v); return x ? (x * (x < 1.5 ? 100 : 1)).toFixed(1) + '%' : '—' } },
  { key: 'roe',         label: 'ROE',           fmt: (v: any) => { const x = n(v); return x ? (x * (x < 1.5 ? 100 : 1)).toFixed(1) + '%' : '—' } },
  { key: 'debtEquity',  label: 'Debt / Equity', fmt: (v: any) => { const x = n(v); return x == null ? '—' : x.toFixed(2) } },
  { key: 'dividendYield', label: 'Div Yield',   fmt: (v: any) => { const x = n(v); return x ? x.toFixed(2) + '%' : '—' } },
]

export default function PeerCompareModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const initial = DEFAULT_PEERS[symbol] || ['SPY', 'QQQ', 'DIA']
  const [peers, setPeers] = useState<string[]>(initial)
  const [input, setInput] = useState('')
  const [data, setData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    const all = [symbol, ...peers]
    Promise.all(all.map(s =>
      fetch(`${BASE}/api/quote?symbol=${s}`).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    )).then(arr => {
      const map: Record<string, any> = {}
      arr.forEach((q, i) => { map[all[i]] = q })
      setData(map)
    }).finally(() => setLoading(false))
  }, [symbol, peers.join(',')])

  function addPeer() {
    const s = input.trim().toUpperCase()
    if (!s || peers.includes(s) || s === symbol || peers.length >= 3) return
    setPeers([...peers, s])
    setInput('')
  }
  function removePeer(s: string) { setPeers(peers.filter(p => p !== s)) }

  const cols = [symbol, ...peers]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,14,26,0.55)', zIndex: 1100, backdropFilter: 'blur(4px)' }} />
      <div role="dialog" aria-modal="true" aria-label="Peer compare"
        style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1101, width: 760, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Peer Compare</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{symbol} vs up to 3 peers</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {peers.map(p => (
            <span key={p} style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {p}
              <button onClick={() => removePeer(p)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
            </span>
          ))}
          {peers.length < 3 && (
            <>
              <input
                value={input}
                onChange={e => setInput(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') addPeer() }}
                placeholder="Add ticker"
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none', width: 110 }}
              />
              <button onClick={addPeer} disabled={!input.trim()}
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 12, fontWeight: 700, cursor: input.trim() ? 'pointer' : 'not-allowed', opacity: input.trim() ? 1 : 0.5 }}>+</button>
            </>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Metric</th>
                {cols.map(s => <th key={s} className="right" style={{ color: s === symbol ? 'var(--accent)' : 'var(--text-secondary)' }}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.key}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.label}</td>
                  {cols.map(s => (
                    <td key={s} className="right" style={{ fontWeight: s === symbol ? 800 : 500, color: s === symbol ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {loading ? <span className="skeleton" style={{ width: 50, height: 12, display: 'inline-block' }} /> : row.fmt(data[s]?.[row.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
