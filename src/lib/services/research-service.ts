import type { ResearchRequest, ResearchResponse } from "@/lib/types/research";
import { getBestEffortQuote } from "@/lib/services/provider-router";

export async function runResearchQuery(input: ResearchRequest): Promise<ResearchResponse> {
  const ticker = input.ticker ? ` (${input.ticker.toUpperCase()})` : "";
  const symbol = input.ticker?.toUpperCase();
  const quoteResult = symbol ? await getBestEffortQuote(symbol) : { quote: null, attemptedProviders: [] };

  const quoteSummary =
    quoteResult.quote && symbol
      ? ` Latest ${symbol} quote: ${quoteResult.quote.price.toFixed(2)} ${quoteResult.quote.currency} via ${quoteResult.quote.provider}.`
      : "";

  return {
    summary: `Research orchestration initialized for: ${input.question}${ticker}.${quoteSummary} FMP remains primary with automatic fallback to other configured providers when needed.`,
    confidence: quoteResult.quote ? "medium" : "low",
    citations: [
      {
        provider: "system",
        label: "Foundation scaffold response",
      },
      ...(quoteResult.quote
        ? [
            {
              provider: quoteResult.quote.provider,
              label: `Quote data for ${quoteResult.quote.symbol}`,
            },
          ]
        : []),
    ],
    nextActions: [
      "Implement provider fan-out with retry + timeout policies",
      "Persist conversation + citation rows in database",
      "Add model routing for fast/deep analysis modes",
      ...(quoteResult.attemptedProviders.length
        ? [`Attempted providers (ordered): ${quoteResult.attemptedProviders.join(", ")}`]
        : []),
    ],
  };
}
