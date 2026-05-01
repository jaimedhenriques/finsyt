import { NextResponse } from 'next/server'

const COMPANIES = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Communication' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication' },
  { symbol: 'RACE', name: 'Ferrari NV', sector: 'Automotive' },
  { symbol: 'ASML', name: 'ASML Holding', sector: 'Technology' },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financials' },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy' },
]

// Deterministic-ish "live now" rotation based on minute-of-day so the page
// can poll and see updates without flapping every second.
function liveSelection() {
  const now = new Date()
  const seed = now.getUTCHours() * 60 + Math.floor(now.getUTCMinutes() / 5)
  const live: any[] = []
  COMPANIES.forEach((c, i) => {
    const phase = (seed + i * 7) % 23
    if (phase < 4) {
      const startedMin = phase * 11
      live.push({
        ...c,
        event: `Q${1 + (seed % 4)} 2026 Earnings Call`,
        startedAt: new Date(now.getTime() - startedMin * 60_000).toISOString(),
        listeners: 200 + (phase * 437 % 4800),
      })
    }
  })
  return live
}

function activityFeed() {
  const now = Date.now()
  const items: any[] = []
  COMPANIES.forEach((c, i) => {
    const ago = (i * 137 + (now / 60000) % 30) % 240
    const types = ['went live', 'just ended', 'released transcript', 'posted slides', 'filed 8-K']
    items.push({
      symbol: c.symbol,
      name: c.name,
      type: types[i % types.length],
      detail: `Q${1 + (i % 4)} 2026`,
      ago: Math.floor(ago),
      ts: new Date(now - ago * 60_000).toISOString(),
    })
  })
  return items.sort((a, b) => a.ago - b.ago).slice(0, 12)
}

export async function GET() {
  return NextResponse.json({
    live: liveSelection(),
    activity: activityFeed(),
    refreshedAt: new Date().toISOString(),
  })
}
