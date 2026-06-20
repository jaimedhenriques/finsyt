import { NextRequest, NextResponse } from 'next/server'
import { getOptionsChain, type NormalizedOptionContract } from '@/lib/data-providers'
import {
  blackScholesGreeks,
  impliedVolatility,
  yearsToExpiry,
  type OptionType,
} from '@/lib/options-math'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/options?symbol=AAPL[&expiry=YYYY-MM-DD][&rate=0.043]
 *
 * Returns a normalized option chain for `symbol`. Greeks/IV are taken verbatim
 * from the upstream provider when present; otherwise they are computed with
 * Black–Scholes from the contract mid price, the underlying spot, and a
 * risk-free rate (rho is always computed since Polygon never supplies it).
 *
 * No chain is ever fabricated: when no provider returns data the route responds
 * with `source: 'none'` and an empty contract set so the UI can show an honest
 * empty state.
 */

// Default risk-free rate used when the caller does not override it. ~3M T-bill
// neighbourhood; the exact value barely moves equity-option Greeks.
const DEFAULT_RATE = 0.043

interface EnrichedContract extends NormalizedOptionContract {
  /** IV actually used for Greek computation (upstream IV or solved IV). */
  ivUsed: number | null
}

function enrichContract(
  c: NormalizedOptionContract,
  spot: number | null,
  rate: number,
): EnrichedContract {
  const t = yearsToExpiry(c.expiration)
  // Prefer the upstream IV; otherwise solve it from the contract mid price.
  let iv = c.impliedVolatility
  const priceForIv = c.mid ?? c.last
  if ((iv == null || !(iv > 0)) && spot != null && priceForIv != null && t > 0) {
    const solved = impliedVolatility(c.type as OptionType, priceForIv, {
      spot,
      strike: c.strike,
      timeToExpiry: t,
      rate,
    })
    if (solved != null) iv = solved
  }

  // If the provider already supplied a full Greek set, keep it and only fill
  // rho (Polygon omits it). Otherwise compute the whole set when we have the
  // inputs to do so honestly.
  if (c.greeksSource === 'upstream') {
    let rho = c.rho
    if (rho == null && spot != null && iv != null && iv > 0 && t > 0) {
      rho = blackScholesGreeks(c.type as OptionType, {
        spot, strike: c.strike, timeToExpiry: t, rate, volatility: iv,
      }).rho
    }
    return { ...c, rho, impliedVolatility: iv, ivUsed: iv }
  }

  if (spot != null && iv != null && iv > 0 && t > 0) {
    const g = blackScholesGreeks(c.type as OptionType, {
      spot, strike: c.strike, timeToExpiry: t, rate, volatility: iv,
    })
    return {
      ...c,
      delta: g.delta,
      gamma: g.gamma,
      theta: g.theta,
      vega: g.vega,
      rho: g.rho,
      impliedVolatility: iv,
      greeksSource: 'computed',
      ivUsed: iv,
    }
  }

  // Not enough inputs to compute Greeks honestly — leave them null.
  return { ...c, impliedVolatility: iv, ivUsed: iv }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = (searchParams.get('symbol') || '').trim().toUpperCase()
  const expiryFilter = (searchParams.get('expiry') || '').trim()
  const rateParam = Number(searchParams.get('rate'))
  const rate = Number.isFinite(rateParam) && rateParam > 0 && rateParam < 1 ? rateParam : DEFAULT_RATE

  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  }

  let chain
  try {
    chain = await getOptionsChain(symbol)
  } catch (err) {
    return NextResponse.json(
      { error: 'options chain fetch failed', detail: String((err as Error)?.message || err) },
      { status: 502 },
    )
  }

  if (!chain || chain.contracts.length === 0) {
    return NextResponse.json({
      symbol,
      source: 'none',
      underlyingPrice: null,
      rate,
      expirations: [],
      expiry: null,
      asOf: new Date().toISOString(),
      contracts: [],
      message: 'No options chain available from configured providers.',
    })
  }

  // Resolve a spot price: prefer the chain's underlying, else the quote route.
  let spot = chain.underlyingPrice
  if (spot == null) {
    try {
      const origin = new URL(req.url).origin
      const res = await fetch(`${origin}/api/quote?symbol=${encodeURIComponent(symbol)}`, {
        cache: 'no-store',
      })
      if (res.ok) {
        const q = await res.json()
        const p = Number(q?.price)
        if (Number.isFinite(p) && p > 0) spot = p
      }
    } catch {
      // Spot stays null — Greeks/IV that need it will be left blank.
    }
  }

  const expirations = chain.expirations
  // Default to the nearest expiry when none requested.
  const expiry = expiryFilter && expirations.includes(expiryFilter) ? expiryFilter : (expirations[0] ?? null)

  const selected = expiry
    ? chain.contracts.filter(c => c.expiration === expiry)
    : chain.contracts

  const enriched = selected
    .map(c => enrichContract(c, spot, rate))
    .sort((a, b) => a.strike - b.strike || a.type.localeCompare(b.type))

  return NextResponse.json({
    symbol,
    source: chain.source,
    underlyingPrice: spot,
    rate,
    expirations,
    expiry,
    asOf: new Date().toISOString(),
    contracts: enriched,
  })
}
