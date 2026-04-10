import { providerRegistry } from "@/lib/providers/registry";
import { getProviderRoutingOrder } from "@/lib/services/provider-router";
import type { ProviderHealth } from "@/lib/types/research";
import { getDatabaseHealth } from "@/lib/services/database-health";

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

export async function getSystemHealth() {
  const providers = await getProviderHealth();
  const database = await getDatabaseHealth();
  return {
    providers,
    database,
  };
}

export function getProviderPriorityOrder() {
  return getProviderRoutingOrder();
}
