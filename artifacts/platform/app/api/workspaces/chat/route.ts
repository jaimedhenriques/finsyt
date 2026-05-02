import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { getManySources, resolveAuthorizedSourceIds } from "../store"
import { embedQuery, rankChunks, type RetrievalChunk } from "../retrieval"

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

/**
 * A single citation surfaced to the chat UI. The model is told to reference
 * sources via numeric `[N]` markers; the client replaces those markers with
 * clickable badges that open the citation drawer. The drawer re-fetches the
 * full chunk via `/api/workspaces/sources/chunk` which re-verifies tenant
 * ownership server-side — so the namespaced `sourceId` shipped here is safe
 * to expose to the same caller.
 */
interface ChatCitation {
  /** 1-based marker the model uses in prose (e.g. `[1]`). */
  index: number
  /** Namespaced `userId:…` source id. Re-verified by the chunk endpoint. */
  sourceId: string
  sourceName: string
  sourceType: string
  /** 0-based chunk index inside the source. */
  chunkIndex: number
  /** Short preview of the chunk (~240 chars) for hover/preview. */
  snippet: string
}

interface RetrievedChunk {
  sourceId: string
  sourceName: string
  sourceType: string
  chunkIndex: number
  text: string
}

/**
 * Build the candidate set for retrieval by flattening every chunk of every
 * authorized source into a single list, carrying its precomputed embedding
 * (when ingest stored one). The ranker then scores them either by cosine
 * similarity (if both query AND chunks expose vectors) or BM25 alone — see
 * `../retrieval.ts` for the full strategy.
 */
async function retrieveContext(
  sourceIds: string[],
  query: string,
  topK = 8,
): Promise<RetrievedChunk[]> {
  if (sourceIds.length === 0 || !query.trim()) return []
  const sources = await getManySources(sourceIds)

  const candidates: RetrievalChunk[] = []
  for (const id of sourceIds) {
    const source = sources.get(id)
    if (!source) continue
    source.chunks.forEach((chunk, i) => {
      candidates.push({
        sourceId: source.sourceId,
        sourceName: source.name,
        sourceType: source.type,
        chunkIndex: i,
        text: chunk,
        embedding: source.embeddings ? source.embeddings[i] ?? null : null,
      })
    })
  }
  if (candidates.length === 0) return []

  const queryEmbedding = await embedQuery(query)
  const ranked = rankChunks(candidates, query, queryEmbedding, topK)

  return ranked.map(({ score: _score, ...rest }) => rest)
}

function buildSnippet(text: string, max = 240): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
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

  const payload = await req.json() as { messages?: UIMessage[]; sourceIds?: string[]; workspaceId?: string | null }
  const messages = payload.messages ?? []
  const rawSourceIds = payload.sourceIds ?? []
  const workspaceId = typeof payload.workspaceId === "string" && payload.workspaceId.length > 0
    ? payload.workspaceId
    : null

  const sourceIds = await resolveAuthorizedSourceIds(userId, workspaceId, rawSourceIds)

  const lastUserMessage = (() => {
    const last = messages.filter(m => m.role === "user").at(-1)
    if (!last) return ""
    return (last.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map(p => p.text)
      .join(" ")
  })()

  const chunks = await retrieveContext(sourceIds, lastUserMessage)

  // Build numbered citations the model will reference as `[N]`. Index is
  // 1-based in the prompt because that reads naturally; the client converts
  // back to 0-based for the chunk fetch.
  const citations: ChatCitation[] = chunks.map((c, i) => ({
    index: i + 1,
    sourceId: c.sourceId,
    sourceName: c.sourceName,
    sourceType: c.sourceType,
    chunkIndex: c.chunkIndex,
    snippet: buildSnippet(c.text),
  }))

  const contextBlock = chunks.length > 0
    ? chunks
        .map((c, i) => `[${i + 1}] Source: ${c.sourceName} (section ${c.chunkIndex + 1})\n${c.text}`)
        .join("\n\n---\n\n")
    : "No source content available."

  const systemPrompt = `You are a financial research analyst assistant embedded in the Finsyt platform.

You ONLY answer based on the provided source documents below. If the answer is not in the sources, say so clearly.

CITATIONS — VERY IMPORTANT
- Every factual claim MUST be followed by an inline citation marker matching the numbered sources below, written exactly as [1], [2], [3], etc.
- You may cite multiple sources for one claim by listing markers together: e.g. "Revenue grew 12% [1][3]."
- Only use the numeric markers shown in the "Source Documents" block. Do NOT invent new numbers and do NOT use the old "[Source: Name]" format.
- Place the marker immediately after the sentence or clause it supports — never as a stand-alone bullet.

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

  // Wrap the streamText output in a UI message stream so we can prepend a
  // `data-citations` part. The client reads this part to render clickable
  // [N] badges and to look up the source/chunk for the citation drawer.
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      if (citations.length > 0) {
        writer.write({
          type: "data-citations",
          data: citations,
        })
      }
      const result = streamText({
        model: anthropic(ANTHROPIC_MODEL),
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens: 2048,
      })
      writer.merge(result.toUIMessageStream())
    },
  })

  return createUIMessageStreamResponse({ stream })
}
