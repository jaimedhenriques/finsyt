import { NextResponse } from 'next/server'
import { getTreasuryCurve, getAggregateSpreads } from '@/lib/fixed-income'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [curve, spreads] = await Promise.all([
      getTreasuryCurve(),
      getAggregateSpreads(60),
    ])
    return NextResponse.json({
      curve: curve.points,
      curveSource: curve.source,
      ig: spreads.ig,
      hy: spreads.hy,
      igLatestBps: spreads.igLatestBps,
      hyLatestBps: spreads.hyLatestBps,
      spreadsSource: spreads.source,
      generatedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
