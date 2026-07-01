import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, ownMarketTrends, massiveGrouped } from '@/lib/data-providers'

interface MoverItem {
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
  volume?: number
}

function normOwn(arr: any[] | null): MoverItem[] {
  if (!arr?.length) return []
  return arr.slice(0, 20).map((s: any) => ({
    symbol:    String(s.symbol || s.ticker || ''),
    name:      String(s.name   || s.companyName || s.symbol || ''),
    price:     Number(s.price  || s.last_price  || 0),
    change:    Number(s.change || s.price_change || 0),
    changePct: Number(s.changePct ?? s.change_percent ?? s.percent_change ?? 0),
    volume:    Number(s.volume) || undefined,
  })).filter(m => m.symbol)
}

async function fetchFmpMovers(endpoint: 'gainers' | 'losers' | 'actives'): Promise<MoverItem[] | null> {
  if (!PROVIDERS.fmp) return null
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/stock_market/${endpoint}?apikey=${PROVIDERS.fmp}`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || !data.length) return null
    return data.slice(0, 20).map((s: any) => ({
      symbol:    String(s.symbol || ''),
      name:      String(s.companyName || s.name || s.symbol || ''),
      price:     Number(s.price) || 0,
      change:    Number(s.change) || 0,
      changePct: Number(s.changesPercentage) || 0,
      volume:    Number(s.volume) || undefined,
    }))
  } catch {
    return null
  }
}

export async function GET(_req: NextRequest) {
  // ── 1. OpenWebNinja (Google Finance trends) ──────────────────────────────
  if (PROVIDERS.own) {
    try {
      const [rawG, rawL, rawA] = await Promise.all([
        ownMarketTrends('GAINERS'),
        ownMarketTrends('LOSERS'),
        ownMarketTrends('MOST_ACTIVE'),
      ])
      const gainers    = normOwn(rawG)
      const losers     = normOwn(rawL)
      const mostActive = normOwn(rawA)
      if (gainers.length || losers.length) {
        return NextResponse.json({ gainers, losers, mostActive, source: 'openwebninja' })
      }
    } catch {
      // fall through to next provider
    }
  }

  // ── 2. Massive snapshot — derive movers from volume-filtered bars ─────────
  if (PROVIDERS.massive) {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const bars  = await massiveGrouped(today)
      if (bars?.length) {
        const normalised: MoverItem[] = bars
          .filter((b: any) => b.v > 500_000 && b.o > 0)
          .map((b: any) => ({
            symbol:    String(b.T || ''),
            name:      String(b.T || ''),
            price:     Number(b.c) || 0,
            change:    Number(b.c - b.o),
            changePct: Number(((b.c - b.o) / b.o) * 100),
            volume:    Number(b.v) || undefined,
          }))
        const sorted = [...normalised].sort((a, b) => b.changePct - a.changePct)
        const gainers    = sorted.filter(m => m.changePct > 0).slice(0, 20)
        const losers     = [...normalised].sort((a, b) => a.changePct - b.changePct).filter(m => m.changePct < 0).slice(0, 20)
        const mostActive = [...normalised].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 20)
        if (gainers.length || losers.length) {
          return NextResponse.json({ gainers, losers, mostActive, source: 'massive' })
        }
      }
    } catch {
      // fall through to next provider
    }
  }

  // ── 3. FMP gainers / losers / actives ─────────────────────────────────────
  if (PROVIDERS.fmp) {
    const [gainers, losers, mostActive] = await Promise.all([
      fetchFmpMovers('gainers'),
      fetchFmpMovers('losers'),
      fetchFmpMovers('actives'),
    ])
    if (gainers?.length || losers?.length) {
      return NextResponse.json({
        gainers:    gainers    ?? [],
        losers:     losers     ?? [],
        mostActive: mostActive ?? [],
        source:     'fmp',
      })
    }
  }

  return NextResponse.json(
    { error: 'All movers providers unavailable', gainers: [], losers: [], mostActive: [], source: 'none' },
    { status: 503 },
  )
}
