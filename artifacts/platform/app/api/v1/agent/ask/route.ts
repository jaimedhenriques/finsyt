import { NextRequest } from "next/server";
import { authenticateApiRequest, addCors, corsPreflight } from "@/lib/api-key-auth";
import { runAgent, OPENAI_KEY } from "@/lib/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public bearer-auth agent endpoint used by the Excel add-in copilot and
 * external callers. Streams the same SSE events as `/api/agent/ask`, plus an
 * extra `event: action` frame whenever the model wants the client to write to
 * the workbook (insert_formula / write_range / insert_template).
 *
 * Auth: `Authorization: Bearer <fsk_… key | fxa_… add-in JWT>`.
 *       The header `X-Finsyt-Surface: excel` opts the model into Excel-aware
 *       behaviour; everything else gets the standard platform agent.
 */

export async function POST(req: NextRequest) {
  if (!OPENAI_KEY) {
    const res = new Response(
      JSON.stringify({ error: "OpenAI integration not configured" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
    addCors(res, req);
    return res;
  }

  const auth = await authenticateApiRequest(req);
  if (!auth.ok) {
    const res = new Response(JSON.stringify(auth.body), {
      status: auth.status,
      headers: { "content-type": "application/json", ...(auth.headers || {}) },
    });
    addCors(res, req);
    return res;
  }

  let body: { question?: string; context?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch {/* ignore */}
  const question = (body.question || "").trim();
  if (!question) {
    const res = new Response(JSON.stringify({ error: "question required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    addCors(res, req);
    return res;
  }

  const surfaceHeader = (req.headers.get("x-finsyt-surface") || "").toLowerCase();
  const surface: "excel" | "platform" = surfaceHeader === "excel" ? "excel" : "platform";

  let contextPreface = "";
  if (body.context && typeof body.context === "object") {
    try {
      const ctx = JSON.stringify(body.context);
      if (ctx && ctx !== "{}") {
        contextPreface =
          surface === "excel"
            ? `Spreadsheet context (JSON; selection / sheet / nearby values): ${ctx}\n\n`
            : `User is currently viewing this page state (JSON): ${ctx}\n\n`;
      }
    } catch {/* ignore */}
  }

  const baseUrl = req.nextUrl.origin;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {/* closed */}
      };
      try {
        // Bearer caller (fsk_ API key or fxa_ add-in JWT): inner tools
        // hit `/api/v1/*` and forward the same Authorization header so
        // `withPublicApi` can re-authenticate the call.
        const authHdr = req.headers.get("authorization");
        await runAgent({
          question,
          baseUrl,
          contextPreface,
          surface,
          signal: req.signal,
          send,
          dataRoutePrefix: "/api/v1",
          forwardHeaders: authHdr ? { authorization: authHdr } : undefined,
        });
      } catch (e) {
        send("error", { message: (e as Error)?.message || String(e) });
      } finally {
        try { controller.close(); } catch {/* already closed */}
      }
    },
  });

  const res = new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
  addCors(res, req);
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
