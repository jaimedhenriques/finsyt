import { NextRequest, NextResponse } from 'next/server'
import { getYieldCurve } from '@/lib/rates-desk'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  try {
    const curve = await getYieldCurve(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null)
    return NextResponse.json(curve)
  } catch (e) {
    return NextResponse.json(
      { date: date || null, asOf: null, points: [], spreads: [], source: 'none', error: (e as Error).message },
      { status: 200 },
    )
  }
}
