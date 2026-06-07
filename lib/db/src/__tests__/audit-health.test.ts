/**
 * Tests for the audit-write health surface.
 *
 * The module is deliberately self-contained (no DB import), so these
 * tests run with `node --import tsx --test` without needing a real
 * Postgres or DATABASE_URL.
 *
 * We capture `console.error` to assert on the structured log lines
 * emitted by the module — that is the same hook the production Pino
 * sink consumes, so verifying the JSON shape here is what lets ops
 * write a real alert rule against `event=audit.write.alert`.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  recordAuditWriteSuccess,
  recordAuditWriteFailure,
  getAuditWriteHealth,
  __resetAuditWriteHealthForTests,
} from "../audit-health.js";

interface CapturedLog {
  raw: string;
  parsed: Record<string, unknown> | null;
}

let captured: CapturedLog[] = [];
let originalConsoleError: typeof console.error;

const SAVED_ENV: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "AUDIT_ALERT_FAILURE_RATE",
  "AUDIT_ALERT_WINDOW_MINUTES",
  "AUDIT_ALERT_MIN_SAMPLES",
  "AUDIT_ALERT_COOLDOWN_SECONDS",
] as const;

beforeEach(() => {
  __resetAuditWriteHealthForTests();
  captured = [];
  originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const raw = args.length === 1 && typeof args[0] === "string" ? args[0] : args.map(String).join(" ");
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    captured.push({ raw, parsed });
  };
  for (const k of ENV_KEYS) {
    SAVED_ENV[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  console.error = originalConsoleError;
  for (const k of ENV_KEYS) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
});

function logsByEvent(name: string): Array<Record<string, unknown>> {
  return captured
    .map(c => c.parsed)
    .filter((p): p is Record<string, unknown> => !!p && p.event === name);
}

test("success-only traffic stays clean and reports zero failure rate", () => {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  for (let i = 0; i < 50; i++) recordAuditWriteSuccess(t0 + i * 1000);

  const snap = getAuditWriteHealth(t0 + 60_000);
  assert.equal(snap.totalAttempts, 50);
  assert.equal(snap.totalSuccesses, 50);
  assert.equal(snap.totalFailures, 0);
  assert.equal(snap.window.failures, 0);
  assert.equal(snap.window.failureRate, 0);
  assert.equal(snap.alert.active, false);
  assert.equal(snap.alert.lastAlertAt, null);
  assert.deepEqual(logsByEvent("audit.write.failed"), []);
  assert.deepEqual(logsByEvent("audit.write.alert"), []);
});

test("each failure emits a structured audit.write.failed log with redacted reason", () => {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  recordAuditWriteFailure(new Error("relation \"audit_events_202601\" does not exist"), "auth.login.success", t0);

  const failed = logsByEvent("audit.write.failed");
  assert.equal(failed.length, 1);
  assert.equal(failed[0]!.level, "error");
  assert.equal(failed[0]!.action, "auth.login.success");
  assert.match(String(failed[0]!.reason), /audit_events_202601/);
  assert.equal(failed[0]!.totalFailures, 1);
  assert.equal(failed[0]!.totalAttempts, 1);
  assert.ok(typeof failed[0]!.at === "string");
});

test("does NOT alert below the minimum-sample floor even at 100% failure", () => {
  process.env.AUDIT_ALERT_MIN_SAMPLES = "20";
  process.env.AUDIT_ALERT_FAILURE_RATE = "0.01";

  const t0 = Date.parse("2026-01-01T00:00:00Z");
  // 5 failures, no successes — 100% failure rate but well below minSamples.
  for (let i = 0; i < 5; i++) recordAuditWriteFailure(new Error("disk full"), "x", t0 + i * 1000);

  assert.deepEqual(logsByEvent("audit.write.alert"), []);
  const snap = getAuditWriteHealth(t0 + 5000);
  assert.equal(snap.alert.active, false);
  assert.equal(snap.window.attempts, 5);
  assert.equal(snap.window.failures, 5);
});

test("crosses threshold once enough samples and failure rate are present", () => {
  process.env.AUDIT_ALERT_MIN_SAMPLES = "20";
  process.env.AUDIT_ALERT_FAILURE_RATE = "0.05"; // 5%
  process.env.AUDIT_ALERT_WINDOW_MINUTES = "5";
  process.env.AUDIT_ALERT_COOLDOWN_SECONDS = "60";

  const t0 = Date.parse("2026-01-01T00:00:00Z");
  // 90 successes, then 10 failures — the rolling rate climbs past 5%
  // somewhere mid-failure-burst, and the very first breach should fire
  // exactly one alert (subsequent failures stay inside the cooldown).
  for (let i = 0; i < 90; i++) recordAuditWriteSuccess(t0 + i * 100);
  for (let i = 0; i < 10; i++) recordAuditWriteFailure(new Error("boom"), "x", t0 + (90 + i) * 100);

  const alerts = logsByEvent("audit.write.alert");
  assert.equal(alerts.length, 1, "exactly one alert should fire when rate first crosses the threshold");
  const a = alerts[0]!;
  assert.equal(a.level, "error");
  assert.equal(a.threshold, 0.05);
  assert.equal(a.windowMinutes, 5);
  assert.equal(a.minSamples, 20);
  // Alert fires on the first breach, not after every subsequent failure.
  // Guard the bounds rather than the exact moment so a future scheduling
  // tweak doesn't make this test brittle.
  assert.ok((a.windowAttempts as number) >= 20);
  assert.ok((a.windowAttempts as number) <= 100);
  assert.ok((a.windowFailures as number) >= 1);
  assert.ok((a.failureRate as number) > 0.05, `failureRate ${a.failureRate} should exceed 0.05`);
  assert.match(String(a.message), /exceeded threshold/);

  const snap = getAuditWriteHealth(t0 + 99 * 100);
  assert.equal(snap.alert.active, true);
  assert.ok(snap.alert.lastAlertAt);
});

test("alert log line is throttled by the cooldown but counters keep climbing", () => {
  process.env.AUDIT_ALERT_MIN_SAMPLES = "10";
  process.env.AUDIT_ALERT_FAILURE_RATE = "0.05";
  process.env.AUDIT_ALERT_COOLDOWN_SECONDS = "60";
  process.env.AUDIT_ALERT_WINDOW_MINUTES = "5";

  const t0 = Date.parse("2026-01-01T00:00:00Z");
  // Trip the threshold.
  for (let i = 0; i < 9; i++) recordAuditWriteSuccess(t0 + i * 1000);
  recordAuditWriteFailure(new Error("first"), "x", t0 + 9_000);
  recordAuditWriteFailure(new Error("second"), "x", t0 + 10_000); // still inside cooldown
  recordAuditWriteFailure(new Error("third"), "x", t0 + 30_000);  // still inside cooldown

  // Only one alert fired despite the three subsequent failures.
  assert.equal(logsByEvent("audit.write.alert").length, 1);
  // But the per-failure structured log fired three times.
  assert.equal(logsByEvent("audit.write.failed").length, 3);

  // Past the cooldown, another alert is allowed if we're still over threshold.
  recordAuditWriteFailure(new Error("fourth"), "x", t0 + 90_000);
  assert.equal(logsByEvent("audit.write.alert").length, 2);
});

test("alertActive clears once the rolling window recovers below threshold", () => {
  process.env.AUDIT_ALERT_MIN_SAMPLES = "10";
  process.env.AUDIT_ALERT_FAILURE_RATE = "0.05";
  process.env.AUDIT_ALERT_WINDOW_MINUTES = "5";

  const t0 = Date.parse("2026-01-01T00:00:00Z");
  // Trip the alert.
  for (let i = 0; i < 9; i++) recordAuditWriteSuccess(t0 + i * 1000);
  recordAuditWriteFailure(new Error("blip"), "x", t0 + 9_000);
  assert.equal(getAuditWriteHealth(t0 + 9_000).alert.active, true);

  // Move >5 minutes forward and feed clean traffic — the failed bucket
  // ages out of the window and `alert.active` flips off again.
  const recoveredAt = t0 + 7 * 60_000;
  for (let i = 0; i < 30; i++) recordAuditWriteSuccess(recoveredAt + i * 1000);

  const snap = getAuditWriteHealth(recoveredAt + 30_000);
  assert.equal(snap.alert.active, false);
  assert.equal(snap.window.failures, 0);
  assert.equal(snap.window.attempts, 30);
});

test("rolling window correctly drops buckets older than the configured window", () => {
  process.env.AUDIT_ALERT_WINDOW_MINUTES = "5";
  process.env.AUDIT_ALERT_MIN_SAMPLES = "10000"; // disable alerting noise here

  const t0 = Date.parse("2026-01-01T00:00:00Z");
  recordAuditWriteFailure(new Error("old"), "x", t0); // minute 0
  // Walk forward exactly 5 minutes — minute 0 should age out.
  const later = t0 + 5 * 60_000;
  for (let i = 0; i < 4; i++) recordAuditWriteSuccess(later + i * 1000);

  const snap = getAuditWriteHealth(later + 4_000);
  assert.equal(snap.window.failures, 0, "the old failure bucket should have aged out of the 5-minute window");
  assert.equal(snap.window.attempts, 4);
  // Lifetime totals are unaffected by the rolling window.
  assert.equal(snap.totalFailures, 1);
  assert.equal(snap.totalAttempts, 5);
});

test("non-Error thrown values are stringified safely into the failure reason", () => {
  recordAuditWriteFailure({ code: "23P01", detail: "partition missing" }, "x");
  const snap = getAuditWriteHealth();
  assert.match(String(snap.lastFailureReason), /23P01/);
  assert.match(String(snap.lastFailureReason), /partition missing/);
});
