/**
 * POST /api/connectors/mappings/:connectionId/:domain/introspect
 *
 * Executes a lightweight sample call on the connection's operation for this
 * domain, introspects the returned column names, runs the auto-mapper, and
 * saves the suggested field map (unconfirmed) to `source_field_mappings`.
 *
 * The UI then presents the auto-mapped results for human review before the
 * operator clicks "Confirm".
 *
 * Body (optional):
 *   { operationName?: string; params?: Record<string, unknown> }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { requireConnectorAdmin } from "@/lib/connectors/permissions";
import { autoMap, introspectFromSample } from "@/lib/connectors/field-mapper";
import { computeCoverage } from "@/lib/connectors/canonical-datapoints";
import { executeConnectionOperation } from "@/lib/connectors/executor";
import type { RoutingDomain } from "@/lib/connectors/routing-policy";
import { db, withOrgContext, sourceFieldMappingsTable, auditLog } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

const VALID_DOMAINS: RoutingDomain[] = [
  "quotes", "fundamentals", "estimates", "news",
  "filings", "transcripts", "macro", "ownership", "deals",
];

type Params = { connectionId: string; domain: string };

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { connectionId, domain } = await params;
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId)  return NextResponse.json({ error: "No active workspace" }, { status: 403 });

  if (!VALID_DOMAINS.includes(domain as RoutingDomain)) {
    return NextResponse.json({ error: `Unknown domain: ${domain}` }, { status: 400 });
  }

  const localOrgId = await resolveLocalOrgId(orgId);
  await requireConnectorAdmin(localOrgId, userId);

  const body = await req.json().catch(() => ({})) as {
    operationName?: string;
    params?: Record<string, unknown>;
  };

  const operation = body.operationName ?? "query";

  // Execute a sample call (low row count) to get the schema.
  const execResult = await executeConnectionOperation({
    orgId: localOrgId,
    connectionId,
    operation,
    params: { ...(body.params ?? {}), limit: 5, row_limit: 5 },
    actorId: userId,
  });

  if (!execResult.ok) {
    return NextResponse.json(
      {
        error: execResult.error ?? `Sample call returned HTTP ${execResult.status}`,
        suggestion: "Check the connection credentials and operation name, then try again.",
      },
      { status: 502 },
    );
  }

  // Introspect field names from the sample.
  const sourceFields = introspectFromSample(execResult.data);

  if (sourceFields.length === 0) {
    return NextResponse.json(
      {
        error: "No fields detected in the sample response. Make sure the operation returns rows.",
        sampleResponse: execResult.data,
      },
      { status: 422 },
    );
  }

  // Auto-map source fields → canonical datapoints.
  const { fieldMap, coverage, confidence } = autoMap(domain as RoutingDomain, sourceFields);

  // Save suggested (unconfirmed) mapping.
  await withOrgContext(localOrgId, async (tx) => {
    const existing = await tx
      .select({ id: sourceFieldMappingsTable.id })
      .from(sourceFieldMappingsTable)
      .where(
        and(
          eq(sourceFieldMappingsTable.orgId, localOrgId),
          eq(sourceFieldMappingsTable.connectionId, connectionId),
          eq(sourceFieldMappingsTable.domain, domain),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await tx
        .update(sourceFieldMappingsTable)
        .set({
          fieldMap: fieldMap as unknown as Record<string, unknown>,
          coverage: coverage.covered as unknown as string[],
          introspectedAt: new Date(),
          confirmedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sourceFieldMappingsTable.orgId, localOrgId),
            eq(sourceFieldMappingsTable.connectionId, connectionId),
            eq(sourceFieldMappingsTable.domain, domain),
          ),
        );
    } else {
      await tx.insert(sourceFieldMappingsTable).values({
        orgId: localOrgId,
        connectionId,
        domain,
        fieldMap: fieldMap as unknown as Record<string, unknown>,
        coverage: coverage.covered as unknown as string[],
        introspectedAt: new Date(),
        confirmedAt: null,
      });
    }
  });

  await auditLog(db, {
    orgId: localOrgId,
    actorId: userId,
    action: "connector.mapping.introspect",
    resource: `connection:${connectionId}:${domain}`,
    meta: { sourceFields: sourceFields.length, coverage: coverage.pct, confidence },
  });

  return NextResponse.json({
    ok: true,
    sourceFields,
    fieldMap,
    coverage,
    confidence,
    confirmedAt: null,
    introspectedAt: new Date().toISOString(),
  });
}
