import { NextResponse } from "next/server";
import { getDatabaseHealth, getProviderHealth } from "@/lib/services/health-service";
import type { DatabaseHealth } from "@/lib/types/research";

export async function GET() {
  const [providers, dbStatus] = await Promise.all([getProviderHealth(), getDatabaseHealth()]);
  const healthyCount = providers.filter((provider) => provider.status === "healthy").length;

  const database: DatabaseHealth = {
    provider: "supabase-postgres",
    status: dbStatus,
  };

  const status =
    healthyCount === 0 || database.status === "unhealthy"
      ? "degraded"
      : "healthy";

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    database,
    providers,
  });
}
