import { NextResponse } from 'next/server'
import {
  PROVIDERS, providerStatus,
  massiveFetch, yahooFetch, alphaFetch, marketstackFetch, ownFetch,
  fmpFetch, eodhdFetch, finnhubFetch, fredFetch, secApiFetch,
  coresignalFetch, databentoFetch, fiscalaiFetch, twentyfirstFetch,
  twelvedataQuote, financialDatasetsIncome, financeflowNews,
} from '@/lib/data-providers'
import { credentialHealthSummary, listCredentialHealth } from '@/lib/credential-health'
import { censusHealthCheck } from '@/lib/census-provider'
import { validateBillingEnv } from '@/lib/billing-config'

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
  // Every probe goes through the credential-health-aware wrappers so a
  // silent key rejection (401/403/Information body/etc.) is recorded in the
  // central registry — not just thrown past as a per-request exception.
  const [
    massive, fmp, eodhd, finnhub, alphav, marketstack, yahoo, own, census,
    fred, sec, coresignal, databento, fiscalai, twentyfirst,
    twelvedata, financialdatasets, financeflow,
  ] = await Promise.all([
    testProvider('massive',     () => massiveFetch('/v1/marketstatus/now')),
    testProvider('fmp',         () => fmpFetch('/stable/quote', { symbol: 'AAPL' })),
    testProvider('eodhd',       () => eodhdFetch('/api/real-time/AAPL.US')),
    testProvider('finnhub',     () => finnhubFetch('/api/v1/quote', { symbol: 'AAPL' })),
    testProvider('alphav',      () => alphaFetch({ function: 'GLOBAL_QUOTE', symbol: 'AAPL' })),
    testProvider('marketstack', () => marketstackFetch('/eod/latest', { symbols: 'AAPL', limit: '1' })),
    testProvider('yahoo',       () => yahooFetch('/api/stock/get-quote', { symbol: 'AAPL', region: 'US', lang: 'en-US' })),
    testProvider('own',         () => ownFetch('stock-quote', { symbol: 'AAPL:NASDAQ' })),
    censusHealthCheck(),
    testProvider('fred',        () => fredFetch('/fred/series/observations', { series_id: 'GDP', limit: '1' })),
    testProvider('sec',         () => secApiFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { query_string: { query: 'ticker:AAPL AND formType:"10-K"' } }, from: '0', size: '1' }),
    })),
    testProvider('coresignal',  () => coresignalFetch('/cdapi/v2/company_base/collect/apple-inc')),
    testProvider('databento',   () => databentoFetch('/v0/metadata.list_datasets')),
    testProvider('fiscalai',    () => fiscalaiFetch('/v1/companies/AAPL')),
    testProvider('twentyfirst', () => twentyfirstFetch('/v1/health')),
    testProvider('twelvedata',        () => twelvedataQuote('AAPL')),
    testProvider('financialdatasets', () => financialDatasetsIncome('AAPL', 'annual', 1)),
    testProvider('financeflow',       () => financeflowNews('AAPL', 1)),
  ])

  const liveTests = {
    openwebninja: own, massive, fmp, eodhd, finnhub, alphav, marketstack, yahoo,
    fred, sec, coresignal, databento, fiscalai, twentyfirst,
    twelvedata, financialdatasets, financeflow,
  }
  const providers = providerStatus()
  const configured = providers.filter(p => p.active).length
  const passing    = Object.values(liveTests).filter(t => t.ok).length

  // Credential health — surfaces providers whose configured key has been
  // silently rejected by the upstream (Census key rotated, OWN key revoked,
  // etc.). External monitors should alert on `credentialHealth.summary.rejected > 0`.
  const credSummary = credentialHealthSummary()
  const billingEnv = validateBillingEnv()
  const credentialHealth = {
    summary: credSummary,
    providers: listCredentialHealth(),
    // Provider-specific structured probe: distinguishes "no key configured"
    // (operator chose keyless) from "key configured but rejected" (silent fallback).
    census,
  }

  return NextResponse.json({
    timestamp:  new Date().toISOString(),
    summary:    `${configured} providers configured, ${passing} passing live tests`
                + (credSummary.rejected > 0
                    ? ` — ${credSummary.rejected} credential(s) rejected: ${credSummary.rejectedProviders.join(', ')}`
                    : '')
                + (!billingEnv.configured
                    ? ` — billing not configured (missing: ${billingEnv.missing.join(', ')})`
                    : ''),
    billing: billingEnv,
    credentialHealth,
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
