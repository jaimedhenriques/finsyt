import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalQuote } from "@/app/api/quote/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) => {
    return callInternalGet(internalQuote, req, ["symbol"]);
  },
  { endpoint: "/v1/quote" },
);

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
