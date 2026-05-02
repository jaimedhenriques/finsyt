/**
 * Audit-write Health Surface
 * ──────────────────────────
 * Counters and alert plumbing for the deliberately-swallowing audit
 * pipeline (`auditLog` in `./audit.ts`).
 *
 * Why this exists
 * ---------------
 * `auditLog` is required by compliance reviewers but must never break a
 * customer request, so it catches and discards every error. Today the
 * only signal a write actually failed is a one-shot `console.error` —
 * useful when an operator is *already looking*, but worthless if the
 * audit pipeline silently rots between reviews (partition exhaustion,
 * disk full, schema drift, RLS misconfig). A sustained failure leaves
 * compliance gaps that nobody notices until the next external audit.
 *
 * What this module adds
 * ---------------------
 *   - **Counters**: process-lifetime totals for `attempts`, `successes`,
 *     and `failures`, plus the most recent failure reason (truncated).
 *   - **Sliding window**: per-minute buckets covering the last
 *     `WINDOW_MINUTES` minutes so we can compute a rolling failure rate
 *     instead of just a since-boot ratio that drifts toward zero.
 *   - **Structured failure log**: a single-line JSON `level=error
 *     event=audit.write.failed` log on every failure (greppable by
 *     log shippers / alerting rules).
 *   - **Threshold alert log**: a separate `event=audit.write.alert`
 *     line whenever the rolling failure rate crosses the documented
 *     threshold (default: more than 1% of writes failing over a
 *     5-minute window, with at least 20 sample writes to avoid paging
 *     on a 1-of-2 transient blip). Self-throttled by an alert cooldown
 *     so a sustained outage produces a steady drip of pages instead of
 *     a wall of duplicates.
 *
 * Operator workflow
 * -----------------
 *   1. The Pino logger in `artifacts/api-server/src/lib/logger.ts`
 *      already ships every `level=error` line to the platform log
 *      sink, so both `event=audit.write.failed` and
 *      `event=audit.write.alert` flow through with zero extra wiring.
 *   2. An on-call alert rule should match
 *      `event=audit.write.alert` (e.g. "page on any matching line in
 *      the last 5 minutes"). The alert message embeds the rolling
 *      failure rate, sample size, and last failure reason so the
 *      pager has actionable context.
 *   3. The current snapshot is also exposed at
 *      `GET /api/admin/audit/health` for ad-hoc inspection / dashboards.
 *
 * Thresholds are deliberately *defaults* and overridable via env so
 * production can dial sensitivity without a redeploy:
 *
 *   - `AUDIT_ALERT_FAILURE_RATE`        Float in `(0, 1]`. Default `0.01` (1%).
 *   - `AUDIT_ALERT_WINDOW_MINUTES`      Integer ≥ 1. Default `5`.
 *   - `AUDIT_ALERT_MIN_SAMPLES`         Integer ≥ 1. Default `20`.
 *   - `AUDIT_ALERT_COOLDOWN_SECONDS`    Integer ≥ 1. Default `60`.
 *
 * Storage is in-process. The numbers reset when the Node process
 * restarts; that's fine because a real ongoing failure will re-trip
 * the threshold within `WINDOW_MINUTES` of the next traffic.
 */

const DEFAULT_ALERT_FAILURE_RATE = 0.01;
const DEFAULT_ALERT_WINDOW_MINUTES = 5;
const DEFAULT_ALERT_MIN_SAMPLES = 20;
const DEFAULT_ALERT_COOLDOWN_SECONDS = 60;

const MAX_REASON_LENGTH = 240;

interface MinuteBucket {
  /** Unix-minute index, i.e. `Math.floor(epochMs / 60_000)`. */
  minute: number;
  attempts: number;
  failures: number;
}

interface AuditHealthState {
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  lastFailureAt: string | null;
  lastFailureAction: string | null;
  lastFailureReason: string | null;
  /** Ring of recent per-minute counters. Trimmed lazily on every record. */
  buckets: MinuteBucket[];
  /** Last time we emitted an `event=audit.write.alert` line (ms epoch). */
  lastAlertAt: number | null;
  /** True while the most-recent evaluation was over the alert threshold. */
  alertActive: boolean;
}

const STATE: AuditHealthState = (() => {
  const g = globalThis as unknown as { __finsytAuditHealth?: AuditHealthState };
  if (!g.__finsytAuditHealth) {
    g.__finsytAuditHealth = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      lastFailureAt: null,
      lastFailureAction: null,
      lastFailureReason: null,
      buckets: [],
      lastAlertAt: null,
      alertActive: false,
    };
  }
  return g.__finsytAuditHealth;
})();

function readPositiveFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) return fallback;
  return parsed;
}

interface AlertConfig {
  failureRate: number;
  windowMinutes: number;
  minSamples: number;
  cooldownSeconds: number;
}

function readAlertConfig(): AlertConfig {
  const failureRate = Math.min(1, readPositiveFloatEnv("AUDIT_ALERT_FAILURE_RATE", DEFAULT_ALERT_FAILURE_RATE));
  return {
    failureRate,
    windowMinutes: readPositiveIntEnv("AUDIT_ALERT_WINDOW_MINUTES", DEFAULT_ALERT_WINDOW_MINUTES),
    minSamples: readPositiveIntEnv("AUDIT_ALERT_MIN_SAMPLES", DEFAULT_ALERT_MIN_SAMPLES),
    cooldownSeconds: readPositiveIntEnv("AUDIT_ALERT_COOLDOWN_SECONDS", DEFAULT_ALERT_COOLDOWN_SECONDS),
  };
}

function currentMinute(nowMs: number): number {
  return Math.floor(nowMs / 60_000);
}

function trimBuckets(state: AuditHealthState, nowMs: number, windowMinutes: number): void {
  const cutoff = currentMinute(nowMs) - windowMinutes + 1;
  // Drop any bucket older than the start of the window (inclusive).
  while (state.buckets.length > 0 && state.buckets[0]!.minute < cutoff) {
    state.buckets.shift();
  }
}

function bucketFor(state: AuditHealthState, nowMs: number): MinuteBucket {
  const minute = currentMinute(nowMs);
  const last = state.buckets[state.buckets.length - 1];
  if (last && last.minute === minute) return last;
  const fresh: MinuteBucket = { minute, attempts: 0, failures: 0 };
  state.buckets.push(fresh);
  return fresh;
}

interface WindowStats {
  attempts: number;
  failures: number;
  rate: number;
}

function windowStats(state: AuditHealthState, nowMs: number, windowMinutes: number): WindowStats {
  trimBuckets(state, nowMs, windowMinutes);
  let attempts = 0;
  let failures = 0;
  for (const b of state.buckets) {
    attempts += b.attempts;
    failures += b.failures;
  }
  const rate = attempts > 0 ? failures / attempts : 0;
  return { attempts, failures, rate };
}

function reasonFromError(err: unknown): string {
  if (err == null) return "unknown";
  if (err instanceof Error) {
    const msg = err.message || err.name || "Error";
    return msg.length > MAX_REASON_LENGTH ? `${msg.slice(0, MAX_REASON_LENGTH)}…` : msg;
  }
  try {
    const s = typeof err === "string" ? err : JSON.stringify(err);
    return s.length > MAX_REASON_LENGTH ? `${s.slice(0, MAX_REASON_LENGTH)}…` : s;
  } catch {
    return "non-serialisable error";
  }
}

/**
 * Record that an audit-log insert succeeded. Counts toward the rolling
 * window so a brief failure spike doesn't permanently dominate the rate.
 */
export function recordAuditWriteSuccess(nowMs: number = Date.now()): void {
  STATE.totalAttempts += 1;
  STATE.totalSuccesses += 1;
  bucketFor(STATE, nowMs).attempts += 1;
  // Re-evaluate alert state so `alertActive` clears once traffic recovers.
  evaluateAlert(nowMs);
}

/**
 * Record that an audit-log insert failed. Always emits a structured
 * `event=audit.write.failed` error log. May also emit a throttled
 * `event=audit.write.alert` line if the rolling failure rate crosses
 * the configured threshold.
 */
export function recordAuditWriteFailure(
  err: unknown,
  action?: string,
  nowMs: number = Date.now(),
): void {
  STATE.totalAttempts += 1;
  STATE.totalFailures += 1;
  STATE.lastFailureAt = new Date(nowMs).toISOString();
  STATE.lastFailureAction = action ?? null;
  STATE.lastFailureReason = reasonFromError(err);
  const bucket = bucketFor(STATE, nowMs);
  bucket.attempts += 1;
  bucket.failures += 1;

  // Per-failure structured log — picked up by the api-server Pino sink
  // and any platform log shipper. Never includes raw error stacks (PII).
  emitStructuredLog({
    level: "error",
    event: "audit.write.failed",
    action: action ?? null,
    reason: STATE.lastFailureReason,
    totalFailures: STATE.totalFailures,
    totalAttempts: STATE.totalAttempts,
    at: STATE.lastFailureAt,
    message: `[audit] insert failed (action=${action ?? "?"}): ${STATE.lastFailureReason}`,
  });

  evaluateAlert(nowMs);
}

function evaluateAlert(nowMs: number): void {
  const cfg = readAlertConfig();
  const stats = windowStats(STATE, nowMs, cfg.windowMinutes);
  const breached = stats.attempts >= cfg.minSamples && stats.rate > cfg.failureRate;

  if (!breached) {
    STATE.alertActive = false;
    return;
  }

  STATE.alertActive = true;

  const cooldownMs = cfg.cooldownSeconds * 1000;
  if (STATE.lastAlertAt != null && nowMs - STATE.lastAlertAt < cooldownMs) {
    // Still in cooldown — counters and `alertActive` already updated above,
    // just don't emit another alert log line yet.
    return;
  }
  STATE.lastAlertAt = nowMs;

  emitStructuredLog({
    level: "error",
    event: "audit.write.alert",
    failureRate: stats.rate,
    failureRatePct: Number((stats.rate * 100).toFixed(2)),
    windowMinutes: cfg.windowMinutes,
    windowAttempts: stats.attempts,
    windowFailures: stats.failures,
    threshold: cfg.failureRate,
    thresholdPct: Number((cfg.failureRate * 100).toFixed(2)),
    minSamples: cfg.minSamples,
    lastFailureReason: STATE.lastFailureReason,
    lastFailureAction: STATE.lastFailureAction,
    at: new Date(nowMs).toISOString(),
    message:
      `[audit] write failure rate ${(stats.rate * 100).toFixed(2)}% over last ` +
      `${cfg.windowMinutes}m exceeded threshold ${(cfg.failureRate * 100).toFixed(2)}% ` +
      `(${stats.failures}/${stats.attempts} writes failing) — investigate the audit pipeline.`,
  });
}

function emitStructuredLog(payload: Record<string, unknown>): void {
  // Single-line JSON so Pino / log shippers capture it as one event.
  // We intentionally use console.error rather than importing pino — this
  // module is in `lib/db` and must not pull artifact-level dependencies.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
}

export interface AuditWriteHealthSnapshot {
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  lastFailureAt: string | null;
  lastFailureAction: string | null;
  lastFailureReason: string | null;
  window: {
    minutes: number;
    attempts: number;
    failures: number;
    failureRate: number;
  };
  alert: {
    active: boolean;
    threshold: number;
    minSamples: number;
    cooldownSeconds: number;
    lastAlertAt: string | null;
  };
}

/** Read-only snapshot suitable for `/api/admin/audit/health` and tests. */
export function getAuditWriteHealth(nowMs: number = Date.now()): AuditWriteHealthSnapshot {
  const cfg = readAlertConfig();
  const stats = windowStats(STATE, nowMs, cfg.windowMinutes);
  return {
    totalAttempts: STATE.totalAttempts,
    totalSuccesses: STATE.totalSuccesses,
    totalFailures: STATE.totalFailures,
    lastFailureAt: STATE.lastFailureAt,
    lastFailureAction: STATE.lastFailureAction,
    lastFailureReason: STATE.lastFailureReason,
    window: {
      minutes: cfg.windowMinutes,
      attempts: stats.attempts,
      failures: stats.failures,
      failureRate: stats.rate,
    },
    alert: {
      active: STATE.alertActive,
      threshold: cfg.failureRate,
      minSamples: cfg.minSamples,
      cooldownSeconds: cfg.cooldownSeconds,
      lastAlertAt: STATE.lastAlertAt != null ? new Date(STATE.lastAlertAt).toISOString() : null,
    },
  };
}

/** Test/debug helper — wipes the in-process state. Not used at runtime. */
export function __resetAuditWriteHealthForTests(): void {
  STATE.totalAttempts = 0;
  STATE.totalSuccesses = 0;
  STATE.totalFailures = 0;
  STATE.lastFailureAt = null;
  STATE.lastFailureAction = null;
  STATE.lastFailureReason = null;
  STATE.buckets.length = 0;
  STATE.lastAlertAt = null;
  STATE.alertActive = false;
}
