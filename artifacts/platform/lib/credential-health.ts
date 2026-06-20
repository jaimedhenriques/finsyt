/**
 * Credential Health Surface
 * ─────────────────────────
 * Central place where data-provider modules record when an upstream
 * credential (API key, token, etc.) has been **silently** rejected by the
 * upstream — i.e. the provider falls back to a degraded mode (keyless,
 * lower rate-limit, partial data) instead of erroring.
 *
 * Why this exists: the Census provider already detected its key being
 * rejected and quietly fell back to keyless mode, but the only signal was
 * a one-time `console.warn` in stdout. We discovered the rotated/expired
 * key by reading deployment logs after rate-limit pain.
 *
 * Goals:
 *   - **Visibility**: a structured, error-level log the first time we see
 *     a key get rejected, so it surfaces in deployment log filters.
 *   - **Accumulation**: a process-lifetime counter so an operator polling
 *     `/api/health` can see "this key has now been rejected 12 times".
 *   - **Distinguishability**: we explicitly model the difference between
 *     "no key configured" (operator chose keyless), "key configured and
 *     accepted", and "key configured but **rejected** by upstream" (silent
 *     failure — operator action required).
 *
 * Storage is in-process. We deliberately avoid pulling in the platform
 * DB so this module can be imported from any route or worker without a
 * DB-init dependency. The numbers reset when the Node process restarts;
 * that is fine because the *first* upstream call after restart will
 * re-detect a rejected key and re-record it.
 */

/** Provider credential states surfaced by `/api/health`. */
export type CredentialState =
  /** A key/credential is configured AND the most recent upstream call accepted it. */
  | 'ok'
  /**
   * A key/credential is configured but the upstream **rejected** it (401, redirect-to-invalid-key,
   * "Unauthorized" body, etc.) and we have silently fallen back to a degraded mode.
   * This is the case operators most need to see — the app keeps working but at
   * lower rate-limit / reduced data quality.
   */
  | 'rejected'
  /**
   * No key is configured for this provider. May be intentional (the provider
   * supports keyless mode) or a missed deployment step. Distinguishing this
   * from `rejected` matters for ops paging.
   */
  | 'missing'
  /**
   * The credential exists but has not been exercised yet, so we cannot
   * confirm whether the upstream accepts it.
   */
  | 'unknown'

export interface CredentialHealthRecord {
  provider: string
  state: CredentialState
  /** Free-form, redacted reason for the most recent rejection. Never includes the key itself. */
  reason: string | null
  rejectionCount: number
  firstRejectedAt: string | null
  lastRejectedAt: string | null
  lastCheckedAt: string | null
}

interface InternalRecord extends CredentialHealthRecord {
  /** Whether we have already emitted the loud one-shot error log for this provider. */
  loggedOnce: boolean
}

const REGISTRY: Map<string, InternalRecord> = (() => {
  // Persist across hot-reloads in dev and across imports in prod.
  const g = globalThis as unknown as { __finsytCredentialHealth?: Map<string, InternalRecord> }
  if (!g.__finsytCredentialHealth) g.__finsytCredentialHealth = new Map()
  return g.__finsytCredentialHealth
})()

function ensure(provider: string): InternalRecord {
  let rec = REGISTRY.get(provider)
  if (!rec) {
    rec = {
      provider,
      state: 'unknown',
      reason: null,
      rejectionCount: 0,
      firstRejectedAt: null,
      lastRejectedAt: null,
      lastCheckedAt: null,
      loggedOnce: false,
    }
    REGISTRY.set(provider, rec)
  }
  return rec
}

/** Strip anything that could look like a leaked secret before we log it. */
function redactReason(reason: string): string {
  return reason
    .slice(0, 200)
    .replace(/(api[_-]?key|token|bearer)["':=\s]+[A-Za-z0-9_\-]{8,}/gi, '$1=REDACTED')
    .replace(/([?&])(key|api_key|apikey|token|access_key|api_token)=[^&\s]+/gi, '$1$2=REDACTED')
}

/**
 * Record that `provider` had its credential rejected by the upstream.
 *
 *   - Emits a single error-level structured log the first time per process
 *     (so it shows up cleanly in `level=error` deployment-log filters).
 *   - Bumps a counter so repeated silent failures don't blend into the
 *     background noise on the health endpoint.
 *
 * Safe to call on every rejected upstream response — it self-throttles the
 * loud log to once per process and just bumps the counter on subsequent calls.
 */
export function recordKeyRejection(provider: string, reason: string): void {
  const rec = ensure(provider)
  const now = new Date().toISOString()
  rec.state = 'rejected'
  rec.reason = redactReason(reason)
  rec.rejectionCount += 1
  if (!rec.firstRejectedAt) rec.firstRejectedAt = now
  rec.lastRejectedAt = now
  rec.lastCheckedAt = now

  if (!rec.loggedOnce) {
    rec.loggedOnce = true
    // Single structured error per process — operators can grep for
    // "credential.rejected" and immediately see which key needs rotation.
    console.error(JSON.stringify({
      level: 'error',
      event: 'credential.rejected',
      provider,
      reason: rec.reason,
      message: `[credential-health] ${provider} credential was rejected by upstream — silent fallback engaged. Rotate or refresh the key.`,
      at: now,
    }))
  }
}

/**
 * Record that `provider`'s configured credential was just accepted by the
 * upstream. Clears any prior rejection state so a re-rotated key can recover
 * without a process restart.
 *
 * We deliberately also null out `firstRejectedAt` / `lastRejectedAt` (not just
 * `reason`) so that the *next* rejection episode starts a fresh dwell timer.
 * Otherwise the "still broken" reminder in `credential-health-notifier.ts`
 * would treat a brand-new re-rejection as already past its 4h threshold (the
 * stale `firstRejectedAt` from the previous episode would be days or months
 * old) and page on-call on the very first tick.
 */
export function recordKeyAccepted(provider: string): void {
  const rec = ensure(provider)
  const now = new Date().toISOString()
  rec.state = 'ok'
  rec.reason = null
  rec.firstRejectedAt = null
  rec.lastRejectedAt = null
  rec.lastCheckedAt = now
  // Reset the loud-log latch so a *future* re-rejection is loud again.
  rec.loggedOnce = false
}

/**
 * Record that `provider` has no credential configured at all (and one is
 * expected). This is informational — it does not log loudly because keyless
 * mode is sometimes intentional.
 *
 * Like `recordKeyAccepted`, we null out `firstRejectedAt` / `lastRejectedAt`
 * (not just `reason`) so that:
 *   1. `/api/health` doesn't keep surfacing the *previous* rejection's reason
 *      and timestamps under a `missing` provider (visually misleading for ops),
 *   2. if the operator later re-adds the key and it gets rejected again, the
 *      "still broken" reminder in `credential-health-notifier.ts` doesn't
 *      misfire on the very first tick because of a stale, hours/days-old
 *      `firstRejectedAt` from the previous episode (same hazard recordKeyAccepted
 *      already guards against on the recover path).
 * We also reset the loud-log latch so a future re-rejection is loud again.
 */
export function recordKeyMissing(provider: string): void {
  const rec = ensure(provider)
  rec.state = 'missing'
  rec.reason = null
  rec.firstRejectedAt = null
  rec.lastRejectedAt = null
  rec.lastCheckedAt = new Date().toISOString()
  rec.loggedOnce = false
}

/**
 * Record that `provider` has a credential configured but has not yet been
 * exercised. Idempotent: only seeds the registry — leaves prior `ok` /
 * `rejected` / `missing` state untouched. Call this on module load so that
 * even providers nobody has hit this session show up on
 * `/api/health.credentialHealth.providers` instead of silently disappearing.
 */
export function recordKeyConfigured(provider: string): void {
  const existing = REGISTRY.get(provider)
  if (existing) return  // never downgrade ok/rejected/missing back to unknown
  ensure(provider).lastCheckedAt = new Date().toISOString()
}

/** Strip the internal `loggedOnce` flag from the public shape. */
function publicShape(rec: InternalRecord): CredentialHealthRecord {
  return {
    provider: rec.provider,
    state: rec.state,
    reason: rec.reason,
    rejectionCount: rec.rejectionCount,
    firstRejectedAt: rec.firstRejectedAt,
    lastRejectedAt: rec.lastRejectedAt,
    lastCheckedAt: rec.lastCheckedAt,
  }
}

/** Snapshot of one provider's credential health (or null if never recorded). */
export function getCredentialHealth(provider: string): CredentialHealthRecord | null {
  const rec = REGISTRY.get(provider)
  return rec ? publicShape(rec) : null
}

/** Snapshot of every provider that has ever been recorded this process. */
export function listCredentialHealth(): CredentialHealthRecord[] {
  return Array.from(REGISTRY.values()).map(publicShape)
}

/** Aggregate counters suitable for embedding in a top-level health response. */
export function credentialHealthSummary(): {
  rejected: number
  ok: number
  missing: number
  unknown: number
  totalRejections: number
  rejectedProviders: string[]
} {
  let rejected = 0, ok = 0, missing = 0, unknown = 0, totalRejections = 0
  const rejectedProviders: string[] = []
  for (const rec of REGISTRY.values()) {
    totalRejections += rec.rejectionCount
    if (rec.state === 'rejected') { rejected += 1; rejectedProviders.push(rec.provider) }
    else if (rec.state === 'ok') ok += 1
    else if (rec.state === 'missing') missing += 1
    else unknown += 1
  }
  return { rejected, ok, missing, unknown, totalRejections, rejectedProviders }
}

/** Test/debug helper — wipes the in-process registry. Not used at runtime. */
export function __resetCredentialHealthForTests(): void {
  REGISTRY.clear()
}
