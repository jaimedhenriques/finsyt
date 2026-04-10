import { NextRequest, NextResponse } from 'next/server'
const FINNHUB = process.env.FINNHUB_API_KEY
const FMP     = process.env.FMP_API_KEY

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') || new Date().toISOString().slice(0, 10)
  const to   = req.nextUrl.searchParams.get('to')   || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)

  try {
    // Finnhub earnings calendar
    const res = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB}`)
    const data = await res.json()
    const events = (data.earningsCalendar || []).slice(0, 50).map((e: any) => ({
      symbol:     e.symbol,
      company:    e.symbol,
      date:       e.date,
      hour:       e.hour,       // bmo | amc
      epsEstimate: e.epsEstimate,
      epsActual:   e.epsActual,
      revenueEstimate: e.revenueEstimate,
      revenueActual:   e.revenueActual,
      quarter:    e.quarter,
      year:       e.year,
    }))
    return NextResponse.json({ events })
  } catch {
    // FMP fallback
    try {
      const res = await fetch(`https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${FMP}`)
      const data = await res.json()
      return NextResponse.json({ events: (data || []).slice(0, 50) })
    } catch { return NextResponse.json({ events: [] }) }
  }
}
