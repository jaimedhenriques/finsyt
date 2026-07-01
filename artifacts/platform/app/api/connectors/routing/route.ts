/**
 * GET  /api/connectors/routing  — list all routing policies for the org.
 * PUT  /api/connectors/routing  — bulk-replace all policies (used by the
 *                                  admin UI's "Save all" action).
 *
 * Each policy entry:
 *   { domain, sources: PolicySource[] }
 *
 * The endpoint also returns a `domainMeta` bag with label/description and
 * the `availableSources` the org can pick from (active connections + built-ins)
 * so the client UI can render the full picker without a second round-trip.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { withOrgContext, routingPoliciesTable, connectionsTable, connectorDefinitionsTable } from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { requireConnectorAdmin, requireConnectorActor } from "@/lib/connectors/permissions";
import {
  ROUTING_DOMAINS,
  DOMAIN_LABELS,
  DOMAIN_DESCRIPTIONS,
  BUILTIN_SOURCES_BY_DOMAIN,
  type PolicySource,
  type RoutingDomain,
  suggestOperation,
} from "@/lib/connectors/routing-policy";
import { findCatalogEntry } from "@/lib/connectors/catalog";

export const runtime = "nodejs";

/** GET — return all policies + available sources for the picker. */
export async function GET() {
  const guard = await requireConnectorActor();
  if (!guard.ok) return guard.response;
  const { clerkOrgId: orgId } = guard.actor;

  const localOrgId = await resolveLocalOrgId(orgId);

  const [policyRows, connRows] = await Promise.all([
    withOrgContext(localOrgId, (tx) =>
      tx
        .select()
        .from(routingPoliciesTable)
        .where(eq(routingPoliciesTable.orgId, localOrgId)),
    ),
    // Active connections with their catalog slug for premium resolution.
    withOrgContext(localOrgId, (tx) =>
      tx
        .select({
          id: connectionsTable.id,
          displayName: connectionsTable.displayName,
          category: connectionsTable.category,
          kind: connectionsTable.kind,
          status: connectionsTable.status,
          definitionSlug: connectorDefinitionsTable.slug,
        })
        .from(connectionsTable)
        .leftJoin(connectorDefinitionsTable, eq(connectorDefinitionsTable.id, connectionsTable.definitionId))
        .where(eq(connectionsTable.orgId, localOrgId)),
    ),
  ]);

  // Build the policy map: domain → ordered PolicySource[].
  const policyByDomain = new Map<string, PolicySource[]>();
  for (const row of policyRows) {
    if (Array.isArray(row.sources)) {
      policyByDomain.set(row.domain, row.sources as PolicySource[]);
    }
  }

  // Derive available connection sources per domain from the org's active connections.
  // We categorise connections using the catalog category — a fundamentals connection
  // (FactSet, CapIQ, Refinitiv) is eligible for fundamentals, quotes, filings, etc.
  const connectionSources: PolicySource[] = connRows
    .filter(r => r.status === "active")
    .map(r => {
      const slug = r.definitionSlug ?? undefined;
      const isPremium = slug ? !!findCatalogEntry(slug)?.isPremium : false;
      return {
        type: "connection" as const,
        id: r.id,
        label: isPremium ? `${r.displayName} (your license)` : r.displayName,
        catalogSlug: slug,
        category: r.category,
        kind: r.kind,
      } as PolicySource & { category: string; kind: string };
    });

  // Build the full domain list with current policy + available options.
  const domains = ROUTING_DOMAINS.map((domain) => {
    const currentSources = policyByDomain.get(domain) ?? [];

    // Connection sources eligible for this domain (connections are domain-agnostic —
    // any active connection can be assigned to any domain by the admin).
    const eligibleConnections = connectionSources.map(s => ({
      ...s,
      // Suggest an operationName based on catalog slug + domain.
      operationName: s.operationName ?? (s.catalogSlug ? suggestOperation(s.catalogSlug, domain) : undefined),
    }));

    // Builtin sources for this domain.
    const builtins = BUILTIN_SOURCES_BY_DOMAIN[domain] ?? [];

    return {
      domain,
      label: DOMAIN_LABELS[domain],
      description: DOMAIN_DESCRIPTIONS[domain],
      sources: currentSources,
      availableSources: [
        ...eligibleConnections,
        ...builtins,
      ],
    };
  });

  return NextResponse.json({ domains });
}

/** PUT — bulk-replace routing policies. Body: `{ policies: [{ domain, sources }] }`. */
export async function PUT(req: NextRequest) {
  const guard = await requireConnectorAdmin();
  if (!guard.ok) return guard.response;
  const { clerkOrgId: orgId } = guard.actor;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  if (!body || typeof body !== "object" || !Array.isArray((body as { policies?: unknown }).policies)) {
    return NextResponse.json({ error: "Body must be { policies: [{ domain, sources }] }" }, { status: 400 });
  }

  const policies = (body as { policies: unknown[] }).policies;
  const validDomains = new Set<string>(ROUTING_DOMAINS);

  const localOrgId = await resolveLocalOrgId(orgId);

  const results: Array<{ domain: string; ok: boolean; error?: string }> = [];

  for (const p of policies) {
    if (!p || typeof p !== "object") continue;
    const { domain, sources } = p as { domain?: unknown; sources?: unknown };
    if (typeof domain !== "string" || !validDomains.has(domain)) {
      results.push({ domain: String(domain), ok: false, error: "Unknown domain" });
      continue;
    }
    if (!Array.isArray(sources)) {
      results.push({ domain, ok: false, error: "sources must be an array" });
      continue;
    }
    const cleaned = sources.filter(isValidSource);
    try {
      await upsertPolicy(localOrgId, domain as RoutingDomain, cleaned);
      results.push({ domain, ok: true });
    } catch (err) {
      results.push({ domain, ok: false, error: (err as Error).message });
    }
  }

  const allOk = results.every(r => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
}

async function upsertPolicy(orgId: string, domain: RoutingDomain, sources: PolicySource[]) {
  await withOrgContext(orgId, async (tx) => {
    const existing = await tx
      .select({ id: routingPoliciesTable.id })
      .from(routingPoliciesTable)
      .where(and(eq(routingPoliciesTable.orgId, orgId), eq(routingPoliciesTable.domain, domain)))
      .limit(1);

    if (existing.length > 0) {
      await tx
        .update(routingPoliciesTable)
        .set({ sources: sources as unknown[], updatedAt: new Date() })
        .where(and(eq(routingPoliciesTable.orgId, orgId), eq(routingPoliciesTable.domain, domain)));
    } else {
      await tx.insert(routingPoliciesTable).values({ orgId, domain, sources: sources as unknown[] });
    }
  });
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
