/**
 * Strict Single-Source Resolver
 * ───────────────────────────────
 * The authoritative resolution path for the Bring-Your-Own-Source engine.
 *
 * Given (org, domain, params):
 *   1. Loads the org's routing policy for that domain.
 *   2. Identifies the "selected source" — the first non-disabled entry.
 *   3. If the selected source is a Finsyt builtin → fall through to the
 *      existing waterfall (caller's `builtinFetcher`).
 *   4. If the selected source is a customer connection:
 *      a. Execute the connection operation.
 *      b. Apply the stored field map to emit ONLY canonical datapoints.
 *      c. Return coverage so the renderer knows which fields to show/hide.
 *      d. NEVER backfill from Finsyt — uncovered fields come back absent.
 *
 * This is the "authoritative single source, no backfill" mode mandated by
 * the product spec. The fallback waterfall behaviour (best-source-router)
 * still applies when the org has not selected a custom source.
 */

import { loadPolicy } from "./best-source-router";
import { executeConnectionOperation } from "./executor";
import { applyFieldMapToRows, introspectFromSample } from "./field-mapper";
import { computeCoverage } from "./canonical-datapoints";
import type { RoutingDomain, PolicySource } from "./routing-policy";
import { eq, and } from "drizzle-orm";
import { withOrgContext } from "@workspace/db";

// Import the field-mappings table (added in DB schema step).
// We access it via dynamic import to keep this file clean if the table
// isn't available yet in older migration states.
let _sourceFieldMappingsTable: unknown = null;
async function getFieldMappingsTable() {
  if (_sourceFieldMappingsTable) return _sourceFieldMappingsTable as typeof import("@workspace/db").sourceFieldMappingsTable;
  try {
    const mod = await import("@workspace/db");
    _sourceFieldMappingsTable = (mod as unknown as Record<string, unknown>).sourceFieldMappingsTable ?? null;
    return _sourceFieldMappingsTable as typeof import("@workspace/db").sourceFieldMappingsTable | null;
  } catch {
    return null;
  }
}

export interface ResolverResult {
  ok: boolean;
  /** True when the result came from a customer-selected source (not Finsyt default). */
  isCustomSource: boolean;
  /** The source that served this result. */
  source?: PolicySource;
  /**
   * For custom sources: canonical data rows (after field-map applied).
   * For builtin fallback: undefined (caller uses its own waterfall result).
   */
  rows?: Record<string, unknown>[];
  /** Single canonical object for single-record domains. */
  record?: Record<string, unknown>;
  /** Which canonical fields are covered by the active source. */
  coverage?: { covered: string[]; uncovered: string[]; pct: number };
  /** Human-readable attribution label. */
  attribution?: string;
  error?: string;
  latencyMs: number;
}

export interface ResolverInput {
  orgId: string;
  domain: RoutingDomain;
  params: Record<string, unknown>;
  actorId?: string | null;
}

/**
 * Resolve data for a domain from the org's selected source.
 *
 * Returns `isCustomSource=false` when the org uses Finsyt defaults — the
 * caller should then use its existing waterfall and ignore `rows`.
 */
export async function resolveSource(input: ResolverInput): Promise<ResolverResult> {
  const t0 = Date.now();

  const policy = await loadPolicy(input.orgId, input.domain);
  const selectedSource = policy.find((s) => !s.disabled);

  // No custom source configured → fall through to Finsyt waterfall.
  if (!selectedSource || selectedSource.type === "builtin") {
    return {
      ok: true,
      isCustomSource: false,
      source: selectedSource,
      attribution: selectedSource?.label ?? "Finsyt",
      latencyMs: Date.now() - t0,
    };
  }

  // Customer connection selected.
  if (!selectedSource.operationName) {
    return {
      ok: false,
      isCustomSource: true,
      source: selectedSource,
      error: "No operation configured for this source. Go to Settings → Data Sources to configure it.",
      attribution: selectedSource.label,
      latencyMs: Date.now() - t0,
    };
  }

  // Execute the connection operation.
  const execResult = await executeConnectionOperation({
    orgId: input.orgId,
    connectionId: selectedSource.id,
    operation: selectedSource.operationName,
    params: input.params,
    actorId: input.actorId ?? null,
  });

  if (!execResult.ok) {
    return {
      ok: false,
      isCustomSource: true,
      source: selectedSource,
      error: execResult.error ?? `Source returned HTTP ${execResult.status}`,
      attribution: selectedSource.label,
      latencyMs: Date.now() - t0,
    };
  }

  // Load the stored field map for this connection + domain.
  const fieldMap = await loadFieldMap(input.orgId, selectedSource.id, input.domain);

  // Apply field map to raw data.
  const rawData = execResult.data;
  let rows: Record<string, unknown>[] = [];
  let record: Record<string, unknown> | undefined;

  if (Array.isArray(rawData)) {
    rows = applyFieldMapToRows(rawData as Record<string, unknown>[], fieldMap);
  } else if (rawData && typeof rawData === "object") {
    const obj = rawData as Record<string, unknown>;
    // Try to extract array from wrapper key.
    const arrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (arrayKey) {
      rows = applyFieldMapToRows(obj[arrayKey] as Record<string, unknown>[], fieldMap);
    } else {
      record = applyFieldMap(obj, fieldMap);
    }
  }

  const coverage = computeCoverage(input.domain, fieldMap);

  return {
    ok: true,
    isCustomSource: true,
    source: selectedSource,
    rows: rows.length > 0 ? rows : undefined,
    record,
    coverage,
    attribution: selectedSource.label,
    latencyMs: Date.now() - t0,
  };
}

/**
 * Apply a single-object field map (for non-array results).
 */
function applyFieldMap(raw: Record<string, unknown>, fieldMap: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [sourceKey, canonicalKey] of Object.entries(fieldMap)) {
    if (sourceKey in raw) out[canonicalKey] = raw[sourceKey];
  }
  return out;
}

/**
 * Load the stored field map for a connection + domain.
 * Returns an empty object if none is saved yet.
 */
async function loadFieldMap(
  orgId: string,
  connectionId: string,
  domain: RoutingDomain,
): Promise<Record<string, string>> {
  try {
    const table = await getFieldMappingsTable();
    if (!table) return {};
    const rows = await withOrgContext(orgId, (tx) =>
      tx
        .select({ fieldMap: table.fieldMap })
        .from(table)
        .where(
          and(
            eq(table.orgId, orgId),
            eq(table.connectionId, connectionId),
            eq(table.domain, domain),
          ),
        )
        .limit(1),
    );
    const raw = rows[0]?.fieldMap;
    if (!raw || typeof raw !== "object") return {};
    return raw as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Save or update a field map for a connection + domain.
 */
export async function saveFieldMap(
  orgId: string,
  connectionId: string,
  domain: RoutingDomain,
  fieldMap: Record<string, string>,
  confirmedAt?: Date,
): Promise<void> {
  const table = await getFieldMappingsTable();
  if (!table) throw new Error("source_field_mappings table not available");

  const coverage = computeCoverage(domain, fieldMap);

  await withOrgContext(orgId, async (tx) => {
    const existing = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.orgId, orgId), eq(table.connectionId, connectionId), eq(table.domain, domain)))
      .limit(1);

    if (existing.length > 0) {
      await tx
        .update(table)
        .set({
          fieldMap: fieldMap as unknown as Record<string, unknown>,
          coverage: coverage.covered as unknown as string[],
          confirmedAt: confirmedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(table.orgId, orgId), eq(table.connectionId, connectionId), eq(table.domain, domain)));
    } else {
      await tx.insert(table).values({
        orgId,
        connectionId,
        domain,
        fieldMap: fieldMap as unknown as Record<string, unknown>,
        coverage: coverage.covered as unknown as string[],
        confirmedAt: confirmedAt ?? new Date(),
        introspectedAt: new Date(),
      });
    }
  });
}

/**
 * Load full mapping metadata for a connection + domain (for the review UI).
 */
export async function loadMappingMeta(
  orgId: string,
  connectionId: string,
  domain: RoutingDomain,
): Promise<{
  fieldMap: Record<string, string>;
  coverage: { covered: string[]; uncovered: string[]; pct: number };
  introspectedAt: Date | null;
  confirmedAt: Date | null;
} | null> {
  try {
    const table = await getFieldMappingsTable();
    if (!table) return null;
    const rows = await withOrgContext(orgId, (tx) =>
      tx
        .select()
        .from(table)
        .where(and(eq(table.orgId, orgId), eq(table.connectionId, connectionId), eq(table.domain, domain)))
        .limit(1),
    );
    const row = rows[0];
    if (!row) return null;
    const fieldMap = (row.fieldMap as Record<string, string>) ?? {};
    const coverage = computeCoverage(domain, fieldMap);
    return {
      fieldMap,
      coverage,
      introspectedAt: row.introspectedAt ?? null,
      confirmedAt: row.confirmedAt ?? null,
    };
  } catch {
    return null;
  }
}
