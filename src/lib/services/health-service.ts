import { providerRegistry } from "@/lib/providers/registry";
import type { ProviderHealth } from "@/lib/types/research";

export async function getProviderHealth(): Promise<ProviderHealth[]> {
  const entries = await Promise.all(
    providerRegistry.map(async (provider) => ({
      id: provider.id,
      configured: provider.configured,
      status: await provider.health(),
    }))
  );

  return entries;
}
