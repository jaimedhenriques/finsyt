// Cluster analyst Q&A from real earnings call transcripts.
//
// Pipeline:
//   1. Pull recent transcripts for one or more symbols (FMP).
//   2. Locate the Q&A section of each transcript.
//   3. Detect analyst speakers (introduced by the operator) and pull the
//      first question they ask.
//   4. Partition the resulting questions by quarter and cluster each
//      quarter into themes via Groq (the LLM acts as the embedding +
//      grouping step in one shot).
//   5. Cache clusters on disk so the work survives server restarts.
//      Refresh with `?refresh=1`.
//
// Falls back to a curated demo dataset when the upstreams or LLM are
// unavailable so the surface is never empty.

import { promises as fs } from 'node:fs'
import path from 'node:path'

const FMP  = process.env.FMP_API_KEY
const GROQ = process.env.GROQ_API_KEY

const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768']

const GLOBAL_WATCHLIST = [
  'NVDA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'TSLA', 'AMD', 'AVGO', 'NFLX',
]

// ── Public types ─────────────────────────────────────────────────────────────
export interface ClusterQuestion {
  symbol: string
  name: string
  date: string
  event: string
  section: 'Q&A'
  q: string
  analyst: string
}

export interface QuestionCluster {
  id: string
  theme: string
  chips: string[]
  quarter: string
  questions: ClusterQuestion[]
}

// ── Internal types (no `any`) ────────────────────────────────────────────────
interface TranscriptListRow { year: number; quarter: number; date: string }
interface TranscriptBody { content: string; date: string }

interface RawTranscriptListItem {
  0?: number | string
  1?: number | string
  2?: string
  length?: number
}
interface RawTranscriptBody { content?: string; date?: string }
interface RawProfile { companyName?: string; name?: string }

interface Segment { speaker: string; text: string }
interface ExtractedQ { analyst: string; q: string }
interface RawQ extends ClusterQuestion { _idx: number }

interface GroqClusterRow { theme?: string; chips?: string[]; indices?: number[] }
interface GroqClusterResponse { clusters?: GroqClusterRow[] }
interface GroqChoice { message?: { content?: string } }
interface GroqResponse { choices?: GroqChoice[] }

// ── Disk-backed cache (survives restarts) ───────────────────────────────────
const TTL_MS = 60 * 60 * 1000
const CACHE_DIR = path.join(process.cwd(), '.cache', 'question-clusters')

interface CacheEnvelope { value: QuestionCluster[]; expires: number }
const MEM: Map<string, CacheEnvelope> = new Map()

async function ensureCacheDir(): Promise<void> {
  try { await fs.mkdir(CACHE_DIR, { recursive: true }) } catch { /* ignore */ }
}

function cacheKeyToFile(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 120)
  return path.join(CACHE_DIR, `${safe}.json`)
}

async function cacheGet(key: string): Promise<QuestionCluster[] | null> {
  const mem = MEM.get(key)
  if (mem && mem.expires > Date.now()) return mem.value
  if (mem) MEM.delete(key)
  try {
    const raw = await fs.readFile(cacheKeyToFile(key), 'utf-8')
    const parsed = JSON.parse(raw) as CacheEnvelope
    if (parsed.expires > Date.now() && Array.isArray(parsed.value)) {
      MEM.set(key, parsed)
      return parsed.value
    }
  } catch { /* miss */ }
  return null
}

async function cacheSet(key: string, value: QuestionCluster[]): Promise<void> {
  const env: CacheEnvelope = { value, expires: Date.now() + TTL_MS }
  MEM.set(key, env)
  try {
    await ensureCacheDir()
    await fs.writeFile(cacheKeyToFile(key), JSON.stringify(env), 'utf-8')
  } catch { /* best-effort */ }
}

// ── FMP helpers ──────────────────────────────────────────────────────────────
async function listTranscripts(symbol: string): Promise<TranscriptListRow[]> {
  if (!FMP) return []
  const res = await fetch(`https://financialmodelingprep.com/api/v4/earning_call_transcript?symbol=${symbol}&apikey=${FMP}`, { cache: 'no-store' })
  if (!res.ok) return []
  const data: unknown = await res.json()
  if (!Array.isArray(data)) return []
  const rows: TranscriptListRow[] = []
  for (const item of data) {
    const r = item as RawTranscriptListItem
    const year = Number(r[0])
    const quarter = Number(r[1])
    if (Number.isFinite(year) && Number.isFinite(quarter)) {
      rows.push({ year, quarter, date: typeof r[2] === 'string' ? r[2] : '' })
    }
  }
  return rows
}

async function fetchTranscript(symbol: string, year: number, quarter: number): Promise<TranscriptBody | null> {
  if (!FMP) return null
  const res = await fetch(`https://financialmodelingprep.com/api/v3/earning_call_transcript/${symbol}?year=${year}&quarter=${quarter}&apikey=${FMP}`, { cache: 'no-store' })
  if (!res.ok) return null
  const data: unknown = await res.json()
  const t = (Array.isArray(data) ? data[0] : data) as RawTranscriptBody | undefined
  if (!t || typeof t.content !== 'string' || !t.content) return null
  return { content: t.content, date: typeof t.date === 'string' ? t.date : '' }
}

async function fetchCompanyName(symbol: string): Promise<string> {
  if (!FMP) return symbol
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP}`, { cache: 'no-store' })
    const data: unknown = await res.json()
    const p = (Array.isArray(data) ? data[0] : data) as RawProfile | undefined
    return p?.companyName || p?.name || symbol
  } catch { return symbol }
}

// ── Q&A extraction ───────────────────────────────────────────────────────────

function findQAStart(content: string): number {
  const markers = [
    /question[-\s]and[-\s]answer/i,
    /we (?:will|'ll) now begin the question/i,
    /open(?:ing)? (?:up |up the |the )?(?:line|call) (?:up |for|to) questions/i,
    /\[Operator Instructions\]/i,
  ]
  for (const re of markers) {
    const m = content.match(re)
    if (m && m.index != null) return m.index
  }
  return Math.floor(content.length * 0.45)
}

function parseSegments(qaContent: string): Segment[] {
  const lines = qaContent.split('\n').map(l => l.trim()).filter(Boolean)
  const segments: Segment[] = []
  let speaker = ''
  let buf: string[] = []

  const flush = (): void => {
    if (speaker && buf.length) segments.push({ speaker, text: buf.join(' ').trim() })
    buf = []
  }

  for (const line of lines) {
    const m = line.match(/^([A-Z][A-Za-z0-9 .,'&\-\u2014]{1,80}):\s*(.*)$/)
    if (m && m[1].split(' ').length <= 10 && !m[1].endsWith(',')) {
      flush()
      speaker = m[1].trim()
      if (m[2]) buf.push(m[2])
    } else {
      buf.push(line)
    }
  }
  flush()
  return segments
}

const FIRM_KEYWORDS = [
  'Goldman', 'Morgan Stanley', 'JPMorgan', 'JPM', 'Bernstein', 'Bank of America', 'BofA', 'BofA Securities',
  'Wells Fargo', 'Citi', 'Citigroup', 'UBS', 'Barclays', 'Deutsche', 'Credit Suisse', 'HSBC', 'Jefferies',
  'Evercore', 'Cowen', 'Piper', 'Raymond James', 'Stifel', 'Wedbush', 'Loop Capital', 'Mizuho', 'Nomura',
  'Macquarie', 'Truist', 'Baird', 'KeyBanc', 'Oppenheimer', 'Needham', 'BTIG', 'Guggenheim', 'Rosenblatt',
  'Susquehanna', 'Wolfe', 'TD Cowen', 'TD Securities', 'RBC', 'Scotiabank', 'BNP', 'Sanford',
  'Redburn', 'Berenberg', 'Exane', 'New Street', 'D.A. Davidson', 'William Blair', 'Canaccord',
  'Benchmark', 'Roth', 'Citizens', 'Morningstar', 'CFRA', 'Argus', 'Zelman',
]

function looksLikeAnalystLabel(speaker: string): boolean {
  if (/operator/i.test(speaker)) return false
  if (/\bAnalyst\b/i.test(speaker)) return true
  if (FIRM_KEYWORDS.some(f => speaker.toLowerCase().includes(f.toLowerCase()))) return true
  if (/(--|—|–)/.test(speaker)) return true
  return false
}

function firstQuestion(text: string): string {
  const cleaned = text.replace(/^(hi|hey|hello|thanks|thank you|good (morning|afternoon|evening))[^.?!]*[.?!]\s*/i, '')
  const match = cleaned.match(/[^.?!]{15,300}\?/)
  if (match) return match[0].trim()
  const sentence = cleaned.match(/[^.?!]{20,260}[.?!]/)
  return (sentence?.[0] || cleaned).trim().slice(0, 260)
}

function extractAnalystIntro(operatorText: string): { name: string; firm: string } | null {
  const re = /(?:from|with)\s+([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,3})\s+(?:of|with|from|at)\s+([A-Z][A-Za-z.&'\-\s]{2,40})/
  const m = operatorText.match(re)
  if (!m) return null
  return { name: m[1].trim(), firm: m[2].trim().replace(/\.$/, '') }
}

function formatAnalyst(speaker: string, fallback?: { name: string; firm: string } | null): string {
  const parts = speaker.split(/\s*(?:--|—|–)\s*/).filter(p => p && !/^Analyst$/i.test(p))
  if (parts.length >= 2) return `${parts[0]} — ${parts[1]}`
  if (fallback) return `${fallback.name} — ${fallback.firm}`
  return speaker
}

function extractAnalystQuestionsFromTranscript(content: string): ExtractedQ[] {
  const start = findQAStart(content)
  const qa = content.slice(start)
  const segs = parseSegments(qa)
  const out: ExtractedQ[] = []
  let pendingIntro: { name: string; firm: string } | null = null

  for (const seg of segs) {
    if (/operator/i.test(seg.speaker)) {
      pendingIntro = extractAnalystIntro(seg.text) || pendingIntro
      continue
    }
    if (!looksLikeAnalystLabel(seg.speaker) && !pendingIntro) continue
    if (!seg.text.includes('?')) { pendingIntro = null; continue }
    const q = firstQuestion(seg.text)
    if (!q) { pendingIntro = null; continue }
    out.push({ analyst: formatAnalyst(seg.speaker, pendingIntro), q })
    pendingIntro = null
    if (out.length >= 14) break
  }
  return out
}

// ── Clustering via Groq ──────────────────────────────────────────────────────

const CLUSTER_SYSTEM = `You group earnings-call analyst questions into themes.
Return STRICT JSON only — no prose, no markdown, no code fences.
Schema: {"clusters":[{"theme":"<2-4 word label>","chips":["<tag>","<tag>","<tag>"],"indices":[<int>,...]}]}
Rules:
- 3 to 6 clusters total.
- Every input index must appear in exactly one cluster.
- Theme labels are crisp finance phrasing ("Margin transition", "AI capex", "Pricing power").
- Chips are 2-3 short tags that describe the dimensions analysts are probing.
- Group by underlying business question, not by company.`

function isGroqClusterResponse(v: unknown): v is GroqClusterResponse {
  if (typeof v !== 'object' || v === null) return false
  const clusters = (v as { clusters?: unknown }).clusters
  return Array.isArray(clusters)
}

async function callGroqJson(userPayload: string): Promise<GroqClusterResponse | null> {
  if (!GROQ) return null
  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ}` },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 1200,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: CLUSTER_SYSTEM },
            { role: 'user', content: userPayload },
          ],
        }),
      })
      if (!res.ok) continue
      const d = (await res.json()) as GroqResponse
      const txt = d.choices?.[0]?.message?.content
      if (!txt) continue
      try {
        const parsed: unknown = JSON.parse(txt)
        if (isGroqClusterResponse(parsed)) return parsed
      } catch { /* try next model */ }
    } catch { /* try next model */ }
  }
  return null
}

function fallbackCluster(qs: RawQ[], quarter: string): QuestionCluster[] {
  const buckets: { theme: string; chips: string[]; match: RegExp; items: RawQ[] }[] = [
    { theme: 'Margin & profitability', chips: ['Margin', 'Mix', 'Pricing'], match: /margin|gross|opex|profitab|mix/i, items: [] },
    { theme: 'AI & capex',             chips: ['AI', 'Capex', 'Compute'],   match: /\bai\b|capex|gpu|hyperscal|llm|compute|inference|training/i, items: [] },
    { theme: 'Demand & guidance',      chips: ['Demand', 'Guide', 'Outlook'], match: /guidance|demand|backlog|orders|book|outlook|guide/i, items: [] },
    { theme: 'Capital return',         chips: ['Buyback', 'Dividend', 'M&A'], match: /buyback|dividend|repurchas|m&a|acquisition|capital return/i, items: [] },
    { theme: 'Geography & macro',      chips: ['China', 'Geo', 'Macro'],     match: /china|europe|emea|apac|macro|consumer|tariff/i, items: [] },
  ]
  const other: RawQ[] = []
  for (const q of qs) {
    const bucket = buckets.find(b => b.match.test(q.q))
    if (bucket) bucket.items.push(q); else other.push(q)
  }
  if (other.length) buckets.push({ theme: 'Other themes', chips: ['Mixed'], match: /./, items: other })
  return buckets.filter(b => b.items.length).map((b, i) => ({
    id: `auto-${quarter}-${i}-${b.theme.toLowerCase().replace(/\W+/g, '-')}`,
    theme: b.theme,
    chips: b.chips,
    quarter,
    questions: b.items.map(({ _idx: _drop, ...rest }) => rest),
  }))
}

async function clusterQuestionsForQuarter(qs: RawQ[], quarter: string): Promise<QuestionCluster[]> {
  if (qs.length === 0) return []
  // Re-index inside the quarter so the LLM payload has stable, dense ids.
  qs.forEach((q, i) => { q._idx = i })
  const compact = qs.map(q => ({ i: q._idx, s: q.symbol, q: q.q })).slice(0, 60)
  const payload = `Quarter: ${quarter}\nCluster these analyst questions into themes:\n${JSON.stringify(compact)}`
  const json = await callGroqJson(payload)
  const clusters = json?.clusters
  if (!Array.isArray(clusters) || clusters.length === 0) return fallbackCluster(qs, quarter)

  const byIdx: Map<number, RawQ> = new Map()
  qs.forEach(q => byIdx.set(q._idx, q))
  const used: Set<number> = new Set()

  const out: QuestionCluster[] = []
  clusters.forEach((c: GroqClusterRow, i: number) => {
    const indices: number[] = Array.isArray(c.indices) ? c.indices.filter((x): x is number => Number.isInteger(x)) : []
    const items: ClusterQuestion[] = []
    for (const idx of indices) {
      if (used.has(idx)) continue
      const src = byIdx.get(idx)
      if (!src) continue
      used.add(idx)
      const { _idx: _drop, ...rest } = src
      items.push(rest)
    }
    if (!items.length) return
    const themeLabel = typeof c.theme === 'string' ? c.theme : 'Theme'
    const chips = Array.isArray(c.chips) ? c.chips.filter((x): x is string => typeof x === 'string').slice(0, 4).map(x => x.slice(0, 28)) : []
    out.push({
      id: `t-${quarter}-${i}-${themeLabel.toLowerCase().replace(/\W+/g, '-').slice(0, 40)}`,
      theme: themeLabel.slice(0, 60),
      chips,
      quarter,
      questions: items,
    })
  })
  const leftovers = qs.filter(q => !used.has(q._idx))
  if (leftovers.length) {
    out.push({
      id: `t-${quarter}-misc-other`,
      theme: 'Other questions',
      chips: ['Mixed'],
      quarter,
      questions: leftovers.map(({ _idx: _drop, ...rest }) => rest),
    })
  }
  return out
}

// Run clustering per quarter so themes are scoped to a single reporting period
// (the original requirement). Quarters are clustered in parallel.
async function clusterByQuarter(qs: RawQ[]): Promise<QuestionCluster[]> {
  const groups: Map<string, RawQ[]> = new Map()
  for (const q of qs) {
    const key = q.event || 'Unknown'
    const arr = groups.get(key) || []
    arr.push(q)
    groups.set(key, arr)
  }
  const sortedQuarters: string[] = Array.from(groups.keys()).sort((a, b) => quarterSortKey(b) - quarterSortKey(a))
  const results = await Promise.all(sortedQuarters.map(q => clusterQuestionsForQuarter(groups.get(q) || [], q)))
  return results.flat()
}

function quarterSortKey(label: string): number {
  // "Q3 2026" → 2026 * 4 + 3
  const m = label.match(/Q(\d)\s*(\d{4})/)
  if (!m) return 0
  return Number(m[2]) * 4 + Number(m[1])
}

// ── Public entrypoints ──────────────────────────────────────────────────────

async function buildSymbolQuestions(symbol: string, transcriptsToScan: number): Promise<RawQ[]> {
  const list = await listTranscripts(symbol)
  if (!list.length) return []
  const recent = list.slice(0, transcriptsToScan)
  const name = await fetchCompanyName(symbol)
  const out: RawQ[] = []
  let idx = 0
  for (const meta of recent) {
    const t = await fetchTranscript(symbol, meta.year, meta.quarter)
    if (!t) continue
    const extracted = extractAnalystQuestionsFromTranscript(t.content)
    for (const e of extracted) {
      out.push({
        _idx: idx++,
        symbol,
        name,
        date: t.date.slice(0, 10),
        event: `Q${meta.quarter} ${meta.year}`,
        section: 'Q&A',
        analyst: e.analyst,
        q: e.q,
      })
    }
  }
  return out
}

export async function getClustersForSymbol(symbol: string, opts: { refresh?: boolean } = {}): Promise<QuestionCluster[]> {
  const key = `sym:${symbol}`
  if (!opts.refresh) {
    const hit = await cacheGet(key)
    if (hit) return hit
  }
  const qs = await buildSymbolQuestions(symbol, 4)
  if (!qs.length) { await cacheSet(key, []); return [] }
  const clusters = await clusterByQuarter(qs)
  await cacheSet(key, clusters)
  return clusters
}

export async function getGlobalClusters(opts: { refresh?: boolean; symbols?: string[] } = {}): Promise<QuestionCluster[]> {
  const symbols = (opts.symbols && opts.symbols.length ? opts.symbols : GLOBAL_WATCHLIST).slice(0, 12)
  const key = `global:${symbols.join(',')}`
  if (!opts.refresh) {
    const hit = await cacheGet(key)
    if (hit) return hit
  }
  const all: RawQ[] = []
  const perSymbol = await Promise.allSettled(symbols.map(s => buildSymbolQuestions(s, 1)))
  let idx = 0
  for (const r of perSymbol) {
    if (r.status !== 'fulfilled') continue
    for (const q of r.value) {
      q._idx = idx++
      all.push(q)
    }
  }
  if (!all.length) { await cacheSet(key, []); return [] }
  const clusters = await clusterByQuarter(all)
  await cacheSet(key, clusters)
  return clusters
}

// Background refresh entrypoint. Safe to call from a cron / scheduled job
// (e.g. Vercel Cron) — it warms the disk cache for the global view and the
// default watchlist so request-time latency stays low.
export async function refreshAllClusters(): Promise<{ refreshed: string[]; failed: string[] }> {
  const refreshed: string[] = []
  const failed: string[] = []
  try {
    await getGlobalClusters({ refresh: true })
    refreshed.push('global')
  } catch { failed.push('global') }
  for (const sym of GLOBAL_WATCHLIST) {
    try {
      await getClustersForSymbol(sym, { refresh: true })
      refreshed.push(sym)
    } catch { failed.push(sym) }
  }
  return { refreshed, failed }
}
