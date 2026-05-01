import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server";
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { getSourcesWithChunks } from "../store"

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

Format as clean text with clear sections.`,

  summary: `Generate a concise Executive Summary (max 400 words) covering:
- What the company does (one sentence)
- Key financial highlights from this period
- Most important strategic developments
- Critical risks mentioned
- Bottom line for investors

Write in Goldman Sachs research note style — direct, factual, professional.`,

  risks: `Extract and categorise all risk factors mentioned in the source documents:

**Macro Risks**: [list]
**Competitive Risks**: [list]  
**Operational Risks**: [list]
**Financial Risks**: [list]
**Regulatory/Legal Risks**: [list]

For each risk, note if management acknowledged it and any mitigation mentioned. Highlight (⚠️) any risks that appear particularly material.`,

  comparison: `Create a comparison table from the source documents. Extract all numerical metrics and present as:

| Metric | Value | vs Prior Period | vs Estimate |
|--------|-------|-----------------|-------------|

Then add a 2-3 sentence interpretation of what the numbers indicate about business trajectory.`,
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
    const { type, sourceIds: rawSourceIds } = await req.json()

    const sourceIds = (rawSourceIds ?? []).filter(
      (id: unknown) => typeof id === "string" && id.startsWith(`${userId}:`)
    )

    const sources = await getSourcesWithChunks(sourceIds)
    const allText = sources
      .map(source => `=== ${source.name} ===\n${source.chunks.join("\n\n")}`)
      .filter(Boolean)
      .join("\n\n")

    if (!allText || allText.length < 50) {
      return NextResponse.json({ content: "No source content available. Please add and process sources first." })
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

    const { text } = await generateText({
      model: anthropic(ANTHROPIC_MODEL),
      system: `You are an elite financial analyst. Analyse ONLY the provided source documents. Be precise and professional.\n\nSOURCES:\n${allText.slice(0, 40000)}`,
      prompt,
      maxOutputTokens: 1500,
    })

    return NextResponse.json({ content: text })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
