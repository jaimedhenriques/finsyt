import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalDividends } from "@/app/api/dividends/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) => callInternalGet(internalDividends, req, ["symbol", "limit"]),
  { endpoint: "/v1/dividends" },
);

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
