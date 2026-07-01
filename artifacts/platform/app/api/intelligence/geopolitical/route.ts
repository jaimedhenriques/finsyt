import { NextRequest, NextResponse } from 'next/server'
import { getGeopoliticalRisk, getGeopoliticalRiskMulti } from '@/lib/intelligence/geopolitical'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const iso = searchParams.get('iso') || searchParams.get('country') || 'US'
  const multi = searchParams.get('multi')

  try {
    if (multi) {
      const codes = multi.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 10)
      const results = await getGeopoliticalRiskMulti(codes)
      return NextResponse.json({ results, source: 'World Bank WGI / GDELT' })
    }
    const result = await getGeopoliticalRisk(iso)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({
      unavailable: true,
      unavailableReason: (err as Error).message,
      source: 'World Bank WGI / GDELT',
    }, { status: 503 })
  }
}
