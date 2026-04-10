'use client'
import { useState } from 'react'
import { fmtPct, fmt, changeClass } from '@/lib/utils'

const SECTORS = [
  { name: 'Technology', change: 1.42, ytd: 8.3, mcap: '$14.2T', topStock: 'NVDA +2.8%' },
  { name: 'Healthcare', change: 0.31, ytd: 3.1, mcap: '$6.8T', topStock: 'LLY +1.5%' },
  { name: 'Financials', change: -0.12, ytd: 5.2, mcap: '$7.1T', topStock: 'JPM +0.3%' },
  { name: 'Energy', change: -0.82, ytd: -2.1, mcap: '$3.4T', topStock: 'XOM -0.8%' },
  { name: 'Consumer Disc.', change: 0.64, ytd: 4.8, mcap: '$4.9T', topStock: 'AMZN +1.1%' },
  { name: 'Consumer Staples', change: 0.18, ytd: 1.2, mcap: '$3.1T', topStock: 'WMT +0.4%' },
  { name: 'Industrials', change: 0.22, ytd: 2.8, mcap: '$4.2T', topStock: 'HON +0.5%' },
  { name: 'Utilities', change: -0.45, ytd: -0.8, mcap: '$1.4T', topStock: 'NEE -0.3%' },
  { name: 'Real Estate', change: -0.67, ytd: -3.2, mcap: '$1.2T', topStock: 'AMT -0.7%' },
  { name: 'Materials', change: 0.35, ytd: 1.9, mcap: '$2.1T', topStock: 'LIN +0.4%' },
  { name: 'Communication', change: 0.91, ytd: 6.1, mcap: '$4.4T', topStock: 'META +0.9%' },
]

const INDICES = [
  { label: 'S&P 500', price: 5254.35, change: 0.42, ytd: 7.8, vol: '2.1B' },
  { label: 'NASDAQ 100', price: 18391.2, change: 0.61, ytd: 9.2, vol: '1.4B' },
  { label: 'Dow Jones', price: 39127.8, change: 0.22, ytd: 5.1, vol: '0.8B' },
  { label: 'Russell 2000', price: 2082.4, change: -0.18, ytd: 2.3, vol: '0.6B' },
  { label: 'VIX', price: 14.21, change: -1.8, ytd: -18.2, vol: '—' },
  { label: 'FTSE 100', price: 8204.6, change: 0.14, ytd: 3.8, vol: '0.9B' },
]

const MOVERS = {
  gainers: [
    { symbol: 'NVDA', name: 'NVIDIA', change: 2.88, price: 924.8 },
    { symbol: 'AMD', name: 'Advanced Micro', change: 2.14, price: 158.4 },
    { symbol: 'TSLA', name: 'Tesla', change: 1.92, price: 248.2 },
    { symbol: 'NFLX', name: 'Netflix', change: 1.87, price: 890.4 },
    { symbol: 'AVGO', name: 'Broadcom', change: 1.41, price: 218.5 },
  ],
  losers: [
    { symbol: 'INTC', name: 'Intel', change: -2.31, price: 32.4 },
    { symbol: 'TSLA', name: 'Tesla (prev)', change: -1.82, price: 243.9 },
    { symbol: 'XOM', name: 'Exxon', change: -0.84, price: 116.4 },
    { symbol: 'NEE', name: 'NextEra', change: -0.72, price: 64.2 },
    { symbol: 'AMT', name: 'American Tower', change: -0.68, price: 184.3 },
  ],
}

export default function MarketsPage() {
  const [moversTab, setMoversTab] = useState<'gainers'|'losers'>('gainers')
  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title">Markets</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7D8FA9' }}>Global indices, sectors & movers</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#059669' }} />
          <span className="text-xs font-semibold" style={{ color: '#059669' }}>Live</span>
        </div>
      </div>

      {/* Indices */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {INDICES.map(idx => (
          <div key={idx.label} className="metric-card">
            <div className="flex items-start justify-between mb-2">
              <div className="label">{idx.label}</div>
              <span className={`badge ${idx.change >= 0 ? 'badge-green' : 'badge-red'}`}>{fmtPct(idx.change)}</span>
            </div>
            <div className="font-black text-xl mb-1" style={{ color: '#0A1628', letterSpacing: '-0.02em' }}>{idx.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div className="text-xs" style={{ color: '#7D8FA9' }}>YTD {fmtPct(idx.ytd)} · Vol {idx.vol}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Sector heatmap */}
        <div className="lg:col-span-2 card p-5">
          <div className="section-title">Sector Performance</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SECTORS.map(s => {
              const intensity = Math.min(Math.abs(s.change) / 2, 1)
              const bg = s.change > 0 ? `rgba(5,150,105,${0.08 + intensity * 0.15})` : `rgba(220,38,38,${0.08 + intensity * 0.15})`
              return (
                <div key={s.name} className="rounded-xl p-3" style={{ background: bg, border: `1px solid ${s.change > 0 ? 'rgba(5,150,105,0.2)' : 'rgba(220,38,38,0.2)'}` }}>
                  <div className="font-semibold text-xs mb-1" style={{ color: '#0A1628' }}>{s.name}</div>
                  <div className={`font-black text-lg ${changeClass(s.change)}`} style={{ letterSpacing: '-0.02em' }}>{fmtPct(s.change)}</div>
                  <div className="text-xs mt-1" style={{ color: '#7D8FA9' }}>{s.mcap} · {s.topStock}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Movers */}
        <div className="card overflow-hidden">
          <div className="tab-bar px-5 pt-4 mb-0" style={{ marginBottom: 0 }}>
            <button className={`tab-btn ${moversTab === 'gainers' ? 'active' : ''}`} onClick={() => setMoversTab('gainers')}>Top Gainers</button>
            <button className={`tab-btn ${moversTab === 'losers' ? 'active' : ''}`} onClick={() => setMoversTab('losers')}>Top Losers</button>
          </div>
          <div className="divide-y" style={{ borderColor: '#F0F4FA' }}>
            {MOVERS[moversTab].map((m, i) => (
              <div key={i} onClick={() => window.location.href = `/app/company/${m.symbol}`}
                className="px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-[#F8FAFD]"
                style={{ borderBottom: '1px solid #F0F4FA' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0" style={{ background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)' }}>{m.symbol[0]}</div>
                <div className="flex-1">
                  <div className="font-bold text-sm" style={{ color: '#0A1628' }}>{m.symbol}</div>
                  <div className="text-xs" style={{ color: '#7D8FA9' }}>{m.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">${fmt(m.price)}</div>
                  <div className={`font-bold text-xs ${changeClass(m.change)}`}>{fmtPct(m.change)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
