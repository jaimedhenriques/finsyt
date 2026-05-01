import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server";
import { streamText, convertToModelMessages, type UIMessage } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { getManySources } from "../store"

// Provider precedence: a directly configured ANTHROPIC_API_KEY always wins so
// operators can override the platform-default Replit AI Integrations proxy.
// When no direct key is set, fall back to the proxy if both its base URL and
// key are present. Return 503 only when neither path is fully configured.
// The proxy and direct catalogs don't share model IDs, so we pick a default
// model that the active path actually exposes.
const PROXY_BASE_URL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || ""
const PROXY_KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || ""
const DIRECT_KEY = process.env.ANTHROPIC_API_KEY || ""
const USE_DIRECT = !!DIRECT_KEY
const USE_PROXY = !USE_DIRECT && !!(PROXY_BASE_URL && PROXY_KEY)
const ANTHROPIC_KEY = USE_DIRECT ? DIRECT_KEY : (USE_PROXY ? PROXY_KEY : "")
const ANTHROPIC_MODEL = USE_PROXY
  ? (process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6")
  : (process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022")
const anthropic = createAnthropic({
  apiKey: ANTHROPIC_KEY,
  ...(USE_PROXY ? { baseURL: PROXY_BASE_URL } : {}),
})
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 30
const chatHits = new Map<string, number[]>()

function chatRateLimited(userId: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  const hits = (chatHits.get(userId) ?? []).filter(t => t >= cutoff)
  hits.push(now)
  chatHits.set(userId, hits)
  if (chatHits.size > 5_000) { const first = chatHits.keys().next().value; if (first) chatHits.delete(first) }
  return hits.length > RATE_LIMIT
}

async function retrieveContext(sourceIds: string[], query: string, topK = 8): Promise<{ text: string; sourceName: string; chunkIndex: number }[]> {
  const results: { text: string; sourceName: string; chunkIndex: number; score: number }[] = []
  const queryWords = new Set(query.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  const sources = await getManySources(sourceIds)

  for (const id of sourceIds) {
    const source = sources.get(id)
    if (!source) continue
    source.chunks.forEach((chunk, i) => {
      const chunkWords = chunk.toLowerCase()
      let score = 0
      queryWords.forEach(w => { if (chunkWords.includes(w)) score++ })
      results.push({ text: chunk, sourceName: source.name, chunkIndex: i, score })
    })
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ text, sourceName, chunkIndex }) => ({ text, sourceName, chunkIndex }))
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (chatRateLimited(userId)) {
    return NextResponse.json(
      { error: "Too Many Requests", message: "Chat rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "retry-after": String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
    )
  }

  const payload = await req.json() as { messages?: UIMessage[]; sourceIds?: string[] }
  const messages = payload.messages ?? []
  const rawSourceIds = payload.sourceIds ?? []

  const sourceIds = rawSourceIds.filter(id => typeof id === "string" && id.startsWith(`${userId}:`))

  const lastUserMessage = (() => {
    const last = messages.filter(m => m.role === "user").at(-1)
    if (!last) return ""
    return (last.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map(p => p.text)
      .join(" ")
  })()

  const chunks = await retrieveContext(sourceIds, lastUserMessage)

  const contextBlock = chunks.length > 0
    ? chunks.map((c) => `[Source: ${c.sourceName}, Chunk ${c.chunkIndex + 1}]\n${c.text}`).join("\n\n---\n\n")
    : "No source content available."

  const systemPrompt = `You are a financial research analyst assistant embedded in the Finsyt platform.

You ONLY answer based on the provided source documents below. If the answer is not in the sources, say so clearly.

When citing information, always reference the source like this: [Source: Document Name]

Be precise, structured, and use financial terminology. Use tables when comparing data.

## Source Documents
${contextBlock}

---
Today's date: ${new Date().toLocaleDateString()}`

  if (!ANTHROPIC_KEY) {
    return NextResponse.json(
      {
        error: "AI provider not configured",
        message:
          "Set AI_INTEGRATIONS_ANTHROPIC_BASE_URL + AI_INTEGRATIONS_ANTHROPIC_API_KEY (Replit AI Integrations) or ANTHROPIC_API_KEY to enable workspace chat.",
      },
      { status: 503 },
    )
  }

  const modelMessages = await convertToModelMessages(messages)

  const result = streamText({
    model: anthropic(ANTHROPIC_MODEL),
    system: systemPrompt,
    messages: modelMessages,
    maxOutputTokens: 2048,
  })

  return result.toUIMessageStreamResponse()
}
