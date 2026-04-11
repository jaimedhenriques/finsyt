import { NextRequest, NextResponse } from 'next/server'

const FMP     = process.env.FMP_API_KEY
const FINNHUB = process.env.FINNHUB_API_KEY
const EODHD   = process.env.EODHD_API_KEY || process.env.eodhd_api

function normaliseResult(s: any, source: string) {
  return {
    symbol:    s.symbol,
    name:      s.companyName || s.name || s.description || '',
    price:     s.price || s.last || 0,
    marketCap: s.marketCap || s.mktCap || 0,
    sector:    s.sector || '',
    industry:  s.industry || '',
    beta:      s.beta || 0,
    volume:    s.volume || s.avgVolume || 0,
    exchange:  s.exchangeShortName || s.exchange || '',
    country:   s.country || 'US',
    pe:        s.peRatioTTM || s.pe || null,
    changePct: s.changes || s.change_p || 0,
    revenue:   s.revenue || null,
    grossMargin: s.grossProfitMarginTTM || null,
    roe:       s.roeTTM || null,
    debtEquity:s.debtEquityRatioTTM || null,
    source,
  }
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const sector       = p.get('sector') || ''
  const minMcap      = p.get('minMcap') || '500000000'
  const maxMcap      = p.get('maxMcap') || ''
  const country      = p.get('country') || 'US'
  const exchange     = p.get('exchange') || 'NYSE,NASDAQ'
  const minPe        = p.get('minPe') || ''
  const maxPe        = p.get('maxPe') || ''
  const minPrice     = p.get('minPrice') || ''
  const maxPrice     = p.get('maxPrice') || ''
  const minBeta      = p.get('minBeta') || ''
  const maxBeta      = p.get('maxBeta') || ''
  const minVolume    = p.get('minVolume') || ''
  const industry     = p.get('industry') || ''
  const limit        = Math.min(parseInt(p.get('limit') || '50'), 100)
  const sort         = p.get('sort') || 'marketCap'  // marketCap | pe | volume | changePct
  const order        = p.get('order') || 'desc'

  // ── Primary: FMP Stock Screener ───────────────────────────────────────────
  if (FMP) {
    try {
      let url = `https://financialmodelingprep.com/stable/company-screener?apikey=${FMP}&limit=${limit}&isActivelyTrading=true&exchange=${exchange}`
      if (sector)    url += `&sector=${encodeURIComponent(sector)}`
      if (industry)  url += `&industry=${encodeURIComponent(industry)}`
      if (country)   url += `&country=${country}`
      if (minMcap)   url += `&marketCapMoreThan=${minMcap}`
      if (maxMcap)   url += `&marketCapLowerThan=${maxMcap}`
      if (minPrice)  url += `&priceMoreThan=${minPrice}`
      if (maxPrice)  url += `&priceLowerThan=${maxPrice}`
      if (minBeta)   url += `&betaMoreThan=${minBeta}`
      if (maxBeta)   url += `&betaLowerThan=${maxBeta}`
      if (minVolume) url += `&volumeMoreThan=${minVolume}`

      const res  = await fetch(url, { next: { revalidate: 300 } })
      const data = await res.json()

      if (Array.isArray(data) && data.length > 0) {
        let results = data.map(s => normaliseResult(s, 'fmp'))

        // Apply P/E filter client-side (FMP screener doesn't support it on stable)
        if (minPe) results = results.filter(s => s.pe !== null && s.pe >= parseFloat(minPe))
        if (maxPe) results = results.filter(s => s.pe !== null && s.pe <= parseFloat(maxPe))

        // Sort
        results.sort((a, b) => {
          const av = (a as any)[sort] ?? 0
          const bv = (b as any)[sort] ?? 0
          return order === 'desc' ? bv - av : av - bv
        })

        return NextResponse.json({ results, total: results.length, source: 'fmp' })
      }
    } catch (e) { console.error('FMP screener failed:', e) }
  }

  // ── Fallback: Finnhub ─────────────────────────────────────────────────────
  if (FINNHUB) {
    try {
      const params = new URLSearchParams({ token: FINNHUB })
      if (sector) params.set('sector', sector)
      if (exchange) params.set('exchange', exchange.split(',')[0])
      const res  = await fetch(`https://finnhub.io/api/v1/stock/symbol?${params}`)
      const syms = await res.json()
      const results = (Array.isArray(syms) ? syms : []).slice(0, limit).map((s: any) => ({
        symbol: s.symbol, name: s.description, exchange: s.mic, source: 'finnhub',
        price: 0, marketCap: 0, sector: '', industry: '', beta: 0, volume: 0, country, pe: null, changePct: 0,
      }))
      return NextResponse.json({ results, source: 'finnhub' })
    } catch (e) { console.error('Finnhub screener failed:', e) }
  }

  return NextResponse.json({ results: [], error: 'No screener source available' })
}
