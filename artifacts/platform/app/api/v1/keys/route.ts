import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { eq, and, isNull, desc } from "drizzle-orm";
import {
  db,
  apiKeysTable,
  auditLog,
  TIER_RATE_LIMITS,
  createApiKeySchema,
  type ApiKeyTier,
} from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { generateApiKey } from "@/lib/api-key-auth";

export const runtime = "nodejs";

function isAdminRole(orgRole: string | null | undefined): boolean {
  const r = (orgRole || "").replace(/^org:/, "");
  return r === "admin" || r === "owner";
}

// GET /api/v1/keys — list keys for the current workspace (no plaintext).
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active workspace" }, { status: 403 });

  const localOrgId = await resolveLocalOrgId(orgId);
  const rows = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      prefix: apiKeysTable.prefix,
      scope: apiKeysTable.scope,
      tier: apiKeysTable.tier,
      rateLimitPerMinute: apiKeysTable.rateLimitPerMinute,
      lastUsedAt: apiKeysTable.lastUsedAt,
      revokedAt: apiKeysTable.revokedAt,
      createdAt: apiKeysTable.createdAt,
      authorUserId: apiKeysTable.authorUserId,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.orgId, localOrgId))
    .orderBy(desc(apiKeysTable.createdAt));

  return NextResponse.json({ keys: rows });
}

// POST /api/v1/keys — create new key. Returns plaintext ONCE.
export async function POST(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active workspace" }, { status: 403 });
  if (!isAdminRole(orgRole)) {
    return NextResponse.json({ error: "Requires admin role" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = createApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", detail: parsed.error.flatten() }, { status: 400 });
  }

  const localOrgId = await resolveLocalOrgId(orgId);

  // Cap of 10 active keys per workspace
  const active = await db
    .select({ id: apiKeysTable.id })
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.orgId, localOrgId), isNull(apiKeysTable.revokedAt)));
  if (active.length >= 10) {
    return NextResponse.json({ error: "Maximum of 10 active API keys per workspace. Revoke an existing key first." }, { status: 400 });
  }

  const tier: ApiKeyTier = parsed.data.tier ?? "free";
  const { plaintext, prefix, hash } = generateApiKey();

  const [created] = await db
    .insert(apiKeysTable)
    .values({
      orgId: localOrgId,
      authorUserId: userId,
      name: parsed.data.name,
      prefix,
      keyHash: hash,
      scope: parsed.data.scope,
      tier,
      rateLimitPerMinute: TIER_RATE_LIMITS[tier],
    })
    .returning();

  await auditLog({
    orgId: localOrgId,
    actorId: userId,
    actorType: "user",
    action: "api.key.created",
    resourceType: "api_key",
    resourceId: created.id,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
    metadata: { name: created.name, scope: created.scope, tier: created.tier },
  });

  return NextResponse.json({
    id: created.id,
    name: created.name,
    prefix: created.prefix,
    scope: created.scope,
    tier: created.tier,
    rateLimitPerMinute: created.rateLimitPerMinute,
    createdAt: created.createdAt,
    plaintextKey: plaintext, // shown once, never again
  }, { status: 201 });
}
