import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalTranscripts } from "@/app/api/transcripts/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) =>
    callInternalGet(internalTranscripts, req, ["symbol", "year", "quarter"]),
  { endpoint: "/v1/transcripts" },
);

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
