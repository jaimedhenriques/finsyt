import { NextRequest } from "next/server"
import { streamText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { STORE } from "../ingest/route"

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

function retrieveContext(sourceIds: string[], query: string, topK = 8): { text: string; sourceName: string; chunkIndex: number }[] {
  const results: { text: string; sourceName: string; chunkIndex: number; score: number }[] = []
  const queryWords = new Set(query.toLowerCase().split(/\W+/).filter(w => w.length > 3))

  for (const id of sourceIds) {
    const source = STORE.get(id)
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
  const { messages, sourceIds } = await req.json()
  const lastUserMessage = messages.filter((m: any) => m.role === "user").at(-1)?.content || ""

  // Retrieve relevant chunks
  const chunks = retrieveContext(sourceIds || [], lastUserMessage)
  
  const contextBlock = chunks.length > 0
    ? chunks.map((c, i) => `[Source: ${c.sourceName}, Chunk ${c.chunkIndex + 1}]\n${c.text}`).join("\n\n---\n\n")
    : "No source content available."

  const systemPrompt = `You are a financial research analyst assistant embedded in the Finsyt platform.

You ONLY answer based on the provided source documents below. If the answer is not in the sources, say so clearly.

When citing information, always reference the source like this: [Source: Document Name]

Be precise, structured, and use financial terminology. Use tables when comparing data.

## Source Documents
${contextBlock}

---
Today's date: ${new Date().toLocaleDateString()}`

  const result = streamText({
    model: anthropic("claude-3-5-sonnet-20241022"),
    system: systemPrompt,
    messages,
    maxOutputTokens: 2048,
  })

  return result.toUIMessageStreamResponse()
}
