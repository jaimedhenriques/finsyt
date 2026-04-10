import { NextRequest, NextResponse } from 'next/server'

const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  if (!EODHD) return NextResponse.json({ error: 'EODHD_API_KEY not configured' }, { status: 500 })

  const eodSymbol = symbol.includes('.') ? symbol : `${symbol}.US`
  try {
    const res = await fetch(
      `https://eodhd.com/api/insider-transactions?api_token=${EODHD}&code=${eodSymbol}&fmt=json`,
      { next: { revalidate: 3600 } }
    )
    const data = await res.json()
    return NextResponse.json({ symbol, transactions: data, source: 'eodhd' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
