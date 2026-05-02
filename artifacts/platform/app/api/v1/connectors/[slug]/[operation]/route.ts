import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, connectionsTable, connectorDefinitionsTable } from "@workspace/db";
import { withPublicApi, corsPreflight } from "@/lib/api-key-auth";
import { executeConnectionOperation } from "@/lib/connectors/executor";

export const runtime = "nodejs";

/**
 * Public unified API:
 *   POST /api/v1/connectors/<slug>/<operation>
 *   GET  /api/v1/connectors/<slug>/<operation>?param=…
 *
 * `slug` matches either:
 *   - `connections.id` (the workspace's connection UUID), or
 *   - a `connector_definitions.slug` that this workspace has connected
 *     (resolved via the connections.definition_id FK — never via baseUrl,
 *     which is mutable and not unique).
 *
 * Only connections with `status = 'active'` are eligible. Draft, disabled,
 * and revoked connections return 404 to keep the API stable & predictable.
 *
 * Auth: Finsyt API key (Bearer or X-API-Key). The key's org_id selects the
 * workspace whose connection will be invoked.
 */

function readParams(req: NextRequest, body: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    if (k === "api_key") continue; // never forward auth params upstream
    out[k] = v;
  }
  if (body) Object.assign(out, body);
  return out;
}

type Resolution =
  | { kind: "ok"; id: string }
  | { kind: "not_found" }
  | { kind: "ambiguous"; count: number }
  | { kind: "inactive"; status: string };

async function resolveConnectionId(orgId: string, slug: string): Promise<Resolution> {
  // 1) Direct connection UUID match — must belong to this org and be active.
  if (/^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f]{12}$/i.test(slug)) {
    const direct = await db
      .select({ id: connectionsTable.id, status: connectionsTable.status })
      .from(connectionsTable)
      .where(and(eq(connectionsTable.id, slug), eq(connectionsTable.orgId, orgId)))
      .limit(1);
    if (direct[0]) {
      if (direct[0].status !== "active") return { kind: "inactive", status: direct[0].status };
      return { kind: "ok", id: direct[0].id };
    }
    return { kind: "not_found" };
  }

  // 2) Catalog slug — JOIN connections.definition_id → connector_definitions.slug.
  //    This is the authoritative path. We never compare baseUrl, since multiple
  //    connections can legitimately share a base URL (e.g. two Stripe accounts)
  //    and admins can edit baseUrl after the fact.
  const rows = await db
    .select({ id: connectionsTable.id, status: connectionsTable.status })
    .from(connectionsTable)
    .innerJoin(
      connectorDefinitionsTable,
      eq(connectorDefinitionsTable.id, connectionsTable.definitionId),
    )
    .where(
      and(
        eq(connectionsTable.orgId, orgId),
        eq(connectorDefinitionsTable.slug, slug),
      ),
    );

  const active = rows.filter((r) => r.status === "active");
  if (active.length === 1) return { kind: "ok", id: active[0].id };
  if (active.length > 1) return { kind: "ambiguous", count: active.length };
  if (rows.length > 0) {
    // Connections exist for this slug but none are active.
    return { kind: "inactive", status: rows[0].status };
  }
  return { kind: "not_found" };
}

async function handle(req: NextRequest, ctx: { key: { orgId: string; authorUserId: string } }, slug: string, operation: string, body: Record<string, unknown> | null) {
  const resolved = await resolveConnectionId(ctx.key.orgId, slug);
  if (resolved.kind === "not_found") {
    return NextResponse.json(
      { error: `No connection found for slug '${slug}' in this workspace. Connect it first under /app/connectors.` },
      { status: 404 },
    );
  }
  if (resolved.kind === "inactive") {
    return NextResponse.json(
      { error: `Connection for '${slug}' exists but is not active (status='${resolved.status}'). Activate it under /app/connectors.` },
      { status: 409 },
    );
  }
  if (resolved.kind === "ambiguous") {
    return NextResponse.json(
      {
        error: `Slug '${slug}' matches ${resolved.count} active connections in this workspace. Call by connection id (UUID) instead, or remove the duplicates.`,
      },
      { status: 409 },
    );
  }
  const result = await executeConnectionOperation({
    orgId: ctx.key.orgId,
    connectionId: resolved.id,
    operation,
    params: readParams(req, body),
    actorId: ctx.key.authorUserId,
  });
  return NextResponse.json(
    { ok: result.ok, status: result.status, data: result.data, error: result.error, fromCache: !!result.fromCache, latencyMs: result.latencyMs },
    { status: result.ok ? 200 : (result.status >= 400 ? result.status : 502) },
  );
}

export const GET = withPublicApi(
  async (req, ctx) => {
    const { pathname } = req.nextUrl;
    const parts = pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 2];
    const operation = parts[parts.length - 1];
    return handle(req, ctx, slug, operation, null);
  },
  { endpoint: "/api/v1/connectors" },
);

export const POST = withPublicApi(
  async (req, ctx) => {
    const { pathname } = req.nextUrl;
    const parts = pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 2];
    const operation = parts[parts.length - 1];
    let body: Record<string, unknown> | null = null;
    try { body = await req.json(); } catch { /* empty */ }
    return handle(req, ctx, slug, operation, body);
  },
  { endpoint: "/api/v1/connectors", requireScope: "read" },
);

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
