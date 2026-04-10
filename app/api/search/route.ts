import { NextRequest, NextResponse } from 'next/server'
const AV = process.env.ALPHA_VANTAGE_KEY
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ results: [] })
  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(q)}&apikey=${AV}`)
    const data = await res.json()
    const results = (data.bestMatches||[]).slice(0,8).map((m: any) => ({
      symbol: m['1. symbol'], name: m['2. name'], type: m['3. type'],
      region: m['4. region'], currency: m['8. currency'],
    }))
    return NextResponse.json({ results })
  } catch { return NextResponse.json({ results: [] }) }
}
