import { NextRequest, NextResponse } from 'next/server'
import {
  PROVIDERS, isInternationalSymbol, toEODSymbol,
  ownQuote,
  massiveQuote, massiveTickerDetails,
  yahooQuote, yahooSummary,
  alphaQuote, alphaOverview,
  marketstackQuote,
  twelvedataQuote,
  alpacaQuote,
  databentoQuote,
} from '@/lib/data-providers'

const FMP     = PROVIDERS.fmp
const EODHD   = PROVIDERS.eodhd
const FINNHUB = PROVIDERS.finnhub

// Cap on how many symbols a single batched request may resolve, to keep the
// upstream fan-out (each symbol walks the full provider waterfall) bounded.
const MAX_BATCH = 30

/**
 * Resolve a single symbol through the provider waterfall and return the quote
 * object, or `null` when every provider is exhausted. The HTTP wrappers below
 * stamp the result with an `asOf` timestamp and shape the response.
 */
async function resolveQuote(symbol: string): Promise<Record<string, any> | null> {
  const isIntl = isInternationalSymbol(symbol)

  // ── 0. OpenWebNinja (Google Finance source — real-time, global, pre/post market) ──
  if (PROVIDERS.own) {
    try {
      const q = await ownQuote(symbol)
      if (q?.price) return q
    } catch (e) { console.warn('[quote] OpenWebNinja failed:', (e as Error).message) }
  }

  // For international symbols go Yahoo/EODHD first (better global coverage)
  if (isIntl) {
    // ── Intl-1: Yahoo Finance ───────────────────────────────────────────────
    if (PROVIDERS.yahoo) {
      try {
        const q = await yahooQuote(symbol)
        if (q?.price) return q
      } catch (e) { console.warn('[quote] Yahoo intl failed:', (e as Error).message) }
    }

    // ── Intl-2: EODHD ───────────────────────────────────────────────────────
    if (EODHD) {
      try {
        const eodSymbol = toEODSymbol(symbol)
        const [liveRes, fundRes] = await Promise.all([
          fetch(`https://eodhd.com/api/real-time/${eodSymbol}?api_token=${EODHD}&fmt=json`, { next: { revalidate: 60 } }),
          fetch(`https://eodhd.com/api/fundamentals/${eodSymbol}?api_token=${EODHD}&fmt=json`, { next: { revalidate: 3600 } }),
        ])
        const [live, fund] = await Promise.all([liveRes.json(), fundRes.json()])
        if (live.close || live.previousClose) {
          return buildEodhdQuote(symbol, live, fund)
        }
      } catch (e) { console.warn('[quote] EODHD intl failed:', (e as Error).message) }
    }

    // ── Intl-3: Marketstack ─────────────────────────────────────────────────
    if (PROVIDERS.marketstack) {
      try {
        const q = await marketstackQuote(symbol)
        if (q?.price) return q
      } catch (e) { console.warn('[quote] Marketstack intl failed:', (e as Error).message) }
    }

    // ── Intl-4: Alpha Vantage ───────────────────────────────────────────────
    if (PROVIDERS.alphav) {
      try {
        const [q, ov] = await Promise.all([alphaQuote(symbol), alphaOverview(symbol).catch(() => null)])
        if (q?.price) return { ...q, ...buildAlphaOverlay(ov) }
      } catch (e) { console.warn('[quote] AlphaV intl failed:', (e as Error).message) }
    }
  }

  // US flow: Massive → FMP → Yahoo → EODHD → Finnhub → AlphaV

  // ── US-1: Massive (real-time snapshot) ────────────────────────────────────
  if (PROVIDERS.massive) {
    try {
      const [snap, details] = await Promise.all([
        massiveQuote(symbol),
        massiveTickerDetails(symbol).catch(() => null),
      ])
      if (snap?.price) {
        return {
          symbol,
          price:       snap.price,
          change:      snap.change,
          changePct:   snap.changePct,
          open:        snap.open,
          high:        snap.high,
          low:         snap.low,
          prevClose:   snap.prevClose,
          volume:      snap.volume,
          vwap:        snap.vwap,
          name:        details?.name || symbol,
          exchange:    details?.primary_exchange?.replace('XNAS','NASDAQ').replace('XNYS','NYSE') || '',
          currency:    details?.currency_name?.toUpperCase() || 'USD',
          sector:      details?.sic_description || '',
          logo:        details?.branding?.icon_url || '',
          website:     details?.homepage_url || '',
          description: details?.description || '',
          employees:   details?.total_employees || 0,
          marketCap:   details?.market_cap || 0,
          sharesOut:   details?.weighted_shares_outstanding || 0,
          listDate:    details?.list_date || '',
          source:      'massive',
        }
      }
    } catch (e) { console.warn('[quote] Massive failed:', (e as Error).message) }
  }

  // ── US-1.5: Alpaca Markets (real-time IEX quote/trade, paper-key OK) ──────
  // Slotted between Massive and FMP because Alpaca's NBBO + last-trade is
  // genuinely real-time (≤ 1s), and free/paper keys work without a paid
  // subscription. Returns null on off-hours / non-IEX symbols, in which
  // case the waterfall continues normally.
  if (PROVIDERS.alpaca && PROVIDERS.alpacaSecret) {
    try {
      const q = await alpacaQuote(symbol)
      if (q?.price) return q
    } catch (e) { console.warn('[quote] Alpaca failed:', (e as Error).message) }
  }

  // ── US-1.6: Databento (historical EOD bar — institutional-grade) ──────────
  // Slotted after Alpaca because Databento's free/historical endpoints
  // return the last completed session's close, not a live tick — useful
  // when intraday providers are dark (off-hours, weekends) or refuse
  // a symbol. Returns null when the symbol isn't in the configured
  // dataset (default XNAS.ITCH) so the waterfall continues normally.
  if (PROVIDERS.databento) {
    try {
      const q = await databentoQuote(symbol)
      if (q?.price) return q
    } catch (e) { console.warn('[quote] Databento failed:', (e as Error).message) }
  }

  // ── US-2: FMP ─────────────────────────────────────────────────────────────
  if (FMP) {
    try {
      const [qRes, pRes, ratioRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${FMP}`, { next: { revalidate: 60 } }),
        fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP}`, { next: { revalidate: 3600 } }),
        fetch(`https://financialmodelingprep.com/stable/ratios?symbol=${symbol}&period=annual&limit=1&apikey=${FMP}`, { next: { revalidate: 3600 } }),
      ])
      const [quotes, profiles, ratios] = await Promise.all([qRes.json(), pRes.json(), ratioRes.json()])
      const q = Array.isArray(quotes)?quotes[0]:quotes
      const p = Array.isArray(profiles)?profiles[0]:profiles
      const r = Array.isArray(ratios)?ratios[0]:ratios
      if (q?.price) {
        return {
          symbol, price: q.price, change: q.change, changePct: q.changesPercentage,
          open: q.open, high: q.dayHigh, low: q.dayLow, prevClose: q.previousClose,
          volume: q.volume, avgVolume: q.avgVolume, yearHigh: q.yearHigh, yearLow: q.yearLow,
          marketCap: q.marketCap, pe: q.pe, eps: q.eps, sharesOut: q.sharesOutstanding,
          name: q.name||p?.companyName||symbol, exchange: q.exchange||p?.exchangeShortName||'',
          currency: p?.currency||'USD', sector: p?.sector||'', industry: p?.industry||'',
          logo: p?.image||'', website: p?.website||'', description: p?.description||'',
          employees: p?.fullTimeEmployees||0, country: p?.country||'US', ceo: p?.ceo||'',
          address: p?.address||'', city: p?.city||'', state: p?.state||'', zip: p?.zip||'',
          ipo: p?.ipoDate||'', beta: p?.beta||0,
          dividendYield: p?.lastDiv ? ((p.lastDiv/q.price)*100).toFixed(2) : 0,
          roe: r?.returnOnEquity||0, roa: r?.returnOnAssets||0,
          grossMargin: r?.grossProfitMargin||p?.grossProfitMargin||0, netMargin: r?.netProfitMargin||0,
          evEbitda: r?.enterpriseValueMultiple||0, pb: r?.priceToBookRatio||0,
          ps: r?.priceToSalesRatio||0, currentRatio: r?.currentRatio||0,
          debtEquity: r?.debtEquityRatio||0, source: 'fmp',
        }
      }
    } catch (e) { console.warn('[quote] FMP failed:', (e as Error).message) }
  }

  // ── US-3: Yahoo Finance ───────────────────────────────────────────────────
  if (PROVIDERS.yahoo) {
    try {
      const q = await yahooQuote(symbol)
      if (q?.price) return q
    } catch (e) { console.warn('[quote] Yahoo failed:', (e as Error).message) }
  }

  // ── US-3.5: Twelve Data (global, REST + WS, generous free tier) ──────────
  if (PROVIDERS.twelvedata) {
    try {
      const q = await twelvedataQuote(symbol)
      if (q?.price) return q
    } catch (e) { console.warn('[quote] TwelveData failed:', (e as Error).message) }
  }

  // ── US-4: EODHD ───────────────────────────────────────────────────────────
  if (EODHD) {
    try {
      const eodSymbol = toEODSymbol(symbol)
      const [liveRes, fundRes] = await Promise.all([
        fetch(`https://eodhd.com/api/real-time/${eodSymbol}?api_token=${EODHD}&fmt=json`, { next: { revalidate: 60 } }),
        fetch(`https://eodhd.com/api/fundamentals/${eodSymbol}?api_token=${EODHD}&fmt=json`, { next: { revalidate: 3600 } }),
      ])
      const [live, fund] = await Promise.all([liveRes.json(), fundRes.json()])
      if (live.close || live.previousClose) return buildEodhdQuote(symbol, live, fund)
    } catch (e) { console.warn('[quote] EODHD failed:', (e as Error).message) }
  }

  // ── US-5: Finnhub ─────────────────────────────────────────────────────────
  if (FINNHUB) {
    try {
      const [qRes, pRes, mRes] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB}`),
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB}`),
        fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB}`),
      ])
      const [q, p, { metric: m }] = await Promise.all([qRes.json(), pRes.json(), mRes.json()])
      if (q.c) return {
        symbol, price: q.c, change: q.c - q.pc, changePct: ((q.c - q.pc)/q.pc*100),
        open: q.o, high: q.h, low: q.l, prevClose: q.pc,
        yearHigh: m?.['52WeekHigh'], yearLow: m?.['52WeekLow'],
        marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : 0,
        pe: m?.peNormalizedAnnual, eps: m?.epsNormalizedAnnual,
        name: p.name||symbol, exchange: p.exchange||'', currency: p.currency||'USD',
        sector: p.finnhubIndustry||'', logo: p.logo||'', website: p.weburl||'',
        beta: m?.beta||0, dividendYield: m?.dividendYieldIndicatedAnnual||0,
        roe: m?.roeTTM||0, roa: m?.roaTTM||0,
        grossMargin: m?.grossMarginTTM||0, netMargin: m?.netProfitMarginTTM||0,
        pb: m?.pbAnnual||0, ps: m?.psTTM||0, source: 'finnhub',
      }
    } catch (e) { console.warn('[quote] Finnhub failed:', (e as Error).message) }
  }

  // ── US-6: Alpha Vantage ───────────────────────────────────────────────────
  if (PROVIDERS.alphav) {
    try {
      const [q, ov] = await Promise.all([alphaQuote(symbol), alphaOverview(symbol).catch(() => null)])
      if (q?.price) return { ...q, ...buildAlphaOverlay(ov), source: 'alphav' }
    } catch (e) { console.warn('[quote] AlphaV failed:', (e as Error).message) }
  }

  return null
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  // ── Batch mode: ?symbols=AAPL,MSFT,… ──────────────────────────────────────
  // Used by the watchlist and any multi-ticker surface. Each symbol walks the
  // full provider waterfall in parallel; the list is capped at MAX_BATCH and
  // unresolved symbols are simply omitted from the response.
  const symbolsParam = params.get('symbols')
  if (symbolsParam) {
    const symbols = [...new Set(
      symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
    )].slice(0, MAX_BATCH)
    if (!symbols.length) return NextResponse.json({ error: 'symbols required' }, { status: 400 })

    const resolved = await Promise.all(
      symbols.map(async (s) => {
        const q = await resolveQuote(s).catch(() => null)
        // Normalise back to the requested ticker — some providers (e.g.
        // OpenWebNinja) echo an exchange-suffixed symbol like "AAPL:NASDAQ".
        return q?.price ? ({ ...q, symbol: s } as Record<string, any>) : null
      }),
    )
    const asOf = new Date().toISOString()
    const quotes = resolved
      .filter((q): q is Record<string, any> => q !== null)
      .map(q => ({ ...q, asOf }))
    return NextResponse.json({ quotes, count: quotes.length, asOf })
  }

  // ── Single-symbol mode: ?symbol=AAPL ──────────────────────────────────────
  const symbol = params.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const quote = await resolveQuote(symbol)
  if (!quote?.price) {
    return NextResponse.json({ error: 'All quote providers exhausted', symbol }, { status: 503 })
  }
  return NextResponse.json({ ...quote, asOf: new Date().toISOString() })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildEodhdQuote(symbol: string, live: any, fund: any) {
  const price = live.close || live.previousClose
  const prev  = live.previousClose || live.open
  const h = fund?.Highlights||{}; const g = fund?.General||{}
  const t = fund?.Technicals||{}; const v = fund?.Valuation||{}
  return {
    symbol, price,
    change: parseFloat((price-prev).toFixed(2)),
    changePct: parseFloat(((price-prev)/prev*100).toFixed(2)),
    open: live.open, high: live.high, low: live.low, prevClose: prev, volume: live.volume,
    yearHigh: t['52WeekHigh'], yearLow: t['52WeekLow'],
    marketCap: h.MarketCapitalization, pe: h.PERatio, eps: h.EarningsShare,
    sharesOut: h.SharesOutstanding, name: g.Name||symbol, exchange: g.Exchange||'',
    currency: g.CurrencyCode||'USD', sector: g.Sector||'', industry: g.Industry||'',
    logo: g.LogoURL ? `https://eodhd.com${g.LogoURL}` : '', website: g.WebURL||'',
    description: g.Description||'', employees: g.FullTimeEmployees||0,
    country: g.CountryISO2||'', ipo: g.IPODate||'', beta: t.Beta||0,
    dividendYield: h.DividendYield||0, roe: h.ReturnOnEquityTTM||0, roa: h.ReturnOnAssetsTTM||0,
    grossMargin: h.GrossProfitTTM||0, netMargin: h.ProfitMargin||0,
    evEbitda: v.EnterpriseValueEbitda||0, pb: v.PriceBookMRQ||0, ps: v.PriceSalesTTM||0,
    source: 'eodhd',
  }
}

function buildAlphaOverlay(ov: any) {
  if (!ov) return {}
  return {
    name: ov.Name, exchange: ov.Exchange, currency: ov.Currency,
    sector: ov.Sector, industry: ov.Industry, description: ov.Description,
    country: ov.Country, employees: parseInt(ov.FullTimeEmployees)||0,
    marketCap: parseFloat(ov.MarketCapitalization)||0,
    pe: parseFloat(ov.PERatio)||0, eps: parseFloat(ov.EPS)||0,
    beta: parseFloat(ov.Beta)||0, yearHigh: parseFloat(ov['52WeekHigh'])||0,
    yearLow: parseFloat(ov['52WeekLow'])||0, dividendYield: parseFloat(ov.DividendYield)||0,
    pb: parseFloat(ov.PriceToBookRatio)||0, ps: parseFloat(ov.PriceToSalesRatioTTM)||0,
    evEbitda: parseFloat(ov.EVToEBITDA)||0, roe: parseFloat(ov.ReturnOnEquityTTM)||0,
    analystTarget: parseFloat(ov.AnalystTargetPrice)||0,
  }
}
