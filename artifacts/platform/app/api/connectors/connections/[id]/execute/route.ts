import { NextRequest, NextResponse } from "next/server";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { requireConnectorActor } from "@/lib/connectors/permissions";
import { executeConnectionOperation } from "@/lib/connectors/executor";

export const runtime = "nodejs";

/**
 * POST /api/connectors/connections/:id/execute
 *
 * Workspace-internal connector execution. Used by the in-app surfaces (the
 * company "From your connections" panel, the chat agent's tool-call loop,
 * etc.) so they can invoke an operation under the caller's Clerk session
 * without having to mint a public API key.
 *
 * Body: `{ operation: string, params?: Record<string, unknown>, bypassCache?: boolean }`
 *
 * Members can call. The audit + connection_events trail uses the caller's
 * userId so admins can see "Bob ran get_customer at 14:02".
 *
 * The companion public endpoint at `/api/v1/connectors/[slug]/[operation]`
 * is the same executor but gated by API key — keep behaviour in sync.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireConnectorActor();
  if (!guard.ok) return guard.response;
  const { userId, clerkOrgId: orgId } = guard.actor;

  const { id } = await params;
  const localOrgId = await resolveLocalOrgId(orgId);

  let body: { operation?: string; params?: Record<string, unknown>; bypassCache?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body.operation !== "string" || !body.operation.trim()) {
    return NextResponse.json({ error: "Missing 'operation' name" }, { status: 400 });
  }

  const result = await executeConnectionOperation({
    orgId: localOrgId,
    connectionId: id,
    operation: body.operation.trim(),
    params: body.params || {},
    bypassCache: !!body.bypassCache,
    actorId: userId,
  });

  // Map executor failures to appropriate HTTP statuses so the caller gets a
  // useful response code, not a flat 200-with-ok:false.
  if (!result.ok) {
    const status = result.status >= 400 ? result.status :
                   result.status === 0 ? 502 :
                   400;
    return NextResponse.json(
      { ok: false, error: result.error, status: result.status, latencyMs: result.latencyMs },
      { status },
    );
  }
  return NextResponse.json(result);
}
