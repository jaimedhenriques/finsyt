import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, ownMarketTrends, massiveFetch, massiveGrouped } from '@/lib/data-providers'

export async function GET(req: NextRequest) {
  const type    = (req.nextUrl.searchParams.get('type') || 'GAINERS').toUpperCase() as 'GAINERS' | 'LOSERS' | 'MOST_ACTIVE'
  const country = req.nextUrl.searchParams.get('country') || 'us'

  // 1. OpenWebNinja — Google Finance trends (cleanest data)
  if (PROVIDERS.own) {
    try {
      const data = await ownMarketTrends(type, country)
      if (data) return NextResponse.json({ type, country, trends: data, source: 'openwebninja' })
    } catch (e) { console.warn('[market-trends] OWN failed:', (e as Error).message) }
  }

  // 2. Massive grouped snapshot (US only, day's movers)
  if (PROVIDERS.massive && type === 'MOST_ACTIVE') {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const bars  = await massiveGrouped(today)
      if (bars?.length) {
        const sorted = bars
          .filter((b: any) => b.v > 1000000)
          .sort((a: any, b: any) => b.v - a.v)
          .slice(0, 20)
          .map((b: any) => ({ symbol: b.T, price: b.c, volume: b.v, change: b.c - b.o, changePct: ((b.c - b.o) / b.o * 100).toFixed(2) }))
        return NextResponse.json({ type, country, trends: sorted, source: 'massive' })
      }
    } catch (e) { console.warn('[market-trends] Massive failed:', (e as Error).message) }
  }

  // 3. FMP gainers/losers
  if (PROVIDERS.fmp) {
    try {
      const endpoint = type === 'GAINERS' ? 'gainers' : type === 'LOSERS' ? 'losers' : 'actives'
      const res  = await fetch(`https://financialmodelingprep.com/stable/stock_market/${endpoint}?apikey=${PROVIDERS.fmp}`, { next: { revalidate: 300 } })
      const data = await res.json()
      if (Array.isArray(data) && data.length) {
        return NextResponse.json({ type, country, trends: data.map((s: any) => ({ symbol: s.symbol, name: s.companyName||s.name, price: s.price, change: s.change, changePct: s.changesPercentage, volume: s.volume })), source: 'fmp' })
      }
    } catch (e) { console.warn('[market-trends] FMP failed:', (e as Error).message) }
  }

  return NextResponse.json({ error: 'All trend providers failed', type }, { status: 503 })
}
