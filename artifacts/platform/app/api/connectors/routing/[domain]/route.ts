/**
 * GET  /api/connectors/routing/[domain]  — get routing policy for one domain.
 * PUT  /api/connectors/routing/[domain]  — replace the source list for one domain.
 * DELETE /api/connectors/routing/[domain] — reset to default (removes the row).
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { withOrgContext, routingPoliciesTable } from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { requireConnectorAdmin, requireConnectorActor } from "@/lib/connectors/permissions";
import {
  ROUTING_DOMAINS,
  BUILTIN_SOURCES_BY_DOMAIN,
  type PolicySource,
  type RoutingDomain,
} from "@/lib/connectors/routing-policy";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ domain: string }> };

/** GET — policy for one domain. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const guard = await requireConnectorActor();
  if (!guard.ok) return guard.response;
  const { clerkOrgId: orgId } = guard.actor;

  const { domain } = await ctx.params;
  if (!ROUTING_DOMAINS.includes(domain as RoutingDomain)) {
    return NextResponse.json({ error: `Unknown domain '${domain}'` }, { status: 400 });
  }

  const localOrgId = await resolveLocalOrgId(orgId);
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx
      .select()
      .from(routingPoliciesTable)
      .where(and(eq(routingPoliciesTable.orgId, localOrgId), eq(routingPoliciesTable.domain, domain)))
      .limit(1),
  );

  const sources: PolicySource[] = Array.isArray(rows[0]?.sources)
    ? (rows[0].sources as PolicySource[])
    : (BUILTIN_SOURCES_BY_DOMAIN[domain as RoutingDomain] ?? []);

  return NextResponse.json({ domain, sources, isDefault: !rows[0] });
}

/** PUT — replace source list for one domain. Body: `{ sources: PolicySource[] }`. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const guard = await requireConnectorAdmin();
  if (!guard.ok) return guard.response;
  const { clerkOrgId: orgId } = guard.actor;

  const { domain } = await ctx.params;
  if (!ROUTING_DOMAINS.includes(domain as RoutingDomain)) {
    return NextResponse.json({ error: `Unknown domain '${domain}'` }, { status: 400 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const sources = (body as { sources?: unknown }).sources;
  if (!Array.isArray(sources)) {
    return NextResponse.json({ error: "Body must be { sources: PolicySource[] }" }, { status: 400 });
  }

  const cleaned = sources.filter(isValidSource);
  const localOrgId = await resolveLocalOrgId(orgId);

  await withOrgContext(localOrgId, async (tx) => {
    const existing = await tx
      .select({ id: routingPoliciesTable.id })
      .from(routingPoliciesTable)
      .where(and(eq(routingPoliciesTable.orgId, localOrgId), eq(routingPoliciesTable.domain, domain)))
      .limit(1);

    if (existing.length > 0) {
      await tx
        .update(routingPoliciesTable)
        .set({ sources: cleaned as unknown[], updatedAt: new Date() })
        .where(and(eq(routingPoliciesTable.orgId, localOrgId), eq(routingPoliciesTable.domain, domain)));
    } else {
      await tx.insert(routingPoliciesTable).values({
        orgId: localOrgId,
        domain,
        sources: cleaned as unknown[],
      });
    }
  });

  return NextResponse.json({ ok: true, domain, sources: cleaned });
}

/** DELETE — reset domain policy to built-in defaults. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const guard = await requireConnectorAdmin();
  if (!guard.ok) return guard.response;
  const { clerkOrgId: orgId } = guard.actor;

  const { domain } = await ctx.params;
  if (!ROUTING_DOMAINS.includes(domain as RoutingDomain)) {
    return NextResponse.json({ error: `Unknown domain '${domain}'` }, { status: 400 });
  }

  const localOrgId = await resolveLocalOrgId(orgId);
  await withOrgContext(localOrgId, (tx) =>
    tx
      .delete(routingPoliciesTable)
      .where(and(eq(routingPoliciesTable.orgId, localOrgId), eq(routingPoliciesTable.domain, domain))),
  );

  return NextResponse.json({ ok: true, domain, reset: true });
}

function isValidSource(v: unknown): v is PolicySource {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    (s.type === "connection" || s.type === "builtin") &&
    typeof s.id === "string" && s.id.length > 0 &&
    typeof s.label === "string" && s.label.length > 0
  );
}
