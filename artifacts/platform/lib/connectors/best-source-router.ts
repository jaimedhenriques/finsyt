/**
 * Best-Source Router
 * ──────────────────
 * Vendor-neutral routing layer that selects the highest-priority available
 * source across a tenant's federated connections + built-in providers for a
 * given data domain. It falls over automatically on failure/empty response
 * and records attribution so every value knows where it came from.
 *
 * Design:
 *   - Caller supplies the domain + params.
 *   - The router loads the org's `routing_policies` row for that domain.
 *   - Sources are tried in priority order (policy list first, then any
 *     remaining sources appended at the end as fallbacks).
 *   - Each attempt is timed. The first success is returned together with
 *     the full `triedSources` list so the citation/trace pipeline can show
 *     both "served by X" and "fell back from Y" rows.
 *   - Caching: connection sources delegate to the executor's URL cache.
 *     Builtin sources are cached by the caller-supplied fetcher.
 *
 * "Empty" detection: a 200 OK with an empty array / null `data` is treated
 * as a soft miss and the router tries the next source. Pass
 * `treatEmptyAsFailure: false` to disable this behaviour (e.g. when an
 * empty list is a valid result for a filtered query).
 */

import { eq, and } from "drizzle-orm";
import { withOrgContext, routingPoliciesTable } from "@workspace/db";
import { executeConnectionOperation } from "./executor";
import { ROUTING_DOMAINS, type RoutingDomain, type PolicySource, DOMAIN_LABELS } from "./routing-policy";

export type { RoutingDomain, PolicySource };
export { ROUTING_DOMAINS, DOMAIN_LABELS };

// ── Types ───────────────────────────────────────────────────────────────────

export interface SourceAttempt {
  source: PolicySource;
  ok: boolean;
  latencyMs: number;
  error?: string;
  fromCache?: boolean;
  /** True when the source returned 200 but data was empty/null. */
  empty?: boolean;
}

export interface RouterResult {
  ok: boolean;
  data?: unknown;
  /** The source that successfully served this result. Undefined on full failure. */
  source?: PolicySource;
  /** Every source attempted, in order, with individual latency + outcome. */
  triedSources: SourceAttempt[];
  /** Wall-clock time from first attempt start to last attempt end. */
  totalLatencyMs: number;
}

export interface RouterInput {
  domain: RoutingDomain;
  orgId: string;
  params: Record<string, unknown>;
  actorId?: string | null;
  /**
   * Fetcher for builtin sources. Called when a source entry has type='builtin'.
   * Should return `{ ok, data, error?, fromCache? }`. The router will not
   * attempt this source when the function is not provided.
   */
  builtinFetcher?: (source: PolicySource, params: Record<string, unknown>) => Promise<{
    ok: boolean;
    data?: unknown;
    error?: string;
    fromCache?: boolean;
  }>;
  /**
   * When true (default), a 200 OK with null/undefined/empty-array data is
   * counted as a miss and the next source is tried. Set to false when an
   * empty list is a valid domain result (e.g. "no deals found").
   */
  treatEmptyAsFailure?: boolean;
  /** Skip sources whose catalogSlug matches any of these slugs. */
  excludeSlugs?: string[];
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Route a data request to the best available source for `domain`.
 * Returns a full `RouterResult` including per-source latency and attribution.
 */
export async function routeRequest(input: RouterInput): Promise<RouterResult> {
  const t0 = Date.now();
  const treatEmptyAsFailure = input.treatEmptyAsFailure !== false;

  // Load the org's routing policy for this domain.
  const policy = await loadPolicy(input.orgId, input.domain);

  // Build the ordered candidate list. Policy entries come first; disabled
  // entries are skipped. The list may be empty when no policy has been saved
  // yet — callers should handle `ok=false` gracefully (fall back to their
  // own default behaviour).
  const candidates: PolicySource[] = policy
    .filter(s => !s.disabled)
    .filter(s => !input.excludeSlugs?.length || !s.catalogSlug || !input.excludeSlugs.includes(s.catalogSlug));

  if (candidates.length === 0) {
    return { ok: false, triedSources: [], totalLatencyMs: Date.now() - t0 };
  }

  const triedSources: SourceAttempt[] = [];

  for (const source of candidates) {
    const t1 = Date.now();
    let attempt: SourceAttempt;
    try {
      if (source.type === "connection") {
        attempt = await tryConnection(source, input, t1);
      } else {
        attempt = await tryBuiltin(source, input, t1);
      }
    } catch (err) {
      attempt = {
        source,
        ok: false,
        latencyMs: Date.now() - t1,
        error: (err as Error).message || "Unexpected error",
      };
    }
    triedSources.push(attempt);

    if (!attempt.ok) continue;

    // Check for empty response.
    if (treatEmptyAsFailure && isEmpty(attempt)) {
      attempt.empty = true;
      attempt.ok = false;
      continue;
    }

    return {
      ok: true,
      data: (attempt as { data?: unknown }).data,
      source,
      triedSources,
      totalLatencyMs: Date.now() - t0,
    };
  }

  return { ok: false, triedSources, totalLatencyMs: Date.now() - t0 };
}

// ── Attempt helpers ─────────────────────────────────────────────────────────

async function tryConnection(
  source: PolicySource,
  input: RouterInput,
  t1: number,
): Promise<SourceAttempt & { data?: unknown }> {
  if (!source.operationName) {
    return {
      source,
      ok: false,
      latencyMs: Date.now() - t1,
      error: "No operationName configured for this connection source",
    };
  }
  const result = await executeConnectionOperation({
    orgId: input.orgId,
    connectionId: source.id,
    operation: source.operationName,
    params: input.params,
    actorId: input.actorId,
  });
  return {
    source,
    ok: result.ok,
    latencyMs: result.latencyMs,
    error: result.error,
    fromCache: result.fromCache,
    data: result.data,
  };
}

async function tryBuiltin(
  source: PolicySource,
  input: RouterInput,
  t1: number,
): Promise<SourceAttempt & { data?: unknown }> {
  if (!input.builtinFetcher) {
    return {
      source,
      ok: false,
      latencyMs: Date.now() - t1,
      error: "No builtinFetcher provided for builtin source",
    };
  }
  const result = await input.builtinFetcher(source, input.params);
  return {
    source,
    ok: result.ok,
    latencyMs: Date.now() - t1,
    error: result.error,
    fromCache: result.fromCache,
    data: result.data,
  };
}

function isEmpty(attempt: SourceAttempt & { data?: unknown }): boolean {
  const d = (attempt as { data?: unknown }).data;
  if (d === null || d === undefined) return true;
  if (Array.isArray(d) && d.length === 0) return true;
  return false;
}

// ── Policy loader ────────────────────────────────────────────────────────────

export async function loadPolicy(orgId: string, domain: RoutingDomain): Promise<PolicySource[]> {
  try {
    const rows = await withOrgContext(orgId, (tx) =>
      tx
        .select({ sources: routingPoliciesTable.sources })
        .from(routingPoliciesTable)
        .where(
          and(
            eq(routingPoliciesTable.orgId, orgId),
            eq(routingPoliciesTable.domain, domain),
          ),
        )
        .limit(1),
    );
    const raw = rows[0]?.sources;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isValidPolicySource);
  } catch {
    return [];
  }
}

export async function savePolicy(
  orgId: string,
  domain: RoutingDomain,
  sources: PolicySource[],
): Promise<void> {
  await withOrgContext(orgId, async (tx) => {
    const existing = await tx
      .select({ id: routingPoliciesTable.id })
      .from(routingPoliciesTable)
      .where(
        and(
          eq(routingPoliciesTable.orgId, orgId),
          eq(routingPoliciesTable.domain, domain),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await tx
        .update(routingPoliciesTable)
        .set({ sources: sources as unknown[], updatedAt: new Date() })
        .where(
          and(
            eq(routingPoliciesTable.orgId, orgId),
            eq(routingPoliciesTable.domain, domain),
          ),
        );
    } else {
      await tx.insert(routingPoliciesTable).values({
        orgId,
        domain,
        sources: sources as unknown[],
        updatedAt: new Date(),
      });
    }
  });
}

function isValidPolicySource(v: unknown): v is PolicySource {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    (s.type === "connection" || s.type === "builtin") &&
    typeof s.id === "string" &&
    typeof s.label === "string"
  );
}

// ── Attribution helpers ──────────────────────────────────────────────────────

/**
 * Convert a router result into a summary string suitable for the SSE
 * `tool_result` `provider` field so the citation/trace pipeline can display
 * which source actually served each value plus which ones were skipped.
 *
 * Format: "FactSet (your license)" or "FMP / EODHD → FactSet (fallback)"
 */
export function routerAttributionLabel(result: RouterResult): string {
  if (!result.ok || !result.source) {
    const tried = result.triedSources.map(a => a.source.label).join(", ");
    return tried ? `No source returned data (tried: ${tried})` : "No sources configured";
  }
  const fallbacks = result.triedSources
    .filter(a => !a.ok && a.source.id !== result.source?.id)
    .map(a => a.source.label);
  if (fallbacks.length === 0) return result.source.label;
  return `${result.source.label} (fallback from: ${fallbacks.join(", ")})`;
}

/**
 * Build an observable summary for the routing decision: which sources were
 * tried, latency per source, and which one was selected. Used by the admin
 * observability layer.
 */
export interface RoutingObservability {
  domain: RoutingDomain;
  selectedSource: PolicySource | null;
  attempts: Array<{
    source: PolicySource;
    outcome: "success" | "empty" | "error" | "skipped";
    latencyMs: number;
    error?: string;
    fromCache?: boolean;
  }>;
  totalLatencyMs: number;
}

export function buildObservability(
  domain: RoutingDomain,
  result: RouterResult,
): RoutingObservability {
  return {
    domain,
    selectedSource: result.source ?? null,
    attempts: result.triedSources.map(a => ({
      source: a.source,
      outcome: !a.ok ? (a.empty ? "empty" : "error") : "success",
      latencyMs: a.latencyMs,
      error: a.error,
      fromCache: a.fromCache,
    })),
    totalLatencyMs: result.totalLatencyMs,
  };
}
