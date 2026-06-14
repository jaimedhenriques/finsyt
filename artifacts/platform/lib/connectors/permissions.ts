/**
 * Connector Hub authorization
 * ───────────────────────────
 * The Connector Hub follows the same role model as Team management:
 *   - admin / owner  → can create / update / delete connections, manage
 *                      operations, run discovery and OAuth flows.
 *   - member         → read-only on the catalog and on their own
 *                      workspace's connection list, can invoke connections
 *                      via the agent / public API (calling is gated by
 *                      the API-key/agent surface, not by this helper).
 *
 * Helpers return either `null` (caller may proceed) or a `NextResponse`
 * the route should return immediately. Centralising the check guarantees
 * every mutation endpoint is gated identically.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";

export interface ConnectorActor {
  userId: string;
  clerkOrgId: string;
  orgRole: string | null;
  isAdmin: boolean;
}

function normaliseRole(orgRole: string | null | undefined): string {
  return (orgRole || "").replace(/^org:/, "").toLowerCase();
}

export function isConnectorAdmin(orgRole: string | null | undefined): boolean {
  const r = normaliseRole(orgRole);
  return r === "admin" || r === "owner";
}

/**
 * Resolve the current actor or return a 401/403 response. Callers that need
 * mutation rights should instead use {@link requireConnectorAdmin}.
 */
export async function requireConnectorActor(): Promise<
  { ok: true; actor: ConnectorActor } | { ok: false; response: NextResponse }
> {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No active workspace" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    actor: {
      userId,
      clerkOrgId: orgId,
      orgRole: orgRole ?? null,
      isAdmin: isConnectorAdmin(orgRole),
    },
  };
}

/**
 * Identical to {@link requireConnectorActor} but additionally rejects
 * non-admin callers with a 403. Use on every mutation endpoint
 * (POST/PATCH/DELETE) and on OAuth start/callback.
 */
export async function requireConnectorAdmin(): Promise<
  { ok: true; actor: ConnectorActor } | { ok: false; response: NextResponse }
> {
  const result = await requireConnectorActor();
  if (!result.ok) return result;
  if (!result.actor.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Requires admin role to manage connections" },
        { status: 403 },
      ),
    };
  }
  return result;
}
