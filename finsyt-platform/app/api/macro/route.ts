import { NextRequest, NextResponse } from 'next/server'

const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api

// Key macro indicators available from EODHD
const INDICATORS = {
  gdp:           'GDP_USD',
  gdp_growth:    'GDP_GROWTH_RATE',
  inflation:     'INFLATION_CPI_YOY',
  cpi:           'CPI_INDEX',
  unemployment:  'UNEMPLOYMENT_RATE',
  interest_rate: 'REAL_INTEREST_RATE',
  trade_balance: 'TRADE_BALANCE',
  current_account: 'CURRENT_ACCOUNT_TO_GDP',
  debt_to_gdp:   'GOVERNMENT_DEBT_TO_GDP',
  budget_deficit:'GOVERNMENT_BUDGET_VALUE',
  manufacturing: 'MANUFACTURING_PMI',
  services_pmi:  'SERVICES_PMI',
  consumer_confidence: 'CONSUMER_CONFIDENCE',
  retail_sales:  'RETAIL_SALES_YOY',
  housing_starts:'HOUSING_STARTS',
  industrial:    'INDUSTRIAL_PRODUCTION',
}

export async function GET(req: NextRequest) {
  const country   = req.nextUrl.searchParams.get('country') || 'US'
  const indicator = req.nextUrl.searchParams.get('indicator') || 'gdp'
  const all       = req.nextUrl.searchParams.get('all') === 'true'

  if (!EODHD) return NextResponse.json({ error: 'EODHD_API_KEY not configured' }, { status: 500 })

  if (all) {
    // Fetch top 6 macro indicators for dashboard overview
    const keys = ['gdp_growth', 'inflation', 'unemployment', 'interest_rate', 'manufacturing', 'consumer_confidence']
    const results = await Promise.allSettled(
      keys.map(async (key) => {
        const ind = INDICATORS[key as keyof typeof INDICATORS]
        const res = await fetch(
          `https://eodhd.com/api/macro-indicator/${country}?api_token=${EODHD}&indicator=${ind}&fmt=json`,
          { next: { revalidate: 3600 } }
        )
        const data = await res.json()
        const latest = Array.isArray(data) ? data[data.length - 1] : null
        return { key, indicator: ind, latest, history: Array.isArray(data) ? data.slice(-24) : [] }
      })
    )
    return NextResponse.json({
      country,
      indicators: results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { key: keys[i], error: true }
      ),
      source: 'eodhd',
    })
  }

  const ind = INDICATORS[indicator as keyof typeof INDICATORS] || indicator
  try {
    const res = await fetch(
      `https://eodhd.com/api/macro-indicator/${country}?api_token=${EODHD}&indicator=${ind}&fmt=json`,
      { next: { revalidate: 3600 } }
    )
    const data = await res.json()
    return NextResponse.json({ country, indicator: ind, data, source: 'eodhd' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
