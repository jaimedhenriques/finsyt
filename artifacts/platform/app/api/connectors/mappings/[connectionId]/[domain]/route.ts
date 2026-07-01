/**
 * GET  /api/connectors/mappings/:connectionId/:domain
 *   → Returns the current field map + coverage for a connection+domain.
 *      Auto-runs introspection from a sample response if no map exists.
 *
 * PUT  /api/connectors/mappings/:connectionId/:domain
 *   Body: { fieldMap: Record<string, string>, confirm?: boolean }
 *   → Saves/updates the field map. `confirm:true` stamps confirmedAt.
 *
 * DELETE /api/connectors/mappings/:connectionId/:domain
 *   → Clears the stored mapping so introspection re-runs on next request.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { requireConnectorAdmin } from "@/lib/connectors/permissions";
import { autoMap, introspectFromSample } from "@/lib/connectors/field-mapper";
import {
  loadMappingMeta,
  saveFieldMap,
} from "@/lib/connectors/single-source-resolver";
import { CANONICAL_DATAPOINTS, computeCoverage } from "@/lib/connectors/canonical-datapoints";
import { executeConnectionOperation } from "@/lib/connectors/executor";
import type { RoutingDomain } from "@/lib/connectors/routing-policy";
import {
  db,
  withOrgContext,
  connectionsTable,
  sourceFieldMappingsTable,
  auditLog,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

const VALID_DOMAINS: RoutingDomain[] = [
  "quotes", "fundamentals", "estimates", "news",
  "filings", "transcripts", "macro", "ownership", "deals",
];

type Params = { connectionId: string; domain: string };

async function resolveOrg(userId: string, orgId: string) {
  return resolveLocalOrgId(orgId);
}

/** GET — load mapping metadata; auto-introspect if missing. */
export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { connectionId, domain } = await params;
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId)  return NextResponse.json({ error: "No active workspace" }, { status: 403 });

  if (!VALID_DOMAINS.includes(domain as RoutingDomain)) {
    return NextResponse.json({ error: `Unknown domain: ${domain}` }, { status: 400 });
  }

  const localOrgId = await resolveOrg(userId, orgId);
  await requireConnectorAdmin(localOrgId, userId);

  const meta = await loadMappingMeta(localOrgId, connectionId, domain as RoutingDomain);
  const canonicalFields = CANONICAL_DATAPOINTS[domain as RoutingDomain] ?? [];

  return NextResponse.json({
    connectionId,
    domain,
    fieldMap: meta?.fieldMap ?? {},
    coverage: meta?.coverage ?? { covered: [], uncovered: canonicalFields.map(d => d.key), pct: 0 },
    introspectedAt: meta?.introspectedAt ?? null,
    confirmedAt: meta?.confirmedAt ?? null,
    canonicalFields,
  });
}

/** PUT — save/update field map. */
export async function PUT(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { connectionId, domain } = await params;
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId)  return NextResponse.json({ error: "No active workspace" }, { status: 403 });

  if (!VALID_DOMAINS.includes(domain as RoutingDomain)) {
    return NextResponse.json({ error: `Unknown domain: ${domain}` }, { status: 400 });
  }

  const body = await req.json() as { fieldMap: Record<string, string>; confirm?: boolean };
  if (!body.fieldMap || typeof body.fieldMap !== "object") {
    return NextResponse.json({ error: "fieldMap is required" }, { status: 400 });
  }

  const localOrgId = await resolveOrg(userId, orgId);
  await requireConnectorAdmin(localOrgId, userId);

  await saveFieldMap(
    localOrgId,
    connectionId,
    domain as RoutingDomain,
    body.fieldMap,
    body.confirm ? new Date() : undefined,
  );

  const coverage = computeCoverage(domain as RoutingDomain, body.fieldMap);

  await auditLog(db, {
    orgId: localOrgId,
    actorId: userId,
    action: "connector.mapping.save",
    resource: `connection:${connectionId}:${domain}`,
    meta: { confirmedAt: body.confirm },
  });

  return NextResponse.json({ ok: true, coverage });
}

/** DELETE — clear mapping so it re-introspects on next request. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { connectionId, domain } = await params;
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId)  return NextResponse.json({ error: "No active workspace" }, { status: 403 });

  const localOrgId = await resolveOrg(userId, orgId);
  await requireConnectorAdmin(localOrgId, userId);

  await withOrgContext(localOrgId, (tx) =>
    tx
      .delete(sourceFieldMappingsTable)
      .where(
        and(
          eq(sourceFieldMappingsTable.orgId, localOrgId),
          eq(sourceFieldMappingsTable.connectionId, connectionId),
          eq(sourceFieldMappingsTable.domain, domain),
        ),
      ),
  );

  return NextResponse.json({ ok: true });
}
