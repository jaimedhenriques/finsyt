import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { connectionsTable, connectorDefinitionsTable, db, withOrgContext } from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { loadConnection, recordEvent } from "@/lib/connectors/accessor";
import { findCatalogEntry } from "@/lib/connectors/catalog";
import { authHeadersFromCreds, initialize as mcpInitialize } from "@/lib/connectors/mcp-client";
import { requireConnectorAdmin } from "@/lib/connectors/permissions";
import { assertSafeUrl, UrlSafetyError } from "@/lib/connectors/url-safety";
import { runValidationCall, selectTestStrategy } from "@/lib/connectors/validation";

export const runtime = "nodejs";

/**
 * POST /api/connectors/connections/:id/test
 *
 * Sanity-check the connection by either:
 *   - REST: HEAD or GET against the configured base URL
 *   - MCP : `initialize` JSON-RPC call against the configured mcpUrl
 *
 * Updates the lastTest{At,Ok,Error} columns and writes a `kind=test` audit event.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireConnectorAdmin();
  if (!guard.ok) return guard.response;
  const { userId, clerkOrgId: orgId } = guard.actor;

  const { id } = await params;
  const localOrgId = await resolveLocalOrgId(orgId);

  const loaded = await loadConnection(localOrgId, id, { withCredentials: true, actorId: userId });
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve the catalog entry for this connection (if any) so we can prefer
  // a connector-specific lightweight read over a blunt base-URL ping. Premium
  // connectors (FactSet, CapIQ, …) deliberately reject unauthenticated GETs
  // to their root, so a base-URL ping would always look "reachable" but tell
  // the user nothing about whether their credentials are accepted.
  let catalogEntry: ReturnType<typeof findCatalogEntry> = null;
  if (loaded.connection.definitionId) {
    const defs = await db
      .select({ slug: connectorDefinitionsTable.slug })
      .from(connectorDefinitionsTable)
      .where(eq(connectorDefinitionsTable.id, loaded.connection.definitionId))
      .limit(1);
    if (defs[0]?.slug) catalogEntry = findCatalogEntry(defs[0].slug);
  }

  const t0 = Date.now();
  let ok = false;
  let detail = "";
  let status = 0;
  // Surface the upstream's rate-limit headers (when the validate call went
  // through the executor) so the UI can seed the "X / Y remaining" badge
  // immediately after a successful Test, instead of waiting for the next
  // call to populate it.
  let quota: { remaining: number | null; limit: number | null; resetAt: string | null } | null = null;

  // Pick the lightest credential-meaningful probe for this connection.
  // Premium catalog tiles always hit the `validate` branch because their
  // root URLs deliberately reject unauthenticated GETs — a base-URL ping
  // there would always look "reachable" but tell the operator nothing
  // about whether their credentials are accepted.
  const strategy = selectTestStrategy(loaded.connection, catalogEntry);

  try {
    if (strategy.kind === "mcp") {
      // SSRF check first — mcp-client also validates, but a clearer error
      // here than a generic "rpc failed" is helpful to the operator.
      await assertSafeUrl(loaded.connection.mcpUrl, "mcp");
      const headers = authHeadersFromCreds(loaded.connection.authType, loaded.credentials || {});
      await mcpInitialize({ url: loaded.connection.mcpUrl, authHeaders: headers, timeoutMs: 10_000 });
      ok = true;
      status = 200;
      detail = "MCP initialize succeeded";
    } else if (strategy.kind === "validate") {
      // Run the catalog-declared validation operation. This goes through the
      // same executor / SSRF / rate-limit / audit pipeline as a normal call
      // so the test reflects real production behaviour. The helper bypasses
      // the cache so a recently-cached success cannot mask a now-revoked
      // credential, and feeds in catalog-supplied stub params so the call
      // probes credentials rather than request-shape.
      const outcome = await runValidationCall({
        orgId: localOrgId,
        connectionId: id,
        operation: strategy.operation,
        actorId: userId,
        params: strategy.params,
      });
      ok = outcome.ok;
      status = outcome.status;
      detail = outcome.detail;
      if (
        outcome.rateLimitRemaining != null ||
        outcome.rateLimitLimit != null ||
        outcome.rateLimitReset != null
      ) {
        quota = {
          remaining: outcome.rateLimitRemaining ?? null,
          limit:     outcome.rateLimitLimit     ?? null,
          resetAt:   outcome.rateLimitReset     ?? null,
        };
      }
    } else {
      const url = loaded.connection.baseUrl;
      if (!url) throw new Error("No base URL configured");
      // SSRF check — must run before fetch, otherwise an org admin can
      // probe internal hosts via this endpoint even though executor.ts
      // is gated.
      await assertSafeUrl(url, "rest");
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(url, { method: "GET", signal: ctrl.signal }).finally(() => clearTimeout(t));
      status = res.status;
      // Most APIs return 200/401/403 on a base hit. We treat anything that
      // isn't a network failure or 5xx as "the host is reachable".
      ok = res.status > 0 && res.status < 500;
      detail = ok ? `Reachable (HTTP ${res.status})` : `Upstream returned ${res.status}`;
    }
  } catch (err) {
    ok = false;
    if (err instanceof UrlSafetyError) {
      status = 400;
      detail = err.message;
    } else {
      detail = `Test failed: ${(err as Error).message}`;
    }
  }

  const latency = Date.now() - t0;

  await withOrgContext(localOrgId, (tx) =>
    tx
      .update(connectionsTable)
      .set({
        lastTestAt: new Date(),
        lastTestOk: ok,
        lastTestError: ok ? null : detail,
        status: ok ? "active" : "error",
        updatedAt: new Date(),
      })
      .where(and(eq(connectionsTable.id, id), eq(connectionsTable.orgId, localOrgId))),
  );

  void recordEvent({
    orgId: localOrgId,
    connectionId: id,
    kind: "test",
    actorId: userId,
    latencyMs: latency,
    status,
    error: ok ? null : detail,
  });

  return NextResponse.json({ ok, status, detail, latencyMs: latency, quota });
}
