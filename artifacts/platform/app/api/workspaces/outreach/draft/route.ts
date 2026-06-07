/**
 * POST /api/workspaces/outreach/draft
 *
 * Generates a single personalised outreach email for one target. The route is
 * a thin orchestrator: it builds the prompt with the same persona / intent
 * library that the UI uses, calls the existing `/api/ai-research` endpoint
 * (which already handles live data context, model fallbacks, citations), and
 * parses the JSON envelope back into a structured draft.
 *
 * We deliberately reuse `ai-research` rather than wiring a second model call
 * site so that any future provider/model change picks up automatically and
 * billing / observability stays in one place.
 *
 * Audit: best-effort POST to api-server `/admin/audit` recording the event so
 * compliance teams can see who generated drafts for whom. Failures here are
 * swallowed — outreach drafting must not break when the audit pipe is down.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  OUTREACH_PERSONAS,
  OUTREACH_INTENTS,
  buildDraftPrompt,
  parseDraftResponse,
  type Target,
} from '@/lib/email-draft'
import { apiServerFetch } from '@/lib/audit-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/

/**
 * Build the absolute URL for an internal Next.js API route.
 *
 * We deliberately bypass the public proxy by talking directly to the local
 * Next.js port — looping back through the public hostname is fragile (cert
 * pinning, outbound DNS, double round-trip latency) and the proxy adds no
 * value for a same-process call. The basePath must still be included because
 * `next.config.js` mounts every route under `/platform`.
 */
function internalUrl(path: string): string {
  const port = process.env.PORT || '3000'
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')
  return `http://127.0.0.1:${port}${basePath}${path}`
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

  const symbol = String(body?.symbol ?? '').toUpperCase().slice(0, 12)
  if (!TICKER_RE.test(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 })
  }
  const personaId = String(body?.personaId ?? '')
  const intentId  = String(body?.intentId  ?? '')
  const persona = OUTREACH_PERSONAS.find(p => p.id === personaId)
  const intent  = OUTREACH_INTENTS.find(i => i.id === intentId)
  if (!persona) return NextResponse.json({ error: 'unknown_persona' }, { status: 400 })
  if (!intent)  return NextResponse.json({ error: 'unknown_intent'  }, { status: 400 })

  const target: Target = {
    symbol,
    companyName:    typeof body?.companyName    === 'string' ? body.companyName.slice(0, 200)    : undefined,
    recipientName:  typeof body?.recipientName  === 'string' ? body.recipientName.slice(0, 200)  : undefined,
    recipientEmail: typeof body?.recipientEmail === 'string' ? body.recipientEmail.slice(0, 200) : undefined,
    notes:          typeof body?.notes          === 'string' ? body.notes.slice(0, 1000)         : undefined,
  }

  const prompt = buildDraftPrompt({
    target,
    persona,
    intent,
    fromName:       typeof body?.fromName       === 'string' ? body.fromName.slice(0, 100)       : undefined,
    signature:      typeof body?.signature      === 'string' ? body.signature.slice(0, 800)      : undefined,
    customGuidance: typeof body?.customGuidance === 'string' ? body.customGuidance.slice(0, 800) : undefined,
  })

  // Reuse the existing research agent (full live-data context).
  // Forward the user's Clerk session cookie so the upstream auth check passes
  // — Next.js route-to-route fetches do not inherit headers automatically.
  const upstreamHeaders: Record<string, string> = { 'content-type': 'application/json' }
  const cookie = req.headers.get('cookie')
  if (cookie) upstreamHeaders.cookie = cookie
  const auth = req.headers.get('authorization')
  if (auth) upstreamHeaders.authorization = auth

  let upstream: Response
  try {
    upstream = await fetch(internalUrl('/api/ai-research'), {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify({ query: prompt, symbol, contextLevel: 'full' }),
      cache: 'no-store',
    })
  } catch (err) {
    return NextResponse.json({ error: 'agent_unreachable', detail: String(err) }, { status: 502 })
  }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '')
    return NextResponse.json({ error: 'agent_failed', status: upstream.status, detail }, { status: 502 })
  }
  const research = await upstream.json().catch(() => ({}))
  const raw = typeof research?.fullText === 'string' ? research.fullText : ''
  const parsed = parseDraftResponse(raw)

  // Merge model-supplied citations with the live data sources the agent
  // actually consulted — the research route returns them as `dataSources`.
  const liveSources = Array.isArray(research?.dataSources) ? research.dataSources.filter((s: any): s is string => typeof s === 'string') : []
  const allCitations = Array.from(new Set([...parsed.citations, ...liveSources])).slice(0, 8)

  const draft = {
    symbol,
    companyName: target.companyName,
    subject:    parsed.subject || `${symbol} — ${intent.label}`,
    body:       parsed.body    || raw.slice(0, 1200),
    citations:  allCitations,
    modelUsed:  typeof research?.modelUsed === 'string' ? research.modelUsed : undefined,
    hasLiveData: Boolean(research?.hasLiveData),
    generatedAt: Date.now(),
  }

  // Best-effort audit. Never blocks the response.
  try {
    await apiServerFetch('/admin/audit', {
      method: 'POST',
      body: JSON.stringify({
        action: 'outreach.draft.generated',
        resourceType: 'outreach_draft',
        resourceId: symbol,
        metadata: {
          symbol,
          personaId: persona.id,
          intentId: intent.id,
          modelUsed: draft.modelUsed,
          hasLiveData: draft.hasLiveData,
          citationCount: draft.citations.length,
          recipientHashed: target.recipientEmail
            ? Buffer.from(target.recipientEmail).toString('base64').slice(0, 16)
            : null,
        },
      }),
    })
  } catch { /* swallow — audit is best-effort */ }

  return NextResponse.json({ draft })
}
