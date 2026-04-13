import { NextRequest, NextResponse } from 'next/server'

const FMP = process.env.FMP_API_KEY || ''

async function fmp(path: string) {
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`https://financialmodelingprep.com${path}${sep}apikey=${FMP}`, { next: { revalidate: 1800 } })
  if (!r.ok) throw new Error(`FMP ${r.status}`)
  return r.json()
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    const [estimates, priceTarget, recommendations, upgrades] = await Promise.allSettled([
      fmp(`/stable/analyst-estimates?symbol=${symbol}&limit=12`),
      fmp(`/stable/price-target-consensus?symbol=${symbol}`),
      fmp(`/stable/analyst-stock-recommendations?symbol=${symbol}&limit=12`),
      fmp(`/stable/upgrades-downgrades-consensus?symbol=${symbol}`),
    ])

    return NextResponse.json({
      symbol,
      estimates:       estimates.status === 'fulfilled' ? estimates.value : [],
      priceTarget:     priceTarget.status === 'fulfilled' ? priceTarget.value : null,
      recommendations: recommendations.status === 'fulfilled' ? recommendations.value : [],
      upgrades:        upgrades.status === 'fulfilled' ? upgrades.value : null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
