import 'server-only'
import {
  buildConnectorAgentTools,
  buildConnectorInventoryContext,
  invokeConnectorTool,
  type AgentTool,
} from './connectors/agent-tools'

// ── Real LLM run executor for Agentic AI Workspace ─────────────────────────
// Calls Groq (primary, llama-3.3-70b-versatile) with optional Perplexity
// (sonar-pro) fallback for breadth + web grounding. Each agent template gets
// a tailored system prompt that asks the model to return strict JSON matching
// our run shape (headline, summary, findings, sources). The output is parsed
// defensively so a malformed response degrades into a structured error
// instead of a 500.

const GROQ_KEY       = process.env.GROQ_API_KEY
const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY
const FMP_KEY        = process.env.FMP_API_KEY
const BRAVE_KEY      = process.env.BRAVE_SEARCH_API_KEY

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
] as const

const PERPLEXITY_MODEL = 'sonar-pro'

export interface RunFinding { title: string; detail: string }
export interface RunSource  { label: string; meta: string }

export interface RunOutput {
  headline:  string
  summary:   string
  findings:  RunFinding[]
  sources:   RunSource[]
  model:     string | null
  provider:  'groq' | 'perplexity' | 'fallback'
  promptTokens?:     number
  completionTokens?: number
  latencyMs: number
  ok:        boolean
  errorMessage?: string
}

export interface ExecuteAgentArgs {
  agentName:    string
  category:     string
  templateSlug?: string | null
  instructions: string
  /** Tickers harvested from instructions, e.g. ["NVDA","MSFT"]. Used to enrich the prompt. */
  tickers?: string[]
  /**
   * Optional local org id. When provided, the executor appends a short
   * inventory of the workspace's enabled connector tools to the grounding
   * context so the LLM can cite them. The scheduled runner is completion-
   * style (no tool calls), so this is a read-only mirror of the chat
   * agent's `/api/agent/ask` tool surface.
   */
  orgId?: string
}

// ── System prompt ──────────────────────────────────────────────────────────
// Tightened against the S&P Global / Kensho agent-skills playbook
// (kensho-technologies/spglobal-agent-skills): zero-hallucination, verbatim
// quotes, mandatory AI disclaimer, structured query→section flow, identifier
// pre-validation. Pronto-NLP-style signal language is allowed in findings
// (root-verb + object phrases, e.g. "guides ↓ FY26 revenue").
const SYSTEM_PROMPT = `You are Finsyt's Workflow Agent — an institutional-grade financial research engine that produces a single, well-cited briefing for a buy-side analyst.

ROLE
You generate the deliverable for a scheduled or on-demand agent. You write like a senior buy-side analyst: variant perception, both sides of the trade, primary sources, no fluff.

OUTPUT (STRICT)
Reply with ONLY a single JSON object. No prose before or after. No markdown fence. The shape MUST be:
{
  "headline": string  (≤ 140 chars, the punchline of the brief — what changed and why it matters),
  "summary":  string  (3–5 sentences, ~80 words, paragraph form, plain text — no markdown.
                       MUST end with the literal string " — Analysis is AI-generated; verify before acting."),
  "findings": [        // 3 to 6 items, ranked by investor relevance
    { "title": string  (≤ 110 chars, lead with the data point or the change),
      "detail": string (1–3 sentences, plain text, include numbers + a primary source inline) }
  ],
  "sources":  [        // 3 to 6 citations
    { "label": string  (e.g. "NVDA 10-K (FY2025)" or "Goldman Sachs — NVDA preview"),
      "meta":  string  (date, page or section ref, or URL host — e.g. "Apr 18, 2026 · p.12") }
  ]
}

RULES
1. ZERO HALLUCINATION. Every figure, name, date, percentage, valuation, multiple or quote MUST come from the
   LIVE MARKET CONTEXT block, the user's standing instructions, or a real, verifiable public source the analyst
   can re-pull (10-K/10-Q/8-K, earnings transcript, official press release, FRED, BLS, Fed/ECB, FMP). NEVER
   invent ticker prices, revenue numbers, guidance ranges, deal multiples, fund sizes or analyst names. If a
   needed datum isn't available, write the literal string "data not available" — do not estimate it.
2. IDENTIFIER PRE-VALIDATION. If a ticker named in instructions does NOT appear in LIVE MARKET CONTEXT, flag
   it explicitly in the summary (e.g. "AAPL data not retrieved this run"); do not silently fabricate values for it.
3. CITATIONS REQUIRED. Every finding cites its source inline in the detail (e.g. "(10-K, p.42)", "(Q4'25 call)",
   "(FRED CPI release Apr 12)", "(FMP quote)"). The "sources" array must contain 3–6 distinct primary sources.
4. QUANTIFY. Prefer "Rev $69.4B (+11% QoQ, FMP)" over "Revenue grew strongly". Show absolute and delta together.
5. VERBATIM QUOTES. When you quote management or a sell-side note, copy the phrasing exactly — never paraphrase
   inside quotation marks, never combine fragments from different parts of a transcript.
6. AUDIENCE TAILORING. If the standing instructions name an audience (Equity Research, IB / M&A, Corp Dev,
   Sales/BD, PM, Risk), match that voice — equity research gets thesis + multiples, IB gets deal narrative,
   Corp Dev gets strategic-fit + integration angles, Sales/BD gets account-relevant talking points.
7. BOTH SIDES. Present bull AND bear / upside AND risk where relevant; never read like marketing copy.
8. THIN SIGNAL HONESTY. If the coverage window has nothing material, say so in the summary — do not pad with
   filler findings.
9. JSON HYGIENE. Return well-formed JSON. Escape inner quotes. No trailing commas. No markdown fences.`

// ── Public entry point ─────────────────────────────────────────────────────
export async function executeAgent(args: ExecuteAgentArgs): Promise<RunOutput> {
  const t0 = Date.now()

  // Pre-fetch ticker context so the LLM grounds on real numbers, not its
  // training data — same pattern as the Ask AI / ai-research route, but kept
  // tight (one quote + one financials snapshot per ticker, max 3 tickers).
  // Brave Search runs in parallel with FMP for fresh, cite-able web context.
  const tickers = (args.tickers && args.tickers.length ? args.tickers : harvestTickers(args.instructions)).slice(0, 3)
  const [fmpBlock, webBlock, connInventory, connToolResults] = await Promise.all([
    tickers.length ? buildGroundingContext(tickers) : Promise.resolve(''),
    buildBraveWebContext(args.agentName, args.instructions, tickers),
    args.orgId ? buildConnectorInventoryContextSafe(args.orgId) : Promise.resolve(''),
    args.orgId ? runConnectorToolPassSafe(args.orgId, args) : Promise.resolve(''),
  ])
  const grounding = [fmpBlock, webBlock, connInventory, connToolResults].filter(Boolean).join('\n\n')

  const userPrompt = buildUserPrompt({ ...args, tickers }, grounding)

  // 1. Try Groq first.
  if (GROQ_KEY) {
    for (const model of GROQ_MODELS) {
      try {
        const out = await callGroq(model, userPrompt)
        if (out) return finalize(out, 'groq', model, t0)
      } catch {
        // fall through to next model / provider
      }
    }
  }

  // 2. Fall back to Perplexity (web-grounded).
  if (PERPLEXITY_KEY) {
    try {
      const out = await callPerplexity(userPrompt)
      if (out) return finalize(out, 'perplexity', PERPLEXITY_MODEL, t0)
    } catch {
      /* fall through */
    }
  }

  // 3. No provider available or all failed — return a structured failure that
  //    still shows a useful page rather than a 500.
  return {
    headline: `${args.agentName} — run could not complete`,
    summary:  'No language-model provider was reachable for this run. Check that GROQ_API_KEY or PERPLEXITY_API_KEY is configured, then retry the run from the agent page.',
    findings: [
      { title: 'Provider unavailable', detail: 'Both Groq and Perplexity calls failed or no API keys are configured for this environment.' },
      { title: 'Instructions captured', detail: args.instructions.slice(0, 600) },
    ],
    sources:  [
      { label: 'Agent configuration', meta: 'Saved at run time' },
    ],
    model:    null,
    provider: 'fallback',
    latencyMs: Date.now() - t0,
    ok:       false,
    errorMessage: 'No LLM provider succeeded',
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
/** Wrapper that swallows connector-inventory errors so a misconfigured DB never breaks a run. */
async function buildConnectorInventoryContextSafe(orgId: string): Promise<string> {
  try {
    return await buildConnectorInventoryContext(orgId)
  } catch {
    return ''
  }
}

/**
 * Connector tool-call pass for the scheduled workflow agent.
 *
 * The chat agent (`/api/agent/ask`) does a multi-turn tool-calling loop.
 * Scheduled workflow runs need the same upstream-data muscle (otherwise the
 * Connector Hub is invisible to the workflow surface), but they are
 * completion-style and must finish in a bounded amount of time. So instead
 * of an open loop we do a single, capped Groq function-calling pass:
 *
 *   1. Build the workspace's connector tool list.
 *   2. Ask Groq to pick up to 3 tools that are most relevant to the
 *      standing instructions, with concrete arguments.
 *   3. Execute each chosen tool through the same `invokeConnectorTool`
 *      path the chat agent uses (so audit, rate-limit, SSRF guard all
 *      apply).
 *   4. Return a compact "TOOL RESULTS" block for the JSON-output prompt.
 *
 * Bounded by `MAX_TOOL_CALLS`, with hard timeouts on the planner call
 * and per-tool execution, and a single retry-free path. Any failure
 * collapses to an empty string so a broken connector cannot break a run.
 */
const MAX_TOOL_CALLS = 3
const TOOL_PASS_TIMEOUT_MS = 15_000

async function runConnectorToolPassSafe(orgId: string, args: ExecuteAgentArgs): Promise<string> {
  if (!GROQ_KEY) return ''
  try {
    const tools = await buildConnectorAgentTools(orgId)
    if (!tools.length) return ''
    return await runConnectorToolPass(orgId, args, tools)
  } catch {
    return ''
  }
}

interface ToolCallPlan { name: string; arguments: Record<string, unknown> }

async function runConnectorToolPass(
  orgId: string,
  args: ExecuteAgentArgs,
  tools: AgentTool[],
): Promise<string> {
  // Cap the tool surface we send to the planner so we don't blow context on
  // workspaces with hundreds of operations.
  const surface = tools.slice(0, 24)
  const openAiTools = surface.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
  const byName = new Map(surface.map((t) => [t.name, t]))

  const plannerSystem =
    'You are the data-gathering pre-pass for a buy-side research agent. Decide which workspace connector tools to call (up to 3) so the downstream JSON writer has fresh upstream data. Choose ONLY tools that are obviously relevant. If nothing helps, return no tool calls.'
  const plannerUser = [
    `Agent: ${args.agentName} (${args.category})`,
    args.tickers && args.tickers.length ? `Tickers: ${args.tickers.join(', ')}` : '',
    'Standing instructions:',
    '"""',
    args.instructions.trim().slice(0, 2_000),
    '"""',
  ].filter(Boolean).join('\n')

  const plan = await planToolCalls(plannerSystem, plannerUser, openAiTools)
  if (!plan.length) return ''

  const results: { name: string; ok: boolean; data?: unknown; error?: string }[] = []
  for (const call of plan.slice(0, MAX_TOOL_CALLS)) {
    const tool = byName.get(call.name)
    if (!tool) continue
    try {
      const r = (await Promise.race([
        invokeConnectorTool(orgId, tool, call.arguments || {}, null),
        new Promise((_, rej) => setTimeout(() => rej(new Error('tool_timeout')), TOOL_PASS_TIMEOUT_MS)),
      ])) as { ok?: boolean; data?: unknown; error?: string } | Record<string, unknown>
      const ok = (r as { ok?: boolean }).ok ?? !(r as { error?: string }).error
      results.push({
        name: call.name,
        ok: ok !== false,
        data: (r as { data?: unknown }).data ?? r,
        error: (r as { error?: string }).error,
      })
    } catch (err) {
      results.push({ name: call.name, ok: false, error: (err as Error).message })
    }
  }
  if (!results.length) return ''

  const lines: string[] = ['--- CONNECTOR TOOL RESULTS (live workspace data — cite as the source) ---']
  for (const r of results) {
    const body = JSON.stringify(r.ok ? r.data : { error: r.error }).slice(0, 4_000)
    lines.push(`tool=${r.name} ok=${r.ok}`)
    lines.push(body)
    lines.push('')
  }
  return lines.join('\n')
}

async function planToolCalls(
  system: string,
  user: string,
  openAiTools: Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }>,
): Promise<ToolCallPlan[]> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODELS[0],
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        tools: openAiTools,
        tool_choice: 'auto',
        temperature: 0,
        max_tokens: 600,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return []
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>
    }
    const calls = json.choices?.[0]?.message?.tool_calls || []
    const out: ToolCallPlan[] = []
    for (const c of calls) {
      const name = c.function?.name
      if (!name) continue
      let argObj: Record<string, unknown> = {}
      try { argObj = c.function?.arguments ? JSON.parse(c.function.arguments) as Record<string, unknown> : {} }
      catch { /* ignore malformed args */ }
      out.push({ name, arguments: argObj })
    }
    return out
  } catch {
    return []
  } finally {
    clearTimeout(t)
  }
}

function buildUserPrompt(args: ExecuteAgentArgs, grounding: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const tickerLine = args.tickers && args.tickers.length
    ? `Tickers in scope: ${args.tickers.join(', ')}.`
    : ''
  return [
    `Today's date is ${today}.`,
    `Agent: ${args.agentName}`,
    `Category: ${args.category}`,
    args.templateSlug ? `Template: ${args.templateSlug}` : '',
    tickerLine,
    grounding ? '\n--- LIVE MARKET CONTEXT (use these numbers verbatim) ---\n' + grounding + '\n--- END CONTEXT ---' : '',
    '',
    'Run the following standing instructions and produce the brief:',
    '"""',
    args.instructions.trim(),
    '"""',
    '',
    'Reply with ONLY the JSON object specified in your system instructions.',
  ].filter(Boolean).join('\n')
}

/** Pull a tight per-ticker snapshot from FMP so the model anchors on real data. */
async function buildGroundingContext(tickers: string[]): Promise<string> {
  if (!FMP_KEY) return ''
  const blocks = await Promise.all(tickers.map(async (sym) => {
    try {
      const [qRes, fRes, eRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/quote?symbol=${sym}&apikey=${FMP_KEY}`),
        fetch(`https://financialmodelingprep.com/stable/income-statement?symbol=${sym}&period=annual&limit=2&apikey=${FMP_KEY}`),
        fetch(`https://financialmodelingprep.com/stable/analyst-estimates?symbol=${sym}&period=annual&limit=1&apikey=${FMP_KEY}`),
      ])
      const [quotes, fins, ests] = await Promise.all([qRes.json(), fRes.json(), eRes.json()])
      const q  = Array.isArray(quotes) ? quotes[0] : null
      const f0 = Array.isArray(fins)   ? fins[0]   : null
      const f1 = Array.isArray(fins)   ? fins[1]   : null
      const e0 = Array.isArray(ests)   ? ests[0]   : null
      if (!q && !f0) return ''
      const fmt = (v: any) => (v == null || isNaN(Number(v))) ? 'n/a' : `$${(Number(v) / 1e9).toFixed(2)}B`
      const yoy = (a: any, b: any) => (a && b) ? `${(((a - b) / Math.abs(b)) * 100).toFixed(1)}% YoY` : ''
      const lines: string[] = [`${sym}:`]
      if (q?.price) lines.push(`  Price $${q.price} (${q.changesPercentage?.toFixed(2) ?? '?'}%) · Mkt Cap ${fmt(q.marketCap)} · 52w $${q.yearLow}–$${q.yearHigh} · P/E ${q.pe ?? 'n/a'}`)
      if (f0)        lines.push(`  FY${f0.calendarYear ?? '?'}: Rev ${fmt(f0.revenue)} ${yoy(f0.revenue, f1?.revenue)} · EBITDA ${fmt(f0.ebitda)} (${(f0.ebitdaratio * 100).toFixed(1)}%) · Net Inc ${fmt(f0.netIncome)} · EPS $${f0.epsdiluted ?? 'n/a'}`)
      if (e0)        lines.push(`  Consensus NTM: Rev ${fmt(e0.estimatedRevenueAvg)} · EPS $${e0.estimatedEpsAvg ?? 'n/a'} (high $${e0.estimatedEpsHigh ?? 'n/a'} / low $${e0.estimatedEpsLow ?? 'n/a'})`)
      lines.push(`  Source: FMP (Financial Modeling Prep), pulled ${new Date().toISOString().slice(0, 10)}`)
      return lines.join('\n')
    } catch { return '' }
  }))
  return blocks.filter(Boolean).join('\n\n')
}

/**
 * Pull fresh web hits from Brave Search and format them as a cite-able block
 * the LLM can quote from. We build one query per ticker (or one query from the
 * agent name when no tickers were harvested) and keep the volume tight so the
 * prompt stays under-budget. Results are tagged with their host so the model
 * can cite them naturally (e.g. "(reuters.com, Apr 12)").
 */
async function buildBraveWebContext(agentName: string, instructions: string, tickers: string[]): Promise<string> {
  if (!BRAVE_KEY) return ''
  const queries: string[] = tickers.length
    ? tickers.map(t => `${t} stock latest news earnings filing`)
    : [extractTopicQuery(agentName, instructions)]
  const blocks = await Promise.all(queries.map(async (q) => {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&freshness=pw&safesearch=moderate`
      const r = await fetch(url, {
        headers: {
          'Accept':              'application/json',
          'Accept-Encoding':     'gzip',
          'X-Subscription-Token': BRAVE_KEY!,
        },
      })
      if (!r.ok) return ''
      const data: any = await r.json()
      const hits: any[] = Array.isArray(data?.web?.results) ? data.web.results.slice(0, 5) : []
      if (!hits.length) return ''
      const lines: string[] = [`Web search — "${q}" (Brave, last 7d):`]
      for (const h of hits) {
        const host = hostFromUrl(h?.url || '') || 'web'
        const date = (h?.page_age || h?.age || '').toString().slice(0, 16)
        const title = (h?.title || '').toString().replace(/\s+/g, ' ').trim().slice(0, 160)
        const desc  = (h?.description || h?.snippet || '').toString().replace(/\s+/g, ' ').trim().slice(0, 240)
        if (!title) continue
        lines.push(`  • ${title} — ${desc} (${host}${date ? ', ' + date : ''})`)
      }
      return lines.length > 1 ? lines.join('\n') : ''
    } catch { return '' }
  }))
  return blocks.filter(Boolean).join('\n\n')
}

/** When no tickers are present, derive a short query from the agent name + first sentence of instructions. */
function extractTopicQuery(agentName: string, instructions: string): string {
  const firstSentence = (instructions.split(/[.!?\n]/)[0] || '').trim().slice(0, 140)
  const base = firstSentence || agentName
  return `${base} latest news`
}

interface RawLlmResult {
  headline:  string
  summary:   string
  findings:  RunFinding[]
  sources:   RunSource[]
  promptTokens?:     number
  completionTokens?: number
}

async function callGroq(model: string, userPrompt: string): Promise<RawLlmResult | null> {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens:  2400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt   },
      ],
    }),
  })
  if (!r.ok) throw new Error(`Groq ${r.status}`)
  const data: any = await r.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) return null
  const parsed = parseRunJson(text)
  if (!parsed) return null
  parsed.promptTokens     = data?.usage?.prompt_tokens
  parsed.completionTokens = data?.usage?.completion_tokens
  return parsed
}

async function callPerplexity(userPrompt: string): Promise<RawLlmResult | null> {
  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${PERPLEXITY_KEY}`,
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      temperature: 0.3,
      max_tokens:  2400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt   },
      ],
    }),
  })
  if (!r.ok) throw new Error(`Perplexity ${r.status}`)
  const data: any = await r.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) return null
  const parsed = parseRunJson(text)
  if (!parsed) return null

  // Perplexity returns its citations in `citations`. Fold them into sources
  // when the model didn't include them inline.
  const cites: string[] = Array.isArray(data?.citations) ? data.citations : []
  if (cites.length && (!parsed.sources || parsed.sources.length < 3)) {
    parsed.sources = cites.slice(0, 6).map((url: string, i: number) => ({
      label: hostFromUrl(url) || `Source ${i + 1}`,
      meta:  url,
    }))
  }
  parsed.promptTokens     = data?.usage?.prompt_tokens
  parsed.completionTokens = data?.usage?.completion_tokens
  return parsed
}

function hostFromUrl(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
}

/** Parse the LLM JSON, stripping any accidental markdown fence or stray text. */
function parseRunJson(text: string): RawLlmResult | null {
  const cleaned = text
    .replace(/^[\s\S]*?```(?:json)?\s*/, '')
    .replace(/\s*```[\s\S]*$/, '')
    .trim()
  // If the model wrapped in prose, take the first { … } block.
  const start = cleaned.indexOf('{')
  const end   = cleaned.lastIndexOf('}')
  const slice = (start >= 0 && end > start) ? cleaned.slice(start, end + 1) : cleaned
  try {
    const obj = JSON.parse(slice)
    return normalizeRun(obj)
  } catch {
    return null
  }
}

function normalizeRun(obj: any): RawLlmResult | null {
  if (!obj || typeof obj !== 'object') return null
  const headline = typeof obj.headline === 'string' ? obj.headline.trim() : ''
  const summary  = typeof obj.summary  === 'string' ? obj.summary.trim()  : ''
  if (!headline || !summary) return null
  const findings: RunFinding[] = Array.isArray(obj.findings) ? obj.findings
    .map((f: any) => ({
      title:  typeof f?.title  === 'string' ? f.title.trim().slice(0, 220)  : '',
      detail: typeof f?.detail === 'string' ? f.detail.trim().slice(0, 1200) : '',
    }))
    .filter((f: RunFinding) => f.title && f.detail)
    .slice(0, 8)
    : []
  const sources: RunSource[] = Array.isArray(obj.sources) ? obj.sources
    .map((s: any) => ({
      label: typeof s?.label === 'string' ? s.label.trim().slice(0, 200) : '',
      meta:  typeof s?.meta  === 'string' ? s.meta.trim().slice(0, 400)  :
             typeof s?.url   === 'string' ? s.url.trim().slice(0, 400)   : '',
    }))
    .filter((s: RunSource) => s.label)
    .slice(0, 8)
    : []
  return { headline, summary, findings, sources }
}

function finalize(raw: RawLlmResult, provider: 'groq' | 'perplexity', model: string, t0: number): RunOutput {
  return {
    ...raw,
    model,
    provider,
    latencyMs: Date.now() - t0,
    ok: true,
  }
}

/** Lightweight ticker harvester used to enrich the prompt. */
export function harvestTickers(text: string): string[] {
  const out = new Set<string>()
  const re = /\b[A-Z]{1,5}(?:\.[A-Z]{1,2})?\b/g
  const STOP = new Set(['I','A','THE','TO','OF','AND','OR','IF','BUT','FOR','WITH','ON','IN','AT','BY','VS','EPS','CEO','CFO','COO','GAAP','SEC','FY','QQ','YOY','EBITDA','EBIT','GDP','CPI','PCE','NFP','FOMC','ETF','ESG','API','UBS','M&A','IPO','LLC','LP','PE'])
  for (const m of text.matchAll(re)) {
    const t = m[0]
    if (t.length >= 2 && !STOP.has(t)) out.add(t)
    if (out.size >= 12) break
  }
  return [...out]
}
