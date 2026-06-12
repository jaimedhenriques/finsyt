import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { eq, and } from "drizzle-orm";
import { db, apiKeysTable, auditLog } from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { evictApiKeyFromCache } from "@/lib/api-key-auth";

export const runtime = "nodejs";

function isAdminRole(orgRole: string | null | undefined): boolean {
  const r = (orgRole || "").replace(/^org:/, "");
  return r === "admin" || r === "owner";
}

// DELETE /api/v1/keys/[id] — revoke a key (soft delete)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active workspace" }, { status: 403 });
  if (!isAdminRole(orgRole)) return NextResponse.json({ error: "Requires admin role" }, { status: 403 });

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: "Invalid key id" }, { status: 400 });
  }
  const localOrgId = await resolveLocalOrgId(orgId);

  const [updated] = await db
    .update(apiKeysTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.orgId, localOrgId)))
    .returning({ id: apiKeysTable.id, name: apiKeysTable.name });

  if (!updated) return NextResponse.json({ error: "Key not found" }, { status: 404 });

  evictApiKeyFromCache(updated.id);

  await auditLog({
    orgId: localOrgId,
    actorId: userId,
    actorType: "user",
    action: "api.key.revoked",
    resourceType: "api_key",
    resourceId: updated.id,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
    metadata: { name: updated.name },
  });

  return NextResponse.json({ ok: true });
}
