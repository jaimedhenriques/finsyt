import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, waterfall, massiveQuote, massiveTickerDetails } from '@/lib/data-providers'

const FMP     = PROVIDERS.fmp
const EODHD   = PROVIDERS.eodhd
const FINNHUB = PROVIDERS.finnhub

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  // ── 1. Massive (Polygon.io) — real-time snapshot ──────────────────────────
  if (PROVIDERS.massive) {
    try {
      const [snap, details] = await Promise.all([
        massiveQuote(symbol),
        massiveTickerDetails(symbol).catch(() => null),
      ])
      if (snap?.price) {
        return NextResponse.json({
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
          exchange:    details?.primary_exchange || '',
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
        })
      }
    } catch (e) { console.warn('[quote] Massive failed:', (e as Error).message) }
  }

  // ── 2. FMP ─────────────────────────────────────────────────────────────────
  if (FMP) {
    try {
      const [qRes, pRes, ratioRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${FMP}`,          { next: { revalidate: 60 } }),
        fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP}`,        { next: { revalidate: 3600 } }),
        fetch(`https://financialmodelingprep.com/stable/ratios?symbol=${symbol}&period=annual&limit=1&apikey=${FMP}`, { next: { revalidate: 3600 } }),
      ])
      const [quotes, profiles, ratios] = await Promise.all([qRes.json(), pRes.json(), ratioRes.json()])
      const q = Array.isArray(quotes)  ? quotes[0]  : quotes
      const p = Array.isArray(profiles)? profiles[0]: profiles
      const r = Array.isArray(ratios)  ? ratios[0]  : ratios
      if (q?.price) {
        return NextResponse.json({
          symbol,
          price:       q.price,
          change:      q.change,
          changePct:   q.changesPercentage,
          open:        q.open,
          high:        q.dayHigh,
          low:         q.dayLow,
          prevClose:   q.previousClose,
          volume:      q.volume,
          avgVolume:   q.avgVolume,
          yearHigh:    q.yearHigh,
          yearLow:     q.yearLow,
          marketCap:   q.marketCap,
          pe:          q.pe,
          eps:         q.eps,
          sharesOut:   q.sharesOutstanding,
          name:        q.name || p?.companyName || symbol,
          exchange:    q.exchange || p?.exchangeShortName || '',
          currency:    p?.currency || 'USD',
          sector:      p?.sector || '',
          industry:    p?.industry || '',
          logo:        p?.image || '',
          website:     p?.website || '',
          description: p?.description || '',
          employees:   p?.fullTimeEmployees || 0,
          country:     p?.country || 'US',
          ceo:         p?.ceo || '',
          ipo:         p?.ipoDate || '',
          beta:        p?.beta || 0,
          dividendYield: p?.lastDiv ? ((p.lastDiv / q.price) * 100).toFixed(2) : 0,
          roe:         r?.returnOnEquity || 0,
          roa:         r?.returnOnAssets || 0,
          grossMargin: r?.grossProfitMargin || p?.grossProfitMargin || 0,
          netMargin:   r?.netProfitMargin || 0,
          evEbitda:    r?.enterpriseValueMultiple || 0,
          pb:          r?.priceToBookRatio || 0,
          ps:          r?.priceToSalesRatio || 0,
          currentRatio:r?.currentRatio || 0,
          debtEquity:  r?.debtEquityRatio || 0,
          source: 'fmp',
        })
      }
    } catch (e) { console.warn('[quote] FMP failed:', (e as Error).message) }
  }

  // ── 3. EODHD ──────────────────────────────────────────────────────────────
  if (EODHD) {
    try {
      const eodSymbol = symbol.includes('.') ? symbol : `${symbol}.US`
      const [liveRes, fundRes] = await Promise.all([
        fetch(`https://eodhd.com/api/real-time/${eodSymbol}?api_token=${EODHD}&fmt=json`,       { next: { revalidate: 60 } }),
        fetch(`https://eodhd.com/api/fundamentals/${eodSymbol}?api_token=${EODHD}&fmt=json`,    { next: { revalidate: 3600 } }),
      ])
      const [live, fund] = await Promise.all([liveRes.json(), fundRes.json()])
      if (live.close || live.previousClose) {
        const price = live.close || live.previousClose
        const prev  = live.previousClose || live.open
        const h = fund?.Highlights || {}; const g = fund?.General || {}
        const t = fund?.Technicals || {}; const v = fund?.Valuation || {}
        return NextResponse.json({
          symbol, price,
          change:      parseFloat((price - prev).toFixed(2)),
          changePct:   parseFloat(((price - prev) / prev * 100).toFixed(2)),
          open: live.open, high: live.high, low: live.low, prevClose: prev,
          volume: live.volume,
          yearHigh: t['52WeekHigh'], yearLow: t['52WeekLow'],
          marketCap: h.MarketCapitalization, pe: h.PERatio,
          eps: h.EarningsShare, sharesOut: h.SharesOutstanding,
          name: g.Name || symbol, exchange: g.Exchange || '',
          currency: g.CurrencyCode || 'USD', sector: g.Sector || '',
          industry: g.Industry || '', logo: g.LogoURL ? `https://eodhd.com${g.LogoURL}` : '',
          website: g.WebURL || '', description: g.Description || '',
          employees: g.FullTimeEmployees || 0, country: g.CountryISO2 || 'US',
          ipo: g.IPODate || '', beta: t.Beta || 0,
          dividendYield: h.DividendYield || 0,
          roe: h.ReturnOnEquityTTM || 0, roa: h.ReturnOnAssetsTTM || 0,
          grossMargin: h.GrossProfitTTM || 0, netMargin: h.ProfitMargin || 0,
          evEbitda: v.EnterpriseValueEbitda || 0, pb: v.PriceBookMRQ || 0,
          ps: v.PriceSalesTTM || 0, source: 'eodhd',
        })
      }
    } catch (e) { console.warn('[quote] EODHD failed:', (e as Error).message) }
  }

  // ── 4. Finnhub ────────────────────────────────────────────────────────────
  if (FINNHUB) {
    try {
      const [qRes, pRes, mRes] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB}`),
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB}`),
        fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB}`),
      ])
      const [q, p, { metric: m }] = await Promise.all([qRes.json(), pRes.json(), mRes.json()])
      if (!q.c) throw new Error('no price')
      return NextResponse.json({
        symbol, price: q.c, change: q.c - q.pc,
        changePct: ((q.c - q.pc) / q.pc * 100),
        open: q.o, high: q.h, low: q.l, prevClose: q.pc,
        volume: 0, yearHigh: m?.['52WeekHigh'], yearLow: m?.['52WeekLow'],
        marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : 0,
        pe: m?.peNormalizedAnnual, eps: m?.epsNormalizedAnnual,
        name: p.name || symbol, exchange: p.exchange || '',
        currency: p.currency || 'USD', sector: p.finnhubIndustry || '',
        logo: p.logo || '', website: p.weburl || '',
        beta: m?.beta || 0, dividendYield: m?.dividendYieldIndicatedAnnual || 0,
        roe: m?.roeTTM || 0, roa: m?.roaTTM || 0,
        grossMargin: m?.grossMarginTTM || 0, netMargin: m?.netProfitMarginTTM || 0,
        pb: m?.pbAnnual || 0, ps: m?.psTTM || 0,
        source: 'finnhub',
      })
    } catch (e) { console.warn('[quote] Finnhub failed:', (e as Error).message) }
  }

  return NextResponse.json({ error: 'All quote providers exhausted', symbol }, { status: 503 })
}
