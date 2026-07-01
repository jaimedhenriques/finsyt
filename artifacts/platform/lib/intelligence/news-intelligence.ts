/**
 * News Intelligence Brief Provider
 * ──────────────────────────────────
 * Aggregates cross-stream news intelligence from public RSS feeds and the
 * GDELT news API. Synthesises a curated brief of the most significant
 * geopolitical, macro, and sector developments.
 *
 * Sources (all public, no key required):
 *   • Reuters Business RSS:    https://feeds.reuters.com/reuters/businessNews
 *   • AP News (via Google RSS): https://news.google.com/rss/search?q=...
 *   • BBC Business RSS:         http://feeds.bbci.co.uk/news/business/rss.xml
 *   • GDELT Article List:       https://api.gdeltproject.org/api/v2/doc/doc
 *
 * Source attribution: "Reuters / AP / BBC / GDELT"
 * Cache: 30 min (news is time-sensitive)
 */

export interface NewsItem {
  title: string
  source: string
  publishedAt?: string
  url?: string
  tone?: number
  themes?: string[]
  relevanceScore?: number
}

export interface NewsBriefResult {
  query: string
  headlines: NewsItem[]
  themes: string[]
  topTheme?: string
  sentimentAvg?: number
  sentimentLabel?: 'Bullish' | 'Bearish' | 'Neutral' | 'Mixed'
  briefs: string[]
  source: string
  fetchedAt: string
  unavailable?: boolean
  unavailableReason?: string
}

const CACHE = new Map<string, { data: NewsBriefResult; expiresAt: number }>()
const TTL_MS = 30 * 60 * 1000

function parseRssItems(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = []
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
  for (const block of itemBlocks.slice(0, 8)) {
    const grab = (tag: string): string => {
      const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))
      return m?.[1]?.trim() || ''
    }
    const title = grab('title')
    const link = grab('link') || grab('guid')
    const pubDate = grab('pubDate')
    if (title) {
      items.push({
        title,
        source: sourceName,
        publishedAt: pubDate || undefined,
        url: link || undefined,
      })
    }
  }
  return items
}

async function fetchRss(url: string, sourceName: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Finsyt Intelligence Brief contact@finsyt.dev', Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const text = await res.text()
    return parseRssItems(text, sourceName)
  } catch {
    return []
  }
}

async function fetchGdelt(query: string, limit = 6): Promise<NewsItem[]> {
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${limit}&timespan=1d&format=json&sort=ToneDesc`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Finsyt Intelligence Brief contact@finsyt.dev' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const json = await res.json() as {
      articles?: Array<{
        title?: string
        url?: string
        seendate?: string
        domain?: string
        tone?: string
        themes?: string
      }>
    }
    return (json?.articles || []).map(a => {
      const toneRaw = parseFloat(a.tone?.split(',')?.[0] || 'NaN')
      return {
        title: a.title || '',
        source: a.domain || 'GDELT',
        publishedAt: a.seendate,
        url: a.url,
        tone: isNaN(toneRaw) ? undefined : toneRaw,
        themes: a.themes?.split(';').slice(0, 5).filter(Boolean),
      }
    }).filter(a => !!a.title)
  } catch {
    return []
  }
}

function extractThemes(items: NewsItem[]): string[] {
  const THEME_KEYWORDS: Record<string, string[]> = {
    'Geopolitical Risk': ['war', 'conflict', 'sanction', 'tariff', 'nato', 'russia', 'china', 'taiwan', 'military'],
    'Monetary Policy': ['fed', 'interest rate', 'inflation', 'central bank', 'ecb', 'boe', 'boj', 'rate cut', 'rate hike'],
    'Trade & Supply Chain': ['supply chain', 'trade', 'import', 'export', 'port', 'shipping', 'logistics'],
    'Energy & Commodities': ['oil', 'gas', 'lng', 'opec', 'commodities', 'copper', 'lithium', 'rare earth'],
    'AI & Tech': ['ai', 'artificial intelligence', 'semiconductor', 'chip', 'nvidia', 'openai', 'deepmind'],
    'Financial Markets': ['stock', 'bond', 'yield', 'equity', 'market', 'earnings', 'ipo', 'merger', 'acquisition'],
    'Cyber Security': ['cyber', 'hack', 'ransomware', 'breach', 'attack', 'vulnerability'],
    'Regulatory': ['regulation', 'antitrust', 'compliance', 'sec', 'investigation', 'fine', 'penalty'],
    'Climate & ESG': ['climate', 'carbon', 'esg', 'sustainability', 'renewable', 'green', 'emission'],
  }

  const counts: Record<string, number> = {}
  for (const item of items) {
    const text = item.title.toLowerCase()
    for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
      if (keywords.some(kw => text.includes(kw))) {
        counts[theme] = (counts[theme] || 0) + 1
      }
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([theme]) => theme)
}

function sentimentLabel(avg: number): NewsBriefResult['sentimentLabel'] {
  if (avg > 2) return 'Bullish'
  if (avg < -2) return 'Bearish'
  if (Math.abs(avg) < 0.5) return 'Neutral'
  return 'Mixed'
}

function buildBriefs(items: NewsItem[], themes: string[]): string[] {
  const briefs: string[] = []
  if (themes.length > 0) {
    briefs.push(`Top themes in today's news: ${themes.slice(0, 4).join(', ')}.`)
  }
  const topPositive = items.filter(a => (a.tone ?? 0) > 3).slice(0, 2)
  if (topPositive.length) {
    briefs.push(`Positive signals: ${topPositive.map(a => a.title).join(' • ')}`)
  }
  const topNegative = items.filter(a => (a.tone ?? 0) < -3).slice(0, 2)
  if (topNegative.length) {
    briefs.push(`Risk signals: ${topNegative.map(a => a.title).join(' • ')}`)
  }
  return briefs
}

export async function getNewsBrief(params: {
  ticker?: string
  companyName?: string
  topic?: string
  country?: string
}): Promise<NewsBriefResult> {
  const { ticker, companyName, topic, country } = params
  const queryLabel = ticker || companyName || topic || country || 'global-markets'
  const cacheKey = queryLabel.toLowerCase()

  const cached = CACHE.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const gdeltQuery = ticker
    ? `${ticker} ${companyName || ''} stock financial`
    : topic
    ? topic
    : country
    ? `${country} economy finance geopolitical`
    : 'financial markets economy'

  try {
    const [reuters, bbc, gdelt] = await Promise.all([
      fetchRss('https://feeds.reuters.com/reuters/businessNews', 'Reuters'),
      fetchRss('http://feeds.bbci.co.uk/news/business/rss.xml', 'BBC Business'),
      fetchGdelt(gdeltQuery, 8),
    ])

    let allItems = [...reuters, ...bbc, ...gdelt]

    if (ticker || companyName) {
      const keyword = (ticker || companyName || '').toLowerCase()
      const relevant = allItems.filter(a => a.title.toLowerCase().includes(keyword))
      const general = allItems.filter(a => !a.title.toLowerCase().includes(keyword))
      allItems = [...relevant, ...general.slice(0, 4)].slice(0, 12)
    } else {
      allItems = allItems.slice(0, 12)
    }

    const themes = extractThemes(allItems)
    const tonesArr = allItems
      .map(a => a.tone)
      .filter((t): t is number => typeof t === 'number')
    const sentimentAvg = tonesArr.length
      ? tonesArr.reduce((s, v) => s + v, 0) / tonesArr.length
      : undefined

    const result: NewsBriefResult = {
      query: queryLabel,
      headlines: allItems.slice(0, 10),
      themes,
      topTheme: themes[0],
      sentimentAvg: sentimentAvg != null ? parseFloat(sentimentAvg.toFixed(2)) : undefined,
      sentimentLabel: sentimentAvg != null ? sentimentLabel(sentimentAvg) : undefined,
      briefs: buildBriefs(allItems, themes),
      source: 'Reuters / BBC / GDELT',
      fetchedAt: new Date().toISOString(),
      unavailable: allItems.length === 0,
      unavailableReason: allItems.length === 0 ? 'No news sources returned data' : undefined,
    }

    CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + TTL_MS })
    return result
  } catch (err) {
    const result: NewsBriefResult = {
      query: queryLabel,
      headlines: [],
      themes: [],
      briefs: [],
      source: 'Reuters / BBC / GDELT',
      fetchedAt: new Date().toISOString(),
      unavailable: true,
      unavailableReason: (err as Error).message,
    }
    return result
  }
}
