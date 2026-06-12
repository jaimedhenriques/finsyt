import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { eq, desc } from "drizzle-orm";
import {
  db,
  connectionsTable,
  connectionOperationsTable,
  connectionCredentialsTable,
  connectorDefinitionsTable,
  createConnectionSchema,
  withOrgContext,
  auditLog,
  CONNECTION_KINDS,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { findCatalogEntry } from "@/lib/connectors/catalog";
import { encryptCredentials } from "@/lib/connectors/crypto";
import { requireConnectorAdmin } from "@/lib/connectors/permissions";
import { assertSafeUrlSync, UrlSafetyError } from "@/lib/connectors/url-safety";
import { mergeCredentialDefaults, runValidationCall } from "@/lib/connectors/validation";

export const runtime = "nodejs";

const MAX_CONNECTIONS_PER_ORG = 50;

/** GET /api/connectors/connections — list workspace connections (no creds). */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active workspace" }, { status: 403 });

  const localOrgId = await resolveLocalOrgId(orgId);
  // Join with `connector_definitions` so we can hand the UI the catalog slug
  // for each connection. The slug lets the client resolve `isPremium` (and
  // any other catalog-only metadata) without a second roundtrip — important
  // because the rate-limit usage badge is only shown for premium tiles.
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx
      .select({
        id: connectionsTable.id,
        definitionId: connectionsTable.definitionId,
        definitionSlug: connectorDefinitionsTable.slug,
        kind: connectionsTable.kind,
        status: connectionsTable.status,
        displayName: connectionsTable.displayName,
        baseUrl: connectionsTable.baseUrl,
        mcpUrl: connectionsTable.mcpUrl,
        authType: connectionsTable.authType,
        category: connectionsTable.category,
        createdBy: connectionsTable.createdBy,
        lastTestAt: connectionsTable.lastTestAt,
        lastTestOk: connectionsTable.lastTestOk,
        lastTestError: connectionsTable.lastTestError,
        quotaRemaining: connectionsTable.quotaRemaining,
        quotaLimit: connectionsTable.quotaLimit,
        quotaResetAt: connectionsTable.quotaResetAt,
        quotaUpdatedAt: connectionsTable.quotaUpdatedAt,
        createdAt: connectionsTable.createdAt,
        updatedAt: connectionsTable.updatedAt,
      })
      .from(connectionsTable)
      .leftJoin(
        connectorDefinitionsTable,
        eq(connectorDefinitionsTable.id, connectionsTable.definitionId),
      )
      .where(eq(connectionsTable.orgId, localOrgId))
      .orderBy(desc(connectionsTable.createdAt)),
  );

  // Resolve `isPremium` server-side from the in-process catalog manifest so
  // the client doesn't have to know which slugs are premium. New premium
  // entries automatically get the badge without a UI release.
  const connections = rows.map((r) => {
    const slug = r.definitionSlug;
    const isPremium = slug ? !!findCatalogEntry(slug)?.isPremium : false;
    return { ...r, isPremium };
  });

  return NextResponse.json({ connections });
}

/** POST /api/connectors/connections — create a new connection (catalog or custom). Admin-only. */
export async function POST(req: NextRequest) {
  const guard = await requireConnectorAdmin();
  if (!guard.ok) return guard.response;
  const { userId, clerkOrgId: orgId } = guard.actor;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = createConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", detail: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  if (!CONNECTION_KINDS.includes(input.kind)) {
    return NextResponse.json({ error: `Invalid kind '${input.kind}'` }, { status: 400 });
  }

  const localOrgId = await resolveLocalOrgId(orgId);

  // Enforce per-org cap
  const existing = await db
    .select({ id: connectionsTable.id })
    .from(connectionsTable)
    .where(eq(connectionsTable.orgId, localOrgId));
  if (existing.length >= MAX_CONNECTIONS_PER_ORG) {
    return NextResponse.json(
      { error: `Maximum of ${MAX_CONNECTIONS_PER_ORG} connections per workspace.` },
      { status: 400 },
    );
  }

  // Resolve catalog defaults if a definitionSlug was provided
  let definitionId: string | null = null;
  let baseUrl = input.baseUrl || "";
  let category = input.category || "custom";
  let authType = input.authType;
  const mcpUrl = input.mcpUrl || "";
  let displayName = input.displayName;

  if (input.definitionSlug) {
    const entry = findCatalogEntry(input.definitionSlug);
    if (!entry) return NextResponse.json({ error: `Unknown catalog slug '${input.definitionSlug}'` }, { status: 404 });
    baseUrl = baseUrl || entry.baseUrl;
    category = category === "custom" ? entry.category : category;
    if (!input.authType || input.authType === "none") authType = entry.authType;
    if (!displayName) displayName = entry.name;

    // Merge catalog-supplied credential defaults (e.g. CapIQ's `header_name`,
    // Refinitiv's `app_key_header`) into the user-supplied bag. These are
    // server-only — never round-tripped through the catalog API — so users
    // do not have to know provider-specific header names. User-supplied
    // values always win.
    if (entry.credentialDefaults && Object.keys(entry.credentialDefaults).length > 0) {
      input.credentials = mergeCredentialDefaults(entry.credentialDefaults, input.credentials);
    }
    // Lazy-upsert the catalog definition so `connections.definition_id`
    // actually links to a row. The seeder may run later but we should not
    // require it to have run before the first connect.
    const [def] = await db
      .insert(connectorDefinitionsTable)
      .values({
        slug: entry.slug,
        name: entry.name,
        category: entry.category,
        description: entry.description,
        authType: entry.authType,
        baseUrl: entry.baseUrl,
        docUrl: entry.docUrl,
        isFirstParty: entry.isFirstParty ?? false,
        operationTemplates: (entry.operationTemplates ?? []) as unknown as object,
        oauthConfig: (entry.oauth ?? null) as unknown as object,
      })
      .onConflictDoUpdate({
        target: connectorDefinitionsTable.slug,
        set: {
          name: entry.name,
          category: entry.category,
          description: entry.description,
          authType: entry.authType,
          baseUrl: entry.baseUrl,
          docUrl: entry.docUrl,
          isFirstParty: entry.isFirstParty ?? false,
          operationTemplates: (entry.operationTemplates ?? []) as unknown as object,
          oauthConfig: (entry.oauth ?? null) as unknown as object,
        },
      })
      .returning({ id: connectorDefinitionsTable.id });
    definitionId = def?.id ?? null;
  }

  if (input.kind === "rest" && !baseUrl) {
    return NextResponse.json({ error: "REST connections require a baseUrl" }, { status: 400 });
  }
  if (input.kind === "mcp" && !mcpUrl) {
    return NextResponse.json({ error: "MCP connections require an mcpUrl" }, { status: 400 });
  }

  // SSRF check at create time — fail fast on obviously bad URLs (the
  // executor will re-validate against DNS at every call).
  try {
    if (input.kind === "rest") assertSafeUrlSync(baseUrl, "rest");
    if (input.kind === "mcp") assertSafeUrlSync(mcpUrl, "mcp");
  } catch (err) {
    const detail = err instanceof UrlSafetyError ? err.message : (err as Error).message;
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  const created = await withOrgContext(localOrgId, async (tx) => {
    const [conn] = await tx
      .insert(connectionsTable)
      .values({
        orgId: localOrgId,
        definitionId,
        kind: input.kind,
        status: input.credentials || authType === "none" ? "active" : "draft",
        displayName,
        baseUrl,
        mcpUrl,
        authType,
        category,
        createdBy: userId,
      })
      .returning();

    if (input.credentials && Object.keys(input.credentials).length > 0) {
      const enc = encryptCredentials(input.credentials);
      await tx.insert(connectionCredentialsTable).values({
        connectionId: conn.id,
        keyId: enc.keyId,
        payload: enc.payload,
      });
    }

    // Seed operation templates from the catalog entry
    if (input.definitionSlug) {
      const entry = findCatalogEntry(input.definitionSlug);
      const ops = entry?.operationTemplates || [];
      if (ops.length) {
        await tx.insert(connectionOperationsTable).values(
          ops.map((o) => ({
            connectionId: conn.id,
            name: o.name,
            description: o.description,
            method: o.method,
            path: o.path,
            paramSchema: o.paramSchema as unknown as object,
            cacheTtlSeconds: o.cacheTtlSeconds ?? 60,
            // `hidden: true` keeps the row callable by the executor (for
            // credential-validation probes like Apify's users_me) while
            // suppressing it from the agent / MCP tool registry — so the
            // user sees exactly the actor operations, not the probe.
            hidden: o.hidden === true,
          })),
        );
      }
    }

    return conn;
  });

  await auditLog({
    orgId: localOrgId,
    actorId: userId,
    actorType: "user",
    action: "connector.connection.created",
    resourceType: "connection",
    resourceId: created.id,
    metadata: { displayName: created.displayName, kind: created.kind, authType: created.authType },
  });

  // ── Inline credential validation ────────────────────────────────────────
  // For premium / catalog connectors that ship a `validateOperation`, run it
  // immediately so the user gets a clear "credentials accepted" / "got 401"
  // signal on the very same POST instead of having to navigate to the test
  // button. The connection is kept either way so the user can fix the creds
  // without having to re-enter the connector metadata.
  let validation:
    | { ok: boolean; status: number; detail: string; error?: string; latencyMs: number }
    | null = null;
  if (input.definitionSlug && input.credentials && Object.keys(input.credentials).length > 0) {
    const entry = findCatalogEntry(input.definitionSlug);
    if (entry?.validateOperation) {
      // Use the catalog-declared stub params so the upstream cannot fail
      // with "missing required parameter" — that lets us trust 401/403 as
      // a real credential signal rather than a path-substitution artefact.
      // Pass the catalog entry so any per-connector `validationMessages`
      // (e.g. Apify's "Invalid Apify token" / "Connected as <username>")
      // shape the friendly copy returned to the modal.
      const outcome = await runValidationCall({
        orgId: localOrgId,
        connectionId: created.id,
        operation: entry.validateOperation,
        actorId: userId,
        params: entry.validateParams ?? {},
        catalogEntry: entry,
      });
      validation = {
        ok: outcome.ok,
        status: outcome.status,
        detail: outcome.detail,
        error: outcome.error,
        latencyMs: outcome.latencyMs,
      };

      const nextStatus = outcome.ok ? "active" : "error";
      await db
        .update(connectionsTable)
        .set({
          status: nextStatus,
          lastTestAt: sql`now()`,
          lastTestOk: outcome.ok,
          lastTestError: outcome.ok
            ? null
            : (outcome.error || `HTTP ${outcome.status}`).slice(0, 500),
          updatedAt: sql`now()`,
        })
        .where(eq(connectionsTable.id, created.id));
      created.status = nextStatus;
    }
  }

  return NextResponse.json({
    id: created.id,
    displayName: created.displayName,
    kind: created.kind,
    status: created.status,
    baseUrl: created.baseUrl,
    mcpUrl: created.mcpUrl,
    authType: created.authType,
    category: created.category,
    createdAt: created.createdAt,
    validation,
  }, { status: 201 });
}
