import { NextRequest, NextResponse } from 'next/server'

const FMP   = process.env.FMP_API_KEY || ''
const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api || ''

interface Profile {
  symbol: string
  companyName?: string
  sector?: string
  industry?: string
  country?: string
  mktCap?: number
}

const profileCache = new Map<string, { p: Profile; ts: number }>()
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000

function normaliseCountry(c?: string): string {
  if (!c) return 'US'
  const u = c.toUpperCase()
  if (u === 'GB') return 'UK'
  return u.slice(0, 2)
}

function normaliseSector(sector?: string, industry?: string): string {
  const s = (sector || '').toLowerCase()
  const i = (industry || '').toLowerCase()
  if (i.includes('auto')) return 'Automotive'
  if (s.includes('technology')) return 'Technology'
  if (s.includes('communication')) return 'Communication'
  if (s.includes('consumer')) return 'Consumer'
  if (s.includes('financial')) return 'Financials'
  if (s.includes('energy')) return 'Energy'
  if (s.includes('health')) return 'Healthcare'
  if (s.includes('industrial')) return 'Industrials'
  if (s.includes('utilit')) return 'Industrials'
  if (s.includes('material') || s.includes('basic')) return 'Industrials'
  if (s.includes('real estate')) return 'Financials'
  return sector || 'Other'
}

function timingFor(time?: string): 'BMO' | 'AMC' | 'DMH' {
  const t = (time || '').toLowerCase()
  if (t === 'bmo' || t.includes('before')) return 'BMO'
  if (t === 'amc' || t.includes('after')) return 'AMC'
  return 'DMH'
}

function reportTypeFor(fiscalDateEnding?: string): string {
  if (!fiscalDateEnding) return 'Q1'
  const m = new Date(fiscalDateEnding).getUTCMonth() + 1
  if (m <= 3) return 'Q1'
  if (m <= 6) return 'Q2'
  if (m <= 9) return 'Q3'
  return 'Q4'
}

async function fetchProfilesBatch(symbols: string[]): Promise<Profile[]> {
  if (!FMP || symbols.length === 0) return []
  const out: Profile[] = []
  const fresh: string[] = []
  const now = Date.now()
  for (const s of symbols) {
    const hit = profileCache.get(s)
    if (hit && now - hit.ts < PROFILE_TTL_MS) out.push(hit.p)
    else fresh.push(s)
  }
  // FMP `profile` endpoint accepts comma-separated symbols (up to ~50)
  const chunks: string[][] = []
  for (let i = 0; i < fresh.length; i += 40) chunks.push(fresh.slice(i, i + 40))
  await Promise.all(chunks.map(async chunk => {
    try {
      const url = `https://financialmodelingprep.com/api/v3/profile/${chunk.join(',')}?apikey=${FMP}`
      const r = await fetch(url, { next: { revalidate: 21600 } })
      if (!r.ok) return
      const arr = await r.json()
      if (!Array.isArray(arr)) return
      for (const p of arr) {
        const prof: Profile = {
          symbol: p.symbol,
          companyName: p.companyName,
          sector: p.sector,
          industry: p.industry,
          country: p.country,
          mktCap: Number(p.mktCap) || undefined,
        }
        profileCache.set(p.symbol, { p: prof, ts: now })
        out.push(prof)
      }
    } catch {}
  }))
  return out
}

async function fetchFmpCalendar(from: string, to: string): Promise<any[] | null> {
  if (!FMP) return null
  try {
    // Try the new "stable" endpoint first (active for keys issued after Aug 2025).
    const stableUrl = `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${FMP}`
    let r = await fetch(stableUrl, { next: { revalidate: 1800 } })
    if (r.ok) {
      const data = await r.json()
      if (Array.isArray(data) && data.length) return data
    }
    // Legacy endpoint fallback for older keys.
    const legacyUrl = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${FMP}`
    r = await fetch(legacyUrl, { next: { revalidate: 1800 } })
    if (!r.ok) return null
    const data = await r.json()
    return Array.isArray(data) ? data : null
  } catch { return null }
}

async function fetchEodhdCalendar(from: string, to: string, symbols: string): Promise<any[] | null> {
  if (!EODHD) return null
  try {
    const params = new URLSearchParams({ api_token: EODHD, fmt: 'json', from, to })
    if (symbols) params.set('symbols', symbols)
    const r = await fetch(`https://eodhd.com/api/calendar/earnings?${params}`, { next: { revalidate: 3600 } })
    if (!r.ok) return null
    const data = await r.json()
    return Array.isArray(data?.earnings) ? data.earnings : (Array.isArray(data) ? data : null)
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const today = new Date().toISOString().split('T')[0]
  const defaultTo = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const from = req.nextUrl.searchParams.get('from') || today
  const to   = req.nextUrl.searchParams.get('to')   || defaultTo
  const symbolsParam = req.nextUrl.searchParams.get('symbols') || ''

  if (!FMP && !EODHD) {
    return NextResponse.json({ error: 'No earnings provider configured' }, { status: 500 })
  }

  // Try FMP first (richer timing/estimate data), fallback to EODHD
  let source = 'fmp'
  let raw = await fetchFmpCalendar(from, to)
  if (!raw || raw.length === 0) {
    source = 'eodhd'
    raw = await fetchEodhdCalendar(from, to, symbolsParam)
  }
  if (!raw) return NextResponse.json({ from, to, earnings: [], source: 'none' })

  // Normalise into a common shape
  type Norm = {
    symbol: string; name: string; date: string;
    eventType: string; reportType: string; timing: 'BMO' | 'AMC' | 'DMH';
    country: string; industry: string; marketCap: number;
    consensusEps?: number; consensusRev?: number;
    actualEps?: number; actualRev?: number;
    confirmed: boolean;
  }

  const baseEvents: Norm[] = source === 'fmp'
    ? raw.map((e: any) => ({
        symbol: String(e.symbol || '').split('.')[0],
        name: e.symbol,
        date: e.date,
        eventType: 'Earnings',
        reportType: reportTypeFor(e.fiscalDateEnding),
        timing: timingFor(e.time),
        country: 'US',
        industry: 'Other',
        marketCap: 0,
        // FMP /stable returns epsEstimated/revenueEstimated + epsActual/revenueActual.
        // Legacy /api/v3 returned epsEstimated/revenueEstimated + eps/revenue.
        consensusEps: e.epsEstimated != null ? Number(e.epsEstimated) : undefined,
        consensusRev: e.revenueEstimated != null ? Number(e.revenueEstimated) : undefined,
        actualEps:    (e.epsActual ?? e.eps) != null ? Number(e.epsActual ?? e.eps) : undefined,
        actualRev:    (e.revenueActual ?? e.revenue) != null ? Number(e.revenueActual ?? e.revenue) : undefined,
        confirmed: e.epsEstimated != null || e.revenueEstimated != null || e.epsActual != null || e.revenueActual != null || e.eps != null || e.revenue != null,
      }))
    : raw.map((e: any) => {
        const sym = String(e.code || e.symbol || '').split('.')[0]
        const cc  = String(e.code || '').split('.')[1]
        return {
          symbol: sym,
          name: e.name || sym,
          date: e.report_date || e.date || from,
          eventType: 'Earnings',
          reportType: e.period || reportTypeFor(e.report_date),
          timing: e.before_after_market === 'BeforeMarket' ? 'BMO' : e.before_after_market === 'AfterMarket' ? 'AMC' : 'DMH',
          country: normaliseCountry(cc),
          industry: 'Other',
          marketCap: Number(e.market_capitalization) || 0,
          consensusEps: e.estimate != null ? Number(e.estimate) : undefined,
          actualEps:    e.actual   != null ? Number(e.actual)   : undefined,
          confirmed: !!(e.estimate != null || e.actual != null),
        }
      })

  // Filter to confirmed, valid-symbol events; cap at 200 for performance
  const events = baseEvents
    .filter(e => e.symbol && e.date && e.confirmed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 200)

  // Enrich with profiles for richer filter metadata (industry / market cap / country / name)
  const uniqueSymbols = Array.from(new Set(events.map(e => e.symbol)))
  const profiles = await fetchProfilesBatch(uniqueSymbols)
  const byPro = new Map(profiles.map(p => [p.symbol, p]))

  const enriched = events.map(e => {
    const p = byPro.get(e.symbol)
    return {
      ...e,
      name: p?.companyName || e.name,
      country: p?.country ? normaliseCountry(p.country) : e.country,
      industry: normaliseSector(p?.sector, p?.industry),
      marketCap: p?.mktCap || e.marketCap,
    }
  })

  return NextResponse.json({ from, to, source, count: enriched.length, earnings: enriched })
}
