import { NextResponse } from 'next/server'
import { censusFetchAggregate, CensusApiError } from '@/lib/census-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/census/us-demographics
 *
 * Returns a multi-vintage US demographic time series sourced from ACS5:
 *   - medianHouseholdIncome  (B19013_001E)
 *   - population             (B01003_001E)
 *   - unemploymentRate       100 * B23025_005E / B23025_002E
 *
 * Server-side cache: 24h (per-vintage, single shared in-memory cache).
 */

interface UsDemoPoint {
  year: number
  medianIncome: number | null
  population: number | null
  unemploymentRate: number | null
}

interface CachedPayload {
  source: 'census'
  dataset: string
  vintages: number[]
  series: UsDemoPoint[]
  fetchedAt: string
}

const VINTAGES = [2017, 2018, 2019, 2020, 2021, 2022, 2023]
const TTL_MS = 24 * 60 * 60 * 1000

let _cache: { at: number; payload: CachedPayload } | null = null
let _inflight: Promise<CachedPayload> | null = null

async function fetchVintage(year: number): Promise<UsDemoPoint> {
  try {
    const res = await censusFetchAggregate({
      dataset: 'acs/acs5',
      vintage: year,
      get: ['NAME', 'B19013_001E', 'B01003_001E', 'B23025_002E', 'B23025_005E'],
      for: 'us:1',
    })
    const row = res.rows[0] || {}
    const income = Number(row['B19013_001E'])
    const pop = Number(row['B01003_001E'])
    const labor = Number(row['B23025_002E'])
    const unemp = Number(row['B23025_005E'])
    return {
      year,
      medianIncome: isFinite(income) && income > 0 ? income : null,
      population: isFinite(pop) && pop > 0 ? pop : null,
      unemploymentRate: isFinite(labor) && labor > 0 && isFinite(unemp) ? +(100 * unemp / labor).toFixed(2) : null,
    }
  } catch {
    return { year, medianIncome: null, population: null, unemploymentRate: null }
  }
}

async function buildPayload(): Promise<CachedPayload> {
  const series = await Promise.all(VINTAGES.map(fetchVintage))
  return {
    source: 'census',
    dataset: 'acs/acs5',
    vintages: VINTAGES,
    series,
    fetchedAt: new Date().toISOString(),
  }
}

export async function GET() {
  try {
    if (_cache && Date.now() - _cache.at < TTL_MS) {
      return NextResponse.json({ ...(_cache.payload), cache: 'hit' })
    }
    if (!_inflight) {
      _inflight = buildPayload().then(p => {
        _cache = { at: Date.now(), payload: p }
        return p
      }).finally(() => { _inflight = null })
    }
    const payload = await _inflight
    return NextResponse.json({ ...payload, cache: 'miss' })
  } catch (e) {
    const status = e instanceof CensusApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'census' }, { status })
  }
}
