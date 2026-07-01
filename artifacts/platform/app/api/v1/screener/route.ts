import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalScreener } from "@/app/api/screener/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) =>
    callInternalGet(internalScreener, req, [
      "sector", "minMcap", "maxMcap", "country", "exchange",
      "minPe", "maxPe", "minPrice", "maxPrice", "minBeta", "maxBeta",
      "minVolume", "industry", "limit", "sort", "order",
    ]),
  { endpoint: "/v1/screener" },
);

export async function OPTIONS(req: NextRequest) { return corsPreflight(req); }
