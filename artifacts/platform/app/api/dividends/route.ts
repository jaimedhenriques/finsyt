import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FMP = process.env.FMP_API_KEY || ''

type FmpDividend = {
  date: string
  recordDate?: string
  paymentDate?: string
  declarationDate?: string
  adjDividend?: number
  dividend?: number
  label?: string
}

type FmpDividendsResponse = {
  symbol?: string
  historical?: FmpDividend[]
}

type SlimDividend = {
  exDate: string
  paymentDate: string | null
  recordDate: string | null
  declarationDate: string | null
  amount: number
  adjAmount: number
}

type Annual = { year: number; total: number; payments: number }

const cache = new Map<string, { at: number; payload: unknown }>()
const TTL_MS = 6 * 60 * 60 * 1000

function annualize(rows: SlimDividend[]): Annual[] {
  const map = new Map<number, Annual>()
  for (const r of rows) {
    const y = Number(r.exDate.slice(0, 4))
    if (!Number.isFinite(y)) continue
    const cur = map.get(y) || { year: y, total: 0, payments: 0 }
    cur.total += r.adjAmount || r.amount || 0
    cur.payments += 1
    map.set(y, cur)
  }
  return [...map.values()].sort((a, b) => a.year - b.year)
}

function yieldPctFromTtm(ttm: number, price: number | null): number | null {
  if (!price || !ttm || price <= 0) return null
  return (ttm / price) * 100
}

function cagr(annual: Annual[], years: number): number | null {
  if (annual.length < years + 1) return null
  const tail = annual.slice(-years - 1)
  const start = tail[0].total
  const end = tail[tail.length - 1].total
  if (start <= 0) return null
  return (Math.pow(end / start, 1 / years) - 1) * 100
}

async function fetchPrice(symbol: string): Promise<number | null> {
  if (!FMP) return null
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/api/v3/quote-short/${encodeURIComponent(symbol)}?apikey=${FMP}`,
      { next: { revalidate: 600 } },
    )
    if (!r.ok) return null
    const j = (await r.json()) as Array<{ price?: number }>
    return j?.[0]?.price ?? null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') || '').trim().toUpperCase()
  if (!symbol) return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 })
  if (!FMP) return NextResponse.json({ ok: false, error: 'FMP_API_KEY not configured' }, { status: 503 })

  const key = `div:${symbol}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.payload, { headers: { 'x-cache': 'hit' } })
  }

  let raw: FmpDividendsResponse
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/${encodeURIComponent(symbol)}?apikey=${FMP}`,
      { next: { revalidate: 21600 } },
    )
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `FMP HTTP ${r.status}`, source: 'fmp', symbol },
        { status: r.status },
      )
    }
    raw = (await r.json()) as FmpDividendsResponse
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'fetch failed', source: 'fmp', symbol },
      { status: 502 },
    )
  }

  const rows: SlimDividend[] = (raw.historical || [])
    .map(d => ({
      exDate: d.date,
      paymentDate: d.paymentDate || null,
      recordDate: d.recordDate || null,
      declarationDate: d.declarationDate || null,
      amount: typeof d.dividend === 'number' ? d.dividend : 0,
      adjAmount: typeof d.adjDividend === 'number' ? d.adjDividend : (d.dividend || 0),
    }))
    .filter(r => r.exDate)
    .sort((a, b) => (a.exDate < b.exDate ? 1 : -1))

  if (rows.length === 0) {
    const empty = {
      ok: true as const,
      source: 'fmp' as const,
      symbol,
      paysDividend: false,
      ttm: 0,
      yieldPct: null,
      growth: { y3: null, y5: null, y10: null },
      annual: [] as Annual[],
      recent: [] as SlimDividend[],
      currentPrice: null as number | null,
    }
    cache.set(key, { at: Date.now(), payload: empty })
    return NextResponse.json(empty)
  }

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const ttm = rows
    .filter(r => new Date(r.exDate) >= oneYearAgo)
    .reduce((s, r) => s + (r.adjAmount || r.amount || 0), 0)

  const annual = annualize(rows)
  const price = await fetchPrice(symbol)

  const payload = {
    ok: true as const,
    source: 'fmp' as const,
    symbol,
    paysDividend: true,
    ttm,
    yieldPct: yieldPctFromTtm(ttm, price),
    currentPrice: price,
    growth: {
      y3: cagr(annual, 3),
      y5: cagr(annual, 5),
      y10: cagr(annual, 10),
    },
    annual: annual.slice(-15),
    recent: rows.slice(0, 12),
  }
  cache.set(key, { at: Date.now(), payload })
  return NextResponse.json(payload)
}
