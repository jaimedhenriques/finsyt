import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  connectionsTable,
  connectionOperationsTable,
  withOrgContext,
  createOperationSchema,
  auditLog,
} from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { requireConnectorActor, requireConnectorAdmin } from "@/lib/connectors/permissions";

export const runtime = "nodejs";

/** GET /api/connectors/connections/:id/operations */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Members can read the operation list — they need it to use the connection.
  const guard = await requireConnectorActor();
  if (!guard.ok) return guard.response;
  const { clerkOrgId: orgId } = guard.actor;

  const { id } = await params;
  const localOrgId = await resolveLocalOrgId(orgId);

  const ops = await withOrgContext(localOrgId, async (tx) => {
    const conn = await tx
      .select({ id: connectionsTable.id })
      .from(connectionsTable)
      .where(and(eq(connectionsTable.id, id), eq(connectionsTable.orgId, localOrgId)))
      .limit(1);
    if (!conn.length) return null;
    return tx
      .select()
      .from(connectionOperationsTable)
      .where(
        and(
          eq(connectionOperationsTable.connectionId, id),
          // Hide credential-validation probes (e.g. Apify's users_me) from
          // the user-facing operation list — they exist purely so the
          // executor can run them on connect/Test, not as discoverable ops.
          eq(connectionOperationsTable.hidden, false),
        ),
      );
  });

  if (ops === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ operations: ops });
}

/** POST /api/connectors/connections/:id/operations — add a custom op. Admin-only. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireConnectorAdmin();
  if (!guard.ok) return guard.response;
  const { userId, clerkOrgId: orgId } = guard.actor;

  const { id } = await params;
  const localOrgId = await resolveLocalOrgId(orgId);

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = createOperationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", detail: parsed.error.flatten() }, { status: 400 });
  }

  const created = await withOrgContext(localOrgId, async (tx) => {
    const conn = await tx
      .select({ id: connectionsTable.id })
      .from(connectionsTable)
      .where(and(eq(connectionsTable.id, id), eq(connectionsTable.orgId, localOrgId)))
      .limit(1);
    if (!conn.length) return null;
    const [row] = await tx
      .insert(connectionOperationsTable)
      .values({
        connectionId: id,
        name: parsed.data.name,
        description: parsed.data.description,
        method: parsed.data.method,
        path: parsed.data.path,
        paramSchema: parsed.data.paramSchema as unknown as object,
        cacheTtlSeconds: parsed.data.cacheTtlSeconds,
      })
      .returning();
    return row;
  });

  if (!created) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await auditLog({
    orgId: localOrgId,
    actorId: userId,
    actorType: "user",
    action: "connector.operation.created",
    resourceType: "connection_operation",
    resourceId: created.id,
    metadata: { connectionId: id, name: created.name, method: created.method },
  });

  return NextResponse.json({ operation: created }, { status: 201 });
}
