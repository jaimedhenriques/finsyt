import { NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'
import { auth } from '@/lib/auth-server'
import { checkAiQueryEntitlement } from '@/lib/billing'
import { resolveLocalOrgId } from '@/lib/org-resolver'
import { buildConnectorAgentTools, invokeConnectorTool, type AgentTool as ConnectorAgentTool } from '@/lib/connectors/agent-tools'
import { runAgent } from '@/lib/agent-core'
import { SLIDE_TITLES } from '@/lib/investment-memo-pptx'
import { generateInvestmentMemo, getSectionAvailability, MemoGenerationError } from '@/lib/memo-service'
import { buildAgentToolResultPayload } from '@/lib/agent-tool-result-payload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Helper: forward request cookies + auth headers to internal API routes so
// peer-set tools execute under the caller's Clerk session (not anonymously).
async function forwardHeaders(): Promise<Record<string, string>> {
  const ck = await cookies()
  const hd = await headers()
  const out: Record<string, string> = {}
  const cookieStr = ck.getAll().map((c) => `${c.name}=${c.value}`).join('; ')
  if (cookieStr) out.cookie = cookieStr
  const auth = hd.get('authorization')
  if (auth) out.authorization = auth
  return out
}

// ── Investment-memo deck intent detection ────────────────────────────────────
// Matches phrasings like:
//   "Generate a powerpoint using my investment memo template"
//   "Build a pptx for NVDA"
//   "Create an investment memo deck on Microsoft"
//   "Make me a slide deck for AAPL"
const DECK_VERB_RE   = /\b(generate|build|create|make|produce|put together|prepare|export)\b/i
const DECK_NOUN_RE   = /\b(powerpoint|pptx|\bppt\b|slide\s*deck|\bdeck\b|investment\s*memo|memo\s*template|presentation)\b/i
const TICKER_RE      = /\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/g
const TICKER_SHAPE_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/
// Common English words we must NOT mis-classify as tickers when they happen
// to be 1–5 uppercase letters in a sentence.
const TICKER_STOPWORDS = new Set([
  'A','I','AN','AT','BE','BY','FOR','OF','ON','OR','SO','TO','THE','AND','BUT','IF',
  'GENERATE','BUILD','CREATE','MAKE','PRODUCE','POWERPOINT','PPTX','PPT','PPT','DECK',
  'SLIDE','SLIDES','INVESTMENT','MEMO','TEMPLATE','PRESENTATION','USING','MY','OUR',
  'PLEASE','REPORT','REPORTS','DCF','EPS','PE','EV','PER','SHARE','LTM','NTM','YTD',
  'IPO','CEO','CFO','SEC','GAAP','ESG','API','ETF','M&A','MA','SP','SPX','VS','US','USA','UK','EU',
])

interface DeckIntent { ticker: string | null; matched: boolean; resolvedFromName?: string }

// Words to strip when extracting the residual "company name" hint from a
// deck-generation prompt. These are deck verbs/nouns + filler words that
// would otherwise pollute the lookup query (e.g. "Generate a powerpoint
// using my investment memo template for Microsoft" → "Microsoft").
const NAME_STRIP_RE = /\b(generate|create|make|build|render|produce|export|please|kindly|a|an|the|my|our|using|with|from|investment|memo|template|powerpoint|pptx|deck|slides|slide|presentation|report|reports|for|on|about|of|company|stock|ticker|today|now)\b/gi

function residualCompanyName(question: string): string {
  return question
    .replace(/\$[A-Z]{1,5}/g, ' ')                  // strip cashtags
    .replace(/[\.,;:!?'"`()\[\]{}]/g, ' ')          // punctuation
    .replace(NAME_STRIP_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface SymbolSearchHit {
  symbol?: string
  name?: string
  type?: string
}

function rankAndPickTicker(results: SymbolSearchHit[], name: string): string | null {
  if (!results.length) return null
  const wanted = name.toLowerCase()
  const score = (x: SymbolSearchHit): number => {
    let s = 0
    const sym = (x.symbol || '').toUpperCase()
    const type = (x.type || '').toLowerCase()
    if (TICKER_SHAPE_RE.test(sym) && !sym.includes('.')) s += 3
    if (type.includes('stock') || type.includes('common') || type.includes('equity')) s += 2
    if ((x.name || '').toLowerCase().includes(wanted)) s += 1
    return s
  }
  const ranked = [...results].sort((a, b) => score(b) - score(a))
  const top = ranked[0]
  const sym = (top?.symbol || '').toUpperCase()
  return TICKER_SHAPE_RE.test(sym) ? sym : null
}

/**
 * Resolve a company name to a ticker. Tries the platform's internal
 * /api/search aggregator first (which fans out to FMP, Yahoo, EODHD,
 * Finnhub when keys are configured), then falls back to Yahoo's free
 * public search endpoint so the deck flow keeps working in dev / on
 * environments without commercial data keys.
 */
async function resolveCompanyName(name: string, baseUrl: string): Promise<string | null> {
  if (!name || name.length < 2) return null

  // 1) Internal aggregator search.
  try {
    const r = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(name)}&limit=5`, { cache: 'no-store' })
    if (r.ok) {
      const j = (await r.json()) as { results?: SymbolSearchHit[] }
      const sym = rankAndPickTicker(j?.results || [], name)
      if (sym) return sym
    }
  } catch { /* fall through to Yahoo */ }

  // 2) Free Yahoo Finance public search — no API key required.
  try {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(name)}&quotesCount=5&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinsytAgent/1.0)' }, cache: 'no-store' },
    )
    if (r.ok) {
      const j = (await r.json()) as { quotes?: YahooSearchQuote[] }
      const results: SymbolSearchHit[] = (j.quotes || []).map(q => ({
        symbol: q.symbol,
        name:   q.longname || q.shortname || q.symbol,
        type:   q.quoteType || q.typeDisp,
      }))
      const sym = rankAndPickTicker(results, name)
      if (sym) return sym
    }
  } catch { /* swallow — return null below */ }

  return null
}

interface YahooSearchQuote {
  symbol?:    string
  longname?:  string
  shortname?: string
  quoteType?: string
  typeDisp?:  string
}

async function detectDeckIntent(
  question: string,
  context: Record<string, unknown> | undefined,
  baseUrl: string,
): Promise<DeckIntent> {
  const matched = DECK_VERB_RE.test(question) && DECK_NOUN_RE.test(question)
  if (!matched) return { ticker: null, matched: false }

  // 1) Prefer caller-supplied page context (e.g. user is on the company page).
  const ctxSym = typeof context?.symbol === 'string' ? context.symbol.toUpperCase() : null
  if (ctxSym && TICKER_SHAPE_RE.test(ctxSym)) return { ticker: ctxSym, matched: true }

  // 2) Look for an explicit "for <TICKER>" / "on <TICKER>" / "of <TICKER>" pattern.
  const forMatch = question.match(/\b(?:for|on|about|of)\s+\$?([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/)
  if (forMatch && !TICKER_STOPWORDS.has(forMatch[1])) return { ticker: forMatch[1].toUpperCase(), matched: true }

  // 3) Look for a $TICKER cashtag.
  const cashtag = question.match(/\$([A-Z]{1,5}(?:\.[A-Z]{1,2})?)/)
  if (cashtag) return { ticker: cashtag[1].toUpperCase(), matched: true }

  // 4) Scan all-caps tokens, drop stopwords. If exactly one survives, use it.
  const candidates = (question.match(TICKER_RE) || [])
    .map(t => t.toUpperCase())
    .filter(t => !TICKER_STOPWORDS.has(t))
  if (candidates.length === 1) return { ticker: candidates[0], matched: true }

  // 5) Final fallback: try to resolve a company name via the search API
  //    (e.g. "Generate a powerpoint for Microsoft" → MSFT).
  const residual = residualCompanyName(question)
  if (residual) {
    const sym = await resolveCompanyName(residual, baseUrl)
    if (sym) return { ticker: sym, matched: true, resolvedFromName: residual }
  }

  return { ticker: null, matched: true }
}

const DECK_RATE_WINDOW_MS = 5 * 60 * 1000
const DECK_RATE_MAX = 10
const deckRateBuckets = new Map<string, { count: number; resetAt: number }>()
function checkDeckRate(key: string): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const b = deckRateBuckets.get(key)
  if (!b || b.resetAt < now) {
    deckRateBuckets.set(key, { count: 1, resetAt: now + DECK_RATE_WINDOW_MS })
    return { ok: true, remaining: DECK_RATE_MAX - 1, resetAt: now + DECK_RATE_WINDOW_MS }
  }
  if (b.count >= DECK_RATE_MAX) return { ok: false, remaining: 0, resetAt: b.resetAt }
  b.count += 1
  return { ok: true, remaining: DECK_RATE_MAX - b.count, resetAt: b.resetAt }
}

// Provider precedence: a directly configured OPENAI_API_KEY always wins so
// operators can override the platform-default Replit AI Integrations proxy.
// When no direct key is set, fall back to the proxy if both its base URL and
// key are present.
const PROXY_BASE = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || ''
const PROXY_KEY  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY  || ''
const DIRECT_KEY = process.env.OPENAI_API_KEY || ''
const USE_DIRECT = !!DIRECT_KEY
const USE_PROXY  = !USE_DIRECT && !!(PROXY_BASE && PROXY_KEY)
const OPENAI_BASE = USE_PROXY ? PROXY_BASE : 'https://api.openai.com/v1'
const OPENAI_KEY  = USE_DIRECT ? DIRECT_KEY : (USE_PROXY ? PROXY_KEY : '')
// gpt-4o-mini works on both Replit AI Integrations proxy and OpenAI direct.
// Override via AGENT_MODEL env var (e.g. gpt-5-mini, gpt-4o, etc.).
const MODEL       = process.env.AGENT_MODEL || 'gpt-4o-mini'

const SYSTEM_PROMPT = `You are Finsyt's institutional research agent.

Your job: answer the user's financial question by planning, calling tools to gather REAL data from the platform's data routes, and synthesising a grounded answer.

Rules:
- Always plan first. Call multiple tools in parallel when independent (e.g. quote + news + filings for the same ticker).
- Cite EVERY non-trivial claim with the matching source label like (FMP quote), (10-K 2024-Feb-21), (Reuters 03:14), (FRED).
- If the question is about one or more tickers, prefer get_quote + get_financials + get_news. For "earnings call" or "guidance" → get_transcripts. For "10-K", "10-Q", "8-K", "filing" → get_filings. For "GDP", "inflation", "rates" → get_macro.
- Be concise but complete. Lead with the so-what in 1-2 sentences, then a "Key facts" bullet list with bold labels and inline citations, then a short "Risk / what could be wrong" section.
- If a tool returns nothing useful, say so explicitly — do not hallucinate.
- For peer / comp-set work: prefer list_peer_sets first to discover what the workspace already has. Use compare_peers for "compare my peers on…" requests. The mutating tools (create_peer_set, modify_peer_set) require user confirmation in the UI — when you call them you will receive a "pending" result; tell the user clearly what you've drafted and that they need to click Confirm.
- Format the final answer as Markdown.`

// ── Tool registry ────────────────────────────────────────────────────────────
// `kind: 'write'` tools never mutate directly — the route emits a
// `confirm_required` SSE event with the proposed action and returns a
// "pending" payload to the model. The drawer renders an inline confirm card;
// the user must click Approve before the platform mutates anything.
type ToolDef = {
  name: string
  description: string
  parameters: any
  kind?: 'read' | 'write'
  run: (args: any, baseUrl: string, fwd: Record<string, string>) => Promise<any>
}

async function safeFetch(url: string, init?: RequestInit): Promise<any> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init })
    if (!r.ok) return { error: `HTTP ${r.status}` }
    const ct = r.headers.get('content-type') || ''
    return ct.includes('application/json') ? await r.json() : await r.text()
  } catch (e) {
    return { error: String((e as Error).message || e) }
  }
}

// ── Free public-data fallbacks (no API keys required) ────────────────────────
async function yahooQuoteFree(symbol: string): Promise<any> {
  const d = await safeFetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinsytAgent/1.0)' } },
  )
  const r = d?.chart?.result?.[0]
  if (!r) return null
  const meta = r.meta || {}
  const price = meta.regularMarketPrice
  const prev  = meta.chartPreviousClose ?? meta.previousClose
  return {
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || symbol,
    price,
    previousClose: prev,
    changePct: (price && prev) ? +(((price - prev) / prev) * 100).toFixed(2) : null,
    currency: meta.currency,
    exchange: meta.exchangeName || meta.fullExchangeName,
    high52w: meta.fiftyTwoWeekHigh,
    low52w:  meta.fiftyTwoWeekLow,
    volume: meta.regularMarketVolume,
    source: 'Yahoo Finance (public chart endpoint)',
  }
}

async function yahooQuoteSummaryFree(symbol: string): Promise<any> {
  const d = await safeFetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinsytAgent/1.0)' } },
  )
  return d?.quoteResponse?.result?.[0] || null
}

async function secCikFor(symbol: string): Promise<string | null> {
  // SEC publishes a ticker→CIK map. Cache via Next's default fetch cache.
  try {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': 'Finsyt Agent contact@finsyt.dev' },
      next: { revalidate: 86400 },
    })
    if (!r.ok) return null
    const j: any = await r.json()
    const up = symbol.toUpperCase()
    for (const k of Object.keys(j)) {
      if (j[k]?.ticker?.toUpperCase() === up) return String(j[k].cik_str).padStart(10, '0')
    }
    return null
  } catch { return null }
}

async function secFilingsFree(symbol: string, type?: string): Promise<any[]> {
  const cik = await secCikFor(symbol)
  if (!cik) return []
  const d = await safeFetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { 'User-Agent': 'Finsyt Agent contact@finsyt.dev' },
  })
  const recent = d?.filings?.recent
  if (!recent?.form) return []
  const out: any[] = []
  for (let i = 0; i < recent.form.length && out.length < 8; i++) {
    if (type && recent.form[i] !== type) continue
    const acc = recent.accessionNumber[i].replace(/-/g, '')
    const primary = recent.primaryDocument[i]
    out.push({
      form: recent.form[i],
      filed: recent.filingDate[i],
      description: recent.primaryDocDescription?.[i] || recent.form[i],
      url: `https://www.sec.gov/Archives/edgar/data/${parseInt(cik,10)}/${acc}/${primary}`,
    })
  }
  return out
}

function trim<T = any>(arr: T[] | undefined, n: number): T[] {
  return Array.isArray(arr) ? arr.slice(0, n) : []
}

const TOOLS: ToolDef[] = [
  {
    name: 'get_quote',
    description: 'Real-time quote, market cap, P/E, 52w range, sector, industry for a single US/intl ticker.',
    parameters: { type: 'object', properties: { symbol: { type: 'string', description: 'Ticker symbol e.g. NVDA, AAPL' } }, required: ['symbol'] },
    run: async (a, base) => {
      // Try internal route (paid keys) first; fall back to free Yahoo public chart.
      const d = await safeFetch(`${base}/api/quote?symbol=${encodeURIComponent(a.symbol)}`)
      const q = (d && !d.error) ? (d.quote || d) : null
      if (q?.price) {
        return {
          symbol: q.symbol, name: q.name, price: q.price, changePct: q.changePct,
          marketCap: q.marketCap, pe: q.pe, eps: q.eps, revenue: q.revenue,
          high52w: q.high52w, low52w: q.low52w, sector: q.sector, industry: q.industry,
          exchange: q.exchange, source: 'FMP / EODHD',
        }
      }
      // Free fallback
      const [free, summary] = await Promise.all([
        yahooQuoteFree(a.symbol),
        yahooQuoteSummaryFree(a.symbol).catch(() => null),
      ])
      if (!free) return { empty: true, note: 'No data found for this symbol on free or paid sources.' }
      return {
        ...free,
        marketCap: summary?.marketCap,
        pe: summary?.trailingPE,
        eps: summary?.epsTrailingTwelveMonths,
      }
    },
  },
  {
    name: 'get_news',
    description: 'Latest news headlines for a ticker (or general market if symbol omitted). Returns up to 6 items.',
    parameters: { type: 'object', properties: { symbol: { type: 'string' }, limit: { type: 'number' } }, required: [] },
    run: async (a, base) => {
      const url = `${base}/api/news?${a.symbol ? `symbol=${encodeURIComponent(a.symbol)}&` : ''}limit=${Math.min(a.limit || 6, 10)}`
      const d = await safeFetch(url)
      let articles = trim(d?.articles || d?.news || [], 6)
      // Free fallback: Yahoo RSS (no key required)
      if ((!articles || articles.length === 0)) {
        const sym = a.symbol || '%5EGSPC'
        const rss = await safeFetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`)
        if (typeof rss === 'string') {
          const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6)
          articles = items.map(m => {
            const blk = m[1]
            const grab = (tag: string) => (blk.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`)) || blk.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)))?.[1]?.trim()
            return {
              title: grab('title'),
              link: grab('link'),
              pubDate: grab('pubDate'),
              source: 'Yahoo Finance',
            }
          })
        }
      }
      return { articles: articles.map((n: any) => ({
        title: n.title || n.headline,
        source: n.source || n.publisher || n.site,
        date: n.date || n.publishedAt || n.published_at || n.pubDate,
        url: n.url || n.link,
      })) }
    },
  },
  {
    name: 'get_filings',
    description: 'SEC filings list for a US ticker. Optional type filter (10-K, 10-Q, 8-K, DEF 14A).',
    parameters: { type: 'object', properties: { symbol: { type: 'string' }, type: { type: 'string' } }, required: ['symbol'] },
    run: async (a, base) => {
      const url = `${base}/api/filings?symbol=${encodeURIComponent(a.symbol)}${a.type ? `&type=${encodeURIComponent(a.type)}` : ''}&limit=8`
      const d = await safeFetch(url)
      let list = trim(d?.filings || d?.results || [], 8)
      if ((!list || list.length === 0)) {
        list = await secFilingsFree(a.symbol, a.type)
      }
      return { filings: list.map((f: any) => ({
        form: f.form || f.type, filed: f.filedAt || f.date || f.filed,
        description: f.description || f.title, url: f.linkToHtml || f.url,
      })) }
    },
  },
  {
    name: 'get_financials',
    description: 'Income / balance / cash-flow statement summary for a ticker (annual, last 3 years).',
    parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    run: async (a, base) => {
      const d = await safeFetch(`${base}/api/financials?symbol=${encodeURIComponent(a.symbol)}&type=income&period=annual&limit=3`)
      const rows = Array.isArray(d) ? d : (d?.statements || d?.income || d?.data || [])
      return { years: trim(rows, 3).map((r: any) => ({
        year: r.calendarYear || r.fiscalYear || r.date,
        revenue: r.revenue, grossProfit: r.grossProfit, operatingIncome: r.operatingIncome,
        netIncome: r.netIncome, eps: r.epsdiluted || r.eps,
      })) }
    },
  },
  {
    name: 'get_estimates',
    description: 'Sell-side analyst consensus estimates and price targets.',
    parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    run: async (a, base) => {
      const d = await safeFetch(`${base}/api/estimates?symbol=${encodeURIComponent(a.symbol)}`)
      return d?.estimates || d?.consensus || d || { empty: true }
    },
  },
  {
    name: 'get_transcripts',
    description: 'Earnings call transcripts list for a ticker (most recent first).',
    parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    run: async (a, base) => {
      const d = await safeFetch(`${base}/api/transcripts?symbol=${encodeURIComponent(a.symbol)}&limit=4`)
      const list = d?.transcripts || d?.results || []
      return { transcripts: trim(list, 4).map((t: any) => ({
        symbol: t.symbol, year: t.year, quarter: t.quarter,
        date: t.date, url: t.url, excerpt: typeof t.content === 'string' ? t.content.slice(0, 600) : undefined,
      })) }
    },
  },
  {
    name: 'get_macro',
    description: 'Macro-economic indicator series. Indicators: GDP_GROWTH_RATE, INFLATION_RATE, UNEMPLOYMENT_RATE, INTEREST_RATE.',
    parameters: { type: 'object', properties: { country: { type: 'string' }, indicator: { type: 'string' } }, required: ['indicator'] },
    run: async (a, base) => {
      const url = `${base}/api/macro?country=${encodeURIComponent(a.country || 'US')}&indicator=${encodeURIComponent(a.indicator)}&periods=12`
      const d = await safeFetch(url)
      return d?.series || d || { empty: true }
    },
  },
]

// ── Peer-set tools ────────────────────────────────────────────────────────
// All peer tools forward the caller's auth (cookies/headers) so they execute
// as the signed-in workspace user. Read tools call back into our own API;
// writes are intercepted by the route loop and gated on user confirmation.
TOOLS.push(
  {
    name: 'list_peer_sets',
    description: 'List all peer/comp sets the workspace has saved. Returns id, name, member symbols, and member count for each.',
    parameters: { type: 'object', properties: {}, required: [] },
    kind: 'read',
    run: async (_a, base, fwd) => {
      const d = await safeFetch(`${base}/api/peers/sets`, { headers: fwd })
      const sets = Array.isArray(d?.sets) ? d.sets : []
      return { sets: sets.map((s: any) => ({
        id: s.id, name: s.name, description: s.description,
        symbols: s.symbols || [], memberCount: (s.symbols || []).length,
      })) }
    },
  },
  {
    name: 'get_peer_set',
    description: 'Get one peer set with its members. Look it up by id (preferred) or by exact name (case-insensitive fallback).',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: [],
    },
    kind: 'read',
    run: async (a, base, fwd) => {
      if (a.id) {
        const d = await safeFetch(`${base}/api/peers/sets/${encodeURIComponent(a.id)}`, { headers: fwd })
        return d?.set ? { set: d.set } : { error: d?.error || 'not found' }
      }
      if (a.name) {
        const d = await safeFetch(`${base}/api/peers/sets`, { headers: fwd })
        const sets = Array.isArray(d?.sets) ? d.sets : []
        const found = sets.find((s: any) => (s.name || '').toLowerCase() === String(a.name).toLowerCase())
        return found ? { set: found } : { error: `no peer set named "${a.name}"`, available: sets.map((s: any) => s.name) }
      }
      return { error: 'provide id or name' }
    },
  },
  {
    name: 'compare_peers',
    description: 'Compare a peer set across NTM forward P/E, EV/EBITDA, and exercisable-options metrics. Pass either setId, or symbols (array, with the subject/anchor symbol first).',
    parameters: {
      type: 'object',
      properties: {
        setId: { type: 'string' },
        symbols: { type: 'array', items: { type: 'string' }, description: 'Subject (anchor) symbol first.' },
        subject: { type: 'string', description: 'Optional override subject/anchor when passing symbols.' },
      },
      required: [],
    },
    kind: 'read',
    run: async (a, base, fwd) => {
      const qp = new URLSearchParams()
      if (a.setId) qp.set('setId', a.setId)
      if (Array.isArray(a.symbols) && a.symbols.length) qp.set('symbols', a.symbols.join(','))
      if (a.subject) qp.set('subject', a.subject)
      const d = await safeFetch(`${base}/api/peers/compare?${qp}`, { headers: fwd })
      if (d?.error) return { error: d.error }
      // /api/peers/compare returns rows with shape:
      //   { symbol, name, ok, cells: { [metric]: { value, display, demo? } } }
      // Surface the three institutional cells (forwardPe / evEbitdaNtm /
      // optionsItmPct) directly as numbers + booleans so the model — and
      // AppShell's CompareInlineTable — can render without re-traversing
      // the nested cell envelope.
      const subject: string | null = d?.subject ?? null
      const cellNum = (cells: any, key: string) =>
        cells && typeof cells[key]?.value === 'number' && Number.isFinite(cells[key].value)
          ? cells[key].value as number
          : null
      const cellDemo = (cells: any, key: string) => !!cells?.[key]?.demo
      return {
        setName: d?.setName ?? null,
        subject,
        anchor: subject, // back-compat alias for older renderers
        rows: (d?.rows || []).map((r: any) => ({
          symbol: r.symbol,
          isAnchor: subject ? r.symbol === subject : false,
          forwardPe:     cellNum(r.cells, 'forwardPe'),
          evEbitdaNtm:   cellNum(r.cells, 'evEbitdaNtm'),
          optionsItmPct: cellNum(r.cells, 'optionsItmPct'),
          demo:          cellDemo(r.cells, 'forwardPe')
                      || cellDemo(r.cells, 'evEbitdaNtm')
                      || cellDemo(r.cells, 'optionsItmPct'),
        })),
        note: 'NTM and options metrics are deterministic synthesised demo values flagged demo:true. Live data integration pending.',
      }
    },
  },
  {
    name: 'create_peer_set',
    description: 'Draft a new peer/comp set in the workspace. Requires user confirmation in the UI before saving.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        symbols: { type: 'array', items: { type: 'string' }, description: 'List of ticker symbols (uppercase).' },
      },
      required: ['name', 'symbols'],
    },
    kind: 'write',
    run: async () => ({ pending: true }), // intercepted by the route loop
  },
  {
    name: 'modify_peer_set',
    description: 'Add or remove a single ticker from a saved peer set. Requires user confirmation in the UI before applying.',
    parameters: {
      type: 'object',
      properties: {
        setId: { type: 'string' },
        op: { type: 'string', enum: ['add', 'remove'] },
        symbol: { type: 'string' },
      },
      required: ['setId', 'op', 'symbol'],
    },
    kind: 'write',
    run: async () => ({ pending: true }), // intercepted by the route loop
  },
)

const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.name, t]))
const OPENAI_TOOLS = TOOLS.map(t => ({
  type: 'function' as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}))

// ── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { orgId } = await auth()
  const entitlement = await checkAiQueryEntitlement(orgId, { increment: true })
  if (!entitlement.allowed) {
    return new Response(
      JSON.stringify({
        error: entitlement.reason ?? 'Upgrade required',
        tier: entitlement.tier,
        aiQueriesUsed: entitlement.aiQueriesUsed,
        aiQueriesLimit: entitlement.aiQueriesLimit,
        upgradeUrl: '/platform/app/upgrade',
      }),
      { status: 402, headers: { 'content-type': 'application/json' } },
    )
  }

  let body: { question?: string; symbols?: string[]; context?: Record<string, unknown> } = {}
  try { body = await req.json() } catch {}
  const question = (body.question || '').trim()
  if (!question) return new Response(JSON.stringify({ error: 'question required' }), { status: 400 })

  // Surface-aware behaviour: when the caller declares itself the Excel add-in
  // via `X-Finsyt-Surface: excel`, delegate to the shared `runAgent` core
  // which knows how to emit `event: action` frames (insert_formula /
  // write_range / insert_template) for the task pane to apply. Everything
  // else (default platform UI) keeps the legacy inline-tools path below so
  // the existing in-product copilot is unchanged.
  const surfaceHeader = (req.headers.get('x-finsyt-surface') || '').toLowerCase()
  const isExcelSurface = surfaceHeader === 'excel'

  // Optional caller-supplied page context (e.g. { page: 'company', symbol: 'AAPL', sector: 'Tech' }).
  // We surface it to the model as a structured preface so answers can ground in
  // the user's current view without forcing every chip prompt to repeat it.
  let contextPreface = ''
  if (body.context && typeof body.context === 'object') {
    try {
      const ctx = JSON.stringify(body.context)
      if (ctx && ctx !== '{}') {
        contextPreface = isExcelSurface
          ? `Spreadsheet context (JSON; selection / sheet / nearby values): ${ctx}\n\n`
          : `User is currently viewing this page state (JSON): ${ctx}\n\n`
      }
    } catch { /* ignore unserialisable context */ }
  }

  // Internal API routes are mounted under the artifact basePath (set by
  // `next.config.ts → basePath`), so any server-to-server fetch from a route
  // handler must include it. We trust `req.nextUrl.basePath` (populated from
  // next.config) and fall back to the env mirror, never to a hardcoded literal.
  const basePath = req.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || ''
  const baseUrl  = `${req.nextUrl.origin}${basePath}`
  const encoder = new TextEncoder()

  // Excel add-in surface: delegate to shared runAgent which emits action
  // frames (insert_formula / write_range / insert_template). The legacy
  // connector-aware path below is reserved for the in-product platform UI.
  if (isExcelSurface) {
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            )
          } catch { /* closed */ }
        }
        try {
          // Cookie-auth caller: tools hit `/api/*` and need the user's
          // Clerk session cookie to clear middleware.
          const cookieHdr = req.headers.get('cookie')
          await runAgent({
            question,
            baseUrl,
            contextPreface,
            surface: 'excel',
            signal: req.signal,
            send,
            dataRoutePrefix: '/api',
            forwardHeaders: cookieHdr ? { cookie: cookieHdr } : undefined,
          })
        } catch (e) {
          send('error', { message: (e as Error)?.message || String(e) })
        } finally {
          try { controller.close() } catch { /* already closed */ }
        }
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  // ── Deck-generation fast path ─────────────────────────────────────────────
  // If the question reads as "generate a powerpoint / pptx / investment memo
  // deck", short-circuit the LLM loop and stream a deterministic,
  // tool-driven generation pipeline. This guarantees a real downloadable
  // PPTX populated with live ticker data instead of asking the model to
  // produce slide markdown.
  const intent = await detectDeckIntent(question, body.context, baseUrl)
  if (intent.matched) {
    const { userId, orgId } = await auth()
    const deckStream = new ReadableStream({
      async start(controller) {
        const send = <T>(event: string, data: T) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }
        const fail = (msg: string) => { send('error', { message: msg }); send('done', { ok: false }); controller.close() }

        if (!userId) return fail('Sign in to generate investment memo decks.')
        if (!intent.ticker) {
          return fail('I can build the investment memo deck — which ticker should I use? Try "Generate a powerpoint using my investment memo template for MSFT".')
        }

        const rate = checkDeckRate(userId)
        if (!rate.ok) {
          const wait = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))
          return fail(`You've hit the deck-generation rate limit (${DECK_RATE_MAX} per 5 min). Please wait ${wait}s and try again.`)
        }

        send('step', { kind: 'plan', label: `Building investment memo deck for ${intent.ticker}…` })
        send('tool_call', { id: 'memo-1', name: 'assemble_memo_data', args: { ticker: intent.ticker } })

        // Track per-stage timings so the deck card can show the same
        // "Data sources used" footer the chat answer surfaces.
        const memoT0 = Date.now()
        let memoAssembleAt = memoT0
        try {
          const result = await generateInvestmentMemo({
            baseUrl,
            ticker: intent.ticker,
            userId,
            orgId: orgId || null,
            source: 'agent_ask_intent',
            onStage: (e) => {
              if (e.stage === 'assemble_done' && e.data) {
                const flags = getSectionAvailability(e.data)
                const available = Object.values(flags).filter(Boolean).length
                memoAssembleAt = Date.now()
                send('tool_result', buildAgentToolResultPayload({
                  id: 'memo-1',
                  name: 'assemble_memo_data',
                  out: { ticker: e.data.identity.ticker, sectionAvail: flags },
                  responseMs: memoAssembleAt - memoT0,
                  summarise: () =>
                    `${e.data.identity.ticker} · ${e.data.identity.name} · ${available}/${SLIDE_TITLES.length} sections populated`,
                  providerOverride: 'Finsyt memo assembler',
                  rawMaxLen: 600,
                }))
                send('step', { kind: 'tools', label: `Rendering ${SLIDE_TITLES.length}-slide PPTX…` })
                send('tool_call', { id: 'memo-2', name: 'build_pptx', args: { slides: SLIDE_TITLES.length } })
              } else if (e.stage === 'store_done' && e.fileId && e.bytes != null) {
                send('tool_result', buildAgentToolResultPayload({
                  id: 'memo-2',
                  name: 'build_pptx',
                  out: { fileId: e.fileId, bytes: e.bytes },
                  responseMs: Date.now() - memoAssembleAt,
                  summarise: () =>
                    `${(e.bytes / 1024).toFixed(0)} KB · ${SLIDE_TITLES.length} slides`,
                  providerOverride: 'pptxgenjs renderer',
                }))
              }
            },
          })

          send('deck_ready', {
            kind: 'investment_memo',
            fileId:      result.fileId,
            filename:    result.filename,
            // Same-origin URL (proxied) so browser stays inside the artifact's
            // basePath and shares cookies/auth.
            downloadUrl: `${basePath}/api/copilot/memo/${result.fileId}`,
            bytes:       result.bytes,
            expiresAt:   result.expiresAt,
            ticker:      result.ticker,
            companyName: result.companyName,
            asOf:        result.asOf,
            sourceLine:  result.sourceLine,
            slideTitles: result.slideTitles,
            thumbnails:  result.thumbnails,
            sectionAvailability: result.sectionAvailability,
          })

          // Conversational confirmation streamed as answer chunks so the
          // existing transcript renderer shows a natural "I built it" line.
          const missing = (Object.entries(result.sectionAvailability) as [string, boolean][])
            .filter(([, ok]) => !ok).map(([k]) => k)
          const summaryLine = `Built a 6-slide investment memo deck for **${result.ticker} · ${result.companyName}** using live data as of ${result.asOf}.${missing.length ? ` Sections rendered as "Data unavailable": ${missing.join(', ')}.` : ''} Download it from the file card above.`
          const chunkSize = 40
          for (let i = 0; i < summaryLine.length; i += chunkSize) {
            send('answer_chunk', { text: summaryLine.slice(i, i + chunkSize) })
            await new Promise(r => setTimeout(r, 8))
          }
          send('done', { ok: true })
          controller.close()
        } catch (e) {
          if (e instanceof MemoGenerationError) {
            const toolId = e.stage === 'assemble' || e.stage === 'empty' ? 'memo-1' : 'memo-2'
            const toolName = e.stage === 'assemble' || e.stage === 'empty' ? 'assemble_memo_data' : 'build_pptx'
            send('tool_result', { id: toolId, name: toolName, ok: false, summary: 'failed', raw: e.message.slice(0, 600) })
            return fail(e.message)
          }
          return fail(`Deck generation failed: ${(e as Error).message}`)
        }
      },
    })

    return new Response(deckStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  // The deterministic deck-generation fast path above does not require LLM
  // credentials — it builds the PPTX from authenticated FMP/internal API data
  // alone. Only the model-driven Q&A pipeline below needs an OpenAI key, so
  // gate the OPENAI_KEY check here rather than at the top of the handler.
  if (!OPENAI_KEY) {
    return new Response(JSON.stringify({ error: 'OpenAI integration not configured' }), { status: 500 })
  }

  // ── Connector tools (best-effort) ─────────────────────────────────────────
  // If the request is authenticated and the workspace has any active
  // connections, append their operations as additional OpenAI tools so the
  // agent can call them. Failures are swallowed — the built-in TOOLS list
  // remains the baseline contract.
  let connectorTools: ConnectorAgentTool[] = []
  let workspaceOrgId: string | null = null
  let actorUserId: string | null = null
  try {
    const session = await auth()
    if (session.userId && session.orgId) {
      actorUserId = session.userId
      workspaceOrgId = await resolveLocalOrgId(session.orgId)
      connectorTools = await buildConnectorAgentTools(workspaceOrgId)
    }
  } catch { /* anonymous request or DB hiccup — keep going without connectors */ }
  const CONNECTOR_TOOL_MAP = new Map(connectorTools.map(t => [t.name, t]))
  const effectiveOpenAITools = [
    ...OPENAI_TOOLS,
    ...connectorTools.map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })),
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      send('step', { kind: 'plan', label: 'Planning approach…' })

      const messages: any[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: contextPreface + question },
      ]

      try {
        for (let turn = 0; turn < 5; turn++) {
          if (req.signal.aborted) { controller.close(); return }
          const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
            body: JSON.stringify({
              model: MODEL,
              messages,
              tools: effectiveOpenAITools,
              tool_choice: 'auto',
              parallel_tool_calls: true,
            }),
            signal: req.signal,
          })
          if (!r.ok) {
            const txt = await r.text()
            send('error', { message: `Model error ${r.status}: ${txt.slice(0, 300)}` })
            controller.close()
            return
          }
          const j = await r.json()
          const msg = j.choices?.[0]?.message
          if (!msg) { send('error', { message: 'No model response' }); controller.close(); return }

          // If the model issued tool calls, execute them in parallel.
          if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
            messages.push(msg)
            send('step', { kind: 'tools', label: `Calling ${msg.tool_calls.length} tool${msg.tool_calls.length > 1 ? 's' : ''}…` })

            const fwd = await forwardHeaders()
            const results = await Promise.all(msg.tool_calls.map(async (tc: any) => {
              const def = TOOL_MAP[tc.function.name]
              const connectorDef = CONNECTOR_TOOL_MAP.get(tc.function.name)
              let args: any = {}
              try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
              send('tool_call', { id: tc.id, name: tc.function.name, args })

              // Write tools never auto-mutate — surface a confirm card to the
              // user and return a "pending" payload to the model so it can
              // describe what it drafted. Built-in write tools (peers) take
              // precedence; connector tools always execute directly because
              // their own backends gate side-effects.
              if (def?.kind === 'write') {
                const action = peerWriteActionFor(tc.function.name, args)
                send('confirm_required', { id: tc.id, name: tc.function.name, args, action })
                const pending = {
                  pending: true,
                  message: `Drafted ${tc.function.name} — awaiting user confirmation in the UI.`,
                  action,
                }
                send('tool_result', {
                  id: tc.id, name: tc.function.name, ok: true,
                  summary: `pending confirmation`,
                  raw: JSON.stringify(pending),
                })
                return { tool_call_id: tc.id, role: 'tool', name: tc.function.name, content: JSON.stringify(pending) }
              }

              let out: any
              // Stopwatch the tool round-trip so the client can render the
              // "Data sources used" footer with per-provider response times.
              const t0 = Date.now()
              if (def) {
                out = await def.run(args, baseUrl, fwd)
              } else if (connectorDef && workspaceOrgId) {
                out = await invokeConnectorTool(workspaceOrgId, connectorDef, args, actorUserId)
              } else {
                out = { error: 'unknown tool' }
              }
              const responseMs = Date.now() - t0
              // `buildAgentToolResultPayload` derives `provider` from
              // `out.source` (e.g. "FMP / EODHD", "Yahoo Finance") so the
              // client doesn't need to parse `raw` for it. Shape locked
              // in `lib/__tests__/agent-tool-result-payload.test.ts`.
              send('tool_result', buildAgentToolResultPayload({
                id: tc.id,
                name: tc.function.name,
                out,
                responseMs,
                summarise: summariseToolResult,
              }))
              return { tool_call_id: tc.id, role: 'tool', name: tc.function.name, content: JSON.stringify(out).slice(0, 8000) }
            }))
            for (const r of results) messages.push(r)
            continue
          }

          // Final answer — stream chunks.
          const final = msg.content || ''
          send('step', { kind: 'synthesise', label: 'Synthesising answer…' })
          const chunkSize = 40
          for (let i = 0; i < final.length; i += chunkSize) {
            send('answer_chunk', { text: final.slice(i, i + chunkSize) })
            await new Promise(r => setTimeout(r, 8))
          }
          send('done', { ok: true })
          controller.close()
          return
        }
        send('error', { message: 'Agent exceeded reasoning turn budget.' })
        controller.close()
      } catch (e: any) {
        send('error', { message: e?.message || String(e) })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function summariseToolResult(name: string, out: any): string {
  if (!out || out.error) return out?.error || 'no data'
  switch (name) {
    case 'get_quote':       return out.symbol ? `${out.symbol} $${out.price ?? '—'} · ${out.changePct ?? '—'}%` : 'no quote'
    case 'get_news':        return `${out.articles?.length || 0} headlines`
    case 'get_filings':     return `${out.filings?.length || 0} filings`
    case 'get_financials':  return `${out.years?.length || 0} years of statements`
    case 'get_transcripts': return `${out.transcripts?.length || 0} transcripts`
    case 'get_macro':       return `${Array.isArray(out) ? out.length : 'series'} datapoints`
    case 'list_peer_sets':  return `${out.sets?.length || 0} peer sets`
    case 'get_peer_set':    return out.set ? `${out.set.name} · ${(out.set.symbols || []).length} members` : 'no set'
    case 'compare_peers':   return `${out.rows?.length || 0} rows · anchor ${out.anchor || '—'}`
    default:                return JSON.stringify(out).slice(0, 80)
  }
}

// Build the canonical "action" descriptor surfaced by the confirm_required
// SSE event. The drawer reads this directly to render the confirm card and
// to issue the corresponding mutation when the user clicks Approve.
function peerWriteActionFor(toolName: string, args: any): {
  kind: 'create_peer_set' | 'add_member' | 'remove_member'
  endpoint: string
  method: 'POST' | 'DELETE'
  body?: any
  summary: string
} | null {
  if (toolName === 'create_peer_set') {
    const symbols = Array.isArray(args?.symbols)
      ? args.symbols.map((s: any) => String(s).toUpperCase()).filter(Boolean)
      : []
    return {
      kind: 'create_peer_set',
      endpoint: '/api/peers/sets',
      method: 'POST',
      body: { name: args?.name || 'Untitled set', description: args?.description || '', symbols },
      summary: `Create peer set "${args?.name || 'Untitled'}" with ${symbols.length} member${symbols.length === 1 ? '' : 's'}: ${symbols.join(', ') || '—'}`,
    }
  }
  if (toolName === 'modify_peer_set') {
    const sym = String(args?.symbol || '').toUpperCase()
    const setId = String(args?.setId || '')
    if (args?.op === 'add') {
      return {
        kind: 'add_member',
        endpoint: `/api/peers/sets/${encodeURIComponent(setId)}/members`,
        method: 'POST',
        body: { symbol: sym },
        summary: `Add ${sym} to peer set ${setId}`,
      }
    }
    if (args?.op === 'remove') {
      return {
        kind: 'remove_member',
        endpoint: `/api/peers/sets/${encodeURIComponent(setId)}/members/${encodeURIComponent(sym)}`,
        method: 'DELETE',
        summary: `Remove ${sym} from peer set ${setId}`,
      }
    }
  }
  return null
}
