import { NextRequest, NextResponse } from 'next/server'

const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api || ''
const BASE = 'https://eodhd.com/api'

// Universal EODHD proxy — ?type=eod|fundamentals|live|news|macro|insider|calendar|screener|search
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type   = searchParams.get('type') || 'eod'
  const symbol = searchParams.get('symbol') || ''
  const from   = searchParams.get('from') || ''
  const to     = searchParams.get('to') || ''
  const q      = searchParams.get('q') || ''
  const country= searchParams.get('country') || 'US'
  const indicator = searchParams.get('indicator') || 'GDP_USD'

  if (!EODHD) return NextResponse.json({ error: 'EODHD_API_KEY not configured' }, { status: 500 })

  let url = ''

  switch (type) {
    // End-of-day historical prices
    case 'eod':
      url = `${BASE}/eod/${symbol}?api_token=${EODHD}&fmt=json${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`
      break

    // Real-time / live quote
    case 'live':
      url = `${BASE}/real-time/${symbol}?api_token=${EODHD}&fmt=json`
      break

    // Full fundamental data (income, balance, cash flow, highlights, valuation)
    case 'fundamentals':
      url = `${BASE}/fundamentals/${symbol}?api_token=${EODHD}&fmt=json`
      break

    // Financial news + sentiment
    case 'news':
      url = `${BASE}/news?api_token=${EODHD}&s=${symbol}&limit=50&fmt=json`
      break

    // Macro indicators (GDP, CPI, inflation, unemployment…)
    case 'macro':
      url = `${BASE}/macro-indicator/${country}?api_token=${EODHD}&indicator=${indicator}&fmt=json`
      break

    // Insider transactions (Form 4)
    case 'insider':
      url = `${BASE}/insider-transactions?api_token=${EODHD}&code=${symbol}&fmt=json`
      break

    // Earnings / dividends / IPO calendar
    case 'calendar':
      url = `${BASE}/calendar/earnings?api_token=${EODHD}&fmt=json${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`
      break

    // ESG scores
    case 'esg':
      url = `${BASE}/esg-data?api_token=${EODHD}&code=${symbol}&fmt=json`
      break

    // Historical market cap
    case 'marketcap':
      url = `${BASE}/historical-market-cap?api_token=${EODHD}&code=${symbol}&fmt=json${from ? `&from=${from}` : ''}`
      break

    // Screener
    case 'screener':
      url = `${BASE}/screener?api_token=${EODHD}&filters=[["market_capitalization",">"," 1000000000"]]&limit=50&fmt=json`
      break

    // Search
    case 'search':
      url = `${BASE}/search/${q}?api_token=${EODHD}&fmt=json`
      break

    // Technical indicators
    case 'technical':
      const func = searchParams.get('function') || 'sma'
      const period = searchParams.get('period') || '50'
      url = `${BASE}/technical/${symbol}?api_token=${EODHD}&function=${func}&period=${period}&fmt=json`
      break

    default:
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
  }

  try {
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `EODHD error: ${res.status}`, detail: text }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
