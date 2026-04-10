import type { DataProvider, MarketQuote } from "@/lib/providers/base";
import { providerRegistry } from "@/lib/providers/registry";

export type RoutedProviderOrder = {
  primary: string[];
  fallback: string[];
  all: string[];
};

export function getProviderRoutingOrder(): RoutedProviderOrder {
  const configured = providerRegistry.filter((provider) => provider.configured);
  const fmpPrimary = configured.filter((provider) => provider.id === "fmp").map((provider) => provider.id);
  const fallback = configured.filter((provider) => provider.id !== "fmp").map((provider) => provider.id);

  return {
    primary: fmpPrimary,
    fallback,
    all: [...fmpPrimary, ...fallback],
  };
}

export async function getBestEffortQuote(symbol: string): Promise<{
  quote: MarketQuote | null;
  attemptedProviders: string[];
}> {
  const orderedProviders = [...providerRegistry].sort((a, b) => {
    if (a.id === "fmp") return -1;
    if (b.id === "fmp") return 1;
    return 0;
  });

  const attemptedProviders: string[] = [];

  for (const provider of orderedProviders) {
    if (!provider.configured || !provider.getQuote) {
      continue;
    }

    attemptedProviders.push(provider.id);

    try {
      const quote = await provider.getQuote(symbol);
      if (quote) {
        return { quote, attemptedProviders };
      }
    } catch {
      // Keep moving through fallback providers to preserve availability.
      continue;
    }
  }

  return { quote: null, attemptedProviders };
}

export function getProviderById(id: string): DataProvider | undefined {
  return providerRegistry.find((provider) => provider.id === id);
}
