/**
 * POST /api/research-library/deep-research
 *
 * Multi-hop DeepResearch synthesis over the tenant's Research Library.
 * Retrieves the most relevant chunks across all ingested papers and streams
 * a cited answer via SSE — same event envelope as the existing agent surface.
 *
 * Events emitted (each as `data: <json>\n\n`):
 *   { event:"step",   kind:"retrieve",   label:"..." }
 *   { event:"step",   kind:"synthesise", label:"..." }
 *   { event:"citation", citations:[...] }    // numbered citations for the answer
 *   { event:"answer_chunk", text:"..." }     // streamed prose
 *   { event:"done",   ok:true }
 *   { event:"error",  message:"..." }
 */

import { NextRequest } from "next/server"
import { auth } from "@/lib/auth-server"
import { listLibraryItems } from "../store"
import { getManySources } from "../../workspaces/store"
import { embedQuery, rankChunks, type RetrievalChunk } from "../../workspaces/retrieval"

export const runtime = "nodejs"
export const maxDuration = 60

const OPENAI_BASE =
  (
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/+$/, "")
const OPENAI_KEY =
  process.env.OPENAI_API_KEY ||
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
  ""
const ANTHROPIC_BASE =
  (
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ||
    "https://api.anthropic.com"
  ).replace(/\/+$/, "")
const ANTHROPIC_KEY =
  process.env.ANTHROPIC_API_KEY ||
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||
  ""

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 20
const drHits = new Map<string, number[]>()

function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  const h = (drHits.get(userId) ?? []).filter((t) => t >= cutoff)
  h.push(now)
  drHits.set(userId, h)
  if (drHits.size > 2_000) {
    const first = drHits.keys().next().value
    if (first) drHits.delete(first)
  }
  return h.length > RATE_LIMIT
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId)
    return new Response(
      `data: ${JSON.stringify({ event: "error", message: "Unauthorized" })}\n\n`,
      { status: 401, headers: { "content-type": "text/event-stream" } },
    )

  if (isRateLimited(userId))
    return new Response(
      `data: ${JSON.stringify({ event: "error", message: "Rate limit exceeded" })}\n\n`,
      { status: 429, headers: { "content-type": "text/event-stream" } },
    )

  if (!OPENAI_KEY && !ANTHROPIC_KEY)
    return new Response(
      `data: ${JSON.stringify({ event: "error", message: "No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY." })}\n\n`,
      { status: 503, headers: { "content-type": "text/event-stream" } },
    )

  let body: { question?: string } = {}
  try { body = await req.json() } catch { /* ignore */ }
  const question = (body.question || "").trim()
  if (!question)
    return new Response(
      `data: ${JSON.stringify({ event: "error", message: "question required" })}\n\n`,
      { status: 400, headers: { "content-type": "text/event-stream" } },
    )

  const enc = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`))
      }

      try {
        send("step", { kind: "retrieve", label: "Loading research library…" })

        const items = await listLibraryItems(orgId)
        if (items.length === 0) {
          send("error", { message: "Your Research Library is empty. Ingest some papers first." })
          controller.close()
          return
        }

        const sourceIds = items.map((i) => i.workspaceSourceId)
        const sources = await getManySources(sourceIds)

        const candidates: RetrievalChunk[] = []
        for (const item of items) {
          const src = sources.get(item.workspaceSourceId)
          if (!src) continue
          src.chunks.forEach((text, idx) => {
            candidates.push({
              sourceId: item.workspaceSourceId,
              sourceName: item.title,
              sourceType: "research",
              chunkIndex: idx,
              text,
              embedding: src.embeddings ? src.embeddings[idx] ?? null : null,
            })
          })
        }

        send("step", { kind: "retrieve", label: `Searching ${candidates.length} passages across ${items.length} papers…` })

        const queryVec = await embedQuery(question).catch(() => null)
        const topChunks = rankChunks(candidates, question, queryVec, 10)

        if (topChunks.length === 0) {
          send("error", { message: "No relevant passages found. Try a different question or ingest more papers." })
          controller.close()
          return
        }

        // Build numbered citations
        const citations = topChunks.map((c, i) => ({
          index: i + 1,
          sourceId: c.sourceId,
          sourceName: c.sourceName,
          chunkIndex: c.chunkIndex,
          snippet: c.text.trim().slice(0, 280),
          attribution: items.find((it) => it.workspaceSourceId === c.sourceId)?.attribution || "research",
          arxivId: items.find((it) => it.workspaceSourceId === c.sourceId)?.arxivId || undefined,
          url: items.find((it) => it.workspaceSourceId === c.sourceId)?.url || undefined,
        }))

        send("citation", { citations })

        const contextBlock = topChunks
          .map(
            (c, i) =>
              `[${i + 1}] ${c.sourceName}\n${c.text}`,
          )
          .join("\n\n---\n\n")

        const systemPrompt = `You are a quantitative finance research analyst. Synthesise an insightful, multi-paragraph answer to the user's question using ONLY the provided research passages. 

RULES:
- Every factual claim MUST be followed by an inline citation [N] matching the numbered passages.
- Lead with the key insight in 1-2 sentences, then elaborate with evidence.
- Use bullet points or sub-sections when comparing across papers.
- Note methodological differences or contradictions between papers.
- Close with a brief synthesis/outlook paragraph.
- Format in Markdown. Do NOT invent citations or facts beyond the passages.
- Today: ${new Date().toLocaleDateString()}

RESEARCH PASSAGES:
${contextBlock}`

        send("step", { kind: "synthesise", label: "Synthesising multi-paper answer…" })

        // Try OpenAI first, then Anthropic
        if (OPENAI_KEY) {
          const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
              model: process.env.AGENT_MODEL || "gpt-4o-mini",
              stream: true,
              max_tokens: 1800,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: question },
              ],
            }),
          })

          if (!res.ok || !res.body) {
            throw new Error(`OpenAI error ${res.status}`)
          }

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buf = ""
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split("\n")
            buf = lines.pop() ?? ""
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue
              const raw = line.slice(6)
              if (raw === "[DONE]") break
              try {
                const j = JSON.parse(raw)
                const chunk = j.choices?.[0]?.delta?.content
                if (chunk) send("answer_chunk", { text: chunk })
              } catch { /* skip */ }
            }
          }
        } else if (ANTHROPIC_KEY) {
          const res = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": ANTHROPIC_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
              stream: true,
              max_tokens: 1800,
              system: systemPrompt,
              messages: [{ role: "user", content: question }],
            }),
          })

          if (!res.ok || !res.body) throw new Error(`Anthropic error ${res.status}`)

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buf = ""
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split("\n")
            buf = lines.pop() ?? ""
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue
              try {
                const j = JSON.parse(line.slice(6))
                if (j.type === "content_block_delta" && j.delta?.text) {
                  send("answer_chunk", { text: j.delta.text })
                }
              } catch { /* skip */ }
            }
          }
        }

        send("done", { ok: true })
      } catch (err) {
        send("error", { message: String((err as Error).message || err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  })
}
