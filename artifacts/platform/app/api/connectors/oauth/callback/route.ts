import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  connectionsTable,
  connectionCredentialsTable,
  withOrgContext,
  auditLog,
} from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { findCatalogEntry } from "@/lib/connectors/catalog";
import { encryptCredentials, verifySerialized } from "@/lib/connectors/crypto";

export const runtime = "nodejs";

/**
 * GET /api/connectors/oauth/callback?code=…&state=…
 *
 * Exchanges the authorization code for an access/refresh token pair, stores
 * them encrypted on the connection, and bounces the user back to the hub.
 *
 * Reads the verifier + connectionId from the `connector_oauth_state` cookie
 * planted by the `/start` route.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");
  const cookie = req.cookies.get("connector_oauth_state")?.value;

  const back = (msg: string, ok = false) => {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const url = new URL(`${proto}://${host}/platform/app/connectors`);
    url.searchParams.set(ok ? "oauth" : "oauth_error", ok ? "ok" : msg);
    const res = NextResponse.redirect(url.toString());
    res.cookies.delete("connector_oauth_state");
    return res;
  };

  if (!code || !stateParam || !cookie) return back("missing_params");

  const parsed = verifySerialized<{
    n: string; s: string; c: string; v: string; u: string; o: string; r: string; iat: number;
  }>(cookie);
  if (!parsed) return back("bad_state_cookie");
  if (parsed.n !== stateParam) return back("state_mismatch");
  // Reject cookies older than 10 minutes (cookie maxAge is 5 min, this is a
  // belt-and-braces check against clock skew).
  if (parsed.iat && Math.floor(Date.now() / 1000) - parsed.iat > 600) return back("state_expired");

  const entry = findCatalogEntry(parsed.s);
  if (!entry || !entry.oauth) return back("unknown_provider");

  const clientId = process.env[entry.oauth.clientIdEnv];
  const clientSecret = process.env[entry.oauth.clientSecretEnv];
  if (!clientId || !clientSecret) return back("missing_oauth_env");

  // ── Token exchange ────────────────────────────────────────────────────────
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: parsed.r,
  });
  if (entry.oauth.pkce) tokenBody.set("code_verifier", parsed.v);

  let tokenJson: Record<string, unknown>;
  try {
    const res = await fetch(entry.oauth.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: tokenBody.toString(),
    });
    const text = await res.text();
    try { tokenJson = JSON.parse(text); } catch { tokenJson = { raw: text }; }
    if (!res.ok) return back(`token_exchange_${res.status}`);
  } catch {
    return back("token_exchange_failed");
  }

  const accessToken = (tokenJson.access_token as string) || "";
  const refreshToken = (tokenJson.refresh_token as string) || "";
  const expiresIn = (tokenJson.expires_in as number) || 0;
  if (!accessToken) return back("no_access_token");

  // ── Persist credentials ───────────────────────────────────────────────────
  const localOrgId = await resolveLocalOrgId(parsed.o);
  const enc = encryptCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: (tokenJson.token_type as string) || "Bearer",
    expires_at: expiresIn ? String(Math.floor(Date.now() / 1000) + expiresIn) : "",
  });

  // ── Tenant ownership check FIRST, then credential write ──────────────────
  // We must confirm the cookie's `connectionId` actually belongs to this
  // org BEFORE touching `connection_credentials`. Otherwise an attacker who
  // gets a stale/forged-but-signature-valid cookie pointing at another
  // tenant's connection id could overwrite their secrets through this path.
  // The signed cookie protects against tampering, but a compromised account
  // with API access could still mint a state for someone else's id, so we
  // verify in-DB ownership too.
  const updated = await withOrgContext(localOrgId, async (tx) => {
    const [owns] = await tx
      .select({ id: connectionsTable.id })
      .from(connectionsTable)
      .where(and(eq(connectionsTable.id, parsed.c), eq(connectionsTable.orgId, localOrgId)))
      .limit(1);
    if (!owns) return null;

    await tx
      .delete(connectionCredentialsTable)
      .where(eq(connectionCredentialsTable.connectionId, parsed.c));
    await tx.insert(connectionCredentialsTable).values({
      connectionId: parsed.c,
      keyId: enc.keyId,
      payload: enc.payload,
    });
    const [row] = await tx
      .update(connectionsTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(connectionsTable.id, parsed.c), eq(connectionsTable.orgId, localOrgId)))
      .returning({ id: connectionsTable.id });
    return row;
  });
  if (!updated) return back("connection_not_found");

  await auditLog({
    orgId: localOrgId,
    actorId: parsed.u,
    actorType: "user",
    action: "connector.oauth.completed",
    resourceType: "connection",
    resourceId: parsed.c,
    metadata: { provider: parsed.s },
  });

  return back("ok", true);
}
