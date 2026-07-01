/**
 * POST /api/workspaces/matrix
 * ───────────────────────────
 * Multi-document Q&A matrix: runs one or more questions across many
 * documents and streams one SSE event per completed cell so the UI
 * can update incrementally.
 *
 * Protocol: text/event-stream, each event is:
 *   data: {"type":"cell","cell":{...MatrixCell}}\n\n
 *   data: {"type":"done","total":N}\n\n   (final event)
 *   data: {"type":"error","error":"..."}\n\n (only on fatal early errors)
 *
 * Scalability: query embeddings are computed ONCE per unique question and
 * reused across every source in that question's column, eliminating the
 * N×M embedding amplification that would occur if we embedded inside the
 * per-source retrieval call.
 *
 * Security: enforces the same org-guard + resolveAuthorizedSourceIds
 * checks as the workspace chat route so cross-tenant sourceIds are
 * silently dropped before any retrieval or AI call is made.
 */
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth-server"
import { resolveLocalOrgId } from "@/lib/org-resolver"
import { workspaceBelongsToOrg } from "../org-guard"
import { getManySources, resolveAuthorizedSourceIds } from "../store"
import { embedQuery, rankChunks, type RetrievalChunk } from "../retrieval"

export const runtime = "nodejs"

const PROXY_BASE_URL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || ""
const PROXY_KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || ""
const DIRECT_KEY = process.env.ANTHROPIC_API_KEY || ""
const USE_DIRECT = !!DIRECT_KEY
const USE_PROXY = !USE_DIRECT && !!(PROXY_BASE_URL && PROXY_KEY)
const ANTHROPIC_KEY = USE_DIRECT ? DIRECT_KEY : USE_PROXY ? PROXY_KEY : ""
const ANTHROPIC_MODEL = USE_PROXY
  ? process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"
  : process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
const ANTHROPIC_BASE = USE_PROXY ? PROXY_BASE_URL : "https://api.anthropic.com"

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 10
const matrixHits = new Map<string, number[]>()

function rateLimited(userId: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  const hits = (matrixHits.get(userId) ?? []).filter((t) => t >= cutoff)
  hits.push(now)
  matrixHits.set(userId, hits)
  if (matrixHits.size > 2_000) {
    const first = matrixHits.keys().next().value
    if (first) matrixHits.delete(first)
  }
  return hits.length > RATE_LIMIT
}

export interface MatrixCitation {
  index: number
  sourceId: string
  sourceName: string
  sourceType: string
  chunkIndex: number
  snippet: string
}

export interface MatrixCell {
  sourceId: string
  sourceName: string
  question: string
  questionIndex: number
  answer: string
  citations: MatrixCitation[]
  status: "ok" | "error" | "no_content"
  error?: string
}

function buildSnippet(text: string, max = 200): string {
  const t = text.trim().replace(/\s+/g, " ")
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

/**
 * Retrieve the top-K chunks for a single source and a single question.
 * Accepts a pre-computed queryEmbedding (may be null) so we only pay the
 * embedding API cost ONCE per question column, not once per (source × question) cell.
 */
function retrieveForSource(
  sourceId: string,
  sourceName: string,
  sourceType: string,
  chunks: string[],
  embeddings: (number[] | null)[] | null | undefined,
  query: string,
  queryEmbedding: number[] | null,
  topK = 5,
): { chunks: Array<{ chunkIndex: number; text: string }>; citations: MatrixCitation[] } {
  if (chunks.length === 0) return { chunks: [], citations: [] }

  const candidates: RetrievalChunk[] = chunks.map((text, i) => ({
    sourceId,
    sourceName,
    sourceType,
    chunkIndex: i,
    text,
    embedding: embeddings?.[i] ?? null,
  }))

  const ranked = rankChunks(candidates, query, queryEmbedding, topK)

  const citations: MatrixCitation[] = ranked.map((c, i) => ({
    index: i + 1,
    sourceId: c.sourceId,
    sourceName: c.sourceName,
    sourceType: c.sourceType,
    chunkIndex: c.chunkIndex,
    snippet: buildSnippet(c.text),
  }))

  return { chunks: ranked.map((c) => ({ chunkIndex: c.chunkIndex, text: c.text })), citations }
}

async function callAnthropic(systemPrompt: string, userMessage: string): Promise<string> {
  const url = `${ANTHROPIC_BASE.replace(/\/+$/, "")}/v1/messages`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  const text = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
  return text.trim()
}

/**
 * Generate one matrix cell using a pre-computed query embedding.
 * Retrieval is synchronous (no async embedding call inside);
 * only the LLM call is async.
 */
async function generateCell(
  sourceId: string,
  sourceName: string,
  sourceType: string,
  chunks: string[],
  embeddings: (number[] | null)[] | null | undefined,
  question: string,
  questionIndex: number,
  queryEmbedding: number[] | null,
): Promise<MatrixCell> {
  const { chunks: relevant, citations } = retrieveForSource(
    sourceId,
    sourceName,
    sourceType,
    chunks,
    embeddings,
    question,
    queryEmbedding,
  )

  if (relevant.length === 0) {
    return {
      sourceId,
      sourceName,
      question,
      questionIndex,
      answer: "No relevant content found in this document.",
      citations: [],
      status: "no_content",
    }
  }

  const contextBlock = relevant
    .map((c, i) => `[${i + 1}] (section ${c.chunkIndex + 1})\n${c.text}`)
    .join("\n\n---\n\n")

  const systemPrompt = `You are a financial analyst extracting a concise answer from a single document.

Answer ONLY from the provided source excerpts. If the answer isn't present, say "Not found in this document."

CITATIONS: Place [N] markers after each claim matching the numbered excerpts. Answer in 1–3 sentences maximum.`

  const userMessage = `Document: "${sourceName}"

Source excerpts:
${contextBlock}

---
Question: ${question}`

  try {
    const answer = await callAnthropic(systemPrompt, userMessage)
    return {
      sourceId,
      sourceName,
      question,
      questionIndex,
      answer,
      citations,
      status: "ok",
    }
  } catch (err) {
    return {
      sourceId,
      sourceName,
      question,
      questionIndex,
      answer: "",
      citations,
      status: "error",
      error: (err as Error).message || "generation_failed",
    }
  }
}

/** Run tasks with bounded concurrency, invoking onResult for each completed task. */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  onResult: (result: T) => void,
): Promise<void> {
  let i = 0
  async function worker(): Promise<void> {
    while (i < tasks.length) {
      const idx = i++
      const result = await tasks[idx]()
      onResult(result)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })
  }

  if (rateLimited(userId)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(Math.ceil(RATE_WINDOW_MS / 1000)),
      },
    })
  }

  if (!ANTHROPIC_KEY) {
    return new Response(
      JSON.stringify({
        error: "AI provider not configured",
        message:
          "Set ANTHROPIC_API_KEY or AI_INTEGRATIONS_ANTHROPIC_* to enable the matrix surface.",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    )
  }

  const payload = (await req.json()) as {
    sourceIds?: string[]
    questions?: string[]
    workspaceId?: string | null
  }

  const rawSourceIds = Array.isArray(payload.sourceIds) ? payload.sourceIds : []
  const questions = (Array.isArray(payload.questions) ? payload.questions : [])
    .map((q) => String(q).trim())
    .filter((q) => q.length > 0)
    .slice(0, 10)

  const workspaceId =
    typeof payload.workspaceId === "string" && payload.workspaceId.length > 0
      ? payload.workspaceId
      : null

  if (questions.length === 0) {
    return new Response(JSON.stringify({ error: "At least one question required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }
  if (rawSourceIds.length === 0) {
    return new Response(JSON.stringify({ error: "At least one sourceId required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  if (workspaceId) {
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      })
    }
    try {
      const localOrgId = await resolveLocalOrgId(orgId)
      if (!(await workspaceBelongsToOrg(localOrgId, workspaceId))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        })
      }
    } catch {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      })
    }
  }

  const authorizedIds = await resolveAuthorizedSourceIds(userId, workspaceId, rawSourceIds)
  if (authorizedIds.length === 0) {
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(sseEvent({ type: "done", total: 0 })))
        ctrl.close()
      },
    })
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    })
  }

  const sourcesMap = await getManySources(authorizedIds)

  // Pre-compute one embedding per unique question — reused across all sources
  // in that column. This turns an N×M embedding cost into just M calls.
  const questionEmbeddings: (number[] | null)[] = await Promise.all(
    questions.map((q) => embedQuery(q).catch(() => null)),
  )

  const tasks: Array<() => Promise<MatrixCell>> = []
  for (const sourceId of authorizedIds) {
    const source = sourcesMap.get(sourceId)
    if (!source) continue
    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi]
      const qEmb = questionEmbeddings[qi]
      const qidx = qi
      const si = sourceId
      const sn = source.name
      const st = source.type
      const sc = source.chunks
      const se = source.embeddings
      tasks.push(() => generateCell(si, sn, st, sc, se, q, qidx, qEmb))
    }
  }

  const totalCells = tasks.length

  // Stream each cell result as an SSE event so the UI updates in real time.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const enc = new TextEncoder()

  // Run all cells in the background; write each result to the stream as it completes.
  void runWithConcurrency(tasks, 4, (cell) => {
    void writer.write(enc.encode(sseEvent({ type: "cell", cell })))
  })
    .then(() => {
      void writer.write(enc.encode(sseEvent({ type: "done", total: totalCells })))
    })
    .catch((err: unknown) => {
      void writer.write(
        enc.encode(sseEvent({ type: "error", error: (err as Error).message || "unknown" })),
      )
    })
    .finally(() => {
      void writer.close()
    })

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  })
}
