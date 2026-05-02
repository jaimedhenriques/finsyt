import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalMacro } from "@/app/api/macro/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) =>
    callInternalGet(internalMacro, req, ["country", "indicator", "periods", "all"]),
  { endpoint: "/v1/macro" },
);

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
