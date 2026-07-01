/**
 * Public intelligence API — /api/v1/intelligence/[domain]
 * ─────────────────────────────────────────────────────────
 * Domains: geopolitical | sanctions | trade-flows | cyber | news-brief
 *
 * Auth: Finsyt API key required (Bearer or X-Api-Key header).
 * Rate limiting: inherits the standard /api/v1 gateway limits.
 */
import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiRequest } from '@/lib/api-key-auth'
import { getGeopoliticalRisk, getGeopoliticalRiskMulti } from '@/lib/intelligence/geopolitical'
import { screenSanctions } from '@/lib/intelligence/sanctions'
import { getTradeFlows } from '@/lib/intelligence/trade-flows'
import { getCyberThreats } from '@/lib/intelligence/cyber'
import { getNewsBrief } from '@/lib/intelligence/news-intelligence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const auth = await authenticateApiRequest(req)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const { domain } = await params
  const { searchParams } = new URL(req.url)

  try {
    switch (domain) {
      case 'geopolitical': {
        const iso = searchParams.get('iso') || searchParams.get('country') || 'US'
        const multi = searchParams.get('multi')
        if (multi) {
          const codes = multi.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 10)
          const results = await getGeopoliticalRiskMulti(codes)
          return NextResponse.json({ results, source: 'World Bank WGI / GDELT' })
        }
        return NextResponse.json(await getGeopoliticalRisk(iso))
      }

      case 'sanctions': {
        const entity = searchParams.get('entity') || searchParams.get('name') || searchParams.get('q') || ''
        if (!entity.trim()) return NextResponse.json({ error: 'entity parameter required' }, { status: 400 })
        return NextResponse.json(await screenSanctions(entity))
      }

      case 'trade-flows': {
        const reporterIso = searchParams.get('country') || searchParams.get('reporter') || 'US'
        const commodity   = searchParams.get('commodity') || 'semiconductors'
        const partnerIso  = searchParams.get('partner') || undefined
        return NextResponse.json(await getTradeFlows({ reporterIso, commodity, partnerIso }))
      }

      case 'cyber': {
        const ticker      = searchParams.get('ticker') || searchParams.get('symbol') || undefined
        const companyName = searchParams.get('company') || searchParams.get('name') || undefined
        const sector      = searchParams.get('sector') || undefined
        return NextResponse.json(await getCyberThreats({ ticker, companyName, sector }))
      }

      case 'news-brief': {
        const ticker      = searchParams.get('ticker') || searchParams.get('symbol') || undefined
        const companyName = searchParams.get('company') || searchParams.get('name') || undefined
        const topic       = searchParams.get('topic') || undefined
        const country     = searchParams.get('country') || undefined
        return NextResponse.json(await getNewsBrief({ ticker, companyName, topic, country }))
      }

      default:
        return NextResponse.json({
          error: `Unknown domain "${domain}". Valid: geopolitical, sanctions, trade-flows, cyber, news-brief`,
        }, { status: 404 })
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
