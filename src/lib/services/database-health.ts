import { prisma } from "@/lib/db/prisma";
import { resolveDatabaseUrls } from "@/lib/db/connection";
import type { DatabaseHealth } from "@/lib/types/research";

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const { configured, pooledSource } = resolveDatabaseUrls();

  if (!configured) {
    return {
      configured: false,
      status: "unconfigured",
      source: null,
    };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      configured: true,
      status: "healthy",
      source: pooledSource,
    };
  } catch {
    return {
      configured: true,
      status: "degraded",
      source: pooledSource,
    };
  }
}
