import { NextResponse } from "next/server";
import { getProviderHealth } from "@/lib/services/health-service";

export async function GET() {
  const providers = await getProviderHealth();
  const healthyCount = providers.filter((provider) => provider.status === "healthy").length;

  const status = healthyCount === 0 ? "degraded" : "healthy";

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    providers,
  });
}
