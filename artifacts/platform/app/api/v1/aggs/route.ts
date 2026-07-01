import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalAggs } from "@/app/api/aggs/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) =>
    callInternalGet(internalAggs, req, ["symbol", "from", "to", "multiplier", "timespan"]),
  { endpoint: "/v1/aggs" },
);

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
