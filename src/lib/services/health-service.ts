import { providerRegistry } from "@/lib/providers/registry";
import { getProviderRoutingOrder } from "@/lib/services/provider-router";
import type { ProviderHealth } from "@/lib/types/research";
import { getPrismaClient } from "@/lib/db/prisma";

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

export function getProviderPriorityOrder() {
  return getProviderRoutingOrder();
}

export async function getDatabaseHealth(): Promise<"healthy" | "unconfigured" | "unhealthy"> {
  if (!process.env.DATABASE_URL) {
    return "unconfigured";
  }

  try {
    await getPrismaClient().$queryRaw`SELECT 1`;
    return "healthy";
  } catch {
    return "unhealthy";
  }
}
