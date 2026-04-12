import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, massiveSMA, massiveEMA, massiveRSI, massiveMACD } from '@/lib/data-providers'

export async function GET(req: NextRequest) {
  const p        = req.nextUrl.searchParams
  const symbol   = p.get('symbol')?.toUpperCase()
  const indicator= p.get('indicator') || 'sma' // sma | ema | rsi | macd
  const window   = parseInt(p.get('window') || '50')
  const timespan = p.get('timespan') || 'day'

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  if (!PROVIDERS.massive) {
    return NextResponse.json({ error: 'Technical indicators require Massive (Polygon) API key' }, { status: 503 })
  }

  try {
    let values = null
    if (indicator === 'sma')  values = await massiveSMA(symbol, window, timespan)
    if (indicator === 'ema')  values = await massiveEMA(symbol, window, timespan)
    if (indicator === 'rsi')  values = await massiveRSI(symbol, window, timespan)
    if (indicator === 'macd') values = await massiveMACD(symbol, timespan)

    return NextResponse.json({ symbol, indicator, window, timespan, values, source: 'massive' })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
