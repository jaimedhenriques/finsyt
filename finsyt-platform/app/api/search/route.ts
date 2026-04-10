import { NextRequest, NextResponse } from 'next/server'
const FINNHUB = process.env.FINNHUB_API_KEY
const FMP     = process.env.FMP_API_KEY

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ results: [] })
  try {
    // Finnhub symbol lookup
    const res = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB}`)
    const data = await res.json()
    const results = (data.result || []).slice(0, 10).map((r: any) => ({
      symbol:      r.symbol,
      name:        r.description,
      type:        r.type,
      region:      'US',
      displaySymbol: r.displaySymbol,
    }))
    return NextResponse.json({ results })
  } catch {
    // FMP fallback
    try {
      const res = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(q)}&limit=10&apikey=${FMP}`)
      const data = await res.json()
      return NextResponse.json({ results: (data || []).map((r: any) => ({ symbol: r.symbol, name: r.name, type: 'Common Stock', region: r.exchangeShortName })) })
    } catch { return NextResponse.json({ results: [] }) }
  }
}
