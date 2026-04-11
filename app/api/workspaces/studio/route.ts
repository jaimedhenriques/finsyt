import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { STORE } from "../ingest/route"

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

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
  try {
    const { type, sourceIds, sourceNames } = await req.json()

    // Gather all chunks from selected sources
    const allText = sourceIds
      .map((id: string) => {
        const source = STORE.get(id)
        if (!source) return ""
        return `=== ${source.name} ===\n${source.chunks.join("\n\n")}`
      })
      .filter(Boolean)
      .join("\n\n")

    if (!allText || allText.length < 50) {
      return NextResponse.json({ content: "No source content available. Please add and process sources first." })
    }

    const prompt = PROMPTS[type as keyof typeof PROMPTS]
    if (!prompt) return NextResponse.json({ error: "Unknown studio type" })

    const { text } = await generateText({
      model: anthropic("claude-3-5-sonnet-20241022"),
      system: `You are an elite financial analyst. Analyse ONLY the provided source documents. Be precise and professional.\n\nSOURCES:\n${allText.slice(0, 40000)}`,
      prompt,
      maxTokens: 1500,
    })

    return NextResponse.json({ content: text })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
