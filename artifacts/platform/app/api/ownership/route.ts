import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/billing-server'
import { yahooMajorHolders } from '@/lib/data-providers'

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

  // Yahoo major-holders breakdown is additive (FMP only returns the holder
  // list, not the insider/institution % split) so we fetch it in parallel and
  // attach it regardless of whether the FMP list call succeeds.
  const breakdownP = yahooMajorHolders(symbol).catch(() => null)

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
    const breakdown = await breakdownP
    return NextResponse.json({ symbol, asOf, holders, source: 'fmp', breakdown })
  } catch (e) {
    const breakdown = await breakdownP
    return NextResponse.json({
      symbol, asOf: null, holders: [],
      // If the breakdown still came back from Yahoo, report a degraded-but-
      // partial source rather than a hard error.
      source: breakdown ? 'yahoo' : 'error',
      breakdown,
      note: breakdown
        ? 'Institutional holder list unavailable from FMP; showing Yahoo major-holders breakdown only.'
        : `Unable to load institutional ownership: ${(e as Error).message}`,
    })
  }
}
