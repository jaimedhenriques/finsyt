/**
 * Per-account failed-attempt tracker.
 *
 * Keyed by the normalized identifier (typically email) the user submits at
 * sign-in. After too many failures inside the rolling window, the account is
 * locked for `LOCKOUT_MS` and any further attempts on that identifier are
 * short-circuited with 423 before they reach Clerk. The lock is also cleared
 * automatically when a sign-in succeeds (status 200 with `signed_in` status).
 *
 * Process-local for now; back with Redis or Postgres for multi-replica
 * deployments. Clerk also enforces its own per-account attack-protection
 * policy in parallel — this is the application-side layer that lets us
 * surface lockouts to users and trigger our own notifications.
 */

const FAIL_WINDOW_MS = 30 * 60_000;
const FAIL_THRESHOLD = 5;
const LOCKOUT_MS = 30 * 60_000;
// TTL for the (sign_in_id -> identifier) map, generous enough to outlast a
// password attempt sequence but short enough to bound memory.
const SIGN_IN_TTL_MS = 30 * 60_000;
const MAX_SIGN_IN_ENTRIES = 10_000;

interface AccountState {
  failures: number[];
  lockedUntil: number;
}

interface SignInRef {
  identifier: string;
  expiresAt: number;
}

const accounts = new Map<string, AccountState>();
const signInIndex = new Map<string, SignInRef>();

export function normalizeIdentifier(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toLowerCase();
}

function pruneSignInIndex(): void {
  if (signInIndex.size <= MAX_SIGN_IN_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of signInIndex) {
    if (v.expiresAt < now) signInIndex.delete(k);
    if (signInIndex.size <= MAX_SIGN_IN_ENTRIES) break;
  }
}

export function rememberSignIn(signInId: string, identifier: string): void {
  const id = normalizeIdentifier(identifier);
  if (!signInId || !id) return;
  signInIndex.set(signInId, { identifier: id, expiresAt: Date.now() + SIGN_IN_TTL_MS });
  pruneSignInIndex();
}

export function lookupSignIn(signInId: string): string | null {
  const ref = signInIndex.get(signInId);
  if (!ref) return null;
  if (ref.expiresAt < Date.now()) {
    signInIndex.delete(signInId);
    return null;
  }
  return ref.identifier;
}

function getAccount(identifier: string): AccountState {
  let s = accounts.get(identifier);
  if (!s) {
    s = { failures: [], lockedUntil: 0 };
    accounts.set(identifier, s);
  }
  return s;
}

export function isLocked(identifier: string): { locked: boolean; retryAfterSec: number } {
  const id = normalizeIdentifier(identifier);
  if (!id) return { locked: false, retryAfterSec: 0 };
  const s = accounts.get(id);
  if (!s) return { locked: false, retryAfterSec: 0 };
  const now = Date.now();
  if (s.lockedUntil > now) {
    return { locked: true, retryAfterSec: Math.ceil((s.lockedUntil - now) / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

export interface FailureResult {
  failures: number;
  lockedJustNow: boolean;
  lockedUntil: number;
}

export function recordFailure(identifier: string): FailureResult {
  const id = normalizeIdentifier(identifier);
  if (!id) return { failures: 0, lockedJustNow: false, lockedUntil: 0 };
  const s = getAccount(id);
  const now = Date.now();
  const cutoff = now - FAIL_WINDOW_MS;
  s.failures = s.failures.filter((t) => t >= cutoff);
  s.failures.push(now);
  let lockedJustNow = false;
  if (s.failures.length >= FAIL_THRESHOLD && s.lockedUntil <= now) {
    s.lockedUntil = now + LOCKOUT_MS;
    s.failures = [];
    lockedJustNow = true;
  }
  return { failures: s.failures.length, lockedJustNow, lockedUntil: s.lockedUntil };
}

export function recordSuccess(identifier: string): void {
  const id = normalizeIdentifier(identifier);
  if (!id) return;
  accounts.delete(id);
}

export const accountAttemptConfig = {
  FAIL_WINDOW_MS,
  FAIL_THRESHOLD,
  LOCKOUT_MS,
};
