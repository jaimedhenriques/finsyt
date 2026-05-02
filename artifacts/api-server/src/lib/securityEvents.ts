/**
 * In-memory store of per-user security events (suspicious sign-ins, account
 * lockouts, new-device sign-ins). This is intentionally process-local for the
 * first cut — the persistent audit trail lives in Clerk's session log. The
 * goal here is to surface a recent, app-side view to the user under
 * Account & Security so they notice anomalies without leaving Finsyt.
 *
 * To make this durable across restarts and replicas, swap the Maps below for
 * a Postgres-backed store (a `security_events` table keyed by `userId`).
 */
import { createHash } from "node:crypto";

export type SecurityEventKind =
  | "new_device"
  | "new_country"
  | "ip_lockout"
  | "failed_attempt_burst";

export interface SecurityEvent {
  id: string;
  userId: string;
  kind: SecurityEventKind;
  message: string;
  ip: string;
  userAgent: string;
  createdAt: string; // ISO timestamp
}

const MAX_EVENTS_PER_USER = 50;
const MAX_DEVICES_PER_USER = 200;
const MAX_COUNTRIES_PER_USER = 50;

const events = new Map<string, SecurityEvent[]>();
const knownDevices = new Map<string, Set<string>>();
const knownCountries = new Map<string, Set<string>>();

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function deviceFingerprint(ip: string, userAgent: string): string {
  return createHash("sha256")
    .update(`${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 16);
}

export function recordEvent(
  ev: Omit<SecurityEvent, "id" | "createdAt">,
): SecurityEvent {
  const full: SecurityEvent = {
    ...ev,
    id: shortId(),
    createdAt: new Date().toISOString(),
  };
  const arr = events.get(ev.userId) ?? [];
  arr.unshift(full);
  if (arr.length > MAX_EVENTS_PER_USER) arr.length = MAX_EVENTS_PER_USER;
  events.set(ev.userId, arr);
  return full;
}

export function listEvents(userId: string): SecurityEvent[] {
  return events.get(userId) ?? [];
}

/**
 * Returns true if this fingerprint is the first time we've seen it for this
 * user. Side-effect: registers the fingerprint as known.
 */
export function noteDevice(userId: string, fp: string): boolean {
  let set = knownDevices.get(userId);
  if (!set) {
    set = new Set<string>();
    knownDevices.set(userId, set);
  }
  if (set.has(fp)) return false;
  set.add(fp);
  // Cap memory: drop oldest entries if we exceed the soft cap.
  if (set.size > MAX_DEVICES_PER_USER) {
    const first = set.values().next().value;
    if (first) set.delete(first);
  }
  // First-ever device for a user is not "new" — it's the bootstrap.
  return set.size > 1;
}

/**
 * Returns true if this country is the first time we've seen it for this user
 * (and is therefore unfamiliar). Side-effect: registers the country as known.
 * Returns false for the bootstrap country and for unknown / null inputs.
 */
export function noteCountry(userId: string, country: string | null): boolean {
  if (!country) return false;
  const code = country.toUpperCase();
  let set = knownCountries.get(userId);
  if (!set) {
    set = new Set<string>();
    knownCountries.set(userId, set);
  }
  if (set.has(code)) return false;
  set.add(code);
  if (set.size > MAX_COUNTRIES_PER_USER) {
    const first = set.values().next().value;
    if (first) set.delete(first);
  }
  return set.size > 1;
}
