/**
 * Research Library — metadata store.
 *
 * Maintains a per-org registry of ingested research items (arXiv papers,
 * finance blogs, reports). Each item's chunks are stored in workspace_sources
 * via the existing ingest pipeline; this module only tracks the lightweight
 * metadata overlay (title, authors, topics, source attribution) so the
 * library page can list, filter, and build the knowledge graph without
 * re-fetching chunk text.
 *
 * Storage: in-memory Map with optional Supabase persistence.
 * Table: `research_library_items` (auto-created when Supabase is available).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface ResearchLibraryItem {
  id: string
  /** Clerk org id — primary isolation boundary. */
  orgId: string
  title: string
  authors: string[]
  abstract: string
  /** Auto-assigned research topic tags. */
  topics: string[]
  /** "arxiv" | "url" */
  sourceType: "arxiv" | "url"
  arxivId?: string
  url?: string
  /** Human-readable attribution: "arXiv" or the hostname. */
  attribution: string
  ingestedAt: string
  /**
   * The workspace_sources sourceId where chunks live.
   * Format: `${userId}:rl:${id}` — userId-prefixed for compatibility with
   * the workspace_sources pipeline.
   */
  workspaceSourceId: string
  chunkCount: number
  /** Publication year if known. */
  year?: number
}

const TABLE = "research_library_items"

/** in-memory cache: orgId → items */
const CACHE = new Map<string, ResearchLibraryItem[]>()

let sb: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  if (sb) return sb
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.finsyt_SUPABASE_URL ||
    ""
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.finsyt_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  if (!url || !key) return null
  sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return sb
}

function ensureOrgCache(orgId: string): ResearchLibraryItem[] {
  if (!CACHE.has(orgId)) CACHE.set(orgId, [])
  return CACHE.get(orgId)!
}

/** Load all items for an org, using Supabase when available. */
export async function listLibraryItems(orgId: string): Promise<ResearchLibraryItem[]> {
  const cached = CACHE.get(orgId)
  if (cached !== undefined) return [...cached]

  const client = getClient()
  if (client) {
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("org_id", orgId)
      .order("ingested_at", { ascending: false })
      .limit(500)

    if (!error && data) {
      const items: ResearchLibraryItem[] = data.map(rowToItem)
      CACHE.set(orgId, items)
      return [...items]
    }
  }

  return ensureOrgCache(orgId)
}

/** Persist a new item. */
export async function addLibraryItem(item: ResearchLibraryItem): Promise<void> {
  const list = ensureOrgCache(item.orgId)
  list.unshift(item)

  const client = getClient()
  if (client) {
    await client.from(TABLE).upsert(itemToRow(item), { onConflict: "id" })
  }
}

/**
 * Remove an item by id.
 * Returns the removed item (so callers can access workspaceSourceId for
 * chunk cleanup) or null if not found.
 */
export async function removeLibraryItem(
  orgId: string,
  itemId: string,
): Promise<ResearchLibraryItem | null> {
  const list = CACHE.get(orgId)
  if (!list) return null
  const idx = list.findIndex((x) => x.id === itemId)
  if (idx === -1) return null
  const [removed] = list.splice(idx, 1)

  const client = getClient()
  if (client) {
    await client.from(TABLE).delete().eq("id", itemId).eq("org_id", orgId)
  }
  return removed
}

/** Lookup a single item. */
export async function getLibraryItem(orgId: string, itemId: string): Promise<ResearchLibraryItem | null> {
  const items = await listLibraryItems(orgId)
  return items.find((x) => x.id === itemId) ?? null
}

// ── Row ↔ domain conversion ──────────────────────────────────────────────────

interface Row {
  id: string
  org_id: string
  title: string
  authors: unknown
  abstract: string
  topics: unknown
  source_type: string
  arxiv_id?: string | null
  url?: string | null
  attribution: string
  ingested_at: string
  workspace_source_id: string
  chunk_count: number
  year?: number | null
}

function rowToItem(r: Row): ResearchLibraryItem {
  return {
    id: r.id,
    orgId: r.org_id,
    title: r.title,
    authors: Array.isArray(r.authors) ? r.authors as string[] : [],
    abstract: r.abstract,
    topics: Array.isArray(r.topics) ? r.topics as string[] : [],
    sourceType: r.source_type as "arxiv" | "url",
    arxivId: r.arxiv_id ?? undefined,
    url: r.url ?? undefined,
    attribution: r.attribution,
    ingestedAt: r.ingested_at,
    workspaceSourceId: r.workspace_source_id,
    chunkCount: r.chunk_count,
    year: r.year ?? undefined,
  }
}

function itemToRow(item: ResearchLibraryItem): Record<string, unknown> {
  return {
    id: item.id,
    org_id: item.orgId,
    title: item.title,
    authors: item.authors,
    abstract: item.abstract,
    topics: item.topics,
    source_type: item.sourceType,
    arxiv_id: item.arxivId ?? null,
    url: item.url ?? null,
    attribution: item.attribution,
    ingested_at: item.ingestedAt,
    workspace_source_id: item.workspaceSourceId,
    chunk_count: item.chunkCount,
    year: item.year ?? null,
  }
}

// ── Topic catalogue ──────────────────────────────────────────────────────────

export const RESEARCH_TOPICS = [
  "Factor Investing",
  "Risk Management",
  "Portfolio Optimization",
  "Market Microstructure",
  "Machine Learning in Finance",
  "Derivatives & Options",
  "Alternative Data",
  "Fixed Income & Credit",
  "Macro & Rates",
  "High-Frequency Trading",
  "ESG & Sustainable Finance",
  "Asset Allocation",
  "Behavioral Finance",
  "Volatility",
  "Crypto & DeFi",
  "Earnings & Fundamentals",
  "Sentiment Analysis",
  "Backtesting & Simulation",
] as const

export type ResearchTopic = (typeof RESEARCH_TOPICS)[number]

const TOPIC_KEYWORDS: Record<string, string[]> = {
  "Factor Investing": [
    "factor", "alpha", "momentum", "value investing", "quality factor",
    "size premium", "fama-french", "capm", "market factor", "smart beta",
    "low volatility factor", "profitability", "investment factor",
  ],
  "Risk Management": [
    "risk model", "value at risk", "var", "tail risk", "drawdown",
    "conditional var", "cvar", "expected shortfall", "stress test",
    "systemic risk", "credit risk", "counterparty risk",
  ],
  "Portfolio Optimization": [
    "portfolio optimization", "mean-variance", "markowitz", "efficient frontier",
    "asset allocation", "risk parity", "black-litterman", "kelly criterion",
    "diversification", "rebalancing", "covariance", "constraint",
  ],
  "Market Microstructure": [
    "microstructure", "bid-ask spread", "order flow", "market impact",
    "execution", "limit order", "liquidity", "price discovery",
    "adverse selection", "informed trading", "order book",
  ],
  "Machine Learning in Finance": [
    "machine learning", "deep learning", "neural network", "lstm",
    "gradient boosting", "xgboost", "random forest", "reinforcement learning",
    "natural language processing", "nlp", "transformer", "llm",
    "prediction", "classification", "regression",
  ],
  "Derivatives & Options": [
    "option", "derivative", "black-scholes", "implied volatility",
    "hedging", "greeks", "delta", "gamma", "vega", "futures",
    "swap", "cds", "structured product",
  ],
  "Alternative Data": [
    "alternative data", "satellite", "credit card", "web scraping",
    "geolocation", "foot traffic", "social media", "textual analysis",
    "news sentiment", "supply chain", "patent",
  ],
  "Fixed Income & Credit": [
    "bond", "fixed income", "credit spread", "yield curve", "duration",
    "convexity", "interest rate", "sovereign debt", "corporate bond",
    "municipal", "securitization", "clo", "cmo", "credit default",
  ],
  "Macro & Rates": [
    "gdp", "inflation", "cpi", "federal reserve", "fomc", "monetary policy",
    "fiscal policy", "recession", "economic indicator", "macro",
    "yield curve", "treasury", "central bank",
  ],
  "High-Frequency Trading": [
    "high-frequency", "hft", "algorithmic trading", "latency",
    "market making", "arbitrage", "co-location", "flash crash",
    "tick data", "intraday",
  ],
  "ESG & Sustainable Finance": [
    "esg", "environmental", "social governance", "sustainable", "climate risk",
    "carbon", "green bond", "impact investing", "taxonomy",
  ],
  "Asset Allocation": [
    "strategic asset allocation", "tactical", "global macro", "cross-asset",
    "multi-asset", "regime", "allocation", "endowment",
  ],
  "Behavioral Finance": [
    "behavioral", "bias", "overconfidence", "herding", "disposition effect",
    "prospect theory", "loss aversion", "anchoring", "mental accounting",
  ],
  "Volatility": [
    "volatility", "vix", "garch", "stochastic volatility", "variance swap",
    "realized volatility", "implied vol", "vol surface", "skew",
  ],
  "Crypto & DeFi": [
    "bitcoin", "ethereum", "cryptocurrency", "blockchain", "defi",
    "decentralized finance", "crypto", "token", "smart contract",
  ],
  "Earnings & Fundamentals": [
    "earnings", "revenue", "eps", "guidance", "analyst estimate",
    "fundamental analysis", "valuation", "dcf", "p/e ratio",
    "profit margin", "roe", "ebitda",
  ],
  "Sentiment Analysis": [
    "sentiment", "opinion", "news analytics", "textual", "tone",
    "media coverage", "social media", "twitter", "reddit",
  ],
  "Backtesting & Simulation": [
    "backtest", "simulation", "strategy evaluation", "walk-forward",
    "overfitting", "sharpe ratio", "performance attribution",
    "transaction cost", "slippage",
  ],
}

/**
 * Classify a paper into research topics using keyword matching.
 * Returns 1-3 topics. Falls back to "Machine Learning in Finance" for
 * quant papers that don't clearly match any category.
 */
export function classifyTopics(title: string, abstract: string): ResearchTopic[] {
  const text = `${title} ${abstract}`.toLowerCase()
  const scores: Map<string, number> = new Map()

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let score = 0
    for (const kw of keywords) {
      const re = new RegExp(`\\b${kw.replace(/[^a-z0-9 ]/gi, ".")}\\b`, "gi")
      const matches = text.match(re)
      if (matches) score += matches.length
    }
    if (score > 0) scores.set(topic, score)
  }

  const sorted = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([, s]) => s >= 1)
    .map(([t]) => t as ResearchTopic)

  return sorted.length > 0 ? sorted : ["Machine Learning in Finance"]
}

/**
 * Optionally enhance topic classification with OpenAI.
 * Falls back silently to keyword results.
 */
export async function classifyTopicsWithAI(
  title: string,
  abstract: string,
  keywordTopics: ResearchTopic[],
): Promise<ResearchTopic[]> {
  const key =
    process.env.OPENAI_API_KEY ||
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    ""
  if (!key) return keywordTopics

  const base =
    (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")
  const model = "gpt-4o-mini"

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content: `You are a quant finance research classifier. Given a paper title and abstract, output 1-3 of these topic tags (comma-separated, exact names only): ${RESEARCH_TOPICS.join(", ")}. Output ONLY the comma-separated tags.`,
          },
          {
            role: "user",
            content: `Title: ${title}\nAbstract: ${abstract.slice(0, 500)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return keywordTopics
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = j.choices?.[0]?.message?.content?.trim() || ""
    const parsed = content
      .split(",")
      .map((t) => t.trim())
      .filter((t): t is ResearchTopic =>
        (RESEARCH_TOPICS as readonly string[]).includes(t),
      )
    return parsed.length > 0 ? parsed.slice(0, 3) : keywordTopics
  } catch {
    return keywordTopics
  }
}
