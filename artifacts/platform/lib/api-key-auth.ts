import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { db, apiKeysTable, auditLog, type ApiKey, TIER_RATE_LIMITS } from "@workspace/db";
import { ADDIN_TOKEN_PREFIX, isAddinToken, verifyAddinToken } from "./excel-addin-auth";
import { resolveLocalOrgId } from "./org-resolver";

export interface ResolvedApiKey {
  id: string;
  orgId: string;
  authorUserId: string;
  name: string;
  scope: "read" | "read_write";
  tier: "free" | "paid" | "enterprise";
  rateLimitPerMinute: number;
}

export const KEY_PREFIX = "fsk_";

export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const plaintext = `${KEY_PREFIX}${raw}`;
  const prefix = plaintext.slice(0, 12);
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, prefix, hash };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (header) {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const xKey = req.headers.get("x-api-key");
  if (xKey) return xKey.trim();
  const qp = req.nextUrl.searchParams.get("api_key");
  if (qp) return qp.trim();
  return null;
}

// ── In-process token bucket per key (good enough for MVP — single Next.js worker) ──
const buckets = new Map<string, { tokens: number; last: number; capacity: number }>();
function consumeToken(keyId: string, perMinute: number): { ok: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const refillRate = perMinute / 60_000; // tokens per ms
  let b = buckets.get(keyId);
  if (!b) {
    b = { tokens: perMinute, last: now, capacity: perMinute };
    buckets.set(keyId, b);
  }
  // If tier changed, expand capacity
  if (b.capacity !== perMinute) {
    b.capacity = perMinute;
    b.tokens = Math.min(b.tokens, perMinute);
  }
  const elapsed = now - b.last;
  b.tokens = Math.min(b.capacity, b.tokens + elapsed * refillRate);
  b.last = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, remaining: Math.floor(b.tokens), resetMs: 0 };
  }
  const need = 1 - b.tokens;
  const resetMs = Math.ceil(need / refillRate);
  return { ok: false, remaining: 0, resetMs };
}

const lookupCache = new Map<string, { row: ApiKey | null; expiresAt: number }>();
const LOOKUP_TTL_MS = 30_000;

async function lookupKey(plaintext: string): Promise<ApiKey | null> {
  const hash = hashApiKey(plaintext);
  const cached = lookupCache.get(hash);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.row;
  const rows = await db.select().from(apiKeysTable).where(eq(apiKeysTable.keyHash, hash)).limit(1);
  const row = rows[0] || null;
  lookupCache.set(hash, { row, expiresAt: now + LOOKUP_TTL_MS });
  return row;
}

/**
 * Immediately evict all lookup-cache entries for the given key row id.
 * Call this after revoking or rotating a key so the old cached row cannot
 * be used for the remainder of its TTL window.
 */
export function evictApiKeyFromCache(keyId: string): void {
  for (const [hash, entry] of lookupCache.entries()) {
    if (entry.row?.id === keyId) {
      lookupCache.delete(hash);
    }
  }
}

/**
 * Consume `count` additional tokens from an already-authenticated key's
 * rate-limit bucket. Returns false and a retry-after estimate (ms) if the
 * bucket cannot satisfy the full request.
 *
 * Use this when a single authenticated request fans out into multiple
 * billable operations (e.g. MCP batch requests).
 */
export function consumeExtraTokens(
  keyId: string,
  perMinute: number,
  count: number,
): { ok: boolean; resetMs: number } {
  if (count <= 0) return { ok: true, resetMs: 0 };
  const now = Date.now();
  const refillRate = perMinute / 60_000;
  let b = buckets.get(keyId);
  if (!b) {
    b = { tokens: perMinute, last: now, capacity: perMinute };
    buckets.set(keyId, b);
  }
  const elapsed = now - b.last;
  b.tokens = Math.min(b.capacity, b.tokens + elapsed * refillRate);
  b.last = now;
  if (b.tokens >= count) {
    b.tokens -= count;
    return { ok: true, resetMs: 0 };
  }
  const need = count - b.tokens;
  const resetMs = Math.ceil(need / refillRate);
  return { ok: false, resetMs };
}

function safeEqStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export interface AuthResult {
  ok: true;
  key: ResolvedApiKey;
  rateLimit: { limit: number; remaining: number; resetSeconds: number };
}
export interface AuthError {
  ok: false;
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export async function authenticateApiRequest(req: NextRequest): Promise<AuthResult | AuthError> {
  const presented = extractBearer(req);
  if (!presented) {
    return { ok: false, status: 401, body: { error: "Missing API key. Send `Authorization: Bearer <key>`." } };
  }

  // Excel add-in JWT — short-lived signed token issued by the Clerk popup.
  // Resolves to a synthetic ResolvedApiKey at the "paid" rate-limit tier so
  // the add-in agent doesn't get rate-limited as aggressively as the free public
  // surface; it still goes through the same per-key token bucket so a single
  // workbook can't fan out unbounded.
  if (isAddinToken(presented)) {
    const claims = verifyAddinToken(presented);
    if (!claims) {
      return { ok: false, status: 401, body: { error: "Invalid or expired Excel add-in token." } };
    }
    // Bucket key derives from the Clerk user — many tabs / workbooks under
    // the same user share a quota. Capacity matches the "paid" tier.
    const bucketKey = `addin:${claims.userId}`;
    const perMinute = TIER_RATE_LIMITS.paid;
    const rl = consumeToken(bucketKey, perMinute);
    if (!rl.ok) {
      return {
        ok: false,
        status: 429,
        body: { error: "Rate limit exceeded.", retryAfterSeconds: Math.ceil(rl.resetMs / 1000) },
        headers: {
          "X-RateLimit-Limit": String(perMinute),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetMs / 1000)),
          "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
        },
      };
    }
    // Map Clerk org id to the local UUID the rest of the platform expects
    // (audit-log, RLS contexts, …). Fall back to the raw Clerk id if the
    // mapping fails — recordRequest swallows the resulting audit error.
    let localOrgId = claims.orgId;
    try {
      localOrgId = await resolveLocalOrgId(claims.orgId);
    } catch {/* keep raw */}
    return {
      ok: true,
      key: {
        id: bucketKey,
        orgId: localOrgId,
        authorUserId: claims.userId,
        name: claims.email || "Excel add-in",
        scope: "read_write",
        tier: "paid",
        rateLimitPerMinute: perMinute,
      },
      rateLimit: { limit: perMinute, remaining: rl.remaining, resetSeconds: 0 },
    };
  }

  if (!presented.startsWith(KEY_PREFIX) || presented.length < 30) {
    return { ok: false, status: 401, body: { error: "Malformed API key." } };
  }
  const row = await lookupKey(presented);
  if (!row) {
    return { ok: false, status: 401, body: { error: "Invalid API key." } };
  }
  if (row.revokedAt) {
    return { ok: false, status: 401, body: { error: "API key has been revoked." } };
  }
  // Defense-in-depth: confirm hash matches in constant time
  if (!safeEqStrings(row.keyHash, hashApiKey(presented))) {
    return { ok: false, status: 401, body: { error: "Invalid API key." } };
  }

  const tier = (row.tier as ResolvedApiKey["tier"]) || "free";
  const perMinute = row.rateLimitPerMinute || TIER_RATE_LIMITS[tier] || 60;
  const rl = consumeToken(row.id, perMinute);
  if (!rl.ok) {
    return {
      ok: false,
      status: 429,
      body: { error: "Rate limit exceeded.", retryAfterSeconds: Math.ceil(rl.resetMs / 1000) },
      headers: {
        "X-RateLimit-Limit": String(perMinute),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(rl.resetMs / 1000)),
        "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
      },
    };
  }

  return {
    ok: true,
    key: {
      id: row.id,
      orgId: row.orgId,
      authorUserId: row.authorUserId,
      name: row.name,
      scope: (row.scope as ResolvedApiKey["scope"]) || "read",
      tier,
      rateLimitPerMinute: perMinute,
    },
    rateLimit: { limit: perMinute, remaining: rl.remaining, resetSeconds: 0 },
  };
}

/**
 * Wrap a Next.js GET handler for the public API. Adds:
 *   - Bearer auth via the api_keys table
 *   - per-key rate limit
 *   - audit row for every request
 *   - CORS for browser-side calls
 *   - X-RateLimit-* headers on every response
 *
 * The wrapped handler receives the resolved key as a second argument.
 */
export function withPublicApi(
  handler: (req: NextRequest, ctx: { key: ResolvedApiKey; endpoint: string }) => Promise<NextResponse> | NextResponse,
  opts: { endpoint: string; requireScope?: "read" | "read_write" } = { endpoint: "" },
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const started = Date.now();
    const auth = await authenticateApiRequest(req);
    if (!auth.ok) {
      const res = NextResponse.json(auth.body, { status: auth.status });
      if (auth.headers) for (const [k, v] of Object.entries(auth.headers)) res.headers.set(k, v);
      addCors(res, req);
      return res;
    }
    if (opts.requireScope === "read_write" && auth.key.scope !== "read_write") {
      const res = NextResponse.json({ error: "This endpoint requires a read_write API key." }, { status: 403 });
      addCors(res, req);
      return res;
    }
    let response: NextResponse;
    let status = 500;
    try {
      response = await handler(req, { key: auth.key, endpoint: opts.endpoint });
      status = response.status;
    } catch (err) {
      response = NextResponse.json({ error: "Internal server error", detail: (err as Error).message }, { status: 500 });
      status = 500;
    }
    response.headers.set("X-RateLimit-Limit", String(auth.rateLimit.limit));
    response.headers.set("X-RateLimit-Remaining", String(auth.rateLimit.remaining));
    response.headers.set("X-Finsyt-Key-Id", auth.key.id);
    addCors(response, req);

    // Fire-and-forget last-used + audit
    const latency = Date.now() - started;
    void recordRequest(auth.key, opts.endpoint, status, latency, req).catch(() => {});

    return response;
  };
}

export function addCors(res: NextResponse | Response, _req: NextRequest) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key, X-Finsyt-Surface");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

export function corsPreflight(req: NextRequest): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  addCors(res, req);
  return res;
}

async function recordRequest(
  key: ResolvedApiKey,
  endpoint: string,
  status: number,
  latencyMs: number,
  req: NextRequest,
) {
  // Skip the api_keys.last_used_at update for synthetic principals (Excel
  // add-in JWTs etc.) whose id is not a real api_keys row UUID.
  const isSynthetic = key.id.startsWith("addin:");
  if (!isSynthetic) {
    try {
      await db.execute(
        sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${key.id}`,
      );
    } catch {/* swallow */}
  }
  try {
    await auditLog({
      orgId: key.orgId,
      actorId: key.authorUserId,
      actorType: "service",
      action: "api.v1.request",
      resourceType: "api_key",
      resourceId: key.id,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
      metadata: { endpoint, status, latencyMs, scope: key.scope, tier: key.tier },
    });
  } catch {/* swallow */}
}

/**
 * Internally invoke an existing Next.js GET handler for a sibling /api route,
 * forwarding only the documented public query params. This avoids HTTP self-
 * call overhead and keeps the public surface a thin wrapper.
 */
export async function callInternalGet(
  internalHandler: (r: NextRequest) => Promise<Response> | Response,
  publicReq: NextRequest,
  forwardParams: string[],
  opts: { rename?: Record<string, string>; defaults?: Record<string, string> } = {},
): Promise<NextResponse> {
  const url = new URL(publicReq.nextUrl);
  const fwd = new URL(`${url.origin}/internal`);
  for (const p of forwardParams) {
    const target = opts.rename?.[p] || p;
    const v = publicReq.nextUrl.searchParams.get(p);
    if (v != null) fwd.searchParams.set(target, v);
  }
  if (opts.defaults) {
    for (const [k, v] of Object.entries(opts.defaults)) {
      if (!fwd.searchParams.has(k)) fwd.searchParams.set(k, v);
    }
  }
  const fakeReq = new NextRequest(fwd.toString(), { headers: publicReq.headers });
  const internalRes = await internalHandler(fakeReq);
  const text = await internalRes.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return NextResponse.json(json as object, { status: internalRes.status });
}
