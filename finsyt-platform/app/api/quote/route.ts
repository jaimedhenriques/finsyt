import { NextRequest, NextResponse } from 'next/server'

const EODHD   = process.env.EODHD_API_KEY || process.env.eodhd_api
const FINNHUB = process.env.FINNHUB_API_KEY
const FMP     = process.env.FMP_API_KEY

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  // Primary: EODHD live quote + fundamentals (best coverage, global)
  if (EODHD) {
    try {
      // EODHD uses TICKER.EXCHANGE format — default to US exchange
      const eodSymbol = symbol.includes('.') ? symbol : `${symbol}.US`
      const [liveRes, fundRes] = await Promise.all([
        fetch(`https://eodhd.com/api/real-time/${eodSymbol}?api_token=${EODHD}&fmt=json`),
        fetch(`https://eodhd.com/api/fundamentals/${eodSymbol}?api_token=${EODHD}&fmt=json`),
      ])
      const [live, fund] = await Promise.all([liveRes.json(), fundRes.json()])

      if (live.close || live.previousClose) {
        const price     = live.close || live.previousClose
        const prevClose = live.previousClose || live.open
        const change    = parseFloat((price - prevClose).toFixed(2))
        const changePct = parseFloat(((change / prevClose) * 100).toFixed(2))

        const h = fund?.Highlights || {}
        const v = fund?.Valuation || {}
        const g = fund?.General || {}
        const t = fund?.Technicals || {}

        return NextResponse.json({
          symbol,
          price,
          change,
          changePct,
          open:         live.open,
          high:         live.high,
          low:          live.low,
          prevClose,
          volume:       live.volume,
          name:         g.Name || symbol,
          sector:       g.Sector || '',
          industry:     g.Industry || '',
          marketCap:    h.MarketCapitalization || 0,
          exchange:     g.Exchange || '',
          currency:     g.CurrencyCode || 'USD',
          logo:         g.LogoURL ? `https://eodhd.com${g.LogoURL}` : '',
          weburl:       g.WebURL || '',
          ipo:          g.IPODate || '',
          pe:           h.PERatio || v.TrailingPE || 0,
          eps:          h.EarningsShare || 0,
          beta:         t.Beta || 0,
          week52High:   t['52WeekHigh'] || live.high,
          week52Low:    t['52WeekLow'] || live.low,
          dividendYield:h.DividendYield || 0,
          returnOnEquity: h.ReturnOnEquityTTM || 0,
          grossMargin:  h.GrossProfitTTM || 0,
          netMargin:    h.ProfitMargin || 0,
          revenueGrowth:h.QuarterlyRevenueGrowthYOY || 0,
          analystTarget:h.AnalystTargetPrice || 0,
          description:  g.Description || '',
          employees:    g.FullTimeEmployees || 0,
          source: 'eodhd',
        })
      }
    } catch (e) {
      console.error('EODHD quote failed:', e)
    }
  }

  // Fallback: Finnhub
  if (FINNHUB) {
    try {
      const [qRes, pRes, metricsRes] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB}`),
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB}`),
        fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB}`),
      ])
      const [q, profile, metricsData] = await Promise.all([qRes.json(), pRes.json(), metricsRes.json()])
      const m = metricsData.metric || {}
      if (!q.c || q.c === 0) throw new Error('Finnhub no data')
      const change = q.c - q.pc
      return NextResponse.json({
        symbol,
        price:       q.c,
        change:      parseFloat(change.toFixed(2)),
        changePct:   parseFloat(((change / q.pc) * 100).toFixed(2)),
        open: q.o, high: q.h, low: q.l, prevClose: q.pc, volume: 0,
        name: profile.name || symbol, sector: profile.finnhubIndustry || '',
        industry: profile.finnhubIndustry || '',
        marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : 0,
        exchange: profile.exchange || '', currency: profile.currency || 'USD',
        logo: profile.logo || '', weburl: profile.weburl || '', ipo: profile.ipo || '',
        pe: m['peNormalizedAnnual'] || 0, eps: m['epsNormalizedAnnual'] || 0,
        beta: m['beta'] || 0, week52High: m['52WeekHigh'] || q.h, week52Low: m['52WeekLow'] || q.l,
        dividendYield: m['dividendYieldIndicatedAnnual'] || 0,
        returnOnEquity: m['roeTTM'] || 0, grossMargin: m['grossMarginTTM'] || 0,
        netMargin: m['netProfitMarginTTM'] || 0, revenueGrowth: m['revenueGrowthTTMYoy'] || 0,
        analystTarget: 0, source: 'finnhub',
      })
    } catch (e) { console.error('Finnhub fallback failed:', e) }
  }

  // Fallback: FMP
  if (FMP) {
    try {
      const [qRes, pRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP}`),
        fetch(`https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${FMP}`),
      ])
      const [quotes, profiles] = await Promise.all([qRes.json(), pRes.json()])
      const q = quotes[0]; const p = profiles[0]
      if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({
        symbol: q.symbol, price: q.price, change: q.change, changePct: q.changesPercentage,
        open: q.open, high: q.dayHigh, low: q.dayLow, prevClose: q.previousClose,
        volume: q.volume, marketCap: q.marketCap, name: q.name, exchange: q.exchange,
        currency: 'USD', pe: q.pe, eps: q.eps, week52High: q.yearHigh, week52Low: q.yearLow,
        beta: p?.beta || 0, sector: p?.sector || '', industry: p?.industry || '',
        logo: p?.image || '', weburl: p?.website || '', dividendYield: p?.lastDiv || 0,
        grossMargin: p?.grossProfitMargin || 0, source: 'fmp',
      })
    } catch { return NextResponse.json({ error: 'All sources failed' }, { status: 500 }) }
  }

  return NextResponse.json({ error: 'No API keys configured' }, { status: 500 })
}
