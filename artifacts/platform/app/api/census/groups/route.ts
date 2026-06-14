import { NextRequest, NextResponse } from 'next/server'
import { censusListGroups, CensusApiError } from '@/lib/census-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/census/groups  (a.k.a. table search)
 *  ?dataset=acs/acs5     (required)
 *  ?vintage=2022         (required)
 *  ?q=income             optional fuzzy filter on table description
 *  ?limit=50             default 100
 *
 * Census variable groups ≈ "tables". Each group rolls up many variables
 * (e.g. group B19013 = "Median Household Income in the Past 12 Months").
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const dataset = sp.get('dataset') || ''
  const vintage = Number(sp.get('vintage') || '0')
  const q = sp.get('q') || undefined
  const limit = Math.min(Number(sp.get('limit') || '100'), 1000)

  if (!dataset || !vintage) {
    return NextResponse.json({
      error: 'missing required params',
      required: ['dataset', 'vintage'],
      example: '/api/census/groups?dataset=acs/acs5&vintage=2022&q=income',
    }, { status: 400 })
  }

  try {
    const groups = await censusListGroups(vintage, dataset, { q, limit })
    return NextResponse.json({
      source: 'census',
      dataset,
      vintage,
      count: groups.length,
      groups,
    })
  } catch (e) {
    const status = e instanceof CensusApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'census' }, { status })
  }
}
