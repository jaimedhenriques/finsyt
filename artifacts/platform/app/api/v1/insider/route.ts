import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalInsider } from "@/app/api/insider/route";

export const runtime = "nodejs";

export const GET = withPublicApi(
  async (req) => callInternalGet(internalInsider, req, ["symbol", "limit", "type"]),
  { endpoint: "/v1/insider" },
);

export async function OPTIONS(req: NextRequest) { return corsPreflight(req); }
