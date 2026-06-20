/**
 * Tests for the credential-health notifier.
 *
 * These tests drive `tickCredentialHealthNotifier` end-to-end through the
 * four key transition scenarios that were previously only verified with
 * a one-off script:
 *
 *   1. No rejected credentials  → no notify, no webhook POST.
 *   2. 0 → >0 rejected          → fires an `alert` webhook.
 *   3. Sticky rejected (>0 → >0) → no re-notify on subsequent ticks.
 *   4. >0 → 0 recovered         → fires a `recovery` webhook.
 *
 * Plus the safety check that webhook-less mode still updates the latch
 * (so ops doesn't get a permanently re-arming alert) and never throws or
 * POSTs.
 *
 * Tests use `node:test` and inject a fake `fetchImpl` + a per-test
 * `state` object, so they never touch the real module-level latch and
 * never make a real network call.
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  tickCredentialHealthNotifier,
  evaluateTransition,
  __resetCredentialHealthNotifierForTests,
  type NotifierState,
} from '../credential-health-notifier.ts'
import {
  getCredentialHealth,
  recordKeyAccepted,
  recordKeyMissing,
  recordKeyRejection,
  __resetCredentialHealthForTests,
} from '../credential-health.ts'

const HEALTH_URL = 'https://example.test/api/health'

interface FakeCall {
  url: string
  init: RequestInit | undefined
}

/** Build a fake `fetch` that records calls and returns a configurable response. */
function makeFakeFetch(opts?: { ok?: boolean; status?: number; body?: string }) {
  const calls: FakeCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(opts?.body ?? '', {
      status: opts?.status ?? 200,
      statusText: (opts?.ok ?? true) ? 'OK' : 'Bad',
    })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

function freshState(): NotifierState {
  return { inRejectedState: false, lastNotifiedAt: null, providers: {}, remindersSent: {} }
}

beforeEach(() => {
  // Each test starts with a clean credential-health registry and a clean
  // module-level notifier latch so tests are order-independent.
  __resetCredentialHealthForTests()
  __resetCredentialHealthNotifierForTests()
})

test('no rejections → no notify and no webhook POST', async () => {
  recordKeyAccepted('census')
  recordKeyMissing('worldbank')

  const { fetchImpl, calls } = makeFakeFetch()
  const state = freshState()

  const { transition } = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    cooldownMs: 0,
  })

  assert.equal(transition.shouldNotify, false)
  assert.equal(transition.kind, null)
  assert.equal(calls.length, 0, 'fetch must not be called when there is nothing to alert about')
  assert.equal(state.inRejectedState, false)
  assert.equal(state.lastNotifiedAt, null)
})

test('0 → >0 rejected fires an alert webhook with redacted reason and provider list', async () => {
  recordKeyAccepted('worldbank')
  // Reason intentionally contains a value that should be redacted by the
  // credential-health module (api_key=...). We assert the alert body never
  // contains the raw secret.
  recordKeyRejection('census', 'upstream rejected api_key=SUPERSECRET12345 — falling back to keyless')

  const { fetchImpl, calls } = makeFakeFetch()
  const state = freshState()

  const { transition } = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    cooldownMs: 0,
  })

  assert.equal(transition.shouldNotify, true)
  assert.equal(transition.kind, 'alert')
  assert.match(transition.message, /credential rejected/i)
  assert.match(transition.message, /census/)
  assert.match(transition.message, new RegExp(HEALTH_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.ok(
    !transition.message.includes('SUPERSECRET12345'),
    'alert body must not leak the raw key — credential-health should have redacted it',
  )
  assert.equal(transition.rejectedProviders.length, 1)
  assert.equal(transition.rejectedProviders[0]!.provider, 'census')

  assert.equal(calls.length, 1, 'exactly one webhook POST per alert transition')
  const call = calls[0]!
  assert.equal(call.url, 'https://hooks.example/abc')
  assert.equal(call.init?.method, 'POST')
  const headers = call.init?.headers as Record<string, string> | undefined
  assert.equal(headers?.['content-type'], 'application/json')
  const body = JSON.parse(String(call.init?.body))
  // Slack uses `text`, Discord uses `content` — the notifier sends both.
  assert.equal(body.text, transition.message)
  assert.equal(body.content, transition.message)

  assert.equal(state.inRejectedState, true)
  assert.ok(state.lastNotifiedAt, 'latch timestamp must be set after a successful alert')
})

test('sticky rejected (still >0) does not re-notify on subsequent ticks', async () => {
  recordKeyRejection('census', 'unauthorized')

  const { fetchImpl, calls } = makeFakeFetch()
  const state = freshState()

  const { transition: first } = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    cooldownMs: 0,
  })
  assert.equal(first.kind, 'alert')
  assert.equal(calls.length, 1)
  const firstNotifiedAt = state.lastNotifiedAt
  assert.ok(firstNotifiedAt)

  // Same provider rejected again — counter bumps, but state stays `rejected`.
  recordKeyRejection('census', 'unauthorized again')

  const { transition: second } = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    cooldownMs: 0,
  })
  assert.equal(second.shouldNotify, false, 'sticky rejected must not re-page')
  assert.equal(second.kind, null)
  assert.equal(calls.length, 1, 'no additional webhook POST while still in rejected state')
  assert.equal(state.lastNotifiedAt, firstNotifiedAt, 'latch timestamp must not move on a no-op tick')

  // A third tick adds a *new* provider to the rejected set. Under the
  // per-provider transition model this IS a new transition (worldbank
  // ok → rejected) — census is still suppressed because its per-provider
  // latch already says "rejected", but worldbank pages on its own.
  recordKeyRejection('worldbank', 'forbidden')
  const { transition: third } = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    cooldownMs: 0,
  })
  assert.equal(third.shouldNotify, true, 'a brand-new rejected provider fires its own per-provider alert')
  assert.equal(third.kind, 'alert')
  assert.deepEqual(
    third.rejectedProviders.map((p) => p.provider),
    ['worldbank'],
    'only the newly-rejected provider should be in the alert payload — census is already latched',
  )
  assert.equal(calls.length, 2, 'one new webhook POST for the newly-rejected provider')
})

test('>0 → 0 recovered fires a recovery webhook and clears the latch', async () => {
  // Arm the latch with a real alert tick first.
  recordKeyRejection('census', 'unauthorized')
  const { fetchImpl, calls } = makeFakeFetch()
  const state = freshState()
  await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    cooldownMs: 0,
  })
  assert.equal(state.inRejectedState, true)
  assert.equal(calls.length, 1)

  // Operator rotated the key — provider now reports OK.
  recordKeyAccepted('census')

  const { transition } = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    cooldownMs: 0,
  })

  assert.equal(transition.shouldNotify, true)
  assert.equal(transition.kind, 'recovery')
  // Pure-recovery transitions carry their text on `recoveryMessage`; the
  // `message` field is reserved for alerts so a same-tick alert+recovery
  // can ship two distinct webhook bodies.
  assert.match(transition.recoveryMessage, /recovered/i)
  assert.match(transition.recoveryMessage, new RegExp(HEALTH_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(transition.rejectedProviders.length, 0)
  assert.deepEqual(transition.recoveredProviders, ['census'])

  assert.equal(calls.length, 2, 'recovery transition posts a second webhook')
  const recoveryBody = JSON.parse(String(calls[1]!.init?.body))
  // Recovery payload must mirror the alert payload shape — both Slack-style
  // `text` and Discord-style `content` are sent so a single webhook URL works
  // for either receiver.
  assert.equal(recoveryBody.text, transition.recoveryMessage)
  assert.equal(recoveryBody.content, transition.recoveryMessage)

  assert.equal(state.inRejectedState, false, 'latch must clear on recovery')
  assert.ok(state.lastNotifiedAt)
})

test('webhook-less mode updates the latch without throwing or POSTing', async () => {
  recordKeyRejection('census', 'unauthorized')

  // Spy fetch — the notifier MUST NOT call it when no webhook URL is set.
  const { fetchImpl, calls } = makeFakeFetch()
  const state = freshState()

  const { transition } = await tickCredentialHealthNotifier({
    webhookUrl: null,
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    cooldownMs: 0,
  })

  assert.equal(transition.shouldNotify, true)
  assert.equal(transition.kind, 'alert')
  assert.equal(calls.length, 0, 'no fetch must happen when webhookUrl is null')

  // Critical invariant: even with no webhook, the latch MUST advance —
  // otherwise the notifier would re-fire (and re-no-op) the same
  // transition forever once a webhook is finally configured.
  assert.equal(state.inRejectedState, true)
  assert.ok(state.lastNotifiedAt)

  // Recovery in webhook-less mode also flips the latch back without throwing.
  recordKeyAccepted('census')
  const { transition: recovery } = await tickCredentialHealthNotifier({
    webhookUrl: null,
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    cooldownMs: 0,
  })
  assert.equal(recovery.kind, 'recovery')
  assert.equal(calls.length, 0)
  assert.equal(state.inRejectedState, false)
})

test('webhook failure does not throw and still advances the latch (no tight retry loop)', async () => {
  recordKeyRejection('census', 'unauthorized')
  const { fetchImpl, calls } = makeFakeFetch({ ok: false, status: 500, body: 'boom' })
  const state = freshState()

  // Must not throw — the notifier swallows webhook errors so a bad
  // webhook URL doesn't crash the scheduler.
  const { transition } = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/broken',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    cooldownMs: 0,
  })

  assert.equal(transition.kind, 'alert')
  assert.equal(calls.length, 1)
  // Latch advances even on POST failure — otherwise we'd tight-loop on
  // every tick against a permanently-broken webhook.
  assert.equal(state.inRejectedState, true)
  assert.ok(state.lastNotifiedAt)
})

test('recordKeyAccepted clears firstRejectedAt/lastRejectedAt/reason for the next episode', async () => {
  // Simulate a stale rejection from a prior episode.
  recordKeyRejection('census', 'unauthorized')
  const beforeAccept = getCredentialHealth('census')
  assert.ok(beforeAccept?.firstRejectedAt, 'pre-condition: rejection seeded firstRejectedAt')
  assert.ok(beforeAccept?.lastRejectedAt, 'pre-condition: rejection seeded lastRejectedAt')
  assert.ok(beforeAccept?.reason, 'pre-condition: rejection seeded reason')

  recordKeyAccepted('census')
  const afterAccept = getCredentialHealth('census')
  assert.equal(afterAccept?.state, 'ok')
  assert.equal(afterAccept?.firstRejectedAt, null, 'recovery must clear firstRejectedAt')
  assert.equal(afterAccept?.lastRejectedAt, null, 'recovery must clear lastRejectedAt')
  assert.equal(afterAccept?.reason, null, 'recovery must clear reason')

  // Sleep briefly so the next episode's ISO timestamp is observably distinct
  // from the pre-recovery one. Without this the test could pass even if the
  // clear were a no-op (both timestamps would collide in the same ms).
  await new Promise((r) => setTimeout(r, 5))

  // A brand new rejection episode should mint a fresh firstRejectedAt — not
  // inherit the stale one from the previous episode.
  recordKeyRejection('census', 'unauthorized again')
  const afterReReject = getCredentialHealth('census')
  assert.ok(afterReReject?.firstRejectedAt, 'new episode must seed firstRejectedAt')
  assert.notEqual(
    afterReReject?.firstRejectedAt,
    beforeAccept?.firstRejectedAt,
    'new episode firstRejectedAt must differ from the stale pre-recovery value',
  )
})

test('reminder does not misfire on the first tick of a re-rejection episode', async () => {
  // Episode 1: provider rejects, we let the reminder fire after the 4h dwell.
  recordKeyRejection('census', 'unauthorized')
  const ep1RejectedAt = getCredentialHealth('census')!.firstRejectedAt!
  const ep1Ms = new Date(ep1RejectedAt).getTime()

  const { fetchImpl, calls } = makeFakeFetch()
  const state = freshState()

  // Initial alert (transition 0 → 1).
  const tick1 = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    reminderThresholdMs: 4 * 3_600_000,
    nowMs: ep1Ms + 1_000,
    cooldownMs: 0,
  })
  assert.equal(tick1.transition.kind, 'alert')

  // 5 hours later — reminder fires for episode 1.
  const tick2 = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    reminderThresholdMs: 4 * 3_600_000,
    nowMs: ep1Ms + 5 * 3_600_000,
    cooldownMs: 0,
  })
  assert.equal(tick2.reminder.shouldNotify, true, 'episode-1 reminder fires after the 4h dwell')

  // Operator rotates the key — provider recovers.
  recordKeyAccepted('census')
  const recoveryTick = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    reminderThresholdMs: 4 * 3_600_000,
    nowMs: ep1Ms + 6 * 3_600_000,
    cooldownMs: 0,
  })
  assert.equal(recoveryTick.transition.kind, 'recovery')

  // Sleep briefly so the new rejection's `firstRejectedAt` is observably
  // distinct from the pre-recovery one.
  await new Promise((r) => setTimeout(r, 5))

  // Episode 2: a brand new rejection. With the fix in place, recovery cleared
  // `firstRejectedAt`, so this seeds a fresh timestamp at real-time `now`.
  // Without the fix, the stale `ep1RejectedAt` would survive — making the
  // brand-new rejection look 5+ hours old on the very first tick and pageing
  // on-call immediately for a "still broken" reminder.
  recordKeyRejection('census', 'unauthorized again')
  const reReject = getCredentialHealth('census')!
  assert.ok(reReject.firstRejectedAt, 'new rejection episode must seed firstRejectedAt')
  assert.notEqual(
    reReject.firstRejectedAt,
    ep1RejectedAt,
    'new rejection episode firstRejectedAt must differ from the episode-1 value',
  )
  const ep2Ms = new Date(reReject.firstRejectedAt).getTime()

  const callsBefore = calls.length
  // Tick 1 minute into the new episode — well under the 4h dwell.
  const reRejectTick = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    reminderThresholdMs: 4 * 3_600_000,
    nowMs: ep2Ms + 60_000,
    cooldownMs: 0,
  })
  // The 0 → 1 transition still fires (different concern from the reminder).
  assert.equal(reRejectTick.transition.kind, 'alert', 'new episode produces an alert transition')
  assert.equal(
    reRejectTick.reminder.shouldNotify,
    false,
    '"still broken" reminder must NOT fire 1 minute into a fresh rejection episode',
  )
  // Exactly one new POST for the alert; no extra POST for a misfired reminder.
  assert.equal(calls.length - callsBefore, 1, 'only the alert transition should POST, not a stale reminder')
})

test('recordKeyMissing clears firstRejectedAt/lastRejectedAt/reason for the next episode', async () => {
  // Simulate a stale rejection from a prior episode.
  recordKeyRejection('census', 'unauthorized')
  const beforeMissing = getCredentialHealth('census')
  assert.ok(beforeMissing?.firstRejectedAt, 'pre-condition: rejection seeded firstRejectedAt')
  assert.ok(beforeMissing?.lastRejectedAt, 'pre-condition: rejection seeded lastRejectedAt')
  assert.ok(beforeMissing?.reason, 'pre-condition: rejection seeded reason')

  // Operator un-configures the key — provider goes from rejected → missing.
  recordKeyMissing('census')
  const afterMissing = getCredentialHealth('census')
  assert.equal(afterMissing?.state, 'missing')
  assert.equal(
    afterMissing?.firstRejectedAt,
    null,
    'transition to missing must clear firstRejectedAt — otherwise /api/health surfaces stale rejection details under a missing provider',
  )
  assert.equal(afterMissing?.lastRejectedAt, null, 'transition to missing must clear lastRejectedAt')
  assert.equal(afterMissing?.reason, null, 'transition to missing must clear reason')

  // Sleep briefly so the next episode's ISO timestamp is observably distinct
  // from the pre-missing one. Without this the test could pass even if the
  // clear were a no-op (both timestamps would collide in the same ms).
  await new Promise((r) => setTimeout(r, 5))

  // Operator later re-adds the key and it gets rejected again. A brand new
  // rejection episode should mint a fresh firstRejectedAt — not inherit the
  // stale one from the pre-missing episode.
  recordKeyRejection('census', 'unauthorized again')
  const afterReReject = getCredentialHealth('census')
  assert.ok(afterReReject?.firstRejectedAt, 'new episode must seed firstRejectedAt')
  assert.notEqual(
    afterReReject?.firstRejectedAt,
    beforeMissing?.firstRejectedAt,
    'new episode firstRejectedAt must differ from the stale pre-missing value',
  )
})

test('reminder does not misfire on the first tick of a re-rejection episode after missing', async () => {
  // Episode 1: provider rejects, alert fires.
  recordKeyRejection('census', 'unauthorized')
  const ep1RejectedAt = getCredentialHealth('census')!.firstRejectedAt!
  const ep1Ms = new Date(ep1RejectedAt).getTime()

  const { fetchImpl, calls } = makeFakeFetch()
  const state = freshState()

  const tick1 = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    reminderThresholdMs: 4 * 3_600_000,
    nowMs: ep1Ms + 1_000,
    cooldownMs: 0,
  })
  assert.equal(tick1.transition.kind, 'alert')

  // 5 hours later — reminder fires for episode 1.
  const tick2 = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    reminderThresholdMs: 4 * 3_600_000,
    nowMs: ep1Ms + 5 * 3_600_000,
    cooldownMs: 0,
  })
  assert.equal(tick2.reminder.shouldNotify, true, 'episode-1 reminder fires after the 4h dwell')

  // Operator un-configures the key — provider transitions to missing.
  recordKeyMissing('census')

  // Sleep briefly so the new rejection's `firstRejectedAt` is observably
  // distinct from the pre-missing one.
  await new Promise((r) => setTimeout(r, 5))

  // Episode 2: operator re-adds the key and it's rejected again. With the
  // fix in place, the missing transition cleared `firstRejectedAt`, so this
  // seeds a fresh timestamp at real-time `now`. Without the fix, the stale
  // `ep1RejectedAt` would survive — making the brand-new rejection look
  // 5+ hours old on the very first tick and pageing on-call immediately
  // for a "still broken" reminder.
  recordKeyRejection('census', 'unauthorized again')
  const reReject = getCredentialHealth('census')!
  assert.ok(reReject.firstRejectedAt, 'new rejection episode must seed firstRejectedAt')
  assert.notEqual(
    reReject.firstRejectedAt,
    ep1RejectedAt,
    'new rejection episode firstRejectedAt must differ from the episode-1 value',
  )
  const ep2Ms = new Date(reReject.firstRejectedAt).getTime()

  const callsBefore = calls.length
  // Tick 1 minute into the new episode — well under the 4h dwell.
  const reRejectTick = await tickCredentialHealthNotifier({
    webhookUrl: 'https://hooks.example/abc',
    healthUrl: HEALTH_URL,
    fetchImpl,
    state,
    reminderThresholdMs: 4 * 3_600_000,
    nowMs: ep2Ms + 60_000,
    cooldownMs: 0,
  })
  assert.equal(
    reRejectTick.reminder.shouldNotify,
    false,
    '"still broken" reminder must NOT fire 1 minute into a fresh rejection episode after a missing transition',
  )
  // The transition kind here is implementation-detail (per-provider latch
  // semantics); the critical invariant is no misfired reminder POST.
  assert.ok(
    calls.length - callsBefore <= 1,
    'at most one POST for the alert transition; no extra POST for a misfired reminder',
  )
})

test('evaluateTransition is a pure function and does not mutate prev state', () => {
  const prev: NotifierState = {
    inRejectedState: false,
    lastNotifiedAt: null,
    providers: {},
    remindersSent: {},
  }
  const summary = { rejected: 1, ok: 0, missing: 0, unknown: 0, totalRejections: 3, rejectedProviders: ['census'] }
  const providers = [
    {
      provider: 'census',
      state: 'rejected' as const,
      reason: 'unauthorized',
      rejectionCount: 3,
      firstRejectedAt: '2026-01-01T00:00:00.000Z',
      lastRejectedAt: '2026-01-01T00:00:00.000Z',
      lastCheckedAt: '2026-01-01T00:00:00.000Z',
    },
  ]

  const t = evaluateTransition(summary, providers, prev, HEALTH_URL)
  assert.equal(t.kind, 'alert')
  assert.equal(t.rejectedProviders.length, 1)
  // prev must be untouched — the side effect of advancing the latch
  // happens in `tickCredentialHealthNotifier`, not in `evaluateTransition`.
  assert.equal(prev.inRejectedState, false)
  assert.equal(prev.lastNotifiedAt, null)
})
