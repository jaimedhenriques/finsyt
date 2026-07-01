import { NextRequest, NextResponse } from 'next/server'
import { getInstrumentDetail } from '@/lib/fixed-income'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const symbol = sp.get('symbol')?.trim().toUpperCase()
  const id = sp.get('id')?.trim()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 })
  }
  try {
    const detail = await getInstrumentDetail(symbol, id)
    if (!detail.instrument) {
      return NextResponse.json({ error: 'instrument not found', ...detail }, { status: 404 })
    }
    return NextResponse.json(detail)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
