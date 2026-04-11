import { NextRequest, NextResponse } from 'next/server'

const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api
const FMP   = process.env.FMP_API_KEY
const FRED  = process.env.FRED_API_KEY

// ── FRED indicator → series ID map ───────────────────────────────────────────
const FRED_MAP: Record<string, string> = {
  GDP_GROWTH_RATE:        'A191RL1Q225SBEA',
  INFLATION_RATE:         'CPIAUCSL',
  UNEMPLOYMENT_RATE:      'UNRATE',
  INTEREST_RATE:          'FEDFUNDS',
  RETAIL_SALES:           'RSAFS',
  INDUSTRIAL_PRODUCTION:  'INDPRO',
  CONSUMER_CONFIDENCE:    'UMCSENT',
  HOUSING_STARTS:         'HOUST',
  NONFARM_PAYROLLS:       'PAYEMS',
  M2_MONEY_SUPPLY:        'M2SL',
  YIELD_10Y:              'GS10',
  YIELD_2Y:               'GS2',
  YIELD_SPREAD:           'T10Y2Y',
  PCE_INFLATION:          'PCEPI',
  CREDIT_SPREAD_HY:       'BAMLH0A0HYM2',
}

// ── EODHD indicator map ──────────────────────────────────────────────────────
const EODHD_MAP: Record<string, string> = {
  GDP_GROWTH_RATE:    'real_gdp_growth',
  INFLATION_RATE:     'inflation_consumer_prices_annual',
  UNEMPLOYMENT_RATE:  'unemployment',
  INTEREST_RATE:      'real_interest_rate',
  RETAIL_SALES:       'retail_trade',
  CURRENT_ACCOUNT:    'current_account_balance',
  POPULATION:         'population',
}

// ── FMP Economic Indicators ───────────────────────────────────────────────────
const FMP_INDICATORS = [
  'GDP', 'realGDP', 'nominalPotentialGDP', 'realGDPPerCapita',
  'federalFunds', 'CPI', 'inflationRate', 'inflation',
  'retailSales', 'consumerSentiment', 'durableGoods',
  'unemploymentRate', 'totalNonfarmPayroll',
  'initialJoblessClaims', 'industrialProductionTotalIndex',
  'newPrivatelyOwnedHousingUnitsStartedTotalUnits',
  'totalVehicleSales', 'retailMoneyFunds',
  'smoothedUSRecessionProbabilities', 'jp10yrBondYield',
  'uk30YearBondYield', 'us30YearBondYield',
  'us10YearTreasuryRate', 'us1MonthTreasuryRate', 'us3MonthsTreasuryRate',
  'longTermDebtToCapitalizationRatio',
]

export async function GET(req: NextRequest) {
  const country   = req.nextUrl.searchParams.get('country')   || 'US'
  const indicator = req.nextUrl.searchParams.get('indicator') || 'GDP_GROWTH_RATE'
  const periods   = parseInt(req.nextUrl.searchParams.get('periods') || '20', 10)
  const all       = req.nextUrl.searchParams.get('all') === 'true'

  // ── ALL mode: return dashboard snapshot ──────────────────────────────────
  if (all && FMP) {
    try {
      const snapshotIndicators = ['realGDP','federalFunds','CPI','unemploymentRate','retailSales','consumerSentiment','us10YearTreasuryRate']
      const results = await Promise.allSettled(
        snapshotIndicators.map(ind =>
          fetch(`https://financialmodelingprep.com/stable/economic-indicators?name=${ind}&apikey=${FMP}`)
            .then(r => r.json())
            .then((data: any[]) => ({ indicator: ind, latest: Array.isArray(data) ? data[0] : null, history: (Array.isArray(data) ? data : []).slice(0, 8) }))
        )
      )
      const snapshot = Object.fromEntries(
        results.map((r, i) => [snapshotIndicators[i], r.status === 'fulfilled' ? r.value : null])
      )
      return NextResponse.json({ source: 'fmp', snapshot })
    } catch (e) { console.error('FMP macro snapshot failed:', e) }
  }

  // ── Single indicator ──────────────────────────────────────────────────────
  // Try FRED first (most authoritative for US macro)
  if (FRED && country === 'US' && FRED_MAP[indicator]) {
    try {
      const seriesId = FRED_MAP[indicator]
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED}&file_type=json&sort_order=desc&limit=${periods}`
      const res  = await fetch(url, { next: { revalidate: 3600 } })
      const data = await res.json()
      const history = (data.observations || [])
        .filter((d: any) => d.value !== '.')
        .map((d: any) => ({ date: d.date, value: parseFloat(d.value) }))
        .reverse()
      if (history.length > 0) return NextResponse.json({ country, indicator, history, source: 'fred', seriesId })
    } catch (e) { console.error('FRED failed:', e) }
  }

  // Try FMP economic indicators
  if (FMP) {
    // Map our indicator key to FMP name
    const fmpNames: Record<string, string> = {
      GDP_GROWTH_RATE: 'realGDP', INFLATION_RATE: 'CPI', UNEMPLOYMENT_RATE: 'unemploymentRate',
      INTEREST_RATE: 'federalFunds', RETAIL_SALES: 'retailSales', CONSUMER_CONFIDENCE: 'consumerSentiment',
      YIELD_10Y: 'us10YearTreasuryRate', YIELD_2Y: 'us3MonthsTreasuryRate',
    }
    const fmpName = fmpNames[indicator]
    if (fmpName) {
      try {
        const res = await fetch(`https://financialmodelingprep.com/stable/economic-indicators?name=${fmpName}&apikey=${FMP}`, { next: { revalidate: 3600 } })
        const data = await res.json()
        const history = (Array.isArray(data) ? data : []).slice(0, periods).map((d: any) => ({ date: d.date, value: d.value })).reverse()
        if (history.length > 0) return NextResponse.json({ country, indicator, history, source: 'fmp', fmpName })
      } catch (e) { console.error('FMP economic indicators failed:', e) }
    }
  }

  // Fallback: EODHD
  if (EODHD) {
    try {
      const eodIndicator = EODHD_MAP[indicator] || indicator.toLowerCase()
      const res  = await fetch(`https://eodhd.com/api/macro-indicator/${country}?api_token=${EODHD}&indicator=${eodIndicator}&fmt=json`, { next: { revalidate: 3600 } })
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        const history = data.filter((d: any) => d.value !== null).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-periods)
        return NextResponse.json({ country, indicator, history, source: 'eodhd' })
      }
    } catch (e) { console.error('EODHD macro failed:', e) }
  }

  return NextResponse.json({ country, indicator, history: [], error: 'No data available from any source' })
}

// ── POST: bulk indicator fetch for dashboard ─────────────────────────────────
export async function POST(req: NextRequest) {
  const { indicators = [], country = 'US' } = await req.json()
  const results = await Promise.allSettled(
    indicators.map((ind: string) =>
      fetch(`${req.nextUrl.origin}/api/macro?indicator=${ind}&country=${country}&periods=12`).then(r => r.json())
    )
  )
  const data = Object.fromEntries(
    indicators.map((ind: string, i: number) => [ind, results[i].status === 'fulfilled' ? (results[i] as any).value : null])
  )
  return NextResponse.json(data)
}
