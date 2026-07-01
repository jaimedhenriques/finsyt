import { NextRequest, NextResponse } from 'next/server'
import { getCreditSpreads } from '@/lib/rates-desk'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const raw = parseInt(req.nextUrl.searchParams.get('periods') || '365', 10)
  const periods = Number.isFinite(raw) ? Math.min(Math.max(raw, 30), 3650) : 365
  try {
    const data = await getCreditSpreads(periods)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { latest: [], history: [], differential: null, source: 'none', error: (e as Error).message },
      { status: 200 },
    )
  }
}
