import { NextRequest, NextResponse } from 'next/server'
const FRED    = process.env.FRED_API_KEY
const FINNHUB = process.env.FINNHUB_API_KEY

// Key FRED series
const FRED_SERIES: Record<string, { id: string; label: string; unit: string; description: string }> = {
  fed_rate:    { id: 'FEDFUNDS',     label: 'Fed Funds Rate',       unit: '%',  description: 'Federal funds effective rate' },
  cpi:         { id: 'CPIAUCSL',     label: 'CPI (All Items)',      unit: 'idx',description: 'Consumer Price Index, All Urban Consumers' },
  core_cpi:    { id: 'CPILFESL',     label: 'Core CPI',             unit: 'idx',description: 'CPI excluding food and energy' },
  pce:         { id: 'PCE',          label: 'PCE',                  unit: 'B$', description: 'Personal Consumption Expenditures' },
  core_pce:    { id: 'PCEPILFE',     label: 'Core PCE Deflator',    unit: 'idx',description: 'PCE Price Index ex food/energy' },
  gdp:         { id: 'GDP',          label: 'GDP',                  unit: 'B$', description: 'Gross Domestic Product' },
  gdp_growth:  { id: 'A191RL1Q225SBEA', label: 'Real GDP Growth',  unit: '%',  description: 'Real GDP percent change, quarterly' },
  unemployment:{ id: 'UNRATE',       label: 'Unemployment Rate',    unit: '%',  description: 'Civilian unemployment rate' },
  payrolls:    { id: 'PAYEMS',       label: 'Nonfarm Payrolls',     unit: 'K',  description: 'Total nonfarm payrolls' },
  yield_10y:   { id: 'GS10',         label: '10Y Treasury Yield',   unit: '%',  description: '10-year constant maturity rate' },
  yield_2y:    { id: 'GS2',          label: '2Y Treasury Yield',    unit: '%',  description: '2-year constant maturity rate' },
  yield_30y:   { id: 'GS30',         label: '30Y Treasury Yield',   unit: '%',  description: '30-year constant maturity rate' },
  spread_10_2: { id: 'T10Y2Y',       label: '10Y-2Y Spread',        unit: 'bps',description: '10-year minus 2-year yield spread' },
  m2:          { id: 'M2SL',         label: 'M2 Money Supply',      unit: 'B$', description: 'M2 money stock' },
  housing:     { id: 'HOUST',        label: 'Housing Starts',       unit: 'K',  description: 'Total housing starts' },
  retail_sales:{ id: 'RSXFS',        label: 'Retail Sales ex-auto', unit: 'M$', description: 'Retail & food services, ex auto' },
  vix:         { id: 'VIXCLS',       label: 'VIX',                  unit: 'pts',description: 'CBOE Volatility Index' },
  dxy:         { id: 'DTWEXBGS',     label: 'USD Index (DXY proxy)',unit: 'idx',description: 'Trade-weighted USD index broad' },
}

async function fetchFredSeries(seriesId: string, limit = 12): Promise<{ date: string; value: number }[]> {
  const res = await fetch(
    `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED}&file_type=json&sort_order=desc&limit=${limit}`
  )
  const data = await res.json()
  return (data.observations || [])
    .filter((o: any) => o.value !== '.')
    .map((o: any) => ({ date: o.date, value: parseFloat(o.value) }))
    .reverse()
}

export async function GET(req: NextRequest) {
  const series  = req.nextUrl.searchParams.get('series') || 'dashboard'
  const limit   = parseInt(req.nextUrl.searchParams.get('limit') || '12')

  if (series === 'dashboard') {
    // Return latest value for key indicators
    const keys = ['fed_rate','cpi','core_pce','gdp_growth','unemployment','yield_10y','yield_2y','spread_10_2','vix']
    try {
      const results = await Promise.allSettled(
        keys.map(async k => {
          const def = FRED_SERIES[k]
          const obs = await fetchFredSeries(def.id, 2)
          const latest  = obs[obs.length - 1]
          const previous = obs[obs.length - 2]
          const change = previous ? latest.value - previous.value : 0
          return { key: k, ...def, latest, previous, change }
        })
      )
      const data = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<any>).value)
      return NextResponse.json({ indicators: data })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  if (series === 'yield_curve') {
    try {
      const maturities = [
        { label: '3M', id: 'TB3MS' }, { label: '6M', id: 'TB6MS' },
        { label: '1Y', id: 'GS1' },   { label: '2Y', id: 'GS2' },
        { label: '3Y', id: 'GS3' },   { label: '5Y', id: 'GS5' },
        { label: '7Y', id: 'GS7' },   { label: '10Y', id: 'GS10' },
        { label: '20Y', id: 'GS20' }, { label: '30Y', id: 'GS30' },
      ]
      const results = await Promise.all(
        maturities.map(async m => {
          const obs = await fetchFredSeries(m.id, 1)
          return { maturity: m.label, yield: obs[0]?.value || null }
        })
      )
      return NextResponse.json({ curve: results })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // Single series history
  const def = FRED_SERIES[series]
  if (!def) return NextResponse.json({ error: 'Unknown series' }, { status: 400 })
  try {
    const observations = await fetchFredSeries(def.id, limit)
    return NextResponse.json({ series: def, observations })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
