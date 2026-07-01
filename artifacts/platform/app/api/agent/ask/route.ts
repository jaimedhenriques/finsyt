import { NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'
import { auth } from '@/lib/auth-server'
import { resolveLocalOrgId } from '@/lib/org-resolver'
import { buildConnectorAgentTools, invokeConnectorTool, type AgentTool as ConnectorAgentTool } from '@/lib/connectors/agent-tools'
import { runAgent } from '@/lib/agent-core'
import { SLIDE_TITLES } from '@/lib/investment-memo-pptx'
import { generateInvestmentMemo, getSectionAvailability, MemoGenerationError } from '@/lib/memo-service'
import { buildAgentToolResultPayload } from '@/lib/agent-tool-result-payload'
import { resolveEntitlementContext, checkAndConsumeAiQuery } from '@/lib/billing-server'
import { classifySymbol, ASSET_CLASS_LABEL } from '@/lib/asset-class'

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

// ── Word memo intent detection ────────────────────────────────────────────────
// Matches phrasings like:
//   "Generate a Word document for NVDA"
//   "Create a Word memo on Apple"
//   "Export a .docx investment memo for MSFT"
//   "Build me a Word report for Tesla"
const WORD_VERB_RE = /\b(generate|build|create|make|produce|export|prepare|write|draft)\b/i
const WORD_NOUN_RE = /\b(word\s*(?:doc(?:ument)?|memo|report|file)?|\.docx|docx|word\b)\b/i
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

// Reuse the same ticker-resolution logic for the Word memo fast path.
async function detectWordIntent(
  question: string,
  context: Record<string, unknown> | undefined,
  baseUrl: string,
): Promise<DeckIntent> {
  const matched = WORD_VERB_RE.test(question) && WORD_NOUN_RE.test(question)
  if (!matched) return { ticker: null, matched: false }
  // Reject if the question is also a deck intent — let deck fast-path win.
  if (DECK_VERB_RE.test(question) && DECK_NOUN_RE.test(question)) return { ticker: null, matched: false }

  const ctxSym = typeof context?.symbol === 'string' ? context.symbol.toUpperCase() : null
  if (ctxSym && TICKER_SHAPE_RE.test(ctxSym)) return { ticker: ctxSym, matched: true }

  const forMatch = question.match(/\b(?:for|on|about|of)\s+\$?([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/)
  if (forMatch && !TICKER_STOPWORDS.has(forMatch[1])) return { ticker: forMatch[1].toUpperCase(), matched: true }

  const cashtag = question.match(/\$([A-Z]{1,5}(?:\.[A-Z]{1,2})?)/)
  if (cashtag) return { ticker: cashtag[1].toUpperCase(), matched: true }

  const candidates = (question.match(TICKER_RE) || [])
    .map(t => t.toUpperCase())
    .filter(t => !TICKER_STOPWORDS.has(t))
  if (candidates.length === 1) return { ticker: candidates[0], matched: true }

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
// gpt-5-mini works on both Replit AI Integrations proxy and OpenAI direct.
// Override via AGENT_MODEL env var (e.g. gpt-5-mini, gpt-4o, etc.).
const MODEL       = process.env.AGENT_MODEL || 'gpt-5-mini'

// ── LLM provider fallback chain ──────────────────────────────────────────────
// When the primary provider rejects the request (401/403 auth failure) or hits
// a rate limit (429), the agent tries the next configured provider automatically.
//
// Order: OpenAI direct → Replit AI proxy → Groq → Perplexity.
// Intentionally NO per-key rejected-key circuit breaker — the credential-health
// monitor in lib/credential-health.ts relies on keys being tried each request
// to detect recovery. Silently suppressing retries would hide restored keys.
interface LlmProvider {
  name: string
  base: string
  key: string
  model: string
  // Groq/Perplexity do not support parallel_tool_calls: true
  parallel: boolean
}

const GROQ_KEY_CHAT       = process.env.GROQ_API_KEY       || ''
const PERPLEXITY_KEY_CHAT = process.env.PERPLEXITY_API_KEY || ''
const GROQ_CHAT_MODEL     = process.env.GROQ_CHAT_MODEL    || 'llama-3.3-70b-versatile'

// Built once at module load — only providers with a key are included.
const LLM_PROVIDERS: LlmProvider[] = [
  ...(USE_DIRECT        ? [{ name: 'OpenAI',     base: 'https://api.openai.com/v1',      key: DIRECT_KEY,          model: MODEL,           parallel: true  }] : []),
  ...(USE_PROXY         ? [{ name: 'Replit AI',  base: PROXY_BASE,                       key: PROXY_KEY,           model: MODEL,           parallel: true  }] : []),
  ...(GROQ_KEY_CHAT     ? [{ name: 'Groq',       base: 'https://api.groq.com/openai/v1', key: GROQ_KEY_CHAT,       model: GROQ_CHAT_MODEL, parallel: false }] : []),
  ...(PERPLEXITY_KEY_CHAT ? [{ name: 'Perplexity', base: 'https://api.perplexity.ai',    key: PERPLEXITY_KEY_CHAT, model: 'sonar-pro',     parallel: false }] : []),
]

// Classify an LLM HTTP error into a human-readable cause.
// Returns null when the status code is not a provider-key failure.
type LlmFailureKind = 'auth' | 'rate_limit' | 'error'
function classifyLlmStatus(status: number): LlmFailureKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429 || status === 402) return 'rate_limit'
  return 'error'
}

// Build the error message streamed to the user when all configured providers
// have failed. Never includes key strings or raw API responses.
function allProvidersFailedMessage(
  failures: Array<{ name: string; kind: LlmFailureKind }>,
): string {
  const authFail  = failures.find(f => f.kind === 'auth')
  const rateFail  = failures.find(f => f.kind === 'rate_limit')
  const tried     = failures.map(f => f.name).join(', ')
  const triedNote = failures.length > 1 ? ` (tried: ${tried})` : ''
  if (authFail) {
    return `The AI provider "${authFail.name}" rejected the request — the API key appears to be invalid or missing.${triedNote} Check your provider configuration.`
  }
  if (rateFail) {
    return `The AI provider "${rateFail.name}" is rate-limited or quota-exceeded.${triedNote} Please try again in a moment.`
  }
  if (!failures.length) {
    return 'No AI provider is configured. Set OPENAI_API_KEY, GROQ_API_KEY, or PERPLEXITY_API_KEY, or enable the Replit AI integration.'
  }
  return `No AI provider was reachable.${triedNote} Please try again.`
}

/**
 * Map a premium connector's catalog slug to a "Your license" attribution label
 * emitted as the `provider` field in the agent's `tool_result` SSE frame.
 *
 * This label flows directly into the citation/trace pipeline
 * (`providerKeyFromSource` in `data-sources-trace.ts`) and surfaces in the
 * "Data sources used" footer of every research answer that touched a premium
 * BYO-license connector. Returns null for non-premium / custom connections so
 * `buildAgentToolResultPayload` falls back to its normal `out.source` path.
 */
function premiumConnectorLabel(tool: ConnectorAgentTool | undefined): string | null {
  if (!tool?._catalogSlug) return null
  // Premium BYO-license connectors carry a "(your license)" suffix so the
  // attribution footer makes the licensing relationship explicit.
  const PREMIUM_SLUG_LABELS: Record<string, string> = {
    'factset':        'FactSet (your license)',
    'spglobal-capiq': 'S&P Capital IQ (your license)',
    'refinitiv-lseg': 'Refinitiv / LSEG (your license)',
    'bloomberg-dl':   'Bloomberg Data License (your license)',
    'pitchbook':      'PitchBook (your license)',
  }
  if (tool._isPremium) return PREMIUM_SLUG_LABELS[tool._catalogSlug] ?? null
  // Enterprise knowledge / CRM / email connectors. These aren't premium but
  // still need an explicit attribution label (connector tool results carry no
  // `out.source`), so the citation/trace pipeline can map them to a Connector
  // Hub tile via `providerKeyFromSource`.
  const ENTERPRISE_SLUG_LABELS: Record<string, string> = {
    'salesforce':   'Salesforce',
    'hubspot':      'HubSpot',
    'gmail':        'Gmail',
    'microsoft365': 'Microsoft 365 (Outlook)',
    'sharepoint':   'SharePoint / OneDrive',
    'google-drive': 'Google Drive',
    'confluence':   'Confluence',
    'notion':       'Notion',
  }
  return ENTERPRISE_SLUG_LABELS[tool._catalogSlug] ?? null
}

const SYSTEM_PROMPT = `You are Finsyt's institutional research agent.

Your job: answer the user's financial question by planning, calling tools to gather REAL data from the platform's data routes, and synthesising a grounded answer.

Rules:
- Always plan first. Call multiple tools in parallel when independent (e.g. quote + news + filings for the same ticker).
- Cite EVERY non-trivial claim with a numbered source marker in square brackets like [1], [2] that refers to the "Sources" list you are given after each batch of tool results. Put the marker immediately after the claim, e.g. "Revenue grew 12% [2]." Combine markers when several sources back a claim, e.g. [1][3]. Only ever use numbers that appear in the Sources list — never invent one.
- If the question is about one or more tickers, prefer get_quote + get_financials + get_news. For "earnings call" or "guidance" → get_transcripts. For "10-K", "10-Q", "8-K", "filing" → get_filings. For "GDP", "inflation", "rates" → get_macro. For non-US, cross-country, or forecast macro (compare countries, IMF WEO / World Bank / DBnomics indicators) → get_macro_series.
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
    description: 'Real-time quote for any instrument: equities (NVDA, AAPL), crypto (BTC-USD, ETH-USD), FX (EUR/USD), commodities (prefix bare names with CMDTY: → CMDTY:GOLD, CMDTY:WTI, CMDTY:BRENT — bare GOLD/WTI resolve as equity tickers), or US Treasury yields (US10Y, US2Y). Returns price/yield, change, and asset class.',
    parameters: { type: 'object', properties: { symbol: { type: 'string', description: 'Symbol e.g. NVDA, BTC-USD, EUR/USD, CMDTY:GOLD, US10Y' } }, required: ['symbol'] },
    run: async (a, base) => {
      const cls = classifySymbol(a.symbol)
      // Try internal route (paid keys) first; fall back to free Yahoo public chart.
      const d = await safeFetch(`${base}/api/quote?symbol=${encodeURIComponent(a.symbol)}`)
      const q = (d && !d.error) ? (d.quote || d) : null
      if (q?.price) {
        // Non-equity instruments come back from the multi-asset waterfall already
        // tagged with assetClass + source; label them rather than equity fields.
        if (cls.assetClass !== 'equity') {
          return {
            symbol: q.symbol, name: q.name, assetClass: q.assetClass || cls.assetClass,
            assetType: q.assetType || ASSET_CLASS_LABEL[cls.assetClass],
            price: q.price, change: q.change, changePct: q.changePct,
            ...(cls.assetClass === 'rate' ? { yield: q.yield ?? q.price, unit: '%' } : {}),
            ...(cls.assetClass === 'fx' ? { rate: q.rate ?? q.price } : {}),
            unit: q.unit, open: q.open, high: q.high, low: q.low, prevClose: q.prevClose,
            volume: q.volume, source: q.source || 'yahoo',
          }
        }
        return {
          symbol: q.symbol, name: q.name, assetClass: 'equity', assetType: 'Equity',
          price: q.price, changePct: q.changePct,
          marketCap: q.marketCap, pe: q.pe, eps: q.eps, revenue: q.revenue,
          high52w: q.high52w, low52w: q.low52w, sector: q.sector, industry: q.industry,
          exchange: q.exchange, source: q.source || 'FMP / EODHD',
        }
      }
      // Free fallback — equities only (Yahoo free helpers are equity-shaped).
      const [free, summary] = await Promise.all([
        yahooQuoteFree(a.symbol),
        yahooQuoteSummaryFree(a.symbol).catch(() => null),
      ])
      if (!free) return { empty: true, note: 'No data found for this symbol on free or paid sources.' }
      return {
        ...free,
        assetClass: cls.assetClass,
        assetType: ASSET_CLASS_LABEL[cls.assetClass],
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
        sentiment: n.sentimentLabel,
        sentimentScore: typeof n.sentimentScore === 'number' ? n.sentimentScore : undefined,
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
    name: 'get_esg',
    description: 'Supplementary ESG / sustainability scores (total + environment/social/governance sub-scores, percentile, controversy level) from Yahoo. Personal-use-only data, source: yahoo. Returns empty when no rating exists.',
    parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    run: async (a, base) => {
      const d = await safeFetch(`${base}/api/esg?symbol=${encodeURIComponent(a.symbol)}`)
      if (!d?.esg) return { empty: true, source: d?.source || 'none', note: d?.note }
      return { symbol: d.symbol, ...d.esg, source: 'yahoo' }
    },
  },
  {
    name: 'get_holders_breakdown',
    description: 'Supplementary major-holders breakdown from Yahoo: % held by insiders, % held by institutions, institution count. source: yahoo (personal-use-only). Returns empty when unavailable.',
    parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    run: async (a, base) => {
      const d = await safeFetch(`${base}/api/ownership?symbol=${encodeURIComponent(a.symbol)}`)
      const b = d?.breakdown
      if (!b) return { empty: true, source: 'none' }
      return { symbol: a.symbol, ...b, source: 'yahoo' }
    },
  },
  {
    name: 'get_upgrades',
    description: 'Supplementary per-firm analyst upgrade/downgrade history from Yahoo (firm, from-grade, to-grade, action, date), most recent first. source: yahoo (personal-use-only). Returns empty when unavailable.',
    parameters: { type: 'object', properties: { symbol: { type: 'string' }, limit: { type: 'number', description: 'Max rows (default 20).' } }, required: ['symbol'] },
    run: async (a, base) => {
      const lim = Math.min(Math.max(Number(a.limit) || 20, 1), 100)
      const d = await safeFetch(`${base}/api/upgrades?symbol=${encodeURIComponent(a.symbol)}&limit=${lim}`)
      const history = trim(d?.history, lim)
      if (!history.length) return { empty: true, source: d?.source || 'none', note: d?.note }
      return { symbol: a.symbol, history, source: 'yahoo' }
    },
  },
  {
    name: 'get_fund_holdings',
    description: 'Supplementary fund / ETF profile from Yahoo: top holdings, sector & asset-class weightings, bond ratings, fund family/category/expense. source: yahoo (personal-use-only). Returns empty for non-funds or when unavailable.',
    parameters: { type: 'object', properties: { symbol: { type: 'string', description: 'Fund or ETF symbol, e.g. SPY, QQQ, VTI.' } }, required: ['symbol'] },
    run: async (a, base) => {
      const d = await safeFetch(`${base}/api/fund?symbol=${encodeURIComponent(a.symbol)}`)
      if (!d?.fund) return { empty: true, source: d?.source || 'none', note: d?.note }
      return { symbol: d.symbol, ...d.fund, source: 'yahoo' }
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
  {
    name: 'get_macro_series',
    description: 'Global, cross-country macro time-series from IMF DataMapper (WEO/Fiscal Monitor, incl. forecasts), World Bank Open Data, or DBnomics. Use for non-US or multi-country macro (GDP growth, inflation, unemployment, gov debt/GDP, current account) and country comparisons. For source "imf" pass a DataMapper code (e.g. NGDP_RPCH) + ISO3 country(ies); for "worldbank" pass an indicator id (e.g. NY.GDP.MKTP.CD) + ISO2/ISO3 country(ies); for "dbnomics" pass a full seriesId "provider/dataset/series".',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['imf', 'worldbank', 'dbnomics'], description: 'Which provider to query.' },
        indicator: { type: 'string', description: 'IMF DataMapper code or World Bank indicator id.' },
        country: { type: 'string', description: 'ISO country code(s), comma/semicolon separated (imf/worldbank).' },
        seriesId: { type: 'string', description: 'DBnomics series id "provider/dataset/series".' },
      },
      required: ['source'],
    },
    run: async (a, base, fwd) => {
      const source = String(a.source || '').toLowerCase()
      if (source === 'dbnomics') {
        const id = a.seriesId || a.indicator
        if (!id) return { error: 'dbnomics requires seriesId (provider/dataset/series)', source: 'dbnomics' }
        const d = await safeFetch(`${base}/api/dbnomics/series?id=${encodeURIComponent(id)}`, { headers: fwd })
        return d || { empty: true, source: 'dbnomics' }
      }
      if (source === 'worldbank') {
        if (!a.indicator) return { error: 'worldbank requires indicator (e.g. NY.GDP.MKTP.CD)', source: 'worldbank' }
        const d = await safeFetch(`${base}/api/worldbank/data?indicator=${encodeURIComponent(a.indicator)}&country=${encodeURIComponent(a.country || 'US')}`, { headers: fwd })
        return d || { empty: true, source: 'worldbank' }
      }
      // default: imf
      if (!a.indicator) return { error: 'imf requires indicator (e.g. NGDP_RPCH)', source: 'imf' }
      const d = await safeFetch(`${base}/api/imf/data?indicator=${encodeURIComponent(a.indicator)}&country=${encodeURIComponent(a.country || 'USA')}`, { headers: fwd })
      return d || { empty: true, source: 'imf' }
    },
  },
  {
    name: 'get_prediction_markets',
    description: 'Prediction-market odds (Polymarket + Kalshi) as a research signal. Provide `symbol`+`name` for company-relevant markets, `q` for a keyword search, or neither for the most-active markets. Returns implied probability, 1-day move, volume and a link back to each market. Read-only — no trading.',
    parameters: { type: 'object', properties: {
      symbol: { type: 'string', description: 'Ticker for company relevance, e.g. NVDA' },
      name: { type: 'string', description: 'Company name for relevance matching, e.g. NVIDIA' },
      q: { type: 'string', description: 'Free-text keyword, e.g. "election", "rate cut"' },
      source: { type: 'string', enum: ['polymarket', 'kalshi', 'both'], description: 'Which venue(s) to query (default both)' },
      limit: { type: 'number', description: 'Max markets to return (default 8)' },
    }, required: [] },
    run: async (a, base) => {
      const sp = new URLSearchParams()
      if (a.symbol) sp.set('symbol', String(a.symbol))
      if (a.name) sp.set('name', String(a.name))
      if (a.q) sp.set('q', String(a.q))
      if (a.source) sp.set('source', String(a.source))
      sp.set('limit', String(Math.min(Number(a.limit) || 8, 25)))
      const d = await safeFetch(`${base}/api/prediction-markets?${sp.toString()}`)
      const markets = trim(d?.markets || [], 12)
      return {
        markets: markets.map((m: any) => ({
          question: m.question,
          provider: m.provider,
          impliedProbability: m.yesProbability,
          oneDayChange: m.oneDayChange,
          volume: m.volume,
          closeDate: m.closeDate,
          url: m.url,
        })),
        count: markets.length,
        source: d?.source || 'none',
      }
    },
  },
  {
    name: 'get_geopolitical_events',
    description: 'Geopolitical risk & events feed (GDELT open data) as a research signal. Provide `region` (ISO-2 country code, e.g. US, CN, UA) to scope to a company HQ / market, `category` to focus (conflict | political | disaster | economic | geopolitical), `severity` as a floor (high | medium | low), `q` for a keyword, and `timespan` (e.g. 24h, 7d). Severity is a transparent category-derived label, NOT a forecast. Returns recent events with location, category, severity and a link to each article. Read-only.',
    parameters: { type: 'object', properties: {
      region: { type: 'string', description: 'ISO-2 country code to scope events, e.g. US, CN, UA' },
      category: { type: 'string', enum: ['conflict', 'political', 'disaster', 'economic', 'geopolitical'], description: 'Event category filter' },
      severity: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Minimum severity floor' },
      q: { type: 'string', description: 'Free-text keyword, e.g. "sanctions", "tariffs"' },
      timespan: { type: 'string', description: 'Look-back window, e.g. 24h, 3d, 7d, 14d (default 7d)' },
      limit: { type: 'number', description: 'Max events to return (default 12)' },
    }, required: [] },
    run: async (a, base) => {
      const sp = new URLSearchParams()
      if (a.region) sp.set('region', String(a.region))
      if (a.category) sp.set('category', String(a.category))
      if (a.severity) sp.set('severity', String(a.severity))
      if (a.q) sp.set('q', String(a.q))
      if (a.timespan) sp.set('timespan', String(a.timespan))
      sp.set('limit', String(Math.min(Number(a.limit) || 12, 40)))
      const d = await safeFetch(`${base}/api/geopolitical-events?${sp.toString()}`)
      const events = trim(d?.events || [], 14)
      return {
        events: events.map((e: any) => ({
          title: e.title,
          category: e.category,
          severity: e.severity,
          location: e.location,
          date: e.date,
          outlet: e.domain,
          url: e.url,
        })),
        region: d?.regionName || d?.region || null,
        categoryCounts: d?.categoryCounts,
        count: events.length,
        source: d?.source || 'none',
      }
    },
  },
  {
    name: 'get_cot',
    description: 'CFTC Commitment of Traders (COT) weekly futures positioning as a research signal. Provide `market` as a label or CFTC contract code, e.g. "Gold", "E-mini S&P 500", "WTI Crude Oil", "Bitcoin", "10-Year T-Note", or a code like 088691. Optional `weeks` (default 26). Returns the latest commercial (hedger) vs non-commercial (speculator) net positioning plus a short history. Net = long − short; positive = net long. Read-only public CFTC data.',
    parameters: { type: 'object', properties: {
      market: { type: 'string', description: 'Market label or CFTC contract code, e.g. "Gold" or 088691' },
      weeks: { type: 'number', description: 'Weeks of history (default 26, max 104)' },
    }, required: ['market'] },
    run: async (a, base) => {
      const sp = new URLSearchParams({
        market: String(a.market || ''),
        weeks: String(Math.min(Number(a.weeks) || 26, 104)),
      })
      const d = await safeFetch(`${base}/api/cot?${sp.toString()}`)
      const latest = d?.latest || null
      return {
        market: d?.market || null,
        latest: latest ? {
          date: latest.date,
          openInterest: latest.openInterest,
          noncommercialNet: latest.noncommercial?.net,
          commercialNet: latest.commercial?.net,
          nonreportableNet: latest.nonreportable?.net,
        } : null,
        history: trim(d?.reports || [], 12).map((r: any) => ({
          date: r.date, noncommercialNet: r.noncommercial?.net, commercialNet: r.commercial?.net,
        })),
        count: d?.count || 0,
        source: d?.source || 'none',
      }
    },
  },
  {
    name: 'get_short_interest',
    description: 'Equity short positioning from public FINRA daily short-sale volume + best-effort SEC fails-to-deliver. Provide `symbol`. Optional `days` (default 10) for the short-volume window. Returns the latest short-volume % of total, a multi-day trend, average over the window, and latest FTD if available. Read-only, keyless. U.S.-listed equities only.',
    parameters: { type: 'object', properties: {
      symbol: { type: 'string', description: 'US-listed ticker, e.g. NVDA' },
      days: { type: 'number', description: 'Short-volume trend window in trading days (default 10, max 30)' },
    }, required: ['symbol'] },
    run: async (a, base) => {
      const sp = new URLSearchParams({
        symbol: String(a.symbol || '').toUpperCase(),
        days: String(Math.min(Number(a.days) || 10, 30)),
      })
      const d = await safeFetch(`${base}/api/short-interest?${sp.toString()}`)
      const latest = d?.latest || null
      return {
        symbol: d?.symbol || String(a.symbol || '').toUpperCase(),
        latest: latest ? {
          date: latest.date,
          shortVolume: latest.shortVolume,
          totalVolume: latest.totalVolume,
          shortPct: latest.shortPct,
        } : null,
        avgShortPct: d?.avgShortPct ?? null,
        trend: trim(d?.shortVolume || [], 12).map((r: any) => ({ date: r.date, shortPct: r.shortPct })),
        latestFtd: d?.latestFtd || null,
        count: (d?.shortVolume || []).length,
        source: d?.source || 'none',
      }
    },
  },
  {
    name: 'get_technicals',
    description: 'Technical-analysis indicators for a US/intl ticker computed from real daily OHLCV bars. Overlays: sma, ema, wma, bollinger, vwap, donchian, ichimoku. Oscillators: rsi, macd, stochastic, adx, obv. Returns the latest value of each requested indicator plus trend/momentum signals (e.g. RSI overbought, MACD bullish cross). Read-only — no trading signals.',
    parameters: { type: 'object', properties: {
      symbol: { type: 'string', description: 'Ticker symbol e.g. NVDA, AAPL' },
      indicators: { type: 'string', description: 'Comma-separated indicator list, e.g. "sma,ema,rsi,macd". Defaults to sma(50),sma(200),ema(20),rsi,macd.' },
      range: { type: 'string', enum: ['1M', '3M', '6M', '1Y', '2Y', '5Y', 'MAX'], description: 'History window (default 1Y).' },
    }, required: ['symbol'] },
    run: async (a, base) => {
      const sp = new URLSearchParams()
      sp.set('symbol', String(a.symbol))
      sp.set('noBars', '1')
      if (a.indicators) sp.set('indicators', String(a.indicators))
      if (a.range) sp.set('range', String(a.range))
      const d = await safeFetch(`${base}/api/technicals?${sp.toString()}`)
      if (!d || d.error) return { empty: true, note: d?.error || 'No price history available for this symbol.', source: d?.source || 'none' }
      // Collapse each indicator's series to its latest non-null value so the
      // model gets a compact, quotable snapshot rather than full arrays.
      const latest = (Array.isArray(d.indicators) ? d.indicators : []).map((ind: any) => {
        const series = ind?.series || {}
        const vals: Record<string, number | null> = {}
        for (const key of Object.keys(series)) {
          const arr = series[key]
          let v: number | null = null
          if (Array.isArray(arr)) {
            for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] != null) { v = arr[i]; break } }
          }
          vals[key] = v
        }
        return { type: ind?.type, params: ind?.params, latest: vals }
      })
      return {
        symbol: d.symbol,
        range: d.range,
        count: d.count,
        indicators: latest,
        signals: d.signals || [],
        source: d.source || 'none',
      }
    },
  },
  {
    name: 'get_yield_curve',
    description: 'US Treasury government yield curve across tenors 1M–30Y. Optional `date` (YYYY-MM-DD) returns a historical snapshot for date comparison; omit for the latest curve. Returns per-tenor yields, key slope spreads (2s10s, 3m10y, 5s30s), and a `source` attribution.',
    parameters: { type: 'object', properties: { date: { type: 'string', description: 'Snapshot date YYYY-MM-DD (optional, latest if omitted).' } }, required: [] },
    run: async (a, base) => {
      const url = `${base}/api/rates/yield-curve${a.date ? `?date=${encodeURIComponent(String(a.date))}` : ''}`
      const d = await safeFetch(url)
      if (!d || d.error) return { empty: true, note: d?.error || 'No yield-curve data available.', source: d?.source || 'none' }
      const points = (d.points || []).filter((p: any) => p.yield != null)
      if (!points.length) return { empty: true, note: 'No yield-curve data available for this date.', source: d.source || 'none' }
      return {
        date: d.date, asOf: d.asOf,
        curve: points.map((p: any) => ({ tenor: p.tenor, yield: p.yield })),
        spreads: (d.spreads || []).filter((s: any) => s.value != null),
        source: d.source || 'none',
      }
    },
  },
  {
    name: 'get_rates',
    description: 'Reference benchmark rates board (SOFR, EFFR, SONIA, €STR) and/or credit spreads (Investment Grade vs High Yield OAS). Pass kind="reference", "credit", or "all" (default). Each series carries a `source` attribution.',
    parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['reference', 'credit', 'all'], description: 'Which board to return (default all).' } }, required: [] },
    run: async (a, base) => {
      const kind = a.kind === 'reference' || a.kind === 'credit' ? a.kind : 'all'
      const wantRef = kind === 'all' || kind === 'reference'
      const wantCredit = kind === 'all' || kind === 'credit'
      const [ref, credit] = await Promise.all([
        wantRef ? safeFetch(`${base}/api/rates/reference`) : Promise.resolve(null),
        wantCredit ? safeFetch(`${base}/api/rates/credit-spreads?periods=365`) : Promise.resolve(null),
      ])
      const referenceRates = wantRef && ref && !ref.error
        ? (ref.rates || []).filter((r: any) => r.value != null).map((r: any) => ({ label: r.label, name: r.name, region: r.region, value: r.value, change: r.change, asOf: r.asOf, source: r.source }))
        : []
      const creditSpreads = wantCredit && credit && !credit.error
        ? (credit.latest || []).filter((c: any) => c.value != null).map((c: any) => ({ label: c.label, name: c.name, oas: c.value, change: c.change, asOf: c.asOf, source: c.source }))
        : []
      const differential = wantCredit && credit && !credit.error ? credit.differential : null
      if (!referenceRates.length && !creditSpreads.length) {
        return { empty: true, note: 'No reference-rate or credit-spread data available.', source: 'none' }
      }
      const source = ref?.source && ref.source !== 'none' ? ref.source : (credit?.source || 'none')
      return { referenceRates, creditSpreads, hyIgDifferential: differential, source }
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
  {
    // ── score_filing ─────────────────────────────────────────────────────
    // Scores a single SEC filing on a 0–100 "Signal" scale and returns a
    // short attribution paragraph. Backed by the SEC EDGAR Filings
    // Intelligence Apify actor; the workspace must have an active
    // `apify-actors` connection or the tool returns a connector_required
    // error the model can mention to the user. The Filings tab uses the
    // same operation directly to populate its Signal column — keeping it
    // available as an agent tool means analysts can ask "Score this 10-K"
    // from chat without leaving the conversation.
    name: 'score_filing',
    description:
      'Score a single SEC filing 0-100 on signal strength using the SEC EDGAR Filings Intelligence actor. Returns the score plus a one-paragraph attribution citing the materially-moved sections. Requires a workspace Apify Actors connection.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Issuer ticker, e.g. NVDA. One of symbol / cik / accession is required.' },
        cik: { type: 'string', description: 'Issuer CIK (zero-padded), e.g. 0000320193.' },
        accession: { type: 'string', description: 'Specific accession number (with or without hyphens). When omitted, scores the most recent filing for the issuer.' },
        formType: { type: 'string', description: "Optional form filter, e.g. '10-K', '10-Q', '8-K'." },
      },
      required: [],
    },
    run: async () => ({ pending: true }), // intercepted by the route loop — runs the Apify actor
  },
  {
    // ── draft_report ─────────────────────────────────────────────────────
    // Drafts a research report / tearsheet from reusable blocks and surfaces
    // a confirm card. Never saves directly — the UI POSTs to /api/reports on
    // approval. Block kinds: kpi, chart, peers, valuation, text, citations.
    name: 'draft_report',
    description:
      'Draft a research report / tearsheet composed of ordered blocks (kpi, chart, peers, valuation, text, citations). Requires user confirmation in the UI before saving. Use the top-level symbol as the default ticker; per-block config can override it.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Report title, e.g. "NVIDIA — Q2 Tearsheet".' },
        symbol: { type: 'string', description: 'Primary ticker the report covers (uppercase). Blocks inherit it unless they set their own symbol.' },
        subtitle: { type: 'string', description: 'Optional one-line subtitle / dateline.' },
        blocks: {
          type: 'array',
          description: 'Ordered list of blocks to compose the report from.',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['kpi', 'chart', 'peers', 'valuation', 'text', 'citations'] },
              config: {
                type: 'object',
                description: 'Per-block config. kpi/chart/valuation: {symbol,title,metric,years}; peers: {symbols[],subject,setName,title}; text: {heading,body}; citations: {title}.',
              },
            },
            required: ['kind'],
          },
        },
      },
      required: ['title'],
    },
    kind: 'write',
    run: async () => ({ pending: true }), // intercepted by the route loop
  },
  {
    // ── get_news_sentiment ───────────────────────────────────────────────
    // Returns the trailing-baseline news-sentiment + volume series and a
    // deviation verdict for one ticker (or a named sector). Backed by
    // /api/news/sentiment, which scores cached articles with a bounded LLM
    // pass + lexicon fallback. `source` flows straight through so the
    // citation tracer attributes the cited provider in the Sources panel.
    name: 'get_news_sentiment',
    description:
      'News sentiment trend + deviation alert for a ticker (symbol) or sector. Returns the current mean sentiment label/score, daily series, and a trailing-baseline deviation verdict (sentiment swing or news-volume spike). Use for "how has sentiment shifted", "is there a news spike", or sentiment-monitor questions.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker, e.g. NVDA. One of symbol / sector is required.' },
        sector: { type: 'string', description: 'Named sector, e.g. semiconductors. Alternative to symbol.' },
        days: { type: 'number', description: 'Lookback window in days (default 30).' },
      },
      required: [],
    },
    kind: 'read',
    run: async (a, base) => {
      const qp = new URLSearchParams()
      if (a.symbol) qp.set('symbol', String(a.symbol))
      else if (a.sector) qp.set('sector', String(a.sector))
      else return { error: 'provide a symbol or sector' }
      if (a.days) qp.set('days', String(a.days))
      const d = await safeFetch(`${base}/api/news/sentiment?${qp}`)
      if (!d || d.error) return { error: d?.error || 'sentiment unavailable', sectors: d?.sectors }
      return {
        scope: d.scope,
        symbol: d.symbol,
        sector: d.sector,
        windowDays: d.windowDays,
        current: d.current,
        deviation: d.deviation,
        series: trim(d.series || [], 30),
        source: d.source,
      }
    },
  },
)

// ── Global Intelligence tools ─────────────────────────────────────────────
// Five tools backed by public free-to-use APIs (World Bank WGI, GDELT,
// OFAC SDN, CISA KEV, NVD NIST, UN Comtrade, Reuters/BBC RSS).
// No API keys required. Results include a `source` attribution field
// that the citation tracer maps to PROVIDER_META entries.
TOOLS.push(
  {
    name: 'get_geopolitical_risk',
    description:
      'Get the Country Instability Index (CII, 0–100) and World Bank Worldwide Governance Indicators for a country. ' +
      'Higher CII = higher instability. Returns 6 WGI sub-scores (political stability, government effectiveness, rule of law, ' +
      'regulatory quality, control of corruption, voice & accountability) plus a GDELT conflict-tone signal. ' +
      'Pass an ISO-3166-1 alpha-2 country code, e.g. "US", "CN", "RU", "TW".',
    parameters: {
      type: 'object',
      properties: {
        iso: { type: 'string', description: 'ISO-3166-1 alpha-2 country code, e.g. "CN", "RU", "US".' },
        multi: { type: 'string', description: 'Comma-separated list of ISO codes to compare, e.g. "CN,TW,US". Max 10.' },
      },
      required: [],
    },
    kind: 'read' as const,
    run: async (a: Record<string, string>, base: string) => {
      const qs = new URLSearchParams()
      if (a.multi) qs.set('multi', a.multi)
      else if (a.iso) qs.set('iso', a.iso)
      else qs.set('iso', 'US')
      const d = await safeFetch(`${base}/api/intelligence/geopolitical?${qs}`)
      return d
    },
  },
  {
    name: 'screen_sanctions',
    description:
      'Screen an entity name (company or person) against three global sanctions lists: ' +
      'OFAC SDN (US Treasury), EU Consolidated Financial Sanctions, and UN Security Council Consolidated List. ' +
      'Returns HIT / NO_HIT / UNKNOWN status with match detail and similarity scores for each hit. ' +
      'Use before investments, partnerships, or counterparty onboarding.',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Full legal name to screen, e.g. "Gazprom" or "Huawei Technologies".' },
      },
      required: ['entity'],
    },
    kind: 'read' as const,
    run: async (a: Record<string, string>, base: string) => {
      if (!a.entity) return { error: 'entity required' }
      const d = await safeFetch(`${base}/api/intelligence/sanctions?entity=${encodeURIComponent(a.entity)}`)
      return d
    },
  },
  {
    name: 'get_trade_flows',
    description:
      'Get trade flow signals for a reporter country and commodity from UN Comtrade and World Bank. ' +
      'Returns export/import values, trade balance, and exports/imports as % of GDP. ' +
      'Useful for supply-chain risk analysis, tariff impact, and commodity dependency research.',
    parameters: {
      type: 'object',
      properties: {
        country:   { type: 'string', description: 'ISO-3166-1 alpha-2 reporter country, e.g. "US", "CN", "TW".' },
        commodity: { type: 'string', description: 'Commodity key. One of: semiconductors, oil, lng, steel, aluminum, copper, wheat, corn, soybeans, gold, lithium, rare_earths, pharmaceuticals.' },
        partner:   { type: 'string', description: 'Optional trading partner ISO code for bilateral filter.' },
      },
      required: [],
    },
    kind: 'read' as const,
    run: async (a: Record<string, string>, base: string) => {
      const qs = new URLSearchParams()
      if (a.country)   qs.set('country', a.country)
      if (a.commodity) qs.set('commodity', a.commodity)
      if (a.partner)   qs.set('partner', a.partner)
      const d = await safeFetch(`${base}/api/intelligence/trade-flows?${qs}`)
      return d
    },
  },
  {
    name: 'get_cyber_threats',
    description:
      'Get cyber threat signals for a company or sector from CISA Known Exploited Vulnerabilities (KEV) ' +
      'catalog and NVD NIST CVE API. Returns overall risk rating (CRITICAL/HIGH/MEDIUM/LOW), count of ' +
      'active CISA KEV exploits, recent critical CVEs in last 30 days, and per-CVE detail. ' +
      'Use for due diligence, vendor risk, and sector threat assessment.',
    parameters: {
      type: 'object',
      properties: {
        ticker:  { type: 'string', description: 'Company ticker, e.g. "MSFT", "CSCO", "PANW".' },
        company: { type: 'string', description: 'Full company name as alternative to ticker.' },
        sector:  { type: 'string', description: 'Sector name for broader scan, e.g. "Technology", "Finance", "Healthcare", "Energy".' },
      },
      required: [],
    },
    kind: 'read' as const,
    run: async (a: Record<string, string>, base: string) => {
      const qs = new URLSearchParams()
      if (a.ticker)  qs.set('ticker', a.ticker)
      if (a.company) qs.set('company', a.company)
      if (a.sector)  qs.set('sector', a.sector)
      const d = await safeFetch(`${base}/api/intelligence/cyber?${qs}`)
      return d
    },
  },
  {
    name: 'get_intelligence_brief',
    description:
      'Get a curated cross-stream intelligence brief pulling from Reuters, BBC Business, and GDELT. ' +
      'Returns top headlines, thematic clusters (Geopolitical Risk, Monetary Policy, Trade, Cyber, etc.), ' +
      'sentiment signal (Bullish/Bearish/Neutral/Mixed), and a synthesised 2–3 sentence brief. ' +
      'Useful for market context, country risk colour, or sector news sweep.',
    parameters: {
      type: 'object',
      properties: {
        ticker:  { type: 'string', description: 'Company ticker to focus headlines on.' },
        company: { type: 'string', description: 'Company name as alternative to ticker.' },
        topic:   { type: 'string', description: 'Topic query, e.g. "semiconductor supply chain", "US-China trade war".' },
        country: { type: 'string', description: 'Country ISO or name for geo-focused brief.' },
      },
      required: [],
    },
    kind: 'read' as const,
    run: async (a: Record<string, string>, base: string) => {
      const qs = new URLSearchParams()
      if (a.ticker)  qs.set('ticker', a.ticker)
      if (a.company) qs.set('company', a.company)
      if (a.topic)   qs.set('topic', a.topic)
      if (a.country) qs.set('country', a.country)
      const d = await safeFetch(`${base}/api/intelligence/news-brief?${qs}`)
      return d
    },
  },
)

const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.name, t]))
const OPENAI_TOOLS = TOOLS.map(t => ({
  type: 'function' as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}))

// ── Source-scope tool filtering ───────────────────────────────────────────────
// Maps each built-in tool name to the Source Library leaf IDs it covers.
// When the caller passes selectedSourceIds, only tools whose coverage set
// overlaps the selection are exposed to the model. Peer/workspace tools and
// connector tools are always included — they are workspace operations, not
// corpus-scoped data retrievals.
const TOOL_SOURCE_COVERAGE: Readonly<Record<string, readonly string[]>> = {
  get_quote:      ['br.gs','br.ms','br.jpm','br.bofa','nw.bb','nw.rt','nw.wsj','nw.ft'],
  get_news:       ['nw.bb','nw.rt','nw.wsj','nw.ft'],
  get_filings:    ['fl.10k','fl.10q','fl.8k','fl.def','fl.13f'],
  get_financials: ['br.gs','br.ms','br.jpm','br.bofa'],
  get_estimates:  ['br.gs','br.ms','br.jpm','br.bofa'],
  get_transcripts:['tr.us','tr.eu','eprep.script','eprep.kpi','ir.q4','ir.faq'],
  get_macro:      ['nw.bb','nw.rt','nw.wsj','nw.ft','br.gs'],
}

// Tool names that are always available regardless of source scope — they are
// workspace operations (peer sets, filing scorer) rather than corpus lookups.
// Intelligence tools are also always available: they use public free APIs with
// no key requirement so there is no concept of "deselecting" them via sources.
const ALWAYS_ALLOWED_TOOLS = new Set([
  'list_peer_sets','get_peer_set','compare_peers','create_peer_set','modify_peer_set','score_filing','draft_report',
  'get_geopolitical_risk','screen_sanctions','get_trade_flows','get_cyber_threats','get_intelligence_brief',
])

function scopeTools<T extends { function: { name: string } }>(
  tools: T[],
  selectedSourceIds: string[],
): T[] {
  if (!selectedSourceIds.length) return tools
  const sel = new Set(selectedSourceIds)
  return tools.filter(t => {
    const name = t.function.name
    if (ALWAYS_ALLOWED_TOOLS.has(name)) return true
    const coverage = TOOL_SOURCE_COVERAGE[name]
    // Built-in tools with defined coverage: include only when overlap exists.
    if (coverage) return coverage.some(id => sel.has(id))
    // Connector tools (no entry in TOOL_SOURCE_COVERAGE): always include.
    return true
  })
}

// ── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: {
    question?: string
    symbols?: string[]
    context?: Record<string, unknown>
    history?: { role?: string; text?: string }[]
    selectedSourceIds?: string[]
  } = {}
  try { body = await req.json() } catch {}
  const question = (body.question || '').trim()
  if (!question) return new Response(JSON.stringify({ error: 'question required' }), { status: 400 })

  // ── Free-tier monthly AI-query cap (server-enforced) ──────────────────────
  // Paid plans and demo / open mode are unlimited; Free orgs get a bounded
  // number of agent queries per calendar month. Enforce before any streaming
  // or model spend so an over-cap request is rejected cheaply.
  const billingCtx = await resolveEntitlementContext()
  if (!billingCtx) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const aiUsage = await checkAndConsumeAiQuery(billingCtx)
  if (!aiUsage.allowed) {
    return new Response(
      JSON.stringify({
        error: 'usage_limit_reached',
        message: `You've reached the Free plan limit of ${aiUsage.limit} AI queries this month. Upgrade to Pro for unlimited research.`,
        used: aiUsage.used,
        limit: aiUsage.limit,
        upgradeUrl: '/platform/app/upgrade',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Source scope: leaf IDs from the client's Source Library selection.
  // When non-empty the model only sees tools that cover these sources.
  const selectedSourceIds: string[] = Array.isArray(body.selectedSourceIds)
    ? body.selectedSourceIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []

  // Context-retaining follow-ups: the Research page passes the recent
  // conversation so guided deep-dive suggestions ("compare to peers",
  // "break down revenue") resolve against the prior turn instead of
  // starting cold. We cap to the last few turns and truncate each entry so
  // a long thread can't blow the model's context budget.
  const priorTurns: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body.history)
    ? body.history
        .slice(-6)
        .map((h) => ({
          role: (h?.role === 'agent' || h?.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: String(h?.text || '').slice(0, 4000),
        }))
        .filter((h) => h.content)
    : []

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

  // ── Word-memo fast path ────────────────────────────────────────────────────
  // If the question reads as "generate a Word doc / .docx for <ticker>",
  // short-circuit the LLM loop and call /api/copilot/word directly, streaming
  // a word_ready SSE event so AppShell can render a download card.
  const wordIntent = await detectWordIntent(question, body.context, baseUrl)
  if (wordIntent.matched) {
    const { userId: wUserId } = await auth()
    const wordStream = new ReadableStream({
      async start(controller) {
        const send = <T>(event: string, data: T) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }
        const fail = (msg: string) => { send('error', { message: msg }); send('done', { ok: false }); controller.close() }

        if (!wUserId) return fail('Sign in to generate Word documents.')
        if (!wordIntent.ticker) {
          return fail('I can build the Word memo — which ticker should I use? Try "Generate a Word document for MSFT".')
        }

        send('step', { kind: 'plan', label: `Building Word memo for ${wordIntent.ticker}…` })
        send('tool_call', { id: 'word-1', name: 'generate_word_memo', args: { ticker: wordIntent.ticker } })

        try {
          const fwd = await forwardHeaders()
          const wordT0 = Date.now()
          const r = await fetch(`${baseUrl}/api/copilot/word`, {
            method: 'POST',
            headers: { ...fwd, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: wordIntent.ticker }),
          })

          if (!r.ok) {
            const msg = await r.text().catch(() => `HTTP ${r.status}`)
            return fail(`Word generation failed: ${msg}`)
          }

          const buf = await r.arrayBuffer()
          const bytes = buf.byteLength
          const filename = `${wordIntent.ticker} Investment Memo.docx`
          const asOf = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

          send('tool_result', buildAgentToolResultPayload({
            id: 'word-1',
            name: 'generate_word_memo',
            out: { ticker: wordIntent.ticker, bytes },
            responseMs: Date.now() - wordT0,
            summarise: () => `${(bytes / 1024).toFixed(0)} KB · Word memo ready`,
            providerOverride: 'docx renderer',
            rawMaxLen: 200,
          }))

          // Stream the Word file as a temporary data-URL so the browser card can
          // trigger a direct download without a second round-trip fetch. This is
          // safe because the content is already streamed through our auth-gated
          // /api/copilot/word route — we are just caching the bytes in the SSE
          // message to avoid a second unauthenticated fetch from the card.
          const b64 = Buffer.from(buf).toString('base64')
          send('word_ready', {
            ticker:    wordIntent.ticker,
            filename,
            bytes,
            asOf,
            dataUrl: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${b64}`,
          })

          const summaryLine = `Built a Word investment memo for **${wordIntent.ticker}** (${(bytes / 1024).toFixed(0)} KB) as of ${asOf}. Download it from the file card above.`
          const chunkSize = 40
          for (let i = 0; i < summaryLine.length; i += chunkSize) {
            send('answer_chunk', { text: summaryLine.slice(i, i + chunkSize) })
            await new Promise(r => setTimeout(r, 8))
          }
          send('done', { ok: true })
          controller.close()
        } catch (e) {
          return fail(`Word generation failed: ${(e as Error).message}`)
        }
      },
    })

    return new Response(wordStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  // The deterministic deck/Word generation fast paths above do not require LLM
  // credentials — they build Office files from authenticated FMP/internal API
  // data alone. Only the model-driven Q&A pipeline below needs a provider key.
  // If no provider is configured at all we stream a clear SSE error so the
  // Finsyt Agent drawer can display it inline instead of showing a blank state.
  if (!LLM_PROVIDERS.length) {
    const noProvStream = new ReadableStream({
      start(c) {
        const enc = new TextEncoder()
        const msg = allProvidersFailedMessage([])
        c.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`))
        c.enqueue(enc.encode(`event: done\ndata: ${JSON.stringify({ ok: false })}\n\n`))
        c.close()
      },
    })
    return new Response(noProvStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
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
  const allOpenAITools = [
    ...OPENAI_TOOLS,
    ...connectorTools.map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })),
  ]
  // Apply caller's Source Library scope. When selectedSourceIds is non-empty
  // the model only receives tools that cover at least one of the chosen IDs,
  // so it cannot call (and therefore cannot cite) sources the user excluded.
  const effectiveOpenAITools = scopeTools(allOpenAITools, selectedSourceIds)

  // Build a human-readable scope note to inject into the system context so
  // the model understands why certain tools may be absent and can frame its
  // answer accordingly (e.g. "Based on the selected sources: SEC filings…").
  const sourceScopeNote: string = (() => {
    if (!selectedSourceIds.length) return ''
    const LABEL: Record<string, string> = {
      'br.gs':'Goldman Sachs', 'br.ms':'Morgan Stanley', 'br.jpm':'JPMorgan', 'br.bofa':'BofA',
      'tr.us':'US Earnings Calls', 'tr.eu':'EMEA Earnings Calls',
      'ex.tegus':'Tegus Expert Calls', 'ex.guidepoint':'GuidePoint Expert Calls',
      'fl.10k':'10-K', 'fl.10q':'10-Q', 'fl.8k':'8-K', 'fl.def':'DEF 14A', 'fl.13f':'13F',
      'nw.bb':'Bloomberg', 'nw.rt':'Reuters', 'nw.wsj':'WSJ', 'nw.ft':'FT',
      'cp.idays':'Investor Days', 'cp.cmd':'Capital Markets Day',
      'eprep.script':'Earnings Script', 'eprep.kpi':'KPI Tracker',
      'ir.q4':'IR Briefings', 'ir.faq':'IR FAQ',
      'rec.exp42':'Expert Call #42', 'rec.cust11':'Customer Call #11',
    }
    const labels = selectedSourceIds.map(id => LABEL[id] || id)
    return `\n\nSource scope: the user has narrowed this query to the following sources — ${labels.join(', ')}. Only use the tools available to you (others have been disabled). Do not reference or apologise for data sources that are outside this selection; simply work with what the provided tools can fetch.`
  })()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      send('step', { kind: 'plan', label: 'Planning approach…' })

      const messages: any[] = [
        { role: 'system', content: SYSTEM_PROMPT + sourceScopeNote },
        ...priorTurns,
        { role: 'user',   content: contextPreface + question },
      ]

      // Stable, global citation numbering. Every successful tool result is a
      // citable source; we hand the model a numbered "Sources" list so its
      // inline [n] markers line up 1:1 with the client's right-rail sources
      // panel (the client reads `citeIndex` off each tool_result). citeIndex
      // is attached to the SSE frame only — never to the locked
      // `buildAgentToolResultPayload` shape.
      let nextCiteIndex = 1
      const sourceList: { index: number; label: string; detail: string }[] = []
      const sendToolResult = (payload: any) => {
        let citeIndex: number | undefined
        if (payload?.ok) {
          citeIndex = nextCiteIndex++
          sourceList.push({
            index: citeIndex,
            label: payload.provider || payload.name || 'source',
            detail: typeof payload.summary === 'string' ? payload.summary : '',
          })
        }
        send('tool_result', citeIndex != null ? { ...payload, citeIndex } : payload)
      }
      const pushSourcesContext = () => {
        if (!sourceList.length) return
        const text =
          'Sources (cite each claim with the matching [n]):\n' +
          sourceList
            .map((s) => `[${s.index}] ${s.label}${s.detail ? ` — ${s.detail}` : ''}`)
            .join('\n')
        messages.push({ role: 'system', content: text })
      }

      try {
        // Track which provider is currently active and which have failed,
        // so we can fall back automatically on auth/rate-limit errors.
        // Once a provider succeeds on the first turn we stick with it for
        // subsequent tool-call turns to keep the conversation coherent.
        let activeProviderIdx = 0
        const llmFailures: Array<{ name: string; kind: LlmFailureKind }> = []

        for (let turn = 0; turn < 5; turn++) {
          if (req.signal.aborted) { controller.close(); return }

          // ── Provider selection with fallback ─────────────────────────────
          // Try providers starting from activeProviderIdx. On auth or rate-
          // limit failure we advance to the next; on success we use it for
          // this turn (and subsequent turns stay at the same index).
          let r: Response | null = null
          let chosenProvider: LlmProvider | null = null

          while (activeProviderIdx < LLM_PROVIDERS.length) {
            const p = LLM_PROVIDERS[activeProviderIdx]
            let attempt: Response
            try {
              attempt = await fetch(`${p.base}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
                body: JSON.stringify({
                  model: p.model,
                  messages,
                  tools: effectiveOpenAITools,
                  tool_choice: 'auto',
                  ...(p.parallel ? { parallel_tool_calls: true } : {}),
                }),
                signal: req.signal,
              })
            } catch {
              // Network-level error — try the next provider.
              llmFailures.push({ name: p.name, kind: 'error' })
              activeProviderIdx++
              continue
            }

            if (attempt.ok) {
              r = attempt
              chosenProvider = p
              break
            }

            // HTTP error — classify it and decide whether to try the next provider.
            const kind = classifyLlmStatus(attempt.status)
            llmFailures.push({ name: p.name, kind })
            console.warn(`[finsyt:agent] ${p.name} ${attempt.status} (${kind}) — ${activeProviderIdx + 1 < LLM_PROVIDERS.length ? 'trying next provider' : 'no more providers'}`)

            if (kind === 'auth' || kind === 'rate_limit') {
              // These errors are deterministic for this key — skip to the next.
              activeProviderIdx++
              continue
            }

            // Other HTTP errors (5xx etc.) — stream the error and abort.
            send('error', { message: `Model error ${attempt.status}: provider "${p.name}" returned an unexpected error.` })
            controller.close()
            return
          }

          if (!r || !chosenProvider) {
            // All providers exhausted — stream a descriptive, non-leaking message.
            send('error', { message: allProvidersFailedMessage(llmFailures) })
            controller.close()
            return
          }
          // ── End provider selection ────────────────────────────────────────

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

              // ── score_filing interceptor ─────────────────────────────
              // Built-in `score_filing` is wired to the SEC EDGAR Filings
              // Intelligence Apify actor — we resolve the workspace's
              // active `apify-actors` connection and call its
              // `sec_filings_intelligence` operation through the same
              // executor the in-app /execute route uses, so audit, rate-
              // limit and quota tracking all behave identically. When no
              // connection is configured we return a structured
              // `connector_required` payload the model can mention to the
              // user (and the UI can use to render the deep-link CTA).
              if (def?.name === 'score_filing') {
                const t0sf = Date.now()
                let out: any
                if (!workspaceOrgId) {
                  out = {
                    error: 'connector_required',
                    message: 'Sign in to a workspace and connect Apify Actors to use score_filing.',
                    cta: '/app/connectors?source=apify-actors',
                  }
                } else {
                  out = await runScoreFiling(workspaceOrgId, args, actorUserId)
                }
                const responseMs = Date.now() - t0sf
                sendToolResult(buildAgentToolResultPayload({
                  id: tc.id, name: tc.function.name, out, responseMs,
                  summarise: summariseToolResult,
                }))
                return { tool_call_id: tc.id, role: 'tool', name: tc.function.name, content: JSON.stringify(out).slice(0, 8000) }
              }

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
                sendToolResult({
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
              //
              // For premium BYO-license connectors (FactSet, Capital IQ,
              // Refinitiv, Bloomberg, PitchBook) we inject a "your license"
              // label so the citation/trace pipeline can attribute the result
              // to the right institutional provider rather than leaving it
              // blank (connector tool results don't have an `out.source`
              // string the way native Finsyt tools do).
              const premiumProviderLabel = premiumConnectorLabel(connectorDef)
              sendToolResult(buildAgentToolResultPayload({
                id: tc.id,
                name: tc.function.name,
                out,
                responseMs,
                summarise: summariseToolResult,
                providerOverride: premiumProviderLabel || undefined,
              }))
              return { tool_call_id: tc.id, role: 'tool', name: tc.function.name, content: JSON.stringify(out).slice(0, 8000) }
            }))
            for (const r of results) messages.push(r)
            // Hand the model the running numbered Sources list so its inline
            // [n] markers match the client's right-rail numbering.
            pushSourcesContext()
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
    case 'get_quote':       return out.symbol ? `${out.symbol}${out.assetType && out.assetType!=='Equity'?` (${out.assetType})`:''} ${out.assetClass==='rate'?`${out.yield ?? out.price ?? '—'}%`:`$${out.price ?? '—'}`} · ${out.changePct ?? '—'}%` : 'no quote'
    case 'get_news':        return `${out.articles?.length || 0} headlines`
    case 'get_news_sentiment': return out.current
      ? `${out.symbol || out.sector || 'sentiment'} · ${out.current.label} ${out.current.avgScore >= 0 ? '+' : ''}${Number(out.current.avgScore).toFixed(2)}${out.deviation?.hasSignal ? ' · ⚠ deviation' : ''}`
      : 'no sentiment'
    case 'get_filings':     return `${out.filings?.length || 0} filings`
    case 'get_financials':  return `${out.years?.length || 0} years of statements`
    case 'get_transcripts': return `${out.transcripts?.length || 0} transcripts`
    case 'get_macro':       return `${Array.isArray(out) ? out.length : 'series'} datapoints`
    case 'get_technicals':  return out.empty ? 'no price history' : `${out.indicators?.length || 0} indicators · ${out.signals?.length || 0} signals · ${out.source || 'none'}`
    case 'get_macro_series': return out?.count != null
      ? `${out.count} obs · ${out.source || 'macro'}${out.indicator ? ` · ${out.indicator}` : out.seriesId ? ` · ${out.seriesId}` : ''}`
      : `${Array.isArray(out?.observations) ? out.observations.length : 'series'} datapoints`
    case 'list_peer_sets':  return `${out.sets?.length || 0} peer sets`
    case 'get_peer_set':    return out.set ? `${out.set.name} · ${(out.set.symbols || []).length} members` : 'no set'
    case 'compare_peers':   return `${out.rows?.length || 0} rows · anchor ${out.anchor || '—'}`
    case 'score_filing':    return out?.score != null
      ? `${out.accession || out.symbol || 'filing'} · score ${out.score}/100`
      : 'no score'
    case 'get_prediction_markets': return `${out.markets?.length || 0} markets · ${out.source || 'none'}`
    case 'get_geopolitical_events': return `${out.events?.length || 0} events${out.region ? ` · ${out.region}` : ''} · ${out.source || 'none'}`
    case 'get_cot': return out.latest
      ? `${out.market?.label || 'market'} · spec net ${out.latest.noncommercialNet ?? '—'} · ${out.source || 'none'}`
      : `no COT data · ${out.source || 'none'}`
    case 'get_short_interest': return out.latest
      ? `${out.symbol} short ${out.latest.shortPct != null ? (out.latest.shortPct * 100).toFixed(1) + '%' : '—'} · ${out.source || 'none'}`
      : `no short data · ${out.source || 'none'}`
    case 'get_yield_curve': return out.empty
      ? `no curve data · ${out.source || 'none'}`
      : `${out.curve?.length || 0} tenors${out.spreads?.find((s: any) => s.key === '2s10s') ? ` · 2s10s ${out.spreads.find((s: any) => s.key === '2s10s').value}` : ''} · ${out.source || 'none'}`
    case 'get_rates': return out.empty
      ? `no rates data · ${out.source || 'none'}`
      : `${out.referenceRates?.length || 0} reference · ${out.creditSpreads?.length || 0} credit · ${out.source || 'none'}`
    default:                return JSON.stringify(out).slice(0, 80)
  }
}

/**
 * Resolve the workspace's `apify-actors` connection and execute the SEC
 * EDGAR Filings Intelligence actor for a single filing. Returns a flat
 * `{ accession, symbol, score, attribution, materialSections, source }`
 * payload. Score is the Apify actor's own 0-100 signal score when present;
 * otherwise we derive it from the `materialSections` density so the column
 * is never empty for filings the actor returned.
 *
 * Errors return `{ error, message, cta? }` so the agent can verbalise the
 * fix (connect Apify Actors). The actor is rate-limited and quota-tracked
 * by the executor — there is no extra throttle here.
 */
async function runScoreFiling(
  orgId: string,
  args: { symbol?: string; cik?: string; accession?: string; formType?: string },
  actorUserId: string | null,
): Promise<unknown> {
  const symbol = (args.symbol || '').trim().toUpperCase()
  const cik = (args.cik || '').trim()
  const accession = (args.accession || '').trim().replace(/-/g, '')
  if (!symbol && !cik && !accession) {
    return { error: 'bad_request', message: 'score_filing requires symbol, cik, or accession.' }
  }

  // Look up the workspace's active apify-actors connection. We use the
  // shared org-context query helper so RLS / org guards behave the same
  // as elsewhere.
  let connectionId: string | null = null
  try {
    const { withOrgContext, connectionsTable, connectorDefinitionsTable } = await import('@workspace/db')
    const { eq, and } = await import('drizzle-orm')
    const rows = await withOrgContext(orgId, (tx) =>
      tx
        .select({ id: connectionsTable.id, status: connectionsTable.status })
        .from(connectionsTable)
        .innerJoin(
          connectorDefinitionsTable,
          eq(connectorDefinitionsTable.id, connectionsTable.definitionId),
        )
        .where(
          and(
            eq(connectionsTable.orgId, orgId),
            eq(connectorDefinitionsTable.slug, 'apify-actors'),
          ),
        )
        .limit(1),
    )
    const row = rows[0]
    if (row && row.status === 'active') connectionId = row.id
  } catch {
    /* DB hiccup — fall through to the connector_required branch */
  }

  if (!connectionId) {
    return {
      error: 'connector_required',
      message: 'Connect the Apify Actors workspace connection to score SEC filings.',
      cta: '/app/connectors?source=apify-actors',
    }
  }

  const { executeConnectionOperation } = await import('@/lib/connectors/executor')
  const params: Record<string, unknown> = { limit: 10 }
  if (symbol) params.ticker = symbol
  if (cik) params.cik = cik
  if (args.formType) params.formType = args.formType

  const result = await executeConnectionOperation({
    orgId,
    connectionId,
    operation: 'sec_filings_intelligence',
    params,
    actorId: actorUserId,
  })
  if (!result.ok) {
    return { error: 'apify_error', status: result.status, message: result.error || 'Apify actor failed' }
  }

  const items = Array.isArray(result.data) ? result.data : []
  // The actor returns one row per filing; pick the matching accession when
  // the caller specified one, otherwise the first (most recent) row.
  const norm = (s: unknown) => String(s || '').replace(/-/g, '').toLowerCase()
  const target = accession
    ? items.find((it: any) => norm(it?.accession || it?.accessionNumber || it?.accNum) === norm(accession))
    : items[0]
  if (!target) {
    return { error: 'not_found', message: 'No matching filing returned by SEC EDGAR Intelligence.' }
  }

  const materialSections: string[] = Array.isArray(target.materialSections)
    ? target.materialSections.slice(0, 6)
    : Array.isArray(target.highlights)
      ? target.highlights.slice(0, 6).map((h: any) => h.section || h.title || String(h))
      : []
  const rawScore = Number(target.signalScore ?? target.score ?? target.signal)
  const score = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : Math.min(100, materialSections.length * 12 + (target.formType === '10-K' ? 30 : 18))
  const attribution = String(
    target.summary || target.attribution || target.materialSummary || ''
  ).slice(0, 600)

  return {
    accession: target.accession || target.accessionNumber || target.accNum || accession || null,
    symbol: target.ticker || symbol || null,
    formType: target.formType || target.form || null,
    filedAt: target.filedAt || target.filingDate || target.filed || null,
    score,
    attribution,
    materialSections,
    source: 'SEC EDGAR Filings Intelligence (Apify)',
  }
}

// Build the canonical "action" descriptor surfaced by the confirm_required
// SSE event. The drawer reads this directly to render the confirm card and
// to issue the corresponding mutation when the user clicks Approve.
function peerWriteActionFor(toolName: string, args: any): {
  kind: 'create_peer_set' | 'add_member' | 'remove_member' | 'create_report'
  endpoint: string
  method: 'POST' | 'DELETE'
  body?: any
  summary: string
} | null {
  if (toolName === 'draft_report') {
    const symbol = String(args?.symbol || '').toUpperCase()
    const rawBlocks = Array.isArray(args?.blocks) ? args.blocks : []
    const ALLOWED = new Set(['kpi', 'chart', 'peers', 'valuation', 'text', 'citations'])
    const blocks = rawBlocks
      .filter((b: any) => b && ALLOWED.has(String(b.kind)))
      .slice(0, 40)
      .map((b: any) => ({
        kind: String(b.kind),
        config: b.config && typeof b.config === 'object' ? b.config : {},
      }))
    return {
      kind: 'create_report',
      endpoint: '/api/reports',
      method: 'POST',
      body: {
        title: String(args?.title || 'Untitled report').slice(0, 140),
        subtitle: String(args?.subtitle || '').slice(0, 280),
        symbol,
        blocks,
      },
      summary: `Create report "${args?.title || 'Untitled'}"${symbol ? ` (${symbol})` : ''} with ${blocks.length} block${blocks.length === 1 ? '' : 's'}: ${blocks.map((b: any) => b.kind).join(', ') || '—'}`,
    }
  }
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
