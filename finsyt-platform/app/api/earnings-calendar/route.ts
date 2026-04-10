import { NextRequest, NextResponse } from 'next/server'

const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') || new Date().toISOString().split('T')[0]
  const to   = req.nextUrl.searchParams.get('to')   || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  const symbols = req.nextUrl.searchParams.get('symbols') || ''

  if (!EODHD) return NextResponse.json({ error: 'EODHD_API_KEY not configured' }, { status: 500 })

  try {
    const params = new URLSearchParams({ api_token: EODHD, fmt: 'json', from, to })
    if (symbols) params.set('symbols', symbols)

    const res = await fetch(`https://eodhd.com/api/calendar/earnings?${params}`, { next: { revalidate: 3600 } })
    const data = await res.json()
    return NextResponse.json({ from, to, earnings: data?.earnings || data, source: 'eodhd' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
