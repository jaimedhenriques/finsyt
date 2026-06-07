import { NextResponse } from 'next/server'
import { censusFetchAggregate, CensusApiError } from '@/lib/census-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/census/state-incomes
 *
 * Returns one row per US state + DC + PR with:
 *   stateFips, postalCode, name, medianHouseholdIncome, population
 *
 * Single ACS5 (vintage 2022) call: get=NAME,B19013_001E,B01003_001E&for=state:*
 * Server-side cache: 24h.
 */

interface StateIncomeRow {
  stateFips: string
  postalCode: string
  name: string
  medianIncome: number | null
  population: number | null
}

const TTL_MS = 24 * 60 * 60 * 1000
let _cache: { at: number; rows: StateIncomeRow[] } | null = null
let _inflight: Promise<StateIncomeRow[]> | null = null

const FIPS_TO_USPS: Record<string, string> = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL',
  '13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME',
  '24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH',
  '34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI',
  '56':'WY','72':'PR',
}

async function buildRows(): Promise<StateIncomeRow[]> {
  const res = await censusFetchAggregate({
    dataset: 'acs/acs5',
    vintage: 2022,
    get: ['NAME', 'B19013_001E', 'B01003_001E'],
    for: 'state:*',
  })
  return res.rows
    .map(r => {
      const fips = String(r['state'] || '').padStart(2, '0')
      const inc = Number(r['B19013_001E'])
      const pop = Number(r['B01003_001E'])
      return {
        stateFips: fips,
        postalCode: FIPS_TO_USPS[fips] || '',
        name: r['NAME'] || '',
        medianIncome: isFinite(inc) && inc > 0 ? inc : null,
        population: isFinite(pop) && pop > 0 ? pop : null,
      }
    })
    .filter(r => r.postalCode) // drop territories without USPS code
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function GET() {
  try {
    if (_cache && Date.now() - _cache.at < TTL_MS) {
      return NextResponse.json({ source: 'census', dataset: 'acs/acs5', vintage: 2022, rows: _cache.rows, cache: 'hit' })
    }
    if (!_inflight) {
      _inflight = buildRows().then(rows => {
        _cache = { at: Date.now(), rows }
        return rows
      }).finally(() => { _inflight = null })
    }
    const rows = await _inflight
    return NextResponse.json({ source: 'census', dataset: 'acs/acs5', vintage: 2022, rows, cache: 'miss' })
  } catch (e) {
    const status = e instanceof CensusApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'census' }, { status })
  }
}
