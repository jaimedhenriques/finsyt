import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  connectionsTable,
  connectionCredentialsTable,
  withOrgContext,
  auditLog,
  AUTH_TYPES,
  CONNECTION_STATUSES,
} from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { encryptCredentials } from "@/lib/connectors/crypto";
import { requireConnectorAdmin } from "@/lib/connectors/permissions";

export const runtime = "nodejs";

/** PATCH /api/connectors/connections/:id — update display name, status, creds. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireConnectorAdmin();
  if (!guard.ok) return guard.response;
  const { userId, clerkOrgId: orgId } = guard.actor;

  const { id } = await params;
  const localOrgId = await resolveLocalOrgId(orgId);

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* empty patch */ }

  const updates: Record<string, unknown> = {};
  if (typeof body.displayName === "string" && body.displayName.length) updates.displayName = body.displayName;
  if (typeof body.baseUrl === "string") updates.baseUrl = body.baseUrl;
  if (typeof body.mcpUrl === "string") updates.mcpUrl = body.mcpUrl;
  if (typeof body.category === "string") updates.category = body.category;
  if (typeof body.status === "string" && (CONNECTION_STATUSES as readonly string[]).includes(body.status)) {
    updates.status = body.status;
  }
  if (typeof body.authType === "string" && (AUTH_TYPES as readonly string[]).includes(body.authType)) {
    updates.authType = body.authType;
  }
  updates.updatedAt = new Date();

  const credsRaw = body.credentials;
  const newCreds: Record<string, string> | null =
    credsRaw && typeof credsRaw === "object" && !Array.isArray(credsRaw)
      ? Object.fromEntries(
          Object.entries(credsRaw as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        )
      : null;

  const updated = await withOrgContext(localOrgId, async (tx) => {
    const [row] = await tx
      .update(connectionsTable)
      .set(updates)
      .where(and(eq(connectionsTable.id, id), eq(connectionsTable.orgId, localOrgId)))
      .returning();
    if (!row) return null;

    if (newCreds && Object.keys(newCreds).length > 0) {
      const enc = encryptCredentials(newCreds);
      // Upsert: delete then insert (uniq index on connection_id)
      await tx.delete(connectionCredentialsTable).where(eq(connectionCredentialsTable.connectionId, row.id));
      await tx.insert(connectionCredentialsTable).values({
        connectionId: row.id,
        keyId: enc.keyId,
        payload: enc.payload,
      });
    }
    return row;
  });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await auditLog({
    orgId: localOrgId,
    actorId: userId,
    actorType: "user",
    action: "connector.connection.updated",
    resourceType: "connection",
    resourceId: updated.id,
    metadata: { fields: Object.keys(updates), credsRotated: !!newCreds },
  });

  return NextResponse.json({
    id: updated.id,
    displayName: updated.displayName,
    status: updated.status,
    baseUrl: updated.baseUrl,
    mcpUrl: updated.mcpUrl,
    authType: updated.authType,
    category: updated.category,
    updatedAt: updated.updatedAt,
  });
}

/** DELETE /api/connectors/connections/:id — hard delete (cascades). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireConnectorAdmin();
  if (!guard.ok) return guard.response;
  const { userId, clerkOrgId: orgId } = guard.actor;

  const { id } = await params;
  const localOrgId = await resolveLocalOrgId(orgId);

  const deleted = await withOrgContext(localOrgId, async (tx) => {
    const [row] = await tx
      .delete(connectionsTable)
      .where(and(eq(connectionsTable.id, id), eq(connectionsTable.orgId, localOrgId)))
      .returning({ id: connectionsTable.id, displayName: connectionsTable.displayName });
    return row;
  });
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await auditLog({
    orgId: localOrgId,
    actorId: userId,
    actorType: "user",
    action: "connector.connection.deleted",
    resourceType: "connection",
    resourceId: deleted.id,
    metadata: { displayName: deleted.displayName },
  });
  return NextResponse.json({ ok: true });
}
