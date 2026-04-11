import { NextRequest, NextResponse } from 'next/server'

const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api

export async function GET(req: NextRequest) {
  const country   = req.nextUrl.searchParams.get('country')   || 'US'
  const indicator = req.nextUrl.searchParams.get('indicator') || 'GDP_GROWTH_RATE'
  const periods   = parseInt(req.nextUrl.searchParams.get('periods') || '16', 10)

  if (!EODHD) return NextResponse.json({ error: 'EODHD_API_KEY not configured' }, { status: 500 })

  try {
    const res  = await fetch(
      `https://eodhd.com/api/macro-indicator/${country}?api_token=${EODHD}&indicator=${indicator}&fmt=json`,
      { next: { revalidate: 3600 } }
    )
    const data = await res.json()

    if (!Array.isArray(data)) {
      return NextResponse.json({ country, indicator, history: [], error: 'No data' })
    }

    const history = data
      .filter((d: any) => d.value !== null && d.value !== undefined)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-periods)

    return NextResponse.json({ country, indicator, history, source: 'eodhd' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
