import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalNews } from "@/app/api/news/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) => callInternalGet(internalNews, req, ["symbol", "limit", "from", "to"]),
  { endpoint: "/v1/news" },
);

export async function OPTIONS(req: NextRequest) { return corsPreflight(req); }
