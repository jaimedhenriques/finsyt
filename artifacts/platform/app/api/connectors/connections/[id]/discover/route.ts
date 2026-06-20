import { NextRequest, NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";
import {
  connectionOperationsTable,
  withOrgContext,
  auditLog,
} from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { loadConnection, recordEvent } from "@/lib/connectors/accessor";
import { authHeadersFromCreds, listTools } from "@/lib/connectors/mcp-client";
import { requireConnectorAdmin } from "@/lib/connectors/permissions";

export const runtime = "nodejs";

/**
 * POST /api/connectors/connections/:id/discover
 *
 * Only valid for `kind=mcp` connections. Calls `tools/list` against the
 * configured MCP server and upserts the discovered tools into
 * `connection_operations` so the executor / agent can call them.
 *
 * Existing operations with the same name are kept (description updated);
 * tools that no longer exist on the server are not deleted, just disabled.
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

  const loaded = await loadConnection(localOrgId, id, {
    withCredentials: true,
    withOperations: true,
    actorId: userId,
  });
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (loaded.connection.kind !== "mcp") {
    return NextResponse.json({ error: "Discovery is only supported for MCP connections" }, { status: 400 });
  }

  const t0 = Date.now();
  let tools;
  try {
    const headers = authHeadersFromCreds(loaded.connection.authType, loaded.credentials || {});
    tools = await listTools({ url: loaded.connection.mcpUrl, authHeaders: headers, timeoutMs: 15_000 });
  } catch (err) {
    const detail = (err as Error).message;
    void recordEvent({
      orgId: localOrgId,
      connectionId: id,
      kind: "discover",
      actorId: userId,
      latencyMs: Date.now() - t0,
      error: detail,
    });
    return NextResponse.json({ error: "Discovery failed", detail }, { status: 502 });
  }

  const existing = new Map(loaded.operations.map((o) => [o.name, o]));
  const presentNames = tools.map((t) => t.name);
  const inserted: string[] = [];
  const updated: string[] = [];
  const disabled: string[] = [];

  await withOrgContext(localOrgId, async (tx) => {
    for (const tool of tools) {
      const ex = existing.get(tool.name);
      if (ex) {
        await tx
          .update(connectionOperationsTable)
          .set({
            description: tool.description || ex.description,
            paramSchema: (tool.inputSchema || {}) as object,
            enabled: true,
          })
          .where(eq(connectionOperationsTable.id, ex.id));
        updated.push(tool.name);
      } else {
        await tx.insert(connectionOperationsTable).values({
          connectionId: id,
          name: tool.name,
          description: tool.description || "",
          method: "POST",
          path: tool.name, // For MCP, the path slot stores the tool name
          paramSchema: (tool.inputSchema || {}) as object,
          cacheTtlSeconds: 0,
        });
        inserted.push(tool.name);
      }
    }

    // Honour the doc contract: tools that no longer exist on the server
    // are not deleted, they're disabled. Keeps history (audit, params)
    // intact for any agent that referenced them, but stops them showing
    // up in tool inventories until/unless the upstream re-publishes them.
    if (presentNames.length > 0) {
      const stale = await tx
        .update(connectionOperationsTable)
        .set({ enabled: false })
        .where(
          and(
            eq(connectionOperationsTable.connectionId, id),
            notInArray(connectionOperationsTable.name, presentNames),
          ),
        )
        .returning({ name: connectionOperationsTable.name });
      disabled.push(...stale.map((r) => r.name));
    } else {
      // Server returned zero tools — disable everything we have for it.
      const stale = await tx
        .update(connectionOperationsTable)
        .set({ enabled: false })
        .where(eq(connectionOperationsTable.connectionId, id))
        .returning({ name: connectionOperationsTable.name });
      disabled.push(...stale.map((r) => r.name));
    }
  });

  await auditLog({
    orgId: localOrgId,
    actorId: userId,
    actorType: "user",
    action: "connector.mcp.discovered",
    resourceType: "connection",
    resourceId: id,
    metadata: { inserted: inserted.length, updated: updated.length, disabled: disabled.length, total: tools.length },
  });

  void recordEvent({
    orgId: localOrgId,
    connectionId: id,
    kind: "discover",
    actorId: userId,
    latencyMs: Date.now() - t0,
    status: 200,
    metadata: { inserted: inserted.length, updated: updated.length, disabled: disabled.length },
  });

  return NextResponse.json({
    ok: true,
    discovered: tools.length,
    inserted: inserted.length,
    updated: updated.length,
    disabled: disabled.length,
    tools: tools.map((t) => ({ name: t.name, description: t.description })),
  });
}
