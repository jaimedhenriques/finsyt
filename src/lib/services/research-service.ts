import type { ResearchRequest, ResearchResponse } from "@/lib/types/research";

export async function runResearchQuery(input: ResearchRequest): Promise<ResearchResponse> {
  const ticker = input.ticker ? ` (${input.ticker.toUpperCase()})` : "";

  return {
    summary: `Research orchestration initialized for: ${input.question}${ticker}. Connect structured providers and LLM routing next.`,
    confidence: "low",
    citations: [
      {
        provider: "system",
        label: "Foundation scaffold response",
      },
    ],
    nextActions: [
      "Implement provider fan-out with retry + timeout policies",
      "Persist conversation + citation rows in database",
      "Add model routing for fast/deep analysis modes",
    ],
  };
}
