import { NextRequest, NextResponse } from 'next/server'
const AV = process.env.ALPHA_VANTAGE_KEY
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  try {
    const [qr, or] = await Promise.all([
      fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${AV}`),
      fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${AV}`),
    ])
    const [q, o] = await Promise.all([qr.json(), or.json()])
    const gq = q['Global Quote'] || {}
    if (!gq['01. symbol']) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const price = parseFloat(gq['05. price'] || '0')
    const prev = parseFloat(gq['08. previous close'] || '0')
    const change = price - prev
    return NextResponse.json({
      symbol: gq['01. symbol'], price, change: parseFloat(change.toFixed(2)),
      changePct: parseFloat(prev ? ((change/prev)*100).toFixed(2) : '0'),
      open: parseFloat(gq['02. open']||'0'), high: parseFloat(gq['03. high']||'0'),
      low: parseFloat(gq['04. low']||'0'), volume: parseInt(gq['06. volume']||'0'),
      prevClose: prev, latestDay: gq['07. latest trading day'],
      name: o['Name']||symbol, sector: o['Sector']||'', industry: o['Industry']||'',
      marketCap: parseFloat(o['MarketCapitalization']||'0'), pe: parseFloat(o['PERatio']||'0'),
      eps: parseFloat(o['EPS']||'0'), week52High: parseFloat(o['52WeekHigh']||'0'),
      week52Low: parseFloat(o['52WeekLow']||'0'), description: o['Description']||'',
      exchange: o['Exchange']||'', currency: o['Currency']||'USD',
      dividendYield: parseFloat(o['DividendYield']||'0'), beta: parseFloat(o['Beta']||'0'),
      priceToBook: parseFloat(o['PriceToBookRatio']||'0'), evToEbitda: parseFloat(o['EVToEBITDA']||'0'),
      profitMargin: parseFloat(o['ProfitMargin']||'0'), operatingMargin: parseFloat(o['OperatingMarginTTM']||'0'),
      returnOnEquity: parseFloat(o['ReturnOnEquityTTM']||'0'), analystTarget: parseFloat(o['AnalystTargetPrice']||'0'),
      forwardPE: parseFloat(o['ForwardPE']||'0'), pegRatio: parseFloat(o['PEGRatio']||'0'),
      sharesOutstanding: parseFloat(o['SharesOutstanding']||'0'), revenuePerShare: parseFloat(o['RevenuePerShareTTM']||'0'),
    })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
