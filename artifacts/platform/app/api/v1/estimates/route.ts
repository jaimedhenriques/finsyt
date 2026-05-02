import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalEstimates } from "@/app/api/estimates/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) => callInternalGet(internalEstimates, req, ["symbol"]),
  { endpoint: "/v1/estimates" },
);

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
