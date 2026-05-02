import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import {
  db,
  connectionsTable,
  connectorDefinitionsTable,
  connectionOperationsTable,
  withOrgContext,
} from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { findCatalogEntry } from "@/lib/connectors/catalog";
import { signSerialized } from "@/lib/connectors/crypto";
import { requireConnectorAdmin } from "@/lib/connectors/permissions";

export const runtime = "nodejs";

/**
 * GET /api/connectors/oauth/start?slug=google-calendar
 *
 * Starts an OAuth flow for the given catalog slug. If `connectionId` is
 * provided we re-use it (and ignore `slug`'s display name); otherwise we
 * pre-create a draft connection so the callback always has a row to update.
 *
 * The verifier and connection id are signed with HMAC-SHA256 (master key
 * shared with the credential encryptor) and stored in a short-lived
 * HTTP-only cookie. We do not persist state server-side — the signed cookie
 * + state-nonce check is enough to prevent CSRF and tampering.
 *
 * Required env per provider (e.g. for `google-calendar`):
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 */

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(req: NextRequest) {
  const guard = await requireConnectorAdmin();
  if (!guard.ok) return guard.response;
  const { userId, clerkOrgId: orgId } = guard.actor;

  const slug = req.nextUrl.searchParams.get("slug");
  let connectionId = req.nextUrl.searchParams.get("connectionId");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }
  const entry = findCatalogEntry(slug);
  if (!entry || !entry.oauth) {
    return NextResponse.json({ error: `OAuth not configured for catalog slug '${slug}'` }, { status: 404 });
  }
  const clientId = process.env[entry.oauth.clientIdEnv];
  if (!clientId) {
    return NextResponse.json(
      { error: `OAuth client id missing — set ${entry.oauth.clientIdEnv} in environment.` },
      { status: 500 },
    );
  }

  const localOrgId = await resolveLocalOrgId(orgId);

  // ── Pre-create a draft connection if the caller didn't supply one ─────────
  if (!connectionId) {
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
        set: { name: entry.name, baseUrl: entry.baseUrl, authType: entry.authType },
      })
      .returning({ id: connectorDefinitionsTable.id });

    const created = await withOrgContext(localOrgId, async (tx) => {
      const [conn] = await tx
        .insert(connectionsTable)
        .values({
          orgId: localOrgId,
          definitionId: def?.id ?? null,
          kind: "rest",
          status: "draft",
          displayName: entry.name,
          baseUrl: entry.baseUrl,
          mcpUrl: "",
          authType: entry.authType,
          category: entry.category,
          createdBy: userId,
        })
        .returning({ id: connectionsTable.id });
      const ops = entry.operationTemplates ?? [];
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
          })),
        );
      }
      return conn;
    });
    connectionId = created.id;
  }

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const stateNonce = base64url(randomBytes(16));

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const redirectUri = `${proto}://${host}/platform/api/connectors/oauth/callback`;

  const url = new URL(entry.oauth.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", entry.oauth.scopes);
  url.searchParams.set("state", stateNonce);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  if (entry.oauth.pkce) {
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }

  // HMAC-signed payload — tamper resistant. See `verifySerialized` in crypto.ts.
  const stateCookie = signSerialized({
    n: stateNonce,
    s: slug,
    c: connectionId,
    v: verifier,
    u: userId,
    o: orgId,
    r: redirectUri,
    iat: Math.floor(Date.now() / 1000),
  });

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("connector_oauth_state", stateCookie, {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return res;
}
