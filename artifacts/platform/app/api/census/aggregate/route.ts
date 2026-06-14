import { NextRequest, NextResponse } from 'next/server'
import { censusFetchAggregate, CensusApiError } from '@/lib/census-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/census/aggregate
 *  ?dataset=acs/acs5         (required) path after /data/{vintage}
 *  ?vintage=2022             (required) year
 *  ?get=NAME,B19013_001E     (required) comma-separated variables
 *  ?for=county:*             (required if no ucgid) FIPS clause, e.g. "county:*", "state:48"
 *  ?in=state:48              optional parent geography (or multiple, space-joined)
 *  ?ucgid=                   alternative to for/in (Uniform Census Geography ID)
 *
 * Examples:
 *   /api/census/aggregate?dataset=acs/acs5&vintage=2022&get=NAME,B19013_001E&for=county:*&in=state:48
 *   /api/census/aggregate?dataset=acs/acs5&vintage=2022&get=NAME,B01003_001E&for=state:*
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const dataset = sp.get('dataset') || ''
  const vintage = Number(sp.get('vintage') || '0')
  const getList = (sp.get('get') || '').split(',').map(s => s.trim()).filter(Boolean)
  const forClause = sp.get('for') || ''
  const inClause = sp.get('in') || undefined
  const ucgid = sp.get('ucgid') || undefined

  if (!dataset || !vintage || !getList.length || (!forClause && !ucgid)) {
    return NextResponse.json({
      error: 'missing required params',
      required: ['dataset', 'vintage', 'get', 'for OR ucgid'],
      example: '/api/census/aggregate?dataset=acs/acs5&vintage=2022&get=NAME,B19013_001E&for=county:*&in=state:48',
    }, { status: 400 })
  }

  try {
    const data = await censusFetchAggregate({
      dataset,
      vintage,
      get: getList,
      for: forClause,
      in: inClause,
      ucgid,
    })
    return NextResponse.json(data)
  } catch (e) {
    const status = e instanceof CensusApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'census' }, { status })
  }
}
