import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { PROVIDERS, PROVIDER_META } from '@/lib/data-providers'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 4000

type ClerkClaims = {
  org_role?: string
  'o.rol'?: string
} & Record<string, unknown>

/** Admin gate — allowlist via ADMIN_USER_IDS or Clerk org role 'admin' / 'owner'. */
async function requireAdmin() {
  const { userId, sessionClaims } = await auth()
  if (!userId) return { ok: false as const, status: 401, error: 'unauthorized' }
  const allowList = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  const inAllowList = allowList.includes(userId)
  const claims = (sessionClaims ?? {}) as ClerkClaims
  const orgRole = claims.org_role || claims['o.rol'] || ''
  const isOrgAdmin = ['org:admin', 'admin', 'org:owner', 'owner'].includes(String(orgRole))
  // Strict admin gate — enforced in every environment. The only escape hatch
  // is the explicit, opt-in flag ADMIN_HEALTH_DEV_BYPASS=1 (intended for a
  // fresh local install where Clerk org roles are not yet provisioned).
  // Never set this flag in production.
  const explicitDevBypass = process.env.ADMIN_HEALTH_DEV_BYPASS === '1'
    && process.env.NODE_ENV !== 'production'
  if (!(inAllowList || isOrgAdmin || explicitDevBypass)) {
    return { ok: false as const, status: 403, error: 'admin only' }
  }
  return { ok: true as const, userId }
}

/**
 * Process-lifetime success ledger — persists per-provider last-success timestamps
 * across requests within a single Node process. Replace with the platform DB
 * (audit_events) once the api-server boot is fixed (follow-up #73).
 */
const lastSuccessLedger: Map<string, string> = (() => {
  const g = globalThis as unknown as { __finsytLastSuccess?: Map<string, string> }
  if (!g.__finsytLastSuccess) g.__finsytLastSuccess = new Map()
  return g.__finsytLastSuccess
})()

interface ProbeResult {
  ok: boolean
  status: number
  ms: number
  lastSuccessAt: string | null
  rateLimit: Record<string, string>
  sample: string | null
  error?: string
  skipped?: boolean
}

/** Capture only well-known X-RateLimit-* / Retry-After headers; never the whole header set. */
function captureRateLimit(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  const wanted = [
    'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
    'x-rate-limit-limit', 'x-rate-limit-remaining', 'x-rate-limit-reset',
    'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset',
    'retry-after',
  ]
  wanted.forEach(k => { const v = h.get(k); if (v) out[k] = v })
  return out
}

/** Best-effort sanitised sample: collapse to a single 200-char preview, no secrets reflected. */
function sanitiseSample(body: string): string {
  const trimmed = body.replace(/\s+/g, ' ').trim().slice(0, 200)
  // Strip anything that looks like our own keys leaking back in error messages
  return trimmed.replace(/(api[_-]?key|token|bearer)["':=\s]+[A-Za-z0-9_\-]{8,}/gi, '$1=***')
}

async function ping(url: string, init: RequestInit = {}): Promise<ProbeResult> {
  const t0 = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, cache: 'no-store' })
    let body = ''
    try { body = await res.text() } catch {}
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - t0,
      lastSuccessAt: res.ok ? new Date().toISOString() : null,
      rateLimit: captureRateLimit(res.headers),
      sample: body ? sanitiseSample(body) : null,
    }
  } catch (e) {
    return {
      ok: false, status: 0, ms: Date.now() - t0,
      lastSuccessAt: null, rateLimit: {}, sample: null,
      error: (e as Error).name === 'AbortError' ? 'timeout' : 'network',
    }
  } finally {
    clearTimeout(timer)
  }
}

const CHECKS: Record<string, () => Promise<any>> = {
  fmp:               () => PROVIDERS.fmp        ? ping(`https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${PROVIDERS.fmp}`) : Promise.resolve({ ok:false, skipped:true }),
  massive:           () => PROVIDERS.massive    ? ping(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/AAPL?apiKey=${PROVIDERS.massive}`) : Promise.resolve({ ok:false, skipped:true }),
  eodhd:             () => PROVIDERS.eodhd      ? ping(`https://eodhd.com/api/real-time/AAPL.US?api_token=${PROVIDERS.eodhd}&fmt=json`) : Promise.resolve({ ok:false, skipped:true }),
  finnhub:           () => PROVIDERS.finnhub    ? ping(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${PROVIDERS.finnhub}`) : Promise.resolve({ ok:false, skipped:true }),
  fred:              () => PROVIDERS.fred       ? ping(`https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key=${PROVIDERS.fred}&file_type=json&limit=1`) : Promise.resolve({ ok:false, skipped:true }),
  alphav:            () => PROVIDERS.alphav     ? ping(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${PROVIDERS.alphav}`) : Promise.resolve({ ok:false, skipped:true }),
  marketstack:       () => PROVIDERS.marketstack? ping(`https://api.marketstack.com/v1/eod/latest?access_key=${PROVIDERS.marketstack}&symbols=AAPL`) : Promise.resolve({ ok:false, skipped:true }),
  yahoo:             () => PROVIDERS.yahoo      ? ping(`https://yahoo-finance166.p.rapidapi.com/api/stock/get-summary?region=US&symbol=AAPL`, { headers:{ 'x-rapidapi-key': PROVIDERS.yahoo, 'x-rapidapi-host':'yahoo-finance166.p.rapidapi.com' } }) : Promise.resolve({ ok:false, skipped:true }),
  own:               () => PROVIDERS.own        ? ping(`https://realtime-finance-data.p.rapidapi.com/stock-quote?symbol=AAPL%3ANASDAQ&language=en`, { headers:{ 'x-rapidapi-key': PROVIDERS.own, 'x-rapidapi-host':'realtime-finance-data.p.rapidapi.com' } }) : Promise.resolve({ ok:false, skipped:true }),
  sec:               () => PROVIDERS.sec        ? ping(`https://api.sec-api.io?token=${PROVIDERS.sec}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query:{ query_string:{ query:'ticker:AAPL AND formType:"10-K"' } }, from:'0', size:'1' }) }) : Promise.resolve({ ok:false, skipped:true }),
  coresignal:        () => PROVIDERS.coresignal ? ping(`https://api.coresignal.com/cdapi/v2/company_base/collect/apple-inc`, { headers:{ 'apikey': PROVIDERS.coresignal } }) : Promise.resolve({ ok:false, skipped:true }),
  twelvedata:        () => PROVIDERS.twelvedata ? ping(`https://api.twelvedata.com/quote?symbol=AAPL&apikey=${PROVIDERS.twelvedata}`) : Promise.resolve({ ok:false, skipped:true }),
  financialdatasets: () => PROVIDERS.financialdatasets ? ping(`https://api.financialdatasets.ai/prices/snapshot?ticker=AAPL`, { headers:{ 'X-API-KEY': PROVIDERS.financialdatasets } }) : Promise.resolve({ ok:false, skipped:true }),
  financeflow:       () => PROVIDERS.financeflow? ping(`https://api.financeflow.io/v1/quote?symbol=AAPL`, { headers:{ 'Authorization': `Bearer ${PROVIDERS.financeflow}` } }) : Promise.resolve({ ok:false, skipped:true }),
  databento:         () => PROVIDERS.databento  ? ping(`https://hist.databento.com/v0/metadata.list_datasets`, { headers:{ 'Authorization': `Basic ${Buffer.from(PROVIDERS.databento + ':').toString('base64')}` } }) : Promise.resolve({ ok:false, skipped:true }),
  fiscalai:          () => PROVIDERS.fiscalai   ? ping(`https://api.fiscal.ai/v1/companies/AAPL`, { headers:{ 'Authorization': `Bearer ${PROVIDERS.fiscalai}` } }) : Promise.resolve({ ok:false, skipped:true }),
  twentyfirst:       () => PROVIDERS.twentyfirst? ping(`https://api.21st.dev/v1/health`, { headers:{ 'Authorization': `Bearer ${PROVIDERS.twentyfirst}` } }) : Promise.resolve({ ok:false, skipped:true }),
  openai:            () => PROVIDERS.openai     ? ping(`https://api.openai.com/v1/models`, { headers:{ 'Authorization': `Bearer ${PROVIDERS.openai}` } }) : Promise.resolve({ ok:false, skipped:true }),
  anthropic:         () => PROVIDERS.anthropic  ? ping(`https://api.anthropic.com/v1/models`, { headers:{ 'x-api-key': PROVIDERS.anthropic, 'anthropic-version':'2023-06-01' } }) : Promise.resolve({ ok:false, skipped:true }),
  groq:              () => PROVIDERS.groq       ? ping(`https://api.groq.com/openai/v1/models`, { headers:{ 'Authorization': `Bearer ${PROVIDERS.groq}` } }) : Promise.resolve({ ok:false, skipped:true }),
  perplexity:        () => PROVIDERS.perplexity ? ping(`https://api.perplexity.ai/chat/completions`, { method:'POST', headers:{ 'Authorization': `Bearer ${PROVIDERS.perplexity}`, 'Content-Type':'application/json' }, body: JSON.stringify({ model:'sonar', messages:[{role:'user',content:'ping'}], max_tokens:1 }) }) : Promise.resolve({ ok:false, skipped:true }),
}

async function probeOne(name: string) {
  const key = PROVIDERS[name as keyof typeof PROVIDERS]
  const meta = PROVIDER_META[name] || null
  const check = CHECKS[name]
  const probe = check ? await check() : { ok: false, skipped: true }
  // Persist last-success timestamp across calls so the ledger survives a
  // refresh that returns a transient failure.
  if (probe.ok && probe.lastSuccessAt) {
    lastSuccessLedger.set(name, probe.lastSuccessAt)
  }
  const remembered = lastSuccessLedger.get(name) || null
  return {
    name,
    configured: !!key,
    health: { ...probe, lastSuccessAt: probe.lastSuccessAt || remembered },
    meta,
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const names = Object.keys(PROVIDERS)
  const settled = await Promise.all(names.map(probeOne))

  const summary = {
    total:      settled.length,
    configured: settled.filter(s => s.configured).length,
    healthy:    settled.filter(s => s.health.ok).length,
    failing:    settled.filter(s => s.configured && !s.health.ok && !s.health.skipped).length,
  }

  return NextResponse.json({ summary, providers: settled, generatedAt: new Date().toISOString() })
}

/** POST { provider: "fmp" } — re-probe a single provider (admin-only). */
export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  let body: { provider?: string } = {}
  try { body = await req.json() } catch {}
  const name = (body.provider || '').toLowerCase()
  if (!name || !(name in PROVIDERS)) {
    return NextResponse.json({ error: 'unknown provider', allowed: Object.keys(PROVIDERS) }, { status: 400 })
  }
  const result = await probeOne(name)
  return NextResponse.json({ ...result, generatedAt: new Date().toISOString() })
}
