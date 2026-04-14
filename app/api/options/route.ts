import { NextRequest, NextResponse } from 'next/server'
import { massiveOptionsChain } from '@/lib/data-providers'

const FMP = process.env.FMP_API_KEY || ''

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const symbol = sp.get('symbol')?.toUpperCase()
  const expiry = sp.get('expiry')   // YYYY-MM-DD filter
  const type   = sp.get('type')     // call | put | all (default: all)
  const limit  = parseInt(sp.get('limit') || '100')

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    // Primary: Polygon options chain
    const raw = await massiveOptionsChain(symbol)
    if (raw && Array.isArray(raw)) {
      let chain = raw.map((r: any) => {
        const d = r.details || {}
        const g = r.greeks || {}
        const q = r.day || {}
        return {
          contractType:     d.contract_type || r.type,
          expiry:           d.expiration_date,
          strike:           d.strike_price,
          ticker:           d.ticker,
          lastPrice:        r.last_trade?.price || q.close,
          bid:              r.last_quote?.bid,
          ask:              r.last_quote?.ask,
          midpoint:         r.last_quote?.bid && r.last_quote?.ask ? (r.last_quote.bid + r.last_quote.ask) / 2 : null,
          volume:           q.volume || r.day?.volume,
          openInterest:     r.open_interest,
          impliedVol:       r.implied_volatility,
          delta:            g.delta,
          gamma:            g.gamma,
          theta:            g.theta,
          vega:             g.vega,
          inTheMoney:       r.in_the_money,
          breakeven:        d.contract_type === 'call'
            ? (d.strike_price || 0) + (r.last_quote?.ask || 0)
            : (d.strike_price || 0) - (r.last_quote?.bid || 0),
        }
      })

      if (expiry) chain = chain.filter((c: any) => c.expiry === expiry)
      if (type && type !== 'all') chain = chain.filter((c: any) => c.contractType === type)

      const expiries = [...new Set(chain.map((c: any) => c.expiry).filter(Boolean))].sort()
      const calls = chain.filter((c: any) => c.contractType === 'call').slice(0, limit)
      const puts  = chain.filter((c: any) => c.contractType === 'put').slice(0, limit)

      const putCallRatio = calls.length && puts.length
        ? (puts.reduce((s: number, p: any) => s + (p.openInterest || 0), 0) /
           Math.max(1, calls.reduce((s: number, c: any) => s + (c.openInterest || 0), 0))).toFixed(2)
        : null

      return NextResponse.json({ symbol, expiries, calls, puts, putCallRatio, source: 'polygon', total: chain.length })
    }
  } catch (e) {
    console.warn('[options] Polygon failed:', e)
  }

  // FMP fallback
  if (FMP) {
    try {
      const res = await fetch(`https://financialmodelingprep.com/stable/options?symbol=${symbol}&apikey=${FMP}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        let chain = data.map((o: any) => ({
          contractType: o.callPut === 'C' ? 'call' : 'put',
          expiry:       o.expirationDate,
          strike:       o.strikePrice,
          ticker:       o.symbol,
          lastPrice:    o.last,
          bid:          o.bid,
          ask:          o.ask,
          volume:       o.tradeVolume,
          openInterest: o.openInterest,
          impliedVol:   o.impliedVolatility,
          delta:        o.delta,
          gamma:        o.gamma,
          theta:        o.theta,
          vega:         o.vega,
          inTheMoney:   o.inTheMoney,
        }))
        if (expiry) chain = chain.filter((c: any) => c.expiry === expiry)
        if (type && type !== 'all') chain = chain.filter((c: any) => c.contractType === type)
        const expiries = [...new Set(chain.map((c: any) => c.expiry).filter(Boolean))].sort()
        return NextResponse.json({ symbol, expiries, calls: chain.filter((c: any) => c.contractType === 'call').slice(0, limit), puts: chain.filter((c: any) => c.contractType === 'put').slice(0, limit), source: 'fmp', total: chain.length })
      }
    } catch (e) {
      console.warn('[options] FMP failed:', e)
    }
  }

  return NextResponse.json({ error: 'Options data unavailable' }, { status: 503 })
}
