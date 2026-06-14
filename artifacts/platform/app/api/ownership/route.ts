import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/billing-server'

const FMP = process.env.FMP_API_KEY || ''

async function fmp(path: string) {
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`https://financialmodelingprep.com${path}${sep}apikey=${FMP}`, { next: { revalidate: 3600 } })
  if (!r.ok) throw new Error(`FMP ${r.status}`)
  return r.json()
}

export async function GET(req: NextRequest) {
  const gate = await requireFeature('ownership')
  if (!gate.ok) return gate.response!
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const limit  = parseInt(req.nextUrl.searchParams.get('limit') || '10')
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  if (!FMP) {
    return NextResponse.json({
      symbol, asOf: null, holders: [],
      source: 'unavailable',
      note: 'FMP_API_KEY not configured — institutional ownership data is not available.',
    })
  }

  try {
    const data = await fmp(`/api/v3/institutional-holder/${symbol}`)
    const arr  = Array.isArray(data) ? data : []
    const holders = arr.slice(0, limit).map((h: any) => {
      const change = Number(h.change ?? h.changeShares ?? 0)
      const shares = Number(h.shares ?? h.sharesNumber ?? 0)
      const prior  = shares - change
      const pct    = prior > 0 ? +(change / prior * 100).toFixed(2) : null
      return {
        name:         h.holder || h.name,
        shares,
        value:        Number(h.value ?? (shares * Number(h.price || 0))) || null,
        change,
        changePct:    pct,
        dateReported: h.dateReported ?? h.date ?? null,
      }
    })
    const asOf = arr[0]?.dateReported ?? arr[0]?.date ?? null
    return NextResponse.json({ symbol, asOf, holders, source: 'fmp' })
  } catch (e) {
    return NextResponse.json({
      symbol, asOf: null, holders: [],
      source: 'error',
      note: `Unable to load institutional ownership: ${(e as Error).message}`,
    })
  }
}
