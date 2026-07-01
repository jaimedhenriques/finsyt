import { NextResponse, type NextRequest } from 'next/server'
import { getGeopoliticalEvents } from '@/lib/geopolitical-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Read-only geopolitical risk & events feed (Task #400) built on the public,
// keyless GDELT DOC 2.0 API. No proprietary feeds, no predictive scoring.
// Usage:
//   /api/geopolitical-events                       → recent global events
//   /api/geopolitical-events?region=US             → events for a country (ISO-2/FIPS/name)
//   /api/geopolitical-events?category=conflict     → category filter
//   /api/geopolitical-events?severity=high         → severity floor
//   /api/geopolitical-events?q=sanctions           → keyword filter
//   /api/geopolitical-events?timespan=3d           → look-back window
// Every response carries a `source` attribution field ("GDELT").

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const region = (sp.get('region') || '').trim()
  const category = (sp.get('category') || '').trim()
  const severity = (sp.get('severity') || '').trim()
  const timespan = (sp.get('timespan') || '').trim()
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '30', 10) || 30, 1), 100)

  try {
    const result = await getGeopoliticalEvents({ q, region, category, severity, timespan, limit })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[api/geopolitical-events] failed:', message)
    return NextResponse.json({
      events: [],
      source: 'none',
      count: 0,
      region: region || null,
      regionName: null,
      categoryCounts: { conflict: 0, political: 0, disaster: 0, economic: 0, geopolitical: 0 },
      providerError: message,
      fetchedAt: new Date().toISOString(),
    })
  }
}
