import { NextResponse } from "next/server";
import { getSystemHealth } from "@/lib/services/health-service";

export async function GET() {
  const { providers, database } = await getSystemHealth();
  const healthyCount = providers.filter((provider) => provider.status === "healthy").length;

  const providerStatus = healthyCount === 0 ? "degraded" : "healthy";
  const status = providerStatus === "healthy" && database.status === "healthy" ? "healthy" : "degraded";

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    database,
    providers,
  });
}
