import { NextRequest, NextResponse } from 'next/server'
import { getTradeFlows } from '@/lib/intelligence/trade-flows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const reporterIso = searchParams.get('country') || searchParams.get('reporter') || 'US'
  const commodity   = searchParams.get('commodity') || 'semiconductors'
  const partnerIso  = searchParams.get('partner') || undefined

  try {
    const result = await getTradeFlows({ reporterIso, commodity, partnerIso })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({
      unavailable: true,
      unavailableReason: (err as Error).message,
      source: 'UN Comtrade / World Bank Trade',
    }, { status: 503 })
  }
}
