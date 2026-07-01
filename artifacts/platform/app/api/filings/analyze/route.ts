import { NextRequest } from "next/server"
import { auth } from "@/lib/auth-server"
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { getSourcesWithChunks } from "@/app/api/workspaces/store"

export const runtime = "nodejs"
export const maxDuration = 120

const PROXY_BASE_URL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || ""
const PROXY_KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || ""
const DIRECT_KEY = process.env.ANTHROPIC_API_KEY || ""
const USE_PROXY = !!(PROXY_BASE_URL && PROXY_KEY)
const ANTHROPIC_KEY = USE_PROXY ? PROXY_KEY : DIRECT_KEY
const ANTHROPIC_MODEL = USE_PROXY
  ? (process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6")
  : (process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022")
const anthropic = createAnthropic({
  apiKey: ANTHROPIC_KEY || "placeholder",
  ...(USE_PROXY ? { baseURL: PROXY_BASE_URL } : {}),
})

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 10
const analyzeHits = new Map<string, number[]>()

function rateLimited(userId: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  const hits = (analyzeHits.get(userId) ?? []).filter((t) => t >= cutoff)
  hits.push(now)
  analyzeHits.set(userId, hits)
  if (analyzeHits.size > 5_000) {
    const first = analyzeHits.keys().next().value
    if (first) analyzeHits.delete(first)
  }
  return hits.length > RATE_LIMIT
}

const MAX_CHUNKS = 60

function buildSnippet(text: string, max = 300): string {
  const t = text.trim().replace(/\s+/g, " ")
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

const SECTION_PROMPTS = [
  {
    id: "overview",
    title: "Business Overview & Strategy",
    prompt: `Write 2–3 concise paragraphs summarising:
- What the company does and its primary business segments
- Key strategic priorities and competitive positioning stated in this filing
- Any major business changes, acquisitions, or developments disclosed
Cite every factual claim with [N] markers from the Source Documents.`,
  },
  {
    id: "financials",
    title: "Key Financial Results",
    prompt: `Summarise the most important financial results disclosed:
- Revenue, earnings, and margin performance (with YoY comparisons where stated)
- Balance sheet highlights (cash, debt, leverage ratios)
- Cash flow from operations and capex
- Any forward guidance or financial targets provided
Present as concise bullets. Cite every figure with [N] markers.`,
  },
  {
    id: "risks",
    title: "Risk Factors",
    prompt: `Identify the 5–8 most material risk factors disclosed. For each:
- State the risk concisely (one sentence)
- Note any management-stated mitigation
- Flag (⚠️) any risk that appears particularly material or newly introduced
Cite each risk with its [N] marker.`,
  },
  {
    id: "mda",
    title: "MD&A Highlights",
    prompt: `Extract the key points from Management's Discussion & Analysis:
- Management's narrative on performance drivers
- Notable forward-looking statements and guidance
- Significant accounting changes, non-GAAP items, or one-time adjustments
- Any strategic targets or milestones management has set
Cite every material statement with [N] markers.`,
  },
]

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (rateLimited(userId)) {
    return new Response(JSON.stringify({ error: "Too Many Requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "retry-after": String(Math.ceil(RATE_WINDOW_MS / 1000)),
      },
    })
  }

  let body: { sourceId?: string }
  try {
    body = (await req.json()) as { sourceId?: string }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { sourceId } = body
  if (!sourceId || typeof sourceId !== "string") {
    return new Response(JSON.stringify({ error: "sourceId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!sourceId.startsWith(`${userId}:`)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!ANTHROPIC_KEY) {
    return new Response(
      JSON.stringify({
        error: "AI provider not configured",
        message:
          "Set AI_INTEGRATIONS_ANTHROPIC_BASE_URL + AI_INTEGRATIONS_ANTHROPIC_API_KEY (Replit AI Integrations) or ANTHROPIC_API_KEY to enable filing analysis.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )
  }

  const sources = await getSourcesWithChunks([sourceId])
  if (sources.length === 0) {
    return new Response(
      JSON.stringify({
        error: "Source not found. The document may still be processing — please try again in a moment.",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    )
  }

  const source = sources[0]
  const flatChunks = source.chunks.slice(0, MAX_CHUNKS).map((text, i) => ({
    sourceId: source.sourceId,
    sourceName: source.name,
    sourceType: source.type,
    chunkIndex: i,
    text,
  }))

  const citations = flatChunks.map((c, i) => ({
    index: i + 1,
    sourceId: c.sourceId,
    sourceName: c.sourceName,
    sourceType: c.sourceType,
    chunkIndex: c.chunkIndex,
    snippet: buildSnippet(c.text),
  }))

  const contextBlock = flatChunks
    .map((c, i) => `[${i + 1}] Source: ${c.sourceName} (section ${c.chunkIndex + 1})\n${c.text}`)
    .join("\n\n---\n\n")

  const systemPrompt = `You are an elite financial analyst specialising in SEC filings and annual reports.
Analyse ONLY the provided source document. Be precise, professional, and institutional in tone.

CITATIONS — CRITICAL RULE
Every factual claim MUST be immediately followed by an inline citation marker written exactly as [N] — e.g. "Revenue was $12.4B [3]."
Only use numbers shown in the Source Documents block below. Do NOT invent citation numbers. Do NOT leave factual claims uncited.

## Source Document
${contextBlock.slice(0, 50_000)}`

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const emit = (data: object) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          /* controller already closed */
        }
      }

      try {
        await Promise.all(
          SECTION_PROMPTS.map(async (s) => {
            try {
              const { text } = await generateText({
                model: anthropic(ANTHROPIC_MODEL),
                system: systemPrompt,
                prompt: s.prompt,
                maxOutputTokens: 900,
              })
              emit({ type: "section_done", section: { id: s.id, title: s.title, content: text } })
            } catch (e) {
              emit({
                type: "section_done",
                section: {
                  id: s.id,
                  title: s.title,
                  content: `[Analysis unavailable for this section: ${(e as Error).message}]`,
                },
              })
            }
          }),
        )
        emit({ type: "done", citations, fileName: source.name, chunkCount: source.chunks.length })
      } catch (e) {
        emit({ type: "error", message: String(e) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
