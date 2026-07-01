// Lightweight liveness probe for Replit autoscale's startup health check.
//
// Replit's startup probe requires HTTP 200 on the configured path before it
// will accept traffic. The platform's home route at "/" performs a server-
// side redirect to "/app" (HTTP 307), which the probe rejects, so we expose
// this minimal handler that returns 200 with no upstream dependencies.
//
// Do NOT add provider/database calls here — keep it dependency-free so a
// cold container can satisfy the probe within the autoscale boot budget.
// (For deep diagnostics, /api/health remains the rich endpoint.)

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return new Response("ok", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function HEAD() {
  return new Response(null, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
