import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server";
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { getSourcesWithChunks, resolveAuthorizedSourceIds } from "../store"

// Provider precedence: prefer the Replit AI Integrations Anthropic proxy when
// both its base URL and key are configured (default operator setup), and only
// fall back to a directly configured ANTHROPIC_API_KEY when the proxy is not
// fully set. Return 503 only when neither path is fully configured. The proxy
// and direct catalogs don't share model IDs, so we pick a default model that
// the active path actually exposes.
const PROXY_BASE_URL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || ""
const PROXY_KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || ""
const DIRECT_KEY = process.env.ANTHROPIC_API_KEY || ""
const USE_PROXY = !!(PROXY_BASE_URL && PROXY_KEY)
const USE_DIRECT = !USE_PROXY && !!DIRECT_KEY
const ANTHROPIC_KEY = USE_PROXY ? PROXY_KEY : (USE_DIRECT ? DIRECT_KEY : "")
const ANTHROPIC_MODEL = USE_PROXY
  ? (process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6")
  : (process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022")
const anthropic = createAnthropic({
  apiKey: ANTHROPIC_KEY,
  ...(USE_PROXY ? { baseURL: PROXY_BASE_URL } : {}),
})

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 20
const studioHits = new Map<string, number[]>()

function studioRateLimited(userId: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  const hits = (studioHits.get(userId) ?? []).filter(t => t >= cutoff)
  hits.push(now)
  studioHits.set(userId, hits)
  if (studioHits.size > 5_000) { const first = studioHits.keys().next().value; if (first) studioHits.delete(first) }
  return hits.length > RATE_LIMIT
}

/**
 * A single citation surfaced to the studio UI. Mirrors the chat
 * citation contract — the model references chunks via `[N]` markers,
 * and the client renders those as clickable badges that open the same
 * citation drawer (which re-fetches the chunk via `/api/workspaces/sources/chunk`,
 * re-verifying tenant ownership server-side).
 */
interface StudioCitation {
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

function buildSnippet(text: string, max = 240): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

// Cap on how many chunks we expose as numbered citations to the model.
// The Studio prompts run against the full source set (no query to score
// against), so we feed chunks in document order up to this limit; this
// keeps the prompt bounded while still covering most short filings.
const MAX_CITATION_CHUNKS = 40

const PROMPTS = {
  brief: `Generate a structured Earnings Brief from the provided source documents. Include:
- Company & Period
- Revenue: Actual vs Estimate, YoY growth
- EPS: Actual vs Estimate
- Gross Margin & Operating Margin
- Key segment performance
- Forward guidance
- Management tone (bullish/cautious/mixed)
- One-line verdict

Format as clean text with clear sections. Cite every factual claim with the matching \`[N]\` marker(s) from the Source Documents block.`,

  summary: `Generate a concise Executive Summary (max 400 words) covering:
- What the company does (one sentence)
- Key financial highlights from this period
- Most important strategic developments
- Critical risks mentioned
- Bottom line for investors

Write in Goldman Sachs research note style — direct, factual, professional. Cite every factual claim with the matching \`[N]\` marker(s) from the Source Documents block.`,

  risks: `Extract and categorise all risk factors mentioned in the source documents:

**Macro Risks**: [list]
**Competitive Risks**: [list]
**Operational Risks**: [list]
**Financial Risks**: [list]
**Regulatory/Legal Risks**: [list]

For each risk, note if management acknowledged it and any mitigation mentioned. Highlight (⚠️) any risks that appear particularly material. Every individual risk MUST end with the matching \`[N]\` marker(s) from the Source Documents block so reviewers can audit the underlying source.`,

  comparison: `Create a comparison table from the source documents. Extract all numerical metrics and present as:

| Metric | Value | vs Prior Period | vs Estimate |
|--------|-------|-----------------|-------------|

Then add a 2-3 sentence interpretation of what the numbers indicate about business trajectory. Append the matching \`[N]\` marker(s) from the Source Documents block to each row's Value cell, and to every sentence of the interpretation.`,
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (studioRateLimited(userId)) {
    return NextResponse.json(
      { error: "Too Many Requests", message: "Studio rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "retry-after": String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
    )
  }

  try {
    const body = await req.json() as { type?: string; sourceIds?: unknown[]; workspaceId?: string | null }
    const { type } = body
    const rawSourceIds = body.sourceIds ?? []
    const workspaceId = typeof body.workspaceId === "string" && body.workspaceId.length > 0
      ? body.workspaceId
      : null

    const sourceIds = await resolveAuthorizedSourceIds(
      userId,
      workspaceId,
      rawSourceIds.filter((id): id is string => typeof id === "string"),
    )

    const sources = await getSourcesWithChunks(sourceIds)

    // Build a flat, ordered list of (source, chunkIndex, text) triples so
    // each chunk gets a stable `[N]` marker. We feed the chunks in
    // document order (source-by-source) up to MAX_CITATION_CHUNKS so the
    // model has a numbered reference for every claim it can make.
    const flatChunks: Array<{
      sourceId: string
      sourceName: string
      sourceType: string
      chunkIndex: number
      text: string
    }> = []
    for (const source of sources) {
      source.chunks.forEach((text, i) => {
        flatChunks.push({
          sourceId: source.sourceId,
          sourceName: source.name,
          sourceType: source.type,
          chunkIndex: i,
          text,
        })
      })
    }
    const usedChunks = flatChunks.slice(0, MAX_CITATION_CHUNKS)

    const citations: StudioCitation[] = usedChunks.map((c, i) => ({
      index: i + 1,
      sourceId: c.sourceId,
      sourceName: c.sourceName,
      sourceType: c.sourceType,
      chunkIndex: c.chunkIndex,
      snippet: buildSnippet(c.text),
    }))

    const contextBlock = usedChunks.length > 0
      ? usedChunks
          .map((c, i) => `[${i + 1}] Source: ${c.sourceName} (section ${c.chunkIndex + 1})\n${c.text}`)
          .join("\n\n---\n\n")
      : "No source content available."

    if (usedChunks.length === 0) {
      return NextResponse.json({
        content: "No source content available. Please add and process sources first.",
        citations: [],
      })
    }

    const prompt = PROMPTS[type as keyof typeof PROMPTS]
    if (!prompt) return NextResponse.json({ error: "Unknown studio type" })

    if (!ANTHROPIC_KEY) {
      return NextResponse.json(
        {
          error: "AI provider not configured",
          message:
            "Set AI_INTEGRATIONS_ANTHROPIC_BASE_URL + AI_INTEGRATIONS_ANTHROPIC_API_KEY (Replit AI Integrations) or ANTHROPIC_API_KEY to enable studio analysis.",
        },
        { status: 503 },
      )
    }

    const systemPrompt = `You are an elite financial analyst. Analyse ONLY the provided source documents. Be precise and professional.

CITATIONS — VERY IMPORTANT
- Every factual claim MUST be followed by an inline citation marker matching the numbered sources below, written exactly as [1], [2], [3], etc.
- You may cite multiple sources for one claim by listing markers together: e.g. "Revenue grew 12% [1][3]."
- Only use the numeric markers shown in the "Source Documents" block. Do NOT invent new numbers and do NOT use the old "[Source: Name]" format.
- Place the marker immediately after the sentence, bullet, or table cell it supports — never as a stand-alone line.

## Source Documents
${contextBlock.slice(0, 40000)}`

    const { text } = await generateText({
      model: anthropic(ANTHROPIC_MODEL),
      system: systemPrompt,
      prompt,
      maxOutputTokens: 1500,
    })

    return NextResponse.json({ content: text, citations })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
