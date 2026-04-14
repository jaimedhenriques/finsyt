import { NextRequest, NextResponse } from 'next/server'

const FMP     = process.env.FMP_API_KEY || ''
const FINNHUB = process.env.FINNHUB_API_KEY || ''
const EODHD   = process.env.EODHD_API_KEY || process.env.eodhd_api || ''

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const symbol = sp.get('symbol')?.toUpperCase()
  const period = sp.get('period') || 'annual' // annual | quarterly

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const results: any = { symbol, period }

  try {
    if (FMP) {
      const [estRes, epsRes, recRes, priceRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}&period=${period}&limit=8&apikey=${FMP}`),
        fetch(`https://financialmodelingprep.com/stable/earnings-surprises?symbol=${symbol}&apikey=${FMP}`),
        fetch(`https://financialmodelingprep.com/stable/analyst-stock-recommendations?symbol=${symbol}&apikey=${FMP}`),
        fetch(`https://financialmodelingprep.com/stable/price-target?symbol=${symbol}&apikey=${FMP}`),
      ])
      const [est, eps, rec, price] = await Promise.all([estRes.json(), epsRes.json(), recRes.json(), priceRes.json()])

      if (Array.isArray(est)) {
        results.estimates = est.map((e: any) => ({
          date:            e.date,
          revenueAvg:      e.estimatedRevenueAvg,
          revenueLow:      e.estimatedRevenueLow,
          revenueHigh:     e.estimatedRevenueHigh,
          ebitdaAvg:       e.estimatedEbitdaAvg,
          ebitAvg:         e.estimatedEbitAvg,
          netIncomeAvg:    e.estimatedNetIncomeAvg,
          epsAvg:          e.estimatedEpsAvg,
          epsLow:          e.estimatedEpsLow,
          epsHigh:         e.estimatedEpsHigh,
          numberAnalysts:  e.numberAnalystEstimatedRevenue,
        }))
      }

      if (Array.isArray(eps)) {
        results.epsSurprises = eps.slice(0, 8).map((e: any) => ({
          date:     e.date,
          actual:   e.actualEarningResult,
          estimate: e.estimatedEarning,
          surprise: e.actualEarningResult && e.estimatedEarning
            ? ((e.actualEarningResult - e.estimatedEarning) / Math.abs(e.estimatedEarning) * 100).toFixed(1)
            : null,
        }))
      }

      const recArr = Array.isArray(rec) ? rec : []
      if (recArr.length > 0) {
        const latest = recArr[0]
        results.analystRatings = {
          consensus: latest.consensus,
          strongBuy: latest.strongBuy,
          buy:       latest.buy,
          hold:      latest.hold,
          sell:      latest.sell,
          strongSell:latest.strongSell,
          date:      latest.date,
          history:   recArr.slice(0, 6),
        }
      }

      const priceArr = Array.isArray(price) ? price : []
      if (priceArr.length > 0) {
        const targets = priceArr.filter((p: any) => p.priceTarget).map((p: any) => p.priceTarget)
        results.priceTargets = {
          avg:    targets.reduce((a: number, b: number) => a + b, 0) / (targets.length || 1),
          high:   Math.max(...targets),
          low:    Math.min(...targets),
          count:  targets.length,
          recent: priceArr.slice(0, 10).map((p: any) => ({
            analyst:       p.analystName,
            firm:          p.analystCompany,
            target:        p.priceTarget,
            action:        p.priceTargetDifference > 0 ? 'Raised' : p.priceTargetDifference < 0 ? 'Lowered' : 'Maintained',
            date:          p.publishedDate,
            newsTitle:     p.newsTitle,
            newsUrl:       p.newsURL,
          })),
        }
      }

      results.source = 'fmp'
      return NextResponse.json(results)
    }

    // Finnhub fallback for basic recommendations
    if (FINNHUB) {
      const [recRes, epsRes] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${FINNHUB}`),
        fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${FINNHUB}`),
      ])
      const [rec, eps] = await Promise.all([recRes.json(), epsRes.json()])
      if (Array.isArray(rec) && rec.length > 0) {
        const latest = rec[0]
        results.analystRatings = {
          strongBuy:  latest.strongBuy,
          buy:        latest.buy,
          hold:       latest.hold,
          sell:       latest.sell,
          strongSell: latest.strongSell,
          date:       latest.period,
        }
      }
      if (Array.isArray(eps)) {
        results.epsSurprises = eps.slice(0, 8).map((e: any) => ({
          date:     e.period,
          actual:   e.actual,
          estimate: e.estimate,
          surprise: e.surprisePercent,
        }))
      }
      results.source = 'finnhub'
      return NextResponse.json(results)
    }

    // EODHD fallback
    if (EODHD) {
      const eodSym = symbol.includes('.') ? symbol : `${symbol}.US`
      const res = await fetch(`https://eodhd.com/api/fundamentals/${eodSym}?api_token=${EODHD}&filter=AnalystRatings,Earnings`)
      const data = await res.json()
      if (data?.AnalystRatings) {
        results.analystRatings = {
          consensus:    data.AnalystRatings.Rating,
          targetPrice:  data.AnalystRatings.TargetPrice,
          strongBuy:    data.AnalystRatings.StrongBuy,
          buy:          data.AnalystRatings.Buy,
          hold:         data.AnalystRatings.Hold,
          sell:         data.AnalystRatings.Sell,
          strongSell:   data.AnalystRatings.StrongSell,
        }
      }
      results.source = 'eodhd'
      return NextResponse.json(results)
    }

    return NextResponse.json({ error: 'No estimates provider configured' }, { status: 503 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
