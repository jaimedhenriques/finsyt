import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalTechnicals } from "@/app/api/technicals/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) => {
    return callInternalGet(internalTechnicals, req, [
      "symbol",
      "range",
      "from",
      "to",
      "indicators",
      "config",
      "noBars",
    ]);
  },
  { endpoint: "/v1/technicals" },
);

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
