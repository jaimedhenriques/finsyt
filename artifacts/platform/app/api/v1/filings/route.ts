import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalFilings } from "@/app/api/filings/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) => callInternalGet(internalFilings, req, ["symbol", "type", "limit"]),
  { endpoint: "/v1/filings" },
);

export async function OPTIONS(req: NextRequest) { return corsPreflight(req); }
