/**
 * REST Connection Executor
 * ────────────────────────
 * Single entry point for invoking a `connection_operation` against an
 * upstream REST API. Responsibilities:
 *
 *   - Resolve the right base URL (definition catalog OR custom)
 *   - Substitute `{param}` placeholders in the path template
 *   - Apply the connection's auth scheme (header, query, bearer, basic)
 *   - Apply per-org rate limit (token bucket, in-process)
 *   - Cache successful GETs by URL for `cacheTtlSeconds`
 *   - Append a `connection_events` row (kind=call) with latency + status
 *
 * Returns a normalized `{ ok, status, data, error }` shape so callers (UI,
 * agent, public API) all branch the same way.
 *
 * Out of scope for this iteration:
 *   - retries / backoff (the agent loop handles transient errors)
 *   - response shape coercion (we return whatever the upstream returned)
 *   - streaming responses
 */
import { findCatalogEntry } from "./catalog";
import { loadConnection, recordEvent } from "./accessor";
import { assertSafeUrl, UrlSafetyError } from "./url-safety";
import { callTool as mcpCallTool, authHeadersFromCreds } from "./mcp-client";
import { and, eq } from "drizzle-orm";
import { connectionsTable, withOrgContext, type Connection, type ConnectionOperation } from "@workspace/db";

export interface ExecuteInput {
  orgId: string;
  connectionId: string;
  /** Operation name (matches `connection_operations.name`). */
  operation: string;
  params?: Record<string, unknown>;
  /** When true, bypass the URL cache. */
  bypassCache?: boolean;
  /** Logged on the audit row when present. */
  actorId?: string | null;
}

export interface ExecuteResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
  fromCache?: boolean;
  latencyMs: number;
  /**
   * Rate-limit headers extracted from the upstream response, if present.
   * Surfaced into the connection-health view so admins see remaining headroom.
   */
  rateLimitRemaining?: number | null;
  rateLimitLimit?: number | null;
  rateLimitReset?: string | null;
}

/**
 * Pull `x-ratelimit-{remaining,limit,reset}` (and a couple of common
 * variants) out of a fetch Response. Returns `null` for any value the
 * upstream did not advertise. Most APIs use `x-ratelimit-*` (Anthropic,
 * Stripe, Polygon, GitHub) — we also accept the GitHub-style reset epoch.
 *
 * `Retry-After` (RFC 7231) is honoured as a fallback `reset` source so a
 * 429 carrying only `Retry-After: 30` (or an HTTP-date) still tells the
 * UI when the cap clears, even though the upstream did not bother to
 * include `x-ratelimit-reset`.
 */
function extractRateLimit(res: Response): {
  remaining: number | null; limit: number | null; reset: string | null;
} {
  const get = (k: string) => res.headers.get(k) || res.headers.get(k.toLowerCase());
  const remainingRaw = get("x-ratelimit-remaining") || get("ratelimit-remaining");
  const limitRaw     = get("x-ratelimit-limit")     || get("ratelimit-limit");
  const resetRaw     = get("x-ratelimit-reset")     || get("ratelimit-reset");
  const retryAfter   = get("retry-after");

  let resetIso: string | null = null;
  if (resetRaw) {
    const n = Number(resetRaw);
    if (Number.isFinite(n)) {
      // Heuristic: < 10^11 is seconds-since-epoch, otherwise ms-since-epoch.
      const ms = n < 1e11 ? n * 1000 : n;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) resetIso = d.toISOString();
    } else {
      // Some APIs (Stripe) ship an HTTP date.
      const d = new Date(resetRaw);
      if (!isNaN(d.getTime())) resetIso = d.toISOString();
    }
  }

  // `Retry-After` is allowed to be either an integer "delta-seconds" from
  // now or an HTTP-date. We only use it when `x-ratelimit-reset` was not
  // already provided so authoritative reset windows (e.g. FactSet's
  // explicit reset) win over the more conservative upstream backoff hint.
  if (!resetIso && retryAfter) {
    const n = Number(retryAfter);
    if (Number.isFinite(n) && n >= 0) {
      resetIso = new Date(Date.now() + n * 1000).toISOString();
    } else {
      const d = new Date(retryAfter);
      if (!isNaN(d.getTime())) resetIso = d.toISOString();
    }
  }

  return {
    remaining: remainingRaw != null && Number.isFinite(Number(remainingRaw)) ? Number(remainingRaw) : null,
    limit:     limitRaw     != null && Number.isFinite(Number(limitRaw))     ? Number(limitRaw)     : null,
    reset:     resetIso,
  };
}

// ── In-process URL cache (per-process, no eviction beyond TTL) ─────────────
const urlCache = new Map<string, { expiresAt: number; data: unknown; status: number }>();

// ── Per-org rate limit (60 RPM default) ────────────────────────────────────
const RATE_LIMIT_RPM = Number(process.env.CONNECTOR_RATE_LIMIT_RPM || 120);
const buckets = new Map<string, { tokens: number; last: number }>();
function consumeRate(orgId: string): { ok: boolean; resetMs: number } {
  const now = Date.now();
  const refill = RATE_LIMIT_RPM / 60_000; // tokens per ms
  let b = buckets.get(orgId);
  if (!b) {
    b = { tokens: RATE_LIMIT_RPM, last: now };
    buckets.set(orgId, b);
  }
  b.tokens = Math.min(RATE_LIMIT_RPM, b.tokens + (now - b.last) * refill);
  b.last = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, resetMs: 0 };
  }
  return { ok: false, resetMs: Math.ceil((1 - b.tokens) / refill) };
}

// ── Public entry point ─────────────────────────────────────────────────────
export async function executeConnectionOperation(input: ExecuteInput): Promise<ExecuteResult> {
  const t0 = Date.now();

  // Rate limit (per org)
  const rl = consumeRate(input.orgId);
  if (!rl.ok) {
    return { ok: false, status: 429, error: `Rate limit exceeded; retry in ${rl.resetMs}ms`, latencyMs: 0 };
  }

  const loaded = await loadConnection(input.orgId, input.connectionId, {
    withCredentials: true,
    withOperations: true,
    actorId: input.actorId,
  });
  if (!loaded) {
    return { ok: false, status: 404, error: "Connection not found", latencyMs: 0 };
  }
  if (loaded.connection.status === "disabled") {
    return { ok: false, status: 423, error: "Connection is disabled", latencyMs: 0 };
  }
  // For REST connections we look up a row in `connection_operations`. For
  // MCP connections, the "operation" is just the upstream MCP tool name —
  // we don't require it to be pre-registered in our DB so newly-discovered
  // tools can be invoked immediately. If a row does exist (e.g. created
  // during /discover) we honour its `enabled` flag.
  let opName = input.operation;
  let opForAudit: { name: string } = { name: opName };
  if (loaded.connection.kind === "rest" || loaded.connection.kind === "first_party") {
    const op = loaded.operations.find((o) => o.name === input.operation && o.enabled);
    if (!op) {
      return { ok: false, status: 404, error: `Operation '${input.operation}' not found on this connection`, latencyMs: 0 };
    }
    opForAudit = op;
    opName = op.name;
  } else if (loaded.connection.kind === "mcp") {
    const known = loaded.operations.find((o) => o.name === input.operation);
    if (known && !known.enabled) {
      return { ok: false, status: 423, error: `MCP tool '${input.operation}' is disabled on this connection`, latencyMs: 0 };
    }
  }

  let result: ExecuteResult;
  try {
    if (loaded.connection.kind === "mcp") {
      result = await runMcp(loaded.connection, opName, loaded.credentials || {}, input, t0);
    } else {
      // For REST/first_party, opForAudit is a real ConnectionOperation row.
      result = await runRest(loaded.connection, opForAudit as ConnectionOperation, loaded.credentials || {}, input);
    }
  } catch (err) {
    result = {
      ok: false,
      status: 0,
      error: (err as Error).message || "Unexpected executor failure",
      latencyMs: Date.now() - t0,
    };
  }

  // Audit + health (fire-and-forget). We always include rate-limit headers
  // (when the upstream sent them) so the connection-health view can compute
  // remaining headroom + reset windows. `fromCache` stays in metadata for
  // visibility into how often we are short-circuiting calls.
  const meta: Record<string, unknown> = {};
  if (result.fromCache) meta.fromCache = true;
  if (result.rateLimitRemaining != null) meta.rateLimitRemaining = result.rateLimitRemaining;
  if (result.rateLimitLimit     != null) meta.rateLimitLimit     = result.rateLimitLimit;
  if (result.rateLimitReset     != null) meta.rateLimitReset     = result.rateLimitReset;
  void recordEvent({
    orgId: input.orgId,
    connectionId: loaded.connection.id,
    kind: "call",
    operation: opName,
    actorId: input.actorId,
    latencyMs: result.latencyMs,
    status: result.status,
    error: result.error ?? null,
    metadata: Object.keys(meta).length > 0 ? meta : null,
  });

  // Mirror the freshest rate-limit headers onto the `connections` row so the
  // Connector Hub list can render "X / Y remaining" without having to fan
  // out a per-connection /health call. We only persist when the upstream
  // actually advertised a quota header — cache hits and rate-limit-less
  // providers leave the columns alone so they continue to display the last
  // real number we saw rather than an "n/a" flicker.
  if (
    !result.fromCache &&
    (result.rateLimitRemaining != null ||
      result.rateLimitLimit != null ||
      result.rateLimitReset != null)
  ) {
    void persistQuota(input.orgId, loaded.connection.id, result);
  }

  return result;
}

async function persistQuota(
  orgId: string,
  connectionId: string,
  result: ExecuteResult,
): Promise<void> {
  try {
    await withOrgContext(orgId, async (tx) => {
      const update: Record<string, unknown> = { quotaUpdatedAt: new Date() };
      if (result.rateLimitRemaining != null) update.quotaRemaining = result.rateLimitRemaining;
      if (result.rateLimitLimit     != null) update.quotaLimit     = result.rateLimitLimit;
      if (result.rateLimitReset     != null) update.quotaResetAt   = new Date(result.rateLimitReset);
      await tx
        .update(connectionsTable)
        .set(update)
        .where(and(eq(connectionsTable.id, connectionId), eq(connectionsTable.orgId, orgId)));
    });
  } catch {
    // Telemetry must never break a request — quota is best-effort.
  }
}

// ── MCP core ────────────────────────────────────────────────────────────────
// MCP connections expose `tools/call` over JSON-RPC; we forward `input.params`
// as the tool arguments and translate the response into the same `ExecuteResult`
// shape so callers (public API, agent loop, /execute) branch identically.
async function runMcp(
  conn: Connection,
  toolName: string,
  creds: Record<string, string>,
  input: ExecuteInput,
  t0: number,
): Promise<ExecuteResult> {
  const url = conn.mcpUrl;
  if (!url) {
    return { ok: false, status: 500, error: "MCP connection has no mcpUrl", latencyMs: Date.now() - t0 };
  }
  // Re-validate the URL on every call: blocks DNS-rebinding attacks where a
  // hostname that was public at create-time has since been pointed at an
  // internal IP.
  try {
    await assertSafeUrl(url, "mcp");
  } catch (err) {
    if (err instanceof UrlSafetyError) {
      return { ok: false, status: 400, error: err.message, latencyMs: Date.now() - t0 };
    }
    throw err;
  }
  const headers = authHeadersFromCreds(conn.authType, creds);
  try {
    const data = await mcpCallTool({ url, authHeaders: headers }, toolName, (input.params || {}) as Record<string, unknown>);
    return { ok: true, status: 200, data, latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: (err as Error).message || "MCP call failed",
      latencyMs: Date.now() - t0,
    };
  }
}

// ── REST core ───────────────────────────────────────────────────────────────
async function runRest(
  conn: Connection,
  op: ConnectionOperation,
  creds: Record<string, string>,
  input: ExecuteInput,
): Promise<ExecuteResult> {
  const t0 = Date.now();
  const baseUrl = resolveBaseUrl(conn);
  if (!baseUrl) {
    return { ok: false, status: 500, error: "Connection has no base URL", latencyMs: Date.now() - t0 };
  }

  // ── Substitute path placeholders ────────────────────────────────────────
  const params = (input.params || {}) as Record<string, unknown>;
  let path = op.path;
  const consumedParams = new Set<string>();
  path = path.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => {
    consumedParams.add(k);
    const v = params[k];
    if (v === undefined || v === null) return "";
    return encodeURIComponent(String(v));
  });

  // ── Build URL + apply query auth ────────────────────────────────────────
  const url = new URL(path.startsWith("http") ? path : joinUrl(baseUrl, path));

  // Anything left in `params` that wasn't a path placeholder becomes a query
  // string (for GET) or body field (for POST/PUT/PATCH).
  const remaining: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (!consumedParams.has(k)) remaining[k] = v;
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  applyAuth(conn, creds, url, headers);

  let bodyInit: BodyInit | undefined;
  const method = (op.method || "GET").toUpperCase();
  if (method === "GET" || method === "DELETE") {
    for (const [k, v] of Object.entries(remaining)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  } else {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(remaining);
  }

  // ── Cache check (GET only) ──────────────────────────────────────────────
  const cacheKey = method === "GET" ? `${conn.id}:${url.toString()}` : null;
  if (cacheKey && !input.bypassCache && op.cacheTtlSeconds > 0) {
    const hit = urlCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return { ok: true, status: hit.status, data: hit.data, fromCache: true, latencyMs: Date.now() - t0 };
    }
  }

  // ── SSRF guard (re-validated every call, including DNS) ────────────────
  try {
    await assertSafeUrl(url.toString(), "rest");
  } catch (err) {
    const detail = err instanceof UrlSafetyError ? err.message : (err as Error).message;
    return { ok: false, status: 400, error: detail, latencyMs: Date.now() - t0 };
  }

  // ── Fire ────────────────────────────────────────────────────────────────
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), { method, headers, body: bodyInit, signal: ctrl.signal });
  } catch (err) {
    return { ok: false, status: 0, error: `Fetch failed: ${(err as Error).message}`, latencyMs: Date.now() - t0 };
  } finally {
    clearTimeout(timeout);
  }

  let data: unknown;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  const ok = res.ok;
  if (ok && cacheKey && op.cacheTtlSeconds > 0) {
    urlCache.set(cacheKey, {
      expiresAt: Date.now() + op.cacheTtlSeconds * 1000,
      data,
      status: res.status,
    });
  }

  const rl = extractRateLimit(res);
  return {
    ok,
    status: res.status,
    data,
    error: ok ? undefined : `Upstream returned ${res.status}`,
    latencyMs: Date.now() - t0,
    rateLimitRemaining: rl.remaining,
    rateLimitLimit: rl.limit,
    rateLimitReset: rl.reset,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function resolveBaseUrl(conn: Connection): string {
  if (conn.baseUrl) return conn.baseUrl.replace(/\/+$/, "");
  if (conn.definitionId) {
    // Note: we do not re-fetch the definition here — it should have been
    // copied into `connection.baseUrl` at create time. This branch is a
    // safety net for very old rows (definition without base url copy).
    return "";
  }
  return "";
}

function joinUrl(base: string, path: string): string {
  if (!path) return base;
  if (path.startsWith("/")) return `${base}${path}`;
  return `${base}/${path}`;
}

function applyAuth(
  conn: Connection,
  creds: Record<string, string>,
  url: URL,
  headers: Record<string, string>,
): void {
  // Some upstreams (Refinitiv RDP for one) require a *secondary* identifier
  // header — e.g. `X-Tr-AppKey` — alongside the primary auth scheme. Apply
  // it opportunistically here whenever the cred bag carries an `app_key`,
  // honouring `app_key_header` as an override for the header name. The catalog
  // populates that override via `credentialDefaults` so users only see the
  // friendly "App Key" field in the connect modal.
  const appKey = creds.app_key || creds.appKey || "";
  if (appKey) {
    const appKeyHeader = creds.app_key_header || creds.appKeyHeader || "X-AppKey";
    headers[appKeyHeader] = appKey;
  }

  switch (conn.authType) {
    case "none":
      return;
    case "api_key_header": {
      // Accept both `apiKey` (UI/camelCase) and `api_key` (snake_case) so
      // creds saved by either old or new code paths work.
      const headerName = creds.header_name || creds.headerName || "X-API-Key";
      const value = creds.api_key || creds.apiKey || creds.token || "";
      if (value) headers[headerName] = value;
      return;
    }
    case "api_key_query": {
      const paramName = creds.query_name || creds.queryName || "apikey";
      const value = creds.api_key || creds.apiKey || creds.token || "";
      if (value) url.searchParams.set(paramName, value);
      return;
    }
    case "bearer": {
      const value = creds.access_token || creds.accessToken || creds.bearer || creds.token || creds.api_key || creds.apiKey || "";
      if (value) headers["Authorization"] = `Bearer ${value}`;
      return;
    }
    case "basic": {
      const user = creds.username || creds.user || "";
      const pass = creds.password || creds.pass || "";
      if (user || pass) {
        const b64 = Buffer.from(`${user}:${pass}`).toString("base64");
        headers["Authorization"] = `Basic ${b64}`;
      }
      return;
    }
    case "oauth2": {
      const token = creds.access_token || creds.accessToken || "";
      if (token) headers["Authorization"] = `Bearer ${token}`;
      return;
    }
    default: {
      const fallback = creds.api_key || creds.apiKey || creds.access_token || creds.accessToken || "";
      if (fallback) headers["Authorization"] = `Bearer ${fallback}`;
    }
  }
}

/** Resolve a (slug → connection) lookup for the public `/api/v1/connectors` route. */
export function getCatalogBaseUrl(slug: string): string {
  return findCatalogEntry(slug)?.baseUrl || "";
}

/**
 * Translate the executor's raw failure (status + upstream error string) into
 * a user-meaningful message keyed off the HTTP status family. Centralised so
 * the connection POST and the manual test endpoint produce identical copy
 * for the same failure mode.
 *
 * - 401 / 403 → credential or entitlement problem (the credential probably
 *   reached the upstream; it just wasn't accepted).
 * - 400 / 404 / 422 → request-shape problem; with `validateParams` filled in
 *   this should not happen, but keep the distinction so the user does not
 *   blame their key.
 * - 408 / 429 / 5xx → upstream is reachable but transiently unhappy; safe to
 *   retry.
 * - 0 → network failure (DNS, TLS, timeout) before we even got a status.
 */
export function describeValidationFailure(status: number, rawError?: string): string {
  if (status === 0) {
    return rawError ? `Could not reach the provider (${rawError}).` : "Could not reach the provider.";
  }
  if (status === 401 || status === 403) {
    return `Credentials were rejected by the provider (HTTP ${status}). Double-check the values you pasted and that the issuing user has the required entitlements.`;
  }
  if (status === 429) {
    return "Provider rate-limited the validation call (HTTP 429). The credentials may be valid — try the Test button in a moment.";
  }
  if (status === 408 || (status >= 500 && status < 600)) {
    return `Provider returned a server error (HTTP ${status}). The credentials may still be valid — retry shortly.`;
  }
  if (status === 400 || status === 404 || status === 422) {
    return `Validation call returned HTTP ${status}. This is usually a request-shape issue on Finsyt's side, not your credentials — please report it.`;
  }
  return rawError || `Validation call returned HTTP ${status}.`;
}
