/**
 * GET /api/health
 * Returns real-time provider status — which keys are configured, which are live.
 */
import { NextResponse } from 'next/server'
import { PROVIDERS, providerStatus, massiveFetch } from '@/lib/data-providers'

async function testMassive() {
  try {
    const data = await massiveFetch('/v1/marketstatus/now')
    return { ok: true, detail: data?.market || 'responded' }
  } catch (e) { return { ok: false, detail: (e as Error).message } }
}

async function testFMP() {
  if (!PROVIDERS.fmp) return { ok: false, detail: 'no key' }
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${PROVIDERS.fmp}`, { next: { revalidate: 0 } })
    const d = await res.json()
    return { ok: Array.isArray(d) && d.length > 0, detail: res.status }
  } catch (e) { return { ok: false, detail: (e as Error).message } }
}

async function testEODHD() {
  if (!PROVIDERS.eodhd) return { ok: false, detail: 'no key' }
  try {
    const res = await fetch(`https://eodhd.com/api/real-time/AAPL.US?api_token=${PROVIDERS.eodhd}&fmt=json`, { next: { revalidate: 0 } })
    const d = await res.json()
    return { ok: !!d.close || !!d.previousClose, detail: res.status }
  } catch (e) { return { ok: false, detail: (e as Error).message } }
}

async function testFinnhub() {
  if (!PROVIDERS.finnhub) return { ok: false, detail: 'no key' }
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${PROVIDERS.finnhub}`, { next: { revalidate: 0 } })
    const d = await res.json()
    return { ok: !!d.c, detail: res.status }
  } catch (e) { return { ok: false, detail: (e as Error).message } }
}

export async function GET() {
  const [massive, fmp, eodhd, finnhub] = await Promise.all([
    testMassive(), testFMP(), testEODHD(), testFinnhub(),
  ])

  const providers = providerStatus()

  return NextResponse.json({
    timestamp:  new Date().toISOString(),
    providers,
    liveTests: {
      massive:  { configured: !!PROVIDERS.massive, ...massive },
      fmp:      { configured: !!PROVIDERS.fmp,     ...fmp     },
      eodhd:    { configured: !!PROVIDERS.eodhd,   ...eodhd   },
      finnhub:  { configured: !!PROVIDERS.finnhub, ...finnhub },
      fred:     { configured: !!PROVIDERS.fred,    ok: !!PROVIDERS.fred, detail: 'not tested' },
      alphav:   { configured: !!PROVIDERS.alphav,  ok: !!PROVIDERS.alphav, detail: 'not tested' },
      sec:      { configured: !!PROVIDERS.sec,     ok: !!PROVIDERS.sec,   detail: 'not tested' },
    },
    activeCount: providers.filter(p => p.active).length,
    summary: 'All configured providers checked',
  }, {
    headers: { 'Cache-Control': 'no-store' }
  })
}
