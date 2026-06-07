/**
 * Credential Health Notifier
 * ──────────────────────────
 * Pages on-call when an upstream data-provider credential starts getting
 * silently rejected. Today the only signal is a one-shot `level=error
 * event=credential.rejected` log line plus a counter on `/api/health` —
 * useful if an operator is *already looking*, but nothing actively
 * notifies anyone.
 *
 * This module bridges that gap. On each tick it:
 *
 *   1. Reads `credentialHealthSummary()` and `listCredentialHealth()`
 *      from `./credential-health`.
 *   2. Compares each provider's current state with the per-provider
 *      latch held in a process-level state map.
 *   3. On a `ok → rejected` transition, schedules a `🚨 credential
 *      rejected` alert.
 *   4. On a `rejected → ok` transition, schedules a `✅ credential
 *      recovered` follow-up.
 *   5. Suppresses any per-provider transition that occurs within
 *      `OPS_ALERT_MIN_INTERVAL_SECONDS` of that provider's most recent
 *      fired notification (alert *or* recovery). Suppressed transitions
 *      are still recorded as a structured `event=credential.alert.suppressed`
 *      log line for forensic auditing.
 *   6. Aggregates the surviving per-provider transitions into a single
 *      alert and/or recovery webhook for this tick.
 *   7. For any provider still in `rejected` state past the configurable
 *      `OPS_ALERT_REMINDER_HOURS` threshold (default 4h) — and not
 *      already reminded for this rejection episode — POSTs a `⏰ still
 *      broken` reminder so a stuck rejected key can't sit broken for
 *      days after the original alert scrolls out of chat history.
 *
 * Why per-provider, not aggregate? A partially-broken upstream (e.g. a
 * load-balancer with one bad node) can rapidly toggle a single key
 * between accepted and rejected. With the previous aggregate latch the
 * whole `rejected > 0` flag flapped on every toggle and on-call would
 * have been paged dozens of times an hour. Cooldown is keyed on the
 * provider name so a *different* provider's first-ever failure is never
 * suppressed by an unrelated key still cooling down. Reminders are
 * similarly keyed per provider against `firstRejectedAt`, so a
 * recover → re-reject cycle re-arms the reminder timer for the new
 * episode without needing a process restart.
 *
 * Configuration (all optional — module no-ops cleanly when unset):
 *
 *   - `OPS_ALERT_WEBHOOK_URL`            Slack/Discord/generic incoming
 *                                        webhook URL. Posted as
 *                                        `{ text: "..." }` JSON, which
 *                                        Slack and most generic webhook
 *                                        receivers accept verbatim.
 *   - `OPS_ALERT_HEALTH_URL`             Public URL of `/api/health` to
 *                                        deep-link from the alert.
 *                                        Falls back to the literal
 *                                        string `/api/health` if unset.
 *   - `OPS_ALERT_MIN_INTERVAL_SECONDS`   Minimum quiet period between
 *                                        consecutive notifications for
 *                                        the *same* provider. Defaults
 *                                        to 900 (15 minutes). Set to
 *                                        `0` to disable throttling.
 *   - `OPS_ALERT_REMINDER_HOURS`         How long a credential must
 *                                        remain in the rejected state
 *                                        before we re-page. Float
 *                                        hours; defaults to 4. Set to
 *                                        0 / negative / non-numeric to
 *                                        disable reminders.
 *
 * Storage is in-process (same as `credential-health.ts`). After a
 * restart, the *first* upstream call re-detects a rejected key and
 * re-arms the latch, so the next transition pages again — exactly the
 * behaviour we want for ops. Reminder bookkeeping also resets on
 * restart, which simply means a long-rejected provider may get one
 * extra reminder soon after boot — preferable to silently dropping it.
 */

import { credentialHealthSummary, listCredentialHealth, type CredentialHealthRecord } from './credential-health'

/** Default minimum quiet period between consecutive per-provider notifications, in seconds. */
export const DEFAULT_MIN_INTERVAL_SECONDS = 900

/** Default "still broken" reminder threshold, in hours. */
export const DEFAULT_REMINDER_HOURS = 4

/** Per-provider transition kind that the notifier can emit. */
export type TransitionKind = 'alert' | 'recovery'

/** A per-provider transition that was suppressed because it happened inside the cooldown window. */
export interface SuppressedProviderTransition {
  provider: string
  kind: TransitionKind
  /** Seconds remaining on the cooldown window for this provider. */
  cooldownRemainingSeconds: number
  /** ISO timestamp of the previous *fired* notification that started the cooldown. */
  lastNotifiedAt: string
}

export interface NotifierTransition {
  /** Whether a webhook should be posted for this tick (i.e. at least one
   *  per-provider transition survived the cooldown filter). */
  shouldNotify: boolean
  /** `'alert'` if any provider newly entered `rejected`, `'recovery'` if
   *  only recoveries fired, `null` if nothing fired. When both alerts and
   *  recoveries fire in the same tick, `kind` is `'alert'` (the more
   *  urgent message), and the recovery message is delivered as a second
   *  webhook by `tickCredentialHealthNotifier`. */
  kind: TransitionKind | null
  /** Human-readable summary line for the alert webhook body, if any. */
  message: string
  /** Provider records that triggered the alert this tick (post-cooldown). */
  rejectedProviders: CredentialHealthRecord[]
  /** Names of providers whose recovery fired this tick (post-cooldown). */
  recoveredProviders: string[]
  /** Recovery webhook body, if any recoveries fired this tick. Empty string otherwise. */
  recoveryMessage: string
  /** Per-provider transitions that were suppressed by the cooldown this tick. */
  suppressed: SuppressedProviderTransition[]
}

/** Per-provider cooldown latch entry. */
export interface ProviderNotifierState {
  /** Whether the last *fired* notification for this provider put us in `rejected`. */
  inRejectedState: boolean
  /** Unix-ms of the most recent fired notification (alert OR recovery) for this provider. */
  lastNotifiedAtMs: number
  /** Kind of the most recent fired notification for this provider. */
  lastKind: TransitionKind
}

export interface NotifierReminder {
  /** Whether a reminder webhook should be posted for this tick. */
  shouldNotify: boolean
  /** Human-readable summary line for the webhook body. */
  message: string
  /** Provider records due for a "still broken" reminder this tick. */
  remindedProviders: CredentialHealthRecord[]
}

export interface NotifierState {
  /** Aggregate flag — true iff `summary.rejected > 0` after the most recent
   *  fired transition. Kept for backward-compatible diagnostics. */
  inRejectedState: boolean
  /** ISO timestamp of the most recent fired webhook (any provider). */
  lastNotifiedAt: string | null
  /** Per-provider cooldown latch (used by the throttler). */
  providers: Record<string, ProviderNotifierState>
  /**
   * For each provider we have already paged a "still broken" reminder for,
   * the `firstRejectedAt` value the reminder corresponded to. We key on the
   * timestamp (rather than a plain boolean) so that a recover → re-reject
   * cycle that happens to mint a fresh `firstRejectedAt` re-arms the
   * reminder for the new episode without needing a process restart.
   */
  remindersSent: Record<string, string>
}

// Process-level latch. Persisted on globalThis so dev hot-reloads don't
// accidentally double-fire alerts every time the module is re-evaluated.
const STATE: NotifierState = (() => {
  const g = globalThis as unknown as { __finsytCredentialHealthNotifier?: NotifierState }
  if (!g.__finsytCredentialHealthNotifier) {
    g.__finsytCredentialHealthNotifier = {
      inRejectedState: false,
      lastNotifiedAt: null,
      providers: {},
      remindersSent: {},
    }
  }
  // Backfill fields that may be missing in a state object that pre-dates
  // a given enhancement, so the module keeps working across hot-reload
  // from older builds.
  if (!g.__finsytCredentialHealthNotifier.providers) {
    g.__finsytCredentialHealthNotifier.providers = {}
  }
  if (!g.__finsytCredentialHealthNotifier.remindersSent) {
    g.__finsytCredentialHealthNotifier.remindersSent = {}
  }
  return g.__finsytCredentialHealthNotifier
})()

/** Parse `OPS_ALERT_REMINDER_HOURS`; returns null when reminders should be disabled. */
function parseReminderThresholdMs(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return DEFAULT_REMINDER_HOURS * 3_600_000
  const hours = Number(raw)
  if (!Number.isFinite(hours) || hours <= 0) return null
  return hours * 3_600_000
}

/** Format the per-provider rejection detail for the alert body. */
function describeProvider(rec: CredentialHealthRecord): string {
  const reason = rec.reason ? ` — ${rec.reason}` : ''
  const count = rec.rejectionCount > 1 ? ` (×${rec.rejectionCount})` : ''
  return `• ${rec.provider}${count}${reason}`
}

/** Format the per-provider reminder detail, including how long it has been broken. */
function describeReminderProvider(rec: CredentialHealthRecord, nowMs: number): string {
  const firstMs = rec.firstRejectedAt ? new Date(rec.firstRejectedAt).getTime() : nowMs
  const ageH = Math.max(0, (nowMs - firstMs) / 3_600_000)
  const reason = rec.reason ? ` — ${rec.reason}` : ''
  return `• ${rec.provider} (rejected for ${ageH.toFixed(1)}h, ×${rec.rejectionCount})${reason}`
}

/** Resolve the cooldown window in milliseconds from an explicit option or env. */
export function resolveCooldownMs(explicitSeconds?: number): number {
  if (typeof explicitSeconds === 'number' && Number.isFinite(explicitSeconds)) {
    return Math.max(0, Math.floor(explicitSeconds * 1000))
  }
  const raw = process.env.OPS_ALERT_MIN_INTERVAL_SECONDS
  if (raw == null || raw === '') return DEFAULT_MIN_INTERVAL_SECONDS * 1000
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    // Fail open to the default — a bad env shouldn't make on-call deaf.
    return DEFAULT_MIN_INTERVAL_SECONDS * 1000
  }
  return Math.floor(parsed * 1000)
}

export interface EvaluateOptions {
  /** Override `Date.now()` for tests. */
  now?: number
  /** Override the cooldown window in milliseconds. */
  cooldownMs?: number
}

/**
 * Pure decision function — given the current credential-health snapshot
 * and the last-notified state, decide which per-provider transitions to
 * fire (or suppress) and compose the aggregate webhook bodies.
 *
 * Exported so tests can drive transitions deterministically without
 * touching the global latch or doing a real `fetch`.
 */
export function evaluateTransition(
  summary: ReturnType<typeof credentialHealthSummary>,
  providers: CredentialHealthRecord[],
  prev: NotifierState,
  healthUrl: string,
  options: EvaluateOptions = {},
): NotifierTransition {
  const now = options.now ?? Date.now()
  const cooldownMs = options.cooldownMs ?? resolveCooldownMs()

  const providerByName = new Map<string, CredentialHealthRecord>()
  for (const p of providers) providerByName.set(p.provider, p)

  const currentlyRejected = new Set<string>()
  for (const p of providers) if (p.state === 'rejected') currentlyRejected.add(p.provider)

  // Union of providers we have ever latched and providers currently
  // rejected — covers both new-rejection and recovery transitions.
  const candidateNames = new Set<string>([
    ...Object.keys(prev.providers ?? {}),
    ...currentlyRejected,
  ])

  const newAlerts: CredentialHealthRecord[] = []
  const newRecoveries: string[] = []
  const suppressed: SuppressedProviderTransition[] = []

  for (const name of candidateNames) {
    const prevProv = prev.providers?.[name]
    const wasRejected = prevProv?.inRejectedState ?? false
    const isRejected = currentlyRejected.has(name)

    if (isRejected === wasRejected) continue // no transition for this provider

    const kind: TransitionKind = isRejected ? 'alert' : 'recovery'
    const lastAt = prevProv?.lastNotifiedAtMs ?? 0
    const elapsed = now - lastAt

    if (cooldownMs > 0 && lastAt > 0 && elapsed < cooldownMs) {
      suppressed.push({
        provider: name,
        kind,
        cooldownRemainingSeconds: Math.ceil((cooldownMs - elapsed) / 1000),
        lastNotifiedAt: new Date(lastAt).toISOString(),
      })
      continue
    }

    if (kind === 'alert') {
      // The current health record should always exist for an `isRejected`
      // provider, but fall back defensively to a synthetic record so a
      // missing snapshot can't drop the alert silently.
      const rec = providerByName.get(name) ?? {
        provider: name,
        state: 'rejected' as const,
        reason: null,
        rejectionCount: 1,
        firstRejectedAt: null,
        lastRejectedAt: null,
        lastCheckedAt: null,
      }
      newAlerts.push(rec)
    } else {
      newRecoveries.push(name)
    }
  }

  const hasAlerts = newAlerts.length > 0
  const hasRecoveries = newRecoveries.length > 0

  let message = ''
  if (hasAlerts) {
    const lines = newAlerts.map(describeProvider).join('\n')
    const list = newAlerts.map((p) => p.provider).join(', ')
    message =
      `🚨 [Finsyt] credential rejected — ${newAlerts.length} provider(s): ${list}\n` +
      `${lines}\n` +
      `Health: ${healthUrl}`
  }

  let recoveryMessage = ''
  if (hasRecoveries) {
    const list = newRecoveries.join(', ')
    recoveryMessage =
      `✅ [Finsyt] credential recovered — ${newRecoveries.length} provider(s): ${list}. ` +
      `Health: ${healthUrl}`
  }

  return {
    shouldNotify: hasAlerts || hasRecoveries,
    // Prefer the more urgent kind when both fired in the same tick. The
    // recovery body still ships as a second webhook in `tick…`.
    kind: hasAlerts ? 'alert' : hasRecoveries ? 'recovery' : null,
    message,
    rejectedProviders: newAlerts,
    recoveredProviders: newRecoveries,
    recoveryMessage,
    suppressed,
  }
}

/**
 * Pure decision function — pick the providers that have been stuck in the
 * `rejected` state for longer than `reminderThresholdMs` and that we have
 * not yet paged a reminder for in this rejection episode.
 *
 * Exported for the same reason as `evaluateTransition` — tests drive this
 * with synthetic time and a synthetic state object.
 */
export function evaluateReminder(
  providers: CredentialHealthRecord[],
  prev: NotifierState,
  healthUrl: string,
  reminderThresholdMs: number | null,
  nowMs: number,
): NotifierReminder {
  if (reminderThresholdMs === null) {
    return { shouldNotify: false, message: '', remindedProviders: [] }
  }

  const due: CredentialHealthRecord[] = []
  for (const p of providers) {
    if (p.state !== 'rejected') continue
    if (!p.firstRejectedAt) continue
    const sinceMs = nowMs - new Date(p.firstRejectedAt).getTime()
    if (sinceMs < reminderThresholdMs) continue
    // Already reminded for *this* rejection episode — skip until the
    // provider recovers (which clears the entry) or its `firstRejectedAt`
    // changes (new episode).
    if (prev.remindersSent[p.provider] === p.firstRejectedAt) continue
    due.push(p)
  }

  if (due.length === 0) return { shouldNotify: false, message: '', remindedProviders: [] }

  const thresholdH = reminderThresholdMs / 3_600_000
  const list = due.map((p) => p.provider).join(', ')
  const lines = due.map((p) => describeReminderProvider(p, nowMs)).join('\n')
  const message =
    `⏰ [Finsyt] credential still broken after ${thresholdH}h — ${due.length} provider(s): ${list}\n` +
    `${lines}\n` +
    `Health: ${healthUrl}`
  return { shouldNotify: true, message, remindedProviders: due }
}

/** POST the message to the configured webhook in Slack-compatible shape. */
async function postWebhook(webhookUrl: string, message: string, fetchImpl: typeof fetch): Promise<void> {
  // Slack incoming webhooks accept `{ text }`. Discord, Mattermost and
  // most generic JSON receivers also accept `text` (Discord uses
  // `content`, so we send both — extra fields are ignored elsewhere).
  const body = JSON.stringify({ text: message, content: message })
  const res = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`webhook POST ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 120)}` : ''}`)
  }
}

export interface TickOptions {
  /** Override for tests — defaults to env `OPS_ALERT_WEBHOOK_URL`. */
  webhookUrl?: string | null
  /** Override for tests — defaults to env `OPS_ALERT_HEALTH_URL` or `/api/health`. */
  healthUrl?: string
  /** Override for tests — defaults to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Override for tests — defaults to module-level `STATE`. */
  state?: NotifierState
  /** Override for tests — the "now" instant in ms since epoch. */
  nowMs?: number
  /** Override for tests — defaults to `resolveCooldownMs()` (env or default). */
  cooldownMs?: number
  /**
   * Override for tests — reminder threshold in milliseconds. Defaults to
   * `OPS_ALERT_REMINDER_HOURS` env (or 4h). Pass `null` to disable
   * reminders for this tick.
   */
  reminderThresholdMs?: number | null
}

export interface TickResult {
  transition: NotifierTransition
  reminder: NotifierReminder
}

/**
 * One tick of the credential-health notifier. Safe to call on every
 * scheduler tick — it self-throttles via the per-provider cooldown latch
 * and (separately) the per-provider reminder bookkeeping.
 *
 * Returns the transition and reminder decisions so callers (and tests)
 * can observe what happened (including suppressed transitions for
 * forensic review).
 */
export async function tickCredentialHealthNotifier(opts: TickOptions = {}): Promise<TickResult> {
  const webhookUrl = opts.webhookUrl ?? process.env.OPS_ALERT_WEBHOOK_URL ?? null
  const healthUrl = opts.healthUrl ?? process.env.OPS_ALERT_HEALTH_URL ?? '/api/health'
  const fetchImpl = opts.fetchImpl ?? fetch
  const state = opts.state ?? STATE
  const nowMs = opts.nowMs ?? Date.now()
  const cooldownMs = opts.cooldownMs ?? resolveCooldownMs()
  const reminderThresholdMs = opts.reminderThresholdMs !== undefined
    ? opts.reminderThresholdMs
    : parseReminderThresholdMs(process.env.OPS_ALERT_REMINDER_HOURS)

  const summary = credentialHealthSummary()
  const providers = listCredentialHealth()
  const transition = evaluateTransition(summary, providers, state, healthUrl, { now: nowMs, cooldownMs })

  // Garbage-collect reminder bookkeeping for providers that have either
  // recovered or whose `firstRejectedAt` has changed (new episode). Done
  // up-front so a same-tick alert/recovery never leaves stale entries
  // behind that would suppress a future legitimate reminder.
  const stillRejected = new Map<string, string | null>()
  for (const p of providers) {
    if (p.state === 'rejected') stillRejected.set(p.provider, p.firstRejectedAt)
  }
  for (const provider of Object.keys(state.remindersSent)) {
    const current = stillRejected.get(provider)
    if (current === undefined) {
      // Provider is no longer in rejected state — clear the latch so a
      // future re-rejection re-arms the reminder timer.
      delete state.remindersSent[provider]
    } else if (current !== state.remindersSent[provider]) {
      // New rejection episode (different firstRejectedAt) — drop the
      // stale entry so `evaluateReminder` can fire again once the new
      // episode crosses the threshold.
      delete state.remindersSent[provider]
    }
  }

  const reminder = evaluateReminder(providers, state, healthUrl, reminderThresholdMs, nowMs)

  // Always emit forensic logs for suppressed transitions, even when no
  // webhook is configured. This is the only durable trace that ops have
  // when reviewing why a flapping key wasn't paged a dozen times.
  for (const s of transition.suppressed) {
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'credential.alert.suppressed',
      provider: s.provider,
      kind: s.kind,
      cooldownRemainingSeconds: s.cooldownRemainingSeconds,
      cooldownSeconds: Math.floor(cooldownMs / 1000),
      lastNotifiedAt: s.lastNotifiedAt,
      at: new Date(nowMs).toISOString(),
    }))
  }

  const nowIso = new Date(nowMs).toISOString()

  if (transition.shouldNotify) {
    // Update per-provider latches for every transition that actually fired
    // this tick. Suppressed transitions deliberately leave their latch
    // entry untouched so the *current* state is re-evaluated next tick;
    // that way once the cooldown elapses we notify based on what's true
    // *now*, not on a stale flap from minutes ago.
    for (const rec of transition.rejectedProviders) {
      state.providers[rec.provider] = {
        inRejectedState: true,
        lastNotifiedAtMs: nowMs,
        lastKind: 'alert',
      }
    }
    for (const name of transition.recoveredProviders) {
      state.providers[name] = {
        inRejectedState: false,
        lastNotifiedAtMs: nowMs,
        lastKind: 'recovery',
      }
    }

    state.inRejectedState = summary.rejected > 0
    state.lastNotifiedAt = nowIso

    if (transition.rejectedProviders.length > 0) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'credential.alert.fired',
        kind: 'alert',
        providers: transition.rejectedProviders.map((r) => r.provider),
        rejected: summary.rejected,
        rejectedProviders: summary.rejectedProviders,
        webhookConfigured: !!webhookUrl,
        at: nowIso,
      }))
    }
    if (transition.recoveredProviders.length > 0) {
      console.error(JSON.stringify({
        level: 'info',
        event: 'credential.alert.recovered',
        kind: 'recovery',
        providers: transition.recoveredProviders,
        rejected: summary.rejected,
        rejectedProviders: summary.rejectedProviders,
        webhookConfigured: !!webhookUrl,
        at: nowIso,
      }))
    }

    if (webhookUrl) {
      // Fire the alert first (more urgent), then the recovery, so on-call
      // sees "fire" before "all clear" if both happened in the same tick.
      if (transition.message) {
        try {
          await postWebhook(webhookUrl, transition.message, fetchImpl)
        } catch (e) {
          // Rolling the latch back would cause a tight retry loop on every
          // tick if the webhook URL is permanently broken. Instead we log
          // the failure and keep the latch updated; the next *new*
          // transition will try again.
          console.error('[credential-health-notifier] alert webhook POST failed', (e as Error).message)
        }
      }
      if (transition.recoveryMessage) {
        try {
          await postWebhook(webhookUrl, transition.recoveryMessage, fetchImpl)
        } catch (e) {
          console.error('[credential-health-notifier] recovery webhook POST failed', (e as Error).message)
        }
      }
    }
  }

  if (reminder.shouldNotify) {
    // Mark each due provider as reminded *before* the POST so that a
    // failing webhook doesn't cause us to re-page on the very next tick.
    // The next genuine reminder happens when the provider recovers and
    // gets re-rejected (new `firstRejectedAt`), which is exactly what we
    // want — operators don't get spammed by a permanently broken hook.
    for (const p of reminder.remindedProviders) {
      if (p.firstRejectedAt) state.remindersSent[p.provider] = p.firstRejectedAt
    }
    state.lastNotifiedAt = nowIso

    console.error(JSON.stringify({
      level: 'error',
      event: 'credential.alert.reminder',
      rejected: summary.rejected,
      remindedProviders: reminder.remindedProviders.map((p) => p.provider),
      reminderThresholdHours: reminderThresholdMs !== null ? reminderThresholdMs / 3_600_000 : null,
      webhookConfigured: !!webhookUrl,
      at: nowIso,
    }))

    if (webhookUrl) {
      try {
        await postWebhook(webhookUrl, reminder.message, fetchImpl)
      } catch (e) {
        console.error('[credential-health-notifier] reminder webhook POST failed', (e as Error).message)
      }
    }
  }

  return { transition, reminder }
}

/** Test/debug helper — wipes the in-process latch. Not used at runtime. */
export function __resetCredentialHealthNotifierForTests(): void {
  STATE.inRejectedState = false
  STATE.lastNotifiedAt = null
  STATE.providers = {}
  STATE.remindersSent = {}
}

/** Inspect the current latch — exposed for diagnostics, not for control flow. */
export function getCredentialHealthNotifierState(): Readonly<NotifierState> {
  return {
    inRejectedState: STATE.inRejectedState,
    lastNotifiedAt: STATE.lastNotifiedAt,
    providers: { ...STATE.providers },
    remindersSent: { ...STATE.remindersSent },
  }
}
