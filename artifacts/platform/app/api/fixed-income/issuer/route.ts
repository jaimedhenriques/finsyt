import { NextRequest, NextResponse } from 'next/server'
import { getIssuerCredit } from '@/lib/fixed-income'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const symbol = sp.get('symbol')?.trim().toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 })
  }
  try {
    const issuer = await getIssuerCredit(symbol, {
      name: sp.get('name') || undefined,
      sector: sp.get('sector') || undefined,
    })
    return NextResponse.json(issuer)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
