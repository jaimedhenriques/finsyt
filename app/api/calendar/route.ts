import { NextRequest, NextResponse } from 'next/server'

const FMP     = process.env.FMP_API_KEY || ''
const FINNHUB = process.env.FINNHUB_API_KEY || ''

function todayStr() { return new Date().toISOString().split('T')[0] }
function dateStr(daysOffset: number) {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const sp   = req.nextUrl.searchParams
  const type = sp.get('type') || 'earnings'  // earnings | ipo | dividend | economic
  const from = sp.get('from') || todayStr()
  const to   = sp.get('to')   || dateStr(14)
  const symbol = sp.get('symbol')?.toUpperCase()

  try {
    if (type === 'earnings') {
      if (FMP) {
        const url = symbol
          ? `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&symbol=${symbol}&apikey=${FMP}`
          : `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${FMP}`
        const res = await fetch(url)
        const data = await res.json()
        if (Array.isArray(data)) {
          return NextResponse.json({
            type, from, to,
            events: data.slice(0, 100).map((e: any) => ({
              symbol:      e.symbol,
              name:        e.name,
              date:        e.date,
              time:        e.time === 'bmo' ? 'Before Market Open' : e.time === 'amc' ? 'After Market Close' : e.time,
              epsEst:      e.epsEstimated,
              revEst:      e.revenueEstimated,
              epsActual:   e.eps,
              revActual:   e.revenue,
              surprise:    e.eps && e.epsEstimated ? ((e.eps - e.epsEstimated) / Math.abs(e.epsEstimated) * 100).toFixed(1) : null,
              fiscalPeriod:e.fiscalDateEnding,
              updatedAt:   e.updatedFromDate,
            })),
            source: 'fmp',
          })
        }
      }

      if (FINNHUB) {
        const res = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${symbol || ''}&token=${FINNHUB}`)
        const data = await res.json()
        const events = Array.isArray(data?.earningsCalendar) ? data.earningsCalendar : []
        return NextResponse.json({ type, from, to, events, source: 'finnhub' })
      }
    }

    if (type === 'ipo') {
      if (FMP) {
        const res = await fetch(`https://financialmodelingprep.com/stable/ipo-calendar?from=${from}&to=${to}&apikey=${FMP}`)
        const data = await res.json()
        if (Array.isArray(data)) {
          return NextResponse.json({
            type, from, to,
            events: data.slice(0, 50).map((e: any) => ({
              symbol:     e.symbol,
              name:       e.company,
              date:       e.date,
              exchange:   e.exchange,
              price:      e.priceRange,
              shares:     e.shares,
              marketCap:  e.marketCap,
              status:     e.status,
            })),
            source: 'fmp',
          })
        }
      }
    }

    if (type === 'economic') {
      if (FMP) {
        const res = await fetch(`https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${FMP}`)
        const data = await res.json()
        if (Array.isArray(data)) {
          return NextResponse.json({
            type, from, to,
            events: data.slice(0, 100).map((e: any) => ({
              event:    e.event,
              date:     e.date,
              country:  e.country,
              actual:   e.actual,
              previous: e.previous,
              estimate: e.estimate,
              impact:   e.impact,
            })),
            source: 'fmp',
          })
        }
      }
    }

    return NextResponse.json({ error: `No ${type} calendar provider configured` }, { status: 503 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
