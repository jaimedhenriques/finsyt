import { NextRequest, NextResponse } from 'next/server'
const FMP     = process.env.FMP_API_KEY
const FINNHUB = process.env.FINNHUB_API_KEY

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const sector    = p.get('sector') || ''
  const minMcap   = p.get('minMcap') || '1000000000'
  const maxMcap   = p.get('maxMcap') || ''
  const country   = p.get('country') || 'US'
  const exchange  = p.get('exchange') || 'NYSE,NASDAQ'
  const minPe     = p.get('minPe') || ''
  const maxPe     = p.get('maxPe') || ''
  const minBeta   = p.get('minBeta') || ''
  const maxBeta   = p.get('maxBeta') || ''
  const limit     = p.get('limit') || '50'

  let url = `https://financialmodelingprep.com/api/v3/stock-screener?apikey=${FMP}&limit=${limit}&isActivelyTrading=true&exchange=${exchange}`
  if (sector)   url += `&sector=${encodeURIComponent(sector)}`
  if (country)  url += `&country=${country}`
  if (minMcap)  url += `&marketCapMoreThan=${minMcap}`
  if (maxMcap)  url += `&marketCapLowerThan=${maxMcap}`
  if (minPe)    url += `&priceMoreThan=${minPe}`
  if (maxPe)    url += `&priceLowerThan=${maxPe}`
  if (minBeta)  url += `&betaMoreThan=${minBeta}`
  if (maxBeta)  url += `&betaLowerThan=${maxBeta}`

  try {
    const res = await fetch(url)
    const data = await res.json()
    const results = (Array.isArray(data) ? data : []).map((s: any) => ({
      symbol:       s.symbol,
      name:         s.companyName,
      price:        s.price,
      marketCap:    s.marketCap,
      sector:       s.sector,
      industry:     s.industry,
      beta:         s.beta,
      volume:       s.volume,
      exchange:     s.exchangeShortName,
      country:      s.country,
      pe:           null,
      changePct:    s.changes,
    }))
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
