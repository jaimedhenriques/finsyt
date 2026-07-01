/**
 * Data Sources Trace — shared contract for the "Data sources used" footer
 * that ships with every Finsyt agent answer (Research, AI Analysis tab,
 * Matrix cell drawer, generated decks).
 *
 * Each entry describes one provider/connector touched while answering the
 * question: which role it played (primary | fallback | citation), how long
 * the round-trip took, an optional citation count when the source produced
 * inline-citable items, and a deep link back into the Connector Hub.
 */
import { PROVIDER_META } from './data-providers'

export type ProviderRole = 'primary' | 'fallback' | 'citation'

export interface ProviderTrace {
  /** Stable id, usually `${tool}-${name}` so duplicates can be deduped. */
  id: string
  /** Underlying provider key in `PROVIDER_META` when known (fmp, eodhd, …). */
  provider?: string
  /** Human label, e.g. "Financial Modeling Prep". */
  label: string
  /** Origin tool name on the agent (`get_quote`, `get_news`, …). */
  tool?: string
  /** Role in the answer waterfall. */
  role: ProviderRole
  /** End-to-end tool round-trip in ms. */
  responseMs?: number
  /** Number of citations contributed (only meaningful when role=citation). */
  citationCount?: number
  /** Deep link to the Connector Hub entry for this provider. */
  connectorHubHref: string
  /** Optional one-liner shown under the row, e.g. "FMP / EODHD primary, Yahoo fallback". */
  detail?: string
}

const CITATION_TOOLS = new Set([
  'get_news', 'get_news_sentiment', 'get_filings', 'get_transcripts',
  // `score_filing` returns an attribution paragraph + materialSections list
  // that the answer may quote inline, so it counts as a citation source.
  'score_filing',
  // `get_prediction_markets` returns linked, quotable market rows (each with
  // a `url` back to Polymarket / Kalshi), so it counts as a citation source.
  'get_prediction_markets',
  // `get_geopolitical_events` returns linked, quotable event rows (each with a
  // `url` back to the originating article), so it counts as a citation source.
  'get_geopolitical_events',
])

const PRIMARY_TOOLS = new Set([
  'get_quote', 'get_financials', 'get_estimates', 'get_macro', 'get_macro_series',
  'get_technicals',
  'assemble_memo_data', 'build_pptx',
  // Positioning desk (Task #410): COT + short-interest return a primary
  // positioning signal (not inline-citable items), so they count as primary.
  'get_cot', 'get_short_interest',
  // Fixed Income & Rates Desk (Task #405): yield curve + reference/credit
  // rates return a primary macro signal (not inline-citable items).
  'get_yield_curve', 'get_rates',
  // Keyless Yahoo supplementary data (Task #629): ESG scores, holders
  // breakdown, upgrade/downgrade history, and fund/ETF holdings return a
  // primary signal block (not inline-citable items) tagged source:'yahoo'.
  'get_esg', 'get_holders_breakdown', 'get_upgrades', 'get_fund_holdings',
])

const TOOL_LABEL_FALLBACK: Record<string, string> = {
  get_quote: 'Real-time quote',
  get_news: 'Latest news',
  get_news_sentiment: 'News sentiment',
  get_filings: 'SEC filings',
  get_financials: 'Financial statements',
  get_estimates: 'Sell-side estimates',
  get_transcripts: 'Earnings transcripts',
  get_macro: 'Macro data',
  get_macro_series: 'Global macro series',
  get_technicals: 'Technical indicators',
  assemble_memo_data: 'Memo data assembly',
  build_pptx: 'Slide rendering',
  score_filing: 'SEC EDGAR Filings Intelligence',
  get_prediction_markets: 'Prediction-market odds',
  get_geopolitical_events: 'Geopolitical events (GDELT)',
  get_cot: 'CFTC Commitment of Traders',
  get_short_interest: 'FINRA short volume + SEC fails-to-deliver',
  get_yield_curve: 'US Treasury yield curve',
  get_rates: 'Reference & credit rates',
  get_esg: 'ESG / sustainability scores (Yahoo)',
  get_holders_breakdown: 'Major-holders breakdown (Yahoo)',
  get_upgrades: 'Analyst upgrade/downgrade history (Yahoo)',
  get_fund_holdings: 'Fund / ETF holdings & weightings (Yahoo)',
}

/**
 * Map a tool's `source` string (returned by tool runners, e.g.
 * `'FMP / EODHD'`, `'Yahoo Finance'`, `'SEC EDGAR'`) onto a provider key in
 * `PROVIDER_META` so we can join the trace row to the canonical Connector
 * Hub entry. Returns null when no match (the caller should still render the
 * raw label).
 */
export function providerKeyFromSource(source: string | undefined): string | null {
  if (!source) return null
  const s = source.toLowerCase()
  if (s.includes('fmp') || s.includes('financial modeling prep')) return 'fmp'
  if (s.includes('eodhd')) return 'eodhd'
  if (s.includes('finnhub')) return 'finnhub'
  if (s.includes('massive') || s.includes('polygon')) return 'massive'
  if (s.includes('alpha vantage') || s.includes('alphav')) return 'alphav'
  if (s.includes('marketstack')) return 'marketstack'
  if (s.includes('yahoo')) return 'yahoo'
  if (s.includes('sec edgar') || s.includes('sec ')) return 'sec'
  if (s.includes('fred')) return 'fred'
  if (s.includes('coresignal')) return 'coresignal'
  if (s.includes('twelvedata') || s.includes('twelve data')) return 'twelvedata'
  if (s.includes('financial datasets')) return 'financialdatasets'
  if (s.includes('financeflow')) return 'financeflow'
  if (s.includes('databento')) return 'databento'
  if (s.includes('fiscal')) return 'fiscalai'
  if (s.includes('alpaca')) return 'alpaca'
  if (s.includes('census')) return 'census'
  if (s.includes('world bank') || s.includes('worldbank')) return 'worldbank'
  if (s.includes('dbnomics')) return 'dbnomics'
  if (s === 'imf' || s.includes('imf ') || s.includes('datamapper') || s.includes('international monetary fund')) return 'imf'
  if (s.includes('polymarket')) return 'polymarket'
  if (s.includes('kalshi')) return 'kalshi'
  if (s.includes('gdelt')) return 'gdelt'
  if (s.includes('cftc') || s.includes('commitment of traders')) return 'cftc'
  if (s.includes('finra')) return 'finra'
  if (s.includes('openweb')) return 'own'
  if (s.includes('perplexity')) return 'perplexity'
  if (s.includes('groq')) return 'groq'
  if (s.includes('anthropic') || s.includes('claude')) return 'anthropic'
  if (s.includes('openai') || s.includes('gpt')) return 'openai'
  // Apify-backed alt-data actors. We map the three actors we publish to
  // the same `apify` provider key so the Connector Hub deep link lands on
  // the single Apify Actors tile (operations are picked from there).
  if (s.includes('apify')
    || s.includes('capitol trades')
    || s.includes('glassdoor')
    || s.includes('sec edgar filings intelligence')
  ) return 'apify'
  // Premium BYO-license connectors — matched by their catalog slug label or
  // the "(your license)" attribution string the agent emits for these tools.
  if (s.includes('factset')) return 'factset'
  if (s.includes('capital iq') || s.includes('capiq') || s.includes('s&p capital')) return 'capiq'
  if (s.includes('refinitiv') || s.includes('lseg')) return 'refinitiv'
  if (s.includes('bloomberg')) return 'bloomberg'
  if (s.includes('pitchbook')) return 'pitchbook'
  // Intelligence providers — public free-to-use APIs
  if (s.includes('world bank wgi') || s.includes('worldbank wgi') || s.includes('wgi')) return 'worldbankwgi'
  if (s.includes('gdelt')) return 'gdelt'
  if (s.includes('ofac') || s.includes('sdn') || s.includes('specially designated')) return 'ofac'
  if (s.includes('eu fsf') || s.includes('eu financial sanctions') || s.includes('eu consolidated')) return 'eufsf'
  if (s.includes('un security council') || s.includes('un sc') || s.includes('unsc')) return 'unsc'
  if (s.includes('comtrade') || s.includes('un comtrade')) return 'comtrade'
  if (s.includes('cisa kev') || s.includes('known exploited')) return 'cisakev'
  if (s.includes('nvd nist') || s.includes('nvd') || s.includes('nist cve')) return 'nvdnist'
  if (s.includes('reuters') || s.includes('bbc')) return 'gdelt'
  // Enterprise knowledge / CRM / email connectors. The key is the catalog
  // slug so the Connector Hub deep link lands on the matching tile.
  if (s.includes('salesforce')) return 'salesforce'
  if (s.includes('hubspot')) return 'hubspot'
  if (s.includes('gmail')) return 'gmail'
  if (s.includes('microsoft 365') || s.includes('microsoft365') || s.includes('outlook')) return 'microsoft365'
  if (s.includes('sharepoint') || s.includes('onedrive')) return 'sharepoint'
  if (s.includes('google drive')) return 'google-drive'
  if (s.includes('confluence')) return 'confluence'
  if (s.includes('notion')) return 'notion'
  return null
}

/**
 * Connector Hub deep link. The platform's `/app/connectors` page reads
 * `?provider=<key>` to scroll/highlight the matching connector row.
 */
export function connectorHubHref(providerKey: string | null | undefined): string {
  const base = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE_PATH) || ''
  if (!providerKey) return `${base}/app/connectors`
  return `${base}/app/connectors?provider=${encodeURIComponent(providerKey)}`
}

/**
 * Decide the role this tool played for the answer:
 *   - `citation` for retrieval-shaped tools (news/filings/transcripts) that
 *     contribute inline-citable items.
 *   - `fallback` when the runner returned a non-primary source for a
 *     primary-shaped tool (e.g. quote came back via Yahoo public chart
 *     because FMP/EODHD missed).
 *   - `primary` otherwise.
 */
export function roleForTool(toolName: string, providerKey: string | null): ProviderRole {
  if (CITATION_TOOLS.has(toolName)) return 'citation'
  if (!PRIMARY_TOOLS.has(toolName)) return 'primary'
  if (!providerKey) return 'primary'
  const meta = PROVIDER_META[providerKey]
  if (meta?.tier === 'fallback') return 'fallback'
  return 'primary'
}

/**
 * Build a `ProviderTrace` from a tool_result event. Used by the Research
 * page and AIAnalysisTab to convert SSE frames into footer rows.
 *
 * @param event - the `tool_result` payload from the agent SSE stream.
 * @param citationCount - optional number of citations this tool contributed
 *                        (the page tracks this since it knows which results
 *                        produced citation buckets).
 */
export function traceFromToolResult(event: {
  id?: string
  name?: string
  ok?: boolean
  responseMs?: number
  provider?: string
  raw?: string
}, citationCount?: number): ProviderTrace | null {
  if (!event?.name) return null
  // Try the provider hint we now emit alongside `summary` first; fall back
  // to inspecting the raw payload's `source` field for legacy events.
  let providerKey: string | null = providerKeyFromSource(event.provider)
  if (!providerKey && event.raw) {
    try {
      const r = JSON.parse(event.raw) as { source?: string }
      providerKey = providerKeyFromSource(r?.source)
    } catch { /* ignore parse error */ }
  }
  const meta = providerKey ? PROVIDER_META[providerKey] : null
  const label = meta?.label
    || (event.provider && event.provider.length < 40 ? event.provider : null)
    || TOOL_LABEL_FALLBACK[event.name]
    || event.name
  const role = roleForTool(event.name, providerKey)
  return {
    id: event.id || `${event.name}-${Math.random().toString(36).slice(2, 8)}`,
    provider: providerKey || undefined,
    label,
    tool: event.name,
    role,
    responseMs: typeof event.responseMs === 'number' ? event.responseMs : undefined,
    citationCount: role === 'citation' ? (citationCount ?? (event.ok ? 1 : 0)) : undefined,
    connectorHubHref: connectorHubHref(providerKey),
    detail: TOOL_LABEL_FALLBACK[event.name],
  }
}

/**
 * Dedupe + collapse the trace list so the footer never shows the same
 * provider twice for the same tool. Citation counts are summed; the longest
 * recorded responseMs wins (worst-case latency) so users see how long the
 * slowest hop took.
 */
export function dedupeTrace(items: ProviderTrace[]): ProviderTrace[] {
  const map = new Map<string, ProviderTrace>()
  for (const it of items) {
    const key = `${it.tool || 'unknown'}::${it.provider || it.label}`
    const prev = map.get(key)
    if (!prev) { map.set(key, it); continue }
    map.set(key, {
      ...prev,
      responseMs: Math.max(prev.responseMs ?? 0, it.responseMs ?? 0) || undefined,
      citationCount: (prev.citationCount ?? 0) + (it.citationCount ?? 0) || prev.citationCount,
    })
  }
  return Array.from(map.values())
}

export const ROLE_COLORS: Record<ProviderRole, { bg: string; fg: string; border: string; label: string }> = {
  primary: {
    bg: 'rgba(27,79,255,0.10)',
    fg: 'var(--accent-text)',
    border: 'rgba(27,79,255,0.25)',
    label: 'Primary',
  },
  fallback: {
    bg: 'rgba(251,191,36,0.10)',
    fg: 'var(--amber, #B45309)',
    border: 'rgba(251,191,36,0.30)',
    label: 'Fallback',
  },
  citation: {
    bg: 'rgba(167,139,250,0.10)',
    fg: 'var(--violet, #7C3AED)',
    border: 'rgba(167,139,250,0.30)',
    label: 'Citation',
  },
}
