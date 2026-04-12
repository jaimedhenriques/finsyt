import { NextResponse } from 'next/server'
import { PROVIDERS, providerStatus, massiveFetch, yahooFetch, alphaFetch, marketstackFetch, ownFetch } from '@/lib/data-providers'

async function testProvider(name: string, fn: () => Promise<any>) {
  if (!PROVIDERS[name as keyof typeof PROVIDERS]) return { ok: false, detail: 'not configured' }
  const t0 = Date.now()
  try {
    const d = await fn()
    return { ok: !!d, latencyMs: Date.now() - t0, detail: 'ok' }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, detail: (e as Error).message.slice(0, 80) }
  }
}

export async function GET() {
  const [massive, fmp, eodhd, finnhub, alphav, marketstack, yahoo, own] = await Promise.all([
    testProvider('massive', () => massiveFetch('/v1/marketstatus/now')),
    testProvider('fmp', async () => {
      const r = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${PROVIDERS.fmp}`, { next: { revalidate: 0 } })
      const d = await r.json()
      return Array.isArray(d) && d.length ? d[0] : null
    }),
    testProvider('eodhd', async () => {
      const r = await fetch(`https://eodhd.com/api/real-time/AAPL.US?api_token=${PROVIDERS.eodhd}&fmt=json`, { next: { revalidate: 0 } })
      const d = await r.json()
      return d?.close || d?.previousClose ? d : null
    }),
    testProvider('finnhub', async () => {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${PROVIDERS.finnhub}`)
      const d = await r.json()
      return d?.c ? d : null
    }),
    testProvider('alphav', () => alphaFetch({ function: 'GLOBAL_QUOTE', symbol: 'AAPL' })),
    testProvider('marketstack', () => marketstackFetch('/eod/latest', { symbols: 'AAPL', limit: '1' })),
    testProvider('yahoo', () => yahooFetch('/api/stock/get-quote', { symbol: 'AAPL', region: 'US', lang: 'en-US' })),
    testProvider('own', () => ownFetch('stock-quote', { symbol: 'AAPL:NASDAQ' })),
  ])

  const liveTests = { openwebninja: own, massive, fmp, eodhd, finnhub, alphav, marketstack, yahoo }
  const providers = providerStatus()
  const configured = providers.filter(p => p.active).length
  const passing    = Object.values(liveTests).filter(t => t.ok).length

  return NextResponse.json({
    timestamp:  new Date().toISOString(),
    summary:    `${configured} providers configured, ${passing} passing live tests`,
    providers,
    liveTests,
    dataWaterfall: {
      realTimeQuotes:  ['openwebninja','massive','fmp','yahoo','eodhd','finnhub','alphav'],
      historicalBars:  ['massive','fmp','eodhd','marketstack','alphav','yahoo'],
      fundamentals:    ['fmp','massive','eodhd','alphav'],
      news:            ['massive','fmp','eodhd','finnhub'],
      search:          ['massive','fmp','yahoo','marketstack','eodhd','finnhub'],
      forex:           ['massive','alphav','eodhd','yahoo'],
      international:   ['yahoo','eodhd','marketstack','alphav'],
      macro:           ['fred','alphav','eodhd'],
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
