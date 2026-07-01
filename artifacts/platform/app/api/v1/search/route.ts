import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalSearch } from "@/app/api/search/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) => callInternalGet(internalSearch, req, ["q", "limit"]),
  { endpoint: "/v1/search" },
);

export async function OPTIONS(req: NextRequest) { return corsPreflight(req); }
