import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, massiveSearch, yahooSearch, marketstackSearch } from '@/lib/data-providers'

const FMP     = PROVIDERS.fmp
const EODHD   = PROVIDERS.eodhd
const FINNHUB = PROVIDERS.finnhub
const CS_BASE = 'https://api.coresignal.com/cdapi'
const CS_KEY  = process.env.CORESIGNAL_API_KEY || ''

// Classify an HTTP status into a provider-failure kind so the UI can show a
// specific, human-readable message instead of "no results".
type ProviderErrorKind = 'auth_failure' | 'rate_limit' | 'unavailable'

function classifyProviderError(status: number): ProviderErrorKind | null {
  if (status === 401 || status === 403) return 'auth_failure'
  if (status === 429 || status === 402) return 'rate_limit'
  if (status >= 500 || status === 503) return 'unavailable'
  return null
}

// Tracks errors encountered across all providers in a single search request.
// We accumulate them so the response can distinguish "no match" from
// "all providers failed".
type ProviderError = { provider: string; kind: ProviderErrorKind }

// CoreSignal fuzzy-name search — returns up to 5 private company hits
async function coresignalSearch(q: string): Promise<any[]> {
  if (!CS_KEY) return []
  try {
    const res = await fetch(`${CS_BASE}/v2/company_multi_source/search/es_dsl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CS_KEY}` },
      body: JSON.stringify({
        query: {
          bool: {
            must: [
              { multi_match: { query: q, fields: ['company_name^3', 'company_name_alias'], fuzziness: 'AUTO' } },
            ],
            filter: [{ term: { ownership_status: 'Private' } }],
          },
        },
        size: 5,
      }),
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.hits?.hits || []).map((h: any) => ({
      symbol: `private:${h._source?.id}`,
      name: h._source?.company_name,
      exchange: h._source?.hq_country || '',
      type: 'private',
      industry: h._source?.industry,
      headcount: h._source?.employees_count_inferred,
      totalFunding: h._source?.funding?.total_funding,
      logoUrl: h._source?.company_logo_url,
      source: 'coresignal',
      coresignalId: h._source?.id,
    }))
  } catch {
    return []
  }
}

// True when the query looks like a company name (≥2 chars, not a pure ticker)
function isNameLike(q: string): boolean {
  return q.length >= 2 && !/^[A-Z]{1,5}$/.test(q)
}

// Merge private company results into a public-first result list
function mergePrivate(pub: any[], priv: any[]): any[] {
  if (!priv.length) return pub
  const pubSymbols = new Set(pub.map(r => String(r.symbol).toLowerCase()))
  const deduped = priv.filter(p => !pubSymbols.has(String(p.symbol).toLowerCase()))
  return [...pub, ...deduped]
}

// Build a human-readable, non-leaking error message for the search UI.
function searchErrorMessage(errors: ProviderError[]): string {
  const authFail = errors.find(e => e.kind === 'auth_failure')
  const rateFail = errors.find(e => e.kind === 'rate_limit')
  if (authFail) {
    return 'Search is temporarily unavailable — a data provider rejected the request (invalid or missing API key).'
  }
  if (rateFail) {
    return 'Search is temporarily unavailable — a data provider hit its rate limit or quota. Please try again shortly.'
  }
  return 'Search is temporarily unavailable — all data providers failed to respond. Please try again.'
}

export async function GET(req: NextRequest) {
  const q     = req.nextUrl.searchParams.get('q')?.trim()
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10')
  const includePrivate = req.nextUrl.searchParams.get('private') !== 'false'
  if (!q) return NextResponse.json({ results: [] })

  // Accumulate provider errors so we can surface them in the response.
  const providerErrors: ProviderError[] = []

  // Fan out private-company search in parallel for all name-like queries,
  // regardless of which public provider succeeds. We await it once here
  // so any branch below can merge the results without re-fetching.
  const privateHitsPromise =
    includePrivate && isNameLike(q) ? coresignalSearch(q) : Promise.resolve([])

  // 1. Massive (US stocks, comprehensive)
  if (PROVIDERS.massive) {
    try {
      const r = await massiveSearch(q, limit)
      if (r?.length) {
        const pub = r.map((x: any) => ({
          symbol: x.ticker, name: x.name,
          exchange: x.primary_exchange?.replace('XNAS','NASDAQ').replace('XNYS','NYSE') || '',
          type: x.type, currency: x.currency_name?.toUpperCase() || 'USD',
          active: x.active, source: 'massive',
        }))
        const priv = await privateHitsPromise
        return NextResponse.json({ results: mergePrivate(pub, priv), source: 'massive' })
      }
    } catch { /* continue */ }
  }

  // 2. FMP
  if (FMP) {
    try {
      const res  = await fetch(`https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(q)}&limit=${limit}&apikey=${FMP}`)
      const kind = classifyProviderError(res.status)
      if (kind) {
        providerErrors.push({ provider: 'fmp', kind })
        console.warn(`[finsyt:search] fmp ${res.status} (${kind})`)
      } else {
        const data = await res.json()
        if (Array.isArray(data) && data.length) {
          const pub = data.map((r: any) => ({
            symbol: r.symbol, name: r.name,
            exchange: r.stockExchange || r.exchangeShortName || '',
            type: r.type || 'stock', currency: r.currency || 'USD', source: 'fmp',
          }))
          const priv = await privateHitsPromise
          return NextResponse.json({ results: mergePrivate(pub, priv), source: 'fmp' })
        }
        // FMP returns error objects (not HTTP errors) for rate-limit/auth issues
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const msg = String(data['Error Message'] || data.message || data.error || '').toLowerCase()
          if (msg.includes('invalid api key') || msg.includes('unauthorized')) {
            providerErrors.push({ provider: 'fmp', kind: 'auth_failure' })
            console.warn('[finsyt:search] fmp auth_failure (body error message)')
          } else if (msg.includes('limit reach') || msg.includes('upgrade')) {
            providerErrors.push({ provider: 'fmp', kind: 'rate_limit' })
            console.warn('[finsyt:search] fmp rate_limit (body error message)')
          }
        }
      }
    } catch { /* continue */ }
  }

  // 3. Yahoo (best global coverage)
  if (PROVIDERS.yahoo) {
    try {
      const r = await yahooSearch(q, limit)
      if (r?.length) {
        const pub = r.map((x: any) => ({
          symbol: x.symbol, name: x.longname||x.shortname||x.symbol,
          exchange: x.exchange||x.exchDisp||'', type: x.typeDisp||x.quoteType||'stock', source: 'yahoo',
        }))
        const priv = await privateHitsPromise
        return NextResponse.json({ results: mergePrivate(pub, priv), source: 'yahoo' })
      }
    } catch { /* continue */ }
  }

  // 4. Marketstack
  if (PROVIDERS.marketstack) {
    try {
      const r = await marketstackSearch(q, limit)
      if (r?.length) {
        const pub = r.map((x: any) => ({ symbol: x.symbol, name: x.name, exchange: x.stock_exchange?.acronym||'', type: 'stock', source: 'marketstack' }))
        const priv = await privateHitsPromise
        return NextResponse.json({ results: mergePrivate(pub, priv), source: 'marketstack' })
      }
    } catch { /* continue */ }
  }

  // 5. EODHD
  if (EODHD) {
    try {
      const res  = await fetch(`https://eodhd.com/api/search/${encodeURIComponent(q)}?api_token=${EODHD}&limit=${limit}&fmt=json`)
      const kind = classifyProviderError(res.status)
      if (kind) {
        providerErrors.push({ provider: 'eodhd', kind })
        console.warn(`[finsyt:search] eodhd ${res.status} (${kind})`)
      } else {
        const data = await res.json()
        if (Array.isArray(data) && data.length) {
          const pub = data.map((r: any) => ({ symbol: r.Code, name: r.Name, exchange: r.Exchange||'', type: r.Type||'stock', currency: r.Currency||'USD', source: 'eodhd' }))
          const priv = await privateHitsPromise
          return NextResponse.json({ results: mergePrivate(pub, priv), source: 'eodhd' })
        }
      }
    } catch { /* continue */ }
  }

  // 6. Finnhub
  if (FINNHUB) {
    try {
      const res  = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB}`)
      const kind = classifyProviderError(res.status)
      if (kind) {
        providerErrors.push({ provider: 'finnhub', kind })
        console.warn(`[finsyt:search] finnhub ${res.status} (${kind})`)
      } else {
        const { result } = await res.json()
        if (result?.length) {
          const pub = result.slice(0, limit).map((r: any) => ({ symbol: r.symbol, name: r.description, exchange: r.type, type: r.type, source: 'finnhub' }))
          const priv = await privateHitsPromise
          return NextResponse.json({ results: mergePrivate(pub, priv), source: 'finnhub' })
        }
      }
    } catch { /* continue */ }
  }

  // 7. CoreSignal private company fallback — when no public provider returned anything
  if (includePrivate && CS_KEY) {
    try {
      const priv = await privateHitsPromise
      if (priv.length) return NextResponse.json({ results: priv, source: 'coresignal' })
    } catch { /* continue */ }
  }

  // All providers exhausted. If we collected any error signals, communicate them
  // to the client so the UI can show a specific message instead of "no results".
  if (providerErrors.length > 0) {
    return NextResponse.json({
      results: [],
      source: 'none',
      providerError: providerErrors[0].kind,
      errorMessage: searchErrorMessage(providerErrors),
    })
  }

  return NextResponse.json({ results: [], source: 'none' })
}
