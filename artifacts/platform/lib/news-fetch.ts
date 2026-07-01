/**
 * News aggregation core (extracted from app/api/news/route.ts so server-side
 * callers — the news route, the sentiment monitor, the agent tool — can reuse
 * the same multi-provider waterfall directly instead of fetching the sibling
 * `/api/news` route over loopback, which is flaky under concurrency).
 *
 * Provider waterfall (deduped by url/title, newest first):
 *   OpenWebNinja → Massive (Polygon) → FMP → FinanceFlow → EODHD → Finnhub.
 */
import { PROVIDERS, massiveNews, ownNews, financeflowNews } from '@/lib/data-providers'

const FMP = PROVIDERS.fmp
const EODHD = PROVIDERS.eodhd
const FINNHUB = PROVIDERS.finnhub

export interface RawNewsArticle {
  id: string
  title: string
  summary: string
  url: string
  source: string
  publishedAt: string
  /** Raw upstream sentiment hint, whatever shape the provider returned. */
  sentiment: unknown
  tickers: string[]
  tags: string[]
  image: string | null
  dataSource: string
}

export function normaliseNews(item: any, source: string): RawNewsArticle {
  return {
    id: item.id || item.url || item.link || item.article_url,
    title: item.title || item.headline || '',
    summary: (item.description || item.content || item.summary || item.text || '').slice(0, 500),
    url: item.article_url || item.link || item.url || '',
    source: item.publisher?.name || item.source || item.site || source,
    publishedAt: item.published_utc || item.publishedDate || item.date || item.datetime || '',
    sentiment: item.insights?.[0]?.sentiment ?? item.sentiment ?? null,
    tickers: item.tickers || item.symbols || (item.symbol ? [item.symbol] : []),
    tags: item.keywords || item.tags || (item.category ? [item.category] : []),
    image: item.image_url || item.image || item.img || null,
    dataSource: source,
  }
}

export interface FetchNewsOptions {
  symbol?: string
  limit?: number
  from?: string
  to?: string
}

export interface FetchNewsResult {
  articles: RawNewsArticle[]
  sources: string[]
}

export async function fetchAggregatedNews(opts: FetchNewsOptions = {}): Promise<FetchNewsResult> {
  const symbol = opts.symbol?.toUpperCase()
  const limit = opts.limit ?? 40
  const from = opts.from || new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  const to = opts.to || new Date().toISOString().slice(0, 10)

  const allArticles: RawNewsArticle[] = []
  const seen = new Set<string>()
  const add = (item: RawNewsArticle, key: string | undefined) => {
    const k = key || item.url || item.title
    if (k && !seen.has(k)) { seen.add(k); allArticles.push(item) }
  }

  // ── Source 0: OpenWebNinja (Google Finance — curated, clean) ──────────────
  if (PROVIDERS.own && symbol) {
    try {
      const results = await ownNews(symbol)
      ;(Array.isArray(results) ? results : []).forEach((item: any) => add(item as RawNewsArticle, item.url || item.title))
    } catch (e) { console.warn('[news] OpenWebNinja failed:', (e as Error).message) }
  }

  // ── Source 1: Massive (Polygon) — best quality, publisher/tickers/keywords ─
  if (PROVIDERS.massive) {
    try {
      const results = await massiveNews(symbol, Math.ceil(limit * 1.2))
      ;(Array.isArray(results) ? results : []).forEach((item: any) => add(normaliseNews(item, 'massive'), item.article_url || item.title))
    } catch (e) { console.warn('[news] Massive failed:', (e as Error).message) }
  }

  // ── Source 2: FMP ─────────────────────────────────────────────────────────
  if (FMP) {
    try {
      const url = symbol
        ? `https://financialmodelingprep.com/stable/news/stock?symbols=${symbol}&limit=${limit}&apikey=${FMP}`
        : `https://financialmodelingprep.com/stable/news/general-latest?limit=${limit}&apikey=${FMP}`
      const res = await fetch(url, { next: { revalidate: 300 } })
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).forEach((item: any) => add(normaliseNews(item, 'fmp'), item.url || item.title))
    } catch (e) { console.warn('[news] FMP failed:', (e as Error).message) }
  }

  // ── Source 2.5: FinanceFlow (real-time + sentiment, US-focused) ───────────
  if (PROVIDERS.financeflow) {
    try {
      const items = await financeflowNews(symbol, limit)
      ;(items || []).forEach((item: any) => add(item as RawNewsArticle, item.url || item.title))
    } catch (e) { console.warn('[news] FinanceFlow failed:', (e as Error).message) }
  }

  // ── Source 3: EODHD (strong sentiment scoring) ────────────────────────────
  if (EODHD) {
    try {
      const eodSymbol = symbol ? (symbol.includes('.') ? symbol : `${symbol}.US`) : ''
      const params = new URLSearchParams({ api_token: EODHD, limit: String(Math.min(limit, 50)), fmt: 'json' })
      if (eodSymbol) params.set('s', eodSymbol)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`https://eodhd.com/api/news?${params}`, { next: { revalidate: 300 } })
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).forEach((item: any) => add(normaliseNews(item, 'eodhd'), item.link || item.title))
    } catch (e) { console.warn('[news] EODHD failed:', (e as Error).message) }
  }

  // ── Source 4: Finnhub ─────────────────────────────────────────────────────
  if (FINNHUB && symbol) {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB}`)
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).slice(0, 20).forEach((item: any) =>
        add(normaliseNews({ ...item, title: item.headline }, 'finnhub'), item.url || item.headline))
    } catch (e) { console.warn('[news] Finnhub failed:', (e as Error).message) }
  }

  const sorted = allArticles
    .filter(a => a.title)
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .slice(0, limit)

  const sources = [...new Set(sorted.map(a => a.dataSource))]
  return { articles: sorted, sources }
}
