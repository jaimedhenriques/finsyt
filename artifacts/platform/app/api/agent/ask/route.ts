import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
- Format the final answer as Markdown.`

// ── Tool registry ────────────────────────────────────────────────────────────
type ToolDef = {
  name: string
  description: string
  parameters: any
  run: (args: any, baseUrl: string) => Promise<any>
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

const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.name, t]))
const OPENAI_TOOLS = TOOLS.map(t => ({
  type: 'function' as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}))

// ── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!OPENAI_KEY) {
    return new Response(JSON.stringify({ error: 'OpenAI integration not configured' }), { status: 500 })
  }
  let body: { question?: string; symbols?: string[]; context?: Record<string, unknown> } = {}
  try { body = await req.json() } catch {}
  const question = (body.question || '').trim()
  if (!question) return new Response(JSON.stringify({ error: 'question required' }), { status: 400 })

  // Optional caller-supplied page context (e.g. { page: 'company', symbol: 'AAPL', sector: 'Tech' }).
  // We surface it to the model as a structured preface so answers can ground in
  // the user's current view without forcing every chip prompt to repeat it.
  let contextPreface = ''
  if (body.context && typeof body.context === 'object') {
    try {
      const ctx = JSON.stringify(body.context)
      if (ctx && ctx !== '{}') contextPreface = `User is currently viewing this page state (JSON): ${ctx}\n\n`
    } catch { /* ignore unserialisable context */ }
  }

  const baseUrl = req.nextUrl.origin
  const encoder = new TextEncoder()

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
              tools: OPENAI_TOOLS,
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

            const results = await Promise.all(msg.tool_calls.map(async (tc: any) => {
              const def = TOOL_MAP[tc.function.name]
              let args: any = {}
              try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
              send('tool_call', { id: tc.id, name: tc.function.name, args })
              const out = def ? await def.run(args, baseUrl) : { error: 'unknown tool' }
              send('tool_result', {
                id: tc.id,
                name: tc.function.name,
                ok: !out?.error,
                summary: summariseToolResult(tc.function.name, out),
                raw: JSON.stringify(out).slice(0, 6000),
              })
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
    default:                return JSON.stringify(out).slice(0, 80)
  }
}
