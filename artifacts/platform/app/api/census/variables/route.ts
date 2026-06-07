import { NextRequest, NextResponse } from 'next/server'
import { censusListVariables, CensusApiError } from '@/lib/census-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/census/variables
 *  ?dataset=acs/acs5      (required)
 *  ?vintage=2022          (required)
 *  ?group=B19013          optional — restrict to one variable group
 *  ?q=median household    optional fuzzy filter on label/concept
 *  ?limit=200             default 200
 *
 * Variables are the actual data columns (e.g. B19013_001E = "Estimate!!Median
 * household income in the past 12 months").
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const dataset = sp.get('dataset') || ''
  const vintage = Number(sp.get('vintage') || '0')
  const group = sp.get('group') || undefined
  const q = sp.get('q') || undefined
  const limit = Math.min(Number(sp.get('limit') || '200'), 2000)

  if (!dataset || !vintage) {
    return NextResponse.json({
      error: 'missing required params',
      required: ['dataset', 'vintage'],
      example: '/api/census/variables?dataset=acs/acs5&vintage=2022&group=B19013',
    }, { status: 400 })
  }

  try {
    const vars = await censusListVariables(vintage, dataset, { group, q, limit })
    return NextResponse.json({
      source: 'census',
      dataset,
      vintage,
      count: vars.length,
      variables: vars,
    })
  } catch (e) {
    const status = e instanceof CensusApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'census' }, { status })
  }
}
