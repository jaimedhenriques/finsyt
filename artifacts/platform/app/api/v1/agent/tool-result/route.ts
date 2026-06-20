import { NextRequest } from "next/server";
import { authenticateApiRequest, addCors, corsPreflight } from "@/lib/api-key-auth";
import { resolveOp, type ExcelOpResult } from "@/lib/excel-addin/op-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Round-trip endpoint for the Excel agentic build loop. The task pane POSTs
 * here after executing an `excel_op` (streamed from `/api/v1/agent/ask`) via
 * Office.js, handing the agent loop the real outcome so it can continue.
 *
 * Body: `{ id, ok, result?, error?, cancelled? }`
 *   - `id`      the opaque op id from the matching `excel_op` SSE frame
 *   - `ok`      whether the op succeeded client-side
 *   - `result`  payload for read ops (read_range / get_sheet_names / …)
 *   - `error`   error message when `ok` is false
 *   - `cancelled` the user declined the preview/approve card
 *
 * Auth: same bearer scheme as `/api/v1/agent/ask` (fsk_ key or fxa_ JWT).
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) {
    const res = new Response(JSON.stringify(auth.body), {
      status: auth.status,
      headers: { "content-type": "application/json", ...(auth.headers || {}) },
    });
    addCors(res, req);
    return res;
  }

  let body: {
    id?: string;
    ok?: boolean;
    result?: unknown;
    error?: string;
    cancelled?: boolean;
  } = {};
  try { body = await req.json(); } catch {/* ignore */}

  const id = (body.id || "").trim();
  if (!id) {
    const res = new Response(JSON.stringify({ error: "id required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    addCors(res, req);
    return res;
  }

  const outcome: ExcelOpResult = {
    ok: body.ok !== false && !body.cancelled,
    result: body.result,
    error: body.error,
    cancelled: body.cancelled === true,
  };

  const delivered = await resolveOp(id, outcome);

  const res = new Response(JSON.stringify({ ok: true, delivered }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  addCors(res, req);
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
