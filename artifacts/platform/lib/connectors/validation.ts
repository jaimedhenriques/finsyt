/**
 * Shared credential-validation helpers for the connector POST + test flow.
 *
 * Both `POST /api/connectors/connections` (inline create-time validation)
 * and `POST /api/connectors/connections/[id]/test` (manual test button)
 * need the same code path: run the catalog-declared `validateOperation`
 * via the executor, then translate the executor's raw `{ok, status,
 * error}` tuple into a UI-grade `{ok, status, detail, error}` outcome.
 *
 * Extracted into its own module so it can be tested without spinning up
 * Postgres / Clerk / Next: the only side effect is the executor call,
 * which is injectable via the `executor` test seam. `describeValidationFailure`
 * stays the source of truth for the failure copy so the POST route and the
 * test route always agree on what to show the user for a given HTTP status.
 */
import {
  executeConnectionOperation as defaultExecutor,
  describeValidationFailure,
  type ExecuteResult,
} from "./executor";

export type ConnectionExecutor = typeof defaultExecutor;

export interface RunValidationInput {
  orgId: string;
  connectionId: string;
  /** Catalog operation name to invoke (must exist on the connection). */
  operation: string;
  params?: Record<string, unknown>;
  actorId?: string | null;
  /** Test seam — defaults to the real executor. */
  executor?: ConnectionExecutor;
}

export interface ValidationOutcome {
  ok: boolean;
  status: number;
  latencyMs: number;
  /**
   * Human-friendly description for the UI / audit row.
   *   - On success: `Validated via <op> (HTTP <status>)`
   *   - On failure: same string as `error` (the friendly translation).
   */
  detail: string;
  /** Friendly error string when `ok=false`; absent when `ok=true`. */
  error?: string;
  /**
   * Upstream `x-ratelimit-*` (or `Retry-After`) values forwarded from the
   * executor. Populated only when the upstream advertised any of them, so
   * the test endpoint can immediately seed the "X / Y remaining" badge on
   * premium connector cards without waiting for the next call.
   */
  rateLimitRemaining?: number | null;
  rateLimitLimit?: number | null;
  rateLimitReset?: string | null;
}

/**
 * Run the catalog-declared `validateOperation` for a connection. Always
 * passes `bypassCache: true` so a recently-cached success cannot mask a
 * now-revoked credential.
 */
export async function runValidationCall(input: RunValidationInput): Promise<ValidationOutcome> {
  const exec = input.executor ?? defaultExecutor;
  const res: ExecuteResult = await exec({
    orgId: input.orgId,
    connectionId: input.connectionId,
    operation: input.operation,
    actorId: input.actorId ?? null,
    params: input.params ?? {},
    bypassCache: true,
  });
  if (res.ok) {
    return {
      ok: true,
      status: res.status,
      latencyMs: res.latencyMs,
      detail: `Validated via ${input.operation} (HTTP ${res.status})`,
      rateLimitRemaining: res.rateLimitRemaining ?? null,
      rateLimitLimit:     res.rateLimitLimit     ?? null,
      rateLimitReset:     res.rateLimitReset     ?? null,
    };
  }
  const friendly = describeValidationFailure(res.status, res.error);
  return {
    ok: false,
    status: res.status,
    latencyMs: res.latencyMs,
    detail: friendly,
    error: friendly,
    rateLimitRemaining: res.rateLimitRemaining ?? null,
    rateLimitLimit:     res.rateLimitLimit     ?? null,
    rateLimitReset:     res.rateLimitReset     ?? null,
  };
}

/**
 * Merge a catalog entry's `credentialDefaults` underneath a user-supplied
 * credential bag. User-supplied values always win — defaults are server-only
 * scaffolding (e.g. CapIQ's `header_name: "Apikey"`, Refinitiv's
 * `app_key_header: "X-Tr-AppKey"`) that users should not have to know about.
 *
 * Returns a fresh object so the caller can mutate without aliasing the
 * catalog row.
 */
export function mergeCredentialDefaults(
  defaults: Record<string, string> | undefined | null,
  user: Record<string, string> | undefined | null,
): Record<string, string> {
  const u = user ?? {};
  if (!defaults || Object.keys(defaults).length === 0) return { ...u };
  return { ...defaults, ...u };
}

/**
 * Discriminated decision used by `POST /api/connectors/connections/[id]/test`
 * to pick the lightest credential-meaningful health probe for a connection:
 *
 *   - `mcp`      → JSON-RPC `initialize` against the MCP url
 *   - `validate` → catalog-declared `validateOperation` via the executor
 *   - `ping`     → blunt GET against the configured base URL (last resort)
 *
 * Premium catalog tiles (FactSet, CapIQ, Refinitiv, Bloomberg, PitchBook)
 * always hit the `validate` branch because their root URLs deliberately
 * reject unauthenticated GETs — a base-URL ping there would always look
 * "reachable" but tell the operator nothing about whether their credentials
 * are accepted.
 */
export type TestStrategy =
  | { kind: "mcp" }
  | { kind: "validate"; operation: string; params: Record<string, unknown> }
  | { kind: "ping" };

export function selectTestStrategy(
  connection: { kind: string },
  catalogEntry:
    | {
        validateOperation?: string;
        validateParams?: Record<string, string>;
      }
    | null
    | undefined,
): TestStrategy {
  if (connection.kind === "mcp") return { kind: "mcp" };
  if (catalogEntry?.validateOperation) {
    return {
      kind: "validate",
      operation: catalogEntry.validateOperation,
      params: catalogEntry.validateParams ?? {},
    };
  }
  return { kind: "ping" };
}
