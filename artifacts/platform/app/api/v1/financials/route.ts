import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalFinancials } from "@/app/api/financials/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) =>
    callInternalGet(internalFinancials, req, [
      "symbol", "metric", "metrics", "period", "offset", "limit",
    ]),
  { endpoint: "/v1/financials" },
);

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
