import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { INVESTOR_PERSONAS, listPersonaSummaries, getPersona, type InvestorPersonaId } from '@/lib/investor-personas'
import { INTERNAL_BYPASS_HEADER, isInternalBypass } from '@/lib/internal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPENAI_BASE = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1'
const OPENAI_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || ''
const MODEL = process.env.AGENT_MODEL || 'gpt-5-mini'

/**
 * GET /api/agent/persona               → list available investor personas
 * GET /api/agent/persona?id=buffett    → return one persona's full prompt + checklist
 *
 * POST /api/agent/persona
 *   { persona: "buffett", question: "Analyze AAPL", context?: string }
 *   → invokes the LLM with the persona's system prompt and returns a Markdown
 *   analysis along with the persona's checklist filled in.
 */

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const p = getPersona(id)
    if (!p) return NextResponse.json({ error: `unknown persona: ${id}`, available: listPersonaSummaries().map(s => s.id) }, { status: 404 })
    return NextResponse.json(p)
  }
  return NextResponse.json({ personas: listPersonaSummaries() })
}

export async function POST(req: NextRequest) {
  // Auth gate — POST consumes paid LLM tokens. Allow if either (a) a Clerk
  // workspace session is present, or (b) the request was composed in-process
  // by /api/v1/agent/persona and carries a valid per-process internal
  // bypass token (see lib/internal-auth.ts — token rotates per restart and
  // never leaves the process, so external callers cannot spoof it).
  if (!isInternalBypass(req.headers.get(INTERNAL_BYPASS_HEADER))) {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        error: 'Unauthorized — POST /api/agent/persona requires a workspace session or a Bearer API key via /api/v1/agent/persona (it consumes paid LLM quota).',
      }, { status: 401 })
    }
  }

  let body: { persona?: string; question?: string; context?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const personaId = String(body.persona || '').toLowerCase() as InvestorPersonaId
  const question = String(body.question || '').trim()
  const context = String(body.context || '').trim()
  if (!personaId || !INVESTOR_PERSONAS[personaId]) {
    return NextResponse.json({
      error: 'persona is required',
      available: Object.keys(INVESTOR_PERSONAS),
    }, { status: 400 })
  }
  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }
  if (!OPENAI_KEY) {
    return NextResponse.json({
      error: 'LLM provider not configured (set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY)',
      persona: INVESTOR_PERSONAS[personaId],
    }, { status: 503 })
  }

  const persona = INVESTOR_PERSONAS[personaId]
  const checklistMd = persona.checklist.map((c, i) => `${i + 1}. ${c}`).join('\n')
  const userPrompt = [
    `Question: ${question}`,
    context ? `\nAdditional context provided by the user:\n${context}` : '',
    `\nUse the framework above to produce an institutional-quality analysis. Format the answer as Markdown with these sections:`,
    `\n## Thesis`,
    `## Framework analysis`,
    `(Address each item below — be specific and quantitative where possible.)`,
    checklistMd,
    `\n## Verdict`,
  ].filter(Boolean).join('\n')

  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: persona.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return NextResponse.json({ error: `LLM upstream ${res.status}: ${errText.slice(0, 240)}` }, { status: 502 })
    }
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content || ''
    return NextResponse.json({
      persona: { id: persona.id, name: persona.name, style: persona.style, era: persona.era },
      question,
      analysis: text,
      model: MODEL,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
