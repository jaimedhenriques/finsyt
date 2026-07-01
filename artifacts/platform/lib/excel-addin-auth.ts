import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signed token used by the Excel add-in.
 *
 * The desktop / web Excel host opens a Clerk sign-in popup via
 * `Office.context.ui.displayDialogAsync`. After Clerk sign-in completes,
 * the popup mints one of these tokens with the resolved (orgId, userId,
 * email) and posts it back to the parent dialog. The task pane stores it
 * in `Office.context.document.settings` and sends it as
 * `Authorization: Bearer <token>` to the platform.
 *
 * Tokens are HMAC-SHA256 JWTs with a deliberately short TTL (8 hours):
 * long enough to cover one trading-day's analyst session without
 * re-auth, short enough that a leaked token's blast-radius is limited
 * to a single workday. They are accepted by the same `withPublicApi`
 * wrapper that handles `fsk_` keys, so every `/api/v1/*` route works
 * with either credential. The Clerk-popup flow re-mints a fresh token
 * on each new sign-in, and the task pane is expected to silently
 * re-prompt when a token has expired.
 */

export const ADDIN_TOKEN_PREFIX = "fxa_"; // Finsyt eXcel Addin
const ALG = "HS256";
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours — one trading-day session

let _secret: string | null = null;
function secret(): string {
  if (_secret) return _secret;
  const fromEnv = (process.env.EXCEL_ADDIN_JWT_SECRET || "").trim();
  if (fromEnv) {
    _secret = fromEnv;
    return _secret;
  }
  // No secret configured — generate a per-process one. This means tokens
  // won't survive a server restart, which is fine for development. In
  // production EXCEL_ADDIN_JWT_SECRET should always be set.
  _secret = randomBytes(48).toString("base64url");
  if (process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.warn(
      "[excel-addin-auth] EXCEL_ADDIN_JWT_SECRET is not set; using ephemeral secret. " +
        "Set EXCEL_ADDIN_JWT_SECRET to a stable value in production.",
    );
  }
  return _secret;
}

export interface AddinTokenClaims {
  orgId: string;       // Clerk-shaped org id (org_…)
  userId: string;      // Clerk-shaped user id (user_…)
  email: string | null;
  iat: number;         // issued-at (ms)
  exp: number;         // expires-at (ms)
}

function b64u(buf: Buffer | string): string {
  return Buffer.from(buf as never).toString("base64url");
}
function b64uDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

export function mintAddinToken(input: {
  orgId: string;
  userId: string;
  email?: string | null;
  ttlMs?: number;
}): string {
  const now = Date.now();
  const claims: AddinTokenClaims = {
    orgId: input.orgId,
    userId: input.userId,
    email: input.email ?? null,
    iat: now,
    exp: now + (input.ttlMs ?? TTL_MS),
  };
  const header = b64u(JSON.stringify({ alg: ALG, typ: "JWT" }));
  const body = b64u(JSON.stringify(claims));
  const payload = `${header}.${body}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${ADDIN_TOKEN_PREFIX}${payload}.${sig}`;
}

export function verifyAddinToken(token: string): AddinTokenClaims | null {
  if (!token || !token.startsWith(ADDIN_TOKEN_PREFIX)) return null;
  const raw = token.slice(ADDIN_TOKEN_PREFIX.length);
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac("sha256", secret())
    .update(`${header}.${body}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let claims: AddinTokenClaims;
  try {
    claims = JSON.parse(b64uDecode(body).toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims.exp !== "number" || claims.exp < Date.now()) return null;
  if (typeof claims.orgId !== "string" || !claims.orgId) return null;
  if (typeof claims.userId !== "string" || !claims.userId) return null;
  return claims;
}

export function isAddinToken(presented: string): boolean {
  return typeof presented === "string" && presented.startsWith(ADDIN_TOKEN_PREFIX);
}
