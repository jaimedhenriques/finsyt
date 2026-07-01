/**
 * Tests for the Live Highlights external delivery module.
 *
 * The notification engine reuses these tests for the per-call throttling
 * contract (one first-pin per call, one end-of-call rollup per call) so
 * the audit log doesn't end up with one delivery row per pin.
 *
 * We never make a real network call here — `fetchImpl` is injected.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  deliverLiveHighlightNotification,
  type DeliveryAttempt,
} from '../live-highlights-delivery'
import type {
  LiveHighlightNotification,
  LiveHighlightsSettings,
} from '../live-highlights'

interface FakeCall {
  url: string
  init: RequestInit | undefined
  body?: string
}

function makeFakeFetch(routes: Record<string, { ok?: boolean; status?: number; body?: string }>) {
  const calls: FakeCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init, body: typeof init?.body === 'string' ? (init.body as string) : undefined })
    const match = Object.keys(routes).find((prefix) => url.startsWith(prefix))
    const r = match ? routes[match] : { ok: true, status: 200, body: '{}' }
    return new Response(r.body ?? '{}', { status: r.status ?? (r.ok === false ? 500 : 200) })
  }) as typeof fetch
  return { fetchImpl, calls }
}

function baseSettings(over: Partial<LiveHighlightsSettings> = {}): LiveHighlightsSettings {
  return {
    enabled: true,
    blueprintId: null,
    disabledSymbols: [],
    adHocSymbols: [],
    deliveryChannels: { bell: true, email: false, slack: false },
    slackWebhookUrl: null,
    emailRecipients: [],
    ...over,
  }
}

function baseNotif(over: Partial<LiveHighlightNotification> = {}): LiveHighlightNotification {
  return {
    id: 'AAPL:Q3-FY26:first:note-1',
    kind: 'first_pin',
    symbol: 'AAPL',
    event: 'Q3 FY26 Earnings Call',
    callKey: 'AAPL:Q3-FY26',
    message: 'First live highlight pinned for AAPL — "Margin guide raised"',
    ts: Date.UTC(2026, 4, 1, 14, 30),
    read: false,
    noteId: 'note-1',
    ...over,
  }
}

const SLACK_HOOK = 'https://hooks.slack.com/services/T000/B000/secrettoken'

test('bell-only when no channels opted in — no fetch, returns ["bell"]', async () => {
  const { fetchImpl, calls } = makeFakeFetch({})
  const result = await deliverLiveHighlightNotification({
    orgId: 'org_1',
    userId: 'user_1',
    notif: baseNotif(),
    settings: baseSettings(),
    resolvedRecipients: ['analyst@fund.com'],
    deps: { fetchImpl, resendApiKey: 'rk_test', skipAudit: true },
  })
  assert.deepEqual(result.deliveredChannels, ['bell'])
  assert.equal(calls.length, 0)
})

test('Slack-only delivery posts a single message to the configured webhook', async () => {
  const { fetchImpl, calls } = makeFakeFetch({ [SLACK_HOOK]: { ok: true, status: 200 } })
  const result = await deliverLiveHighlightNotification({
    orgId: 'org_1',
    userId: 'user_1',
    notif: baseNotif(),
    settings: baseSettings({
      deliveryChannels: { bell: true, email: false, slack: true },
      slackWebhookUrl: SLACK_HOOK,
    }),
    resolvedRecipients: [],
    deps: { fetchImpl, resendApiKey: null, skipAudit: true },
  })
  assert.deepEqual(result.deliveredChannels, ['bell', 'slack'])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, SLACK_HOOK)
  const body = JSON.parse(calls[0].body!)
  assert.match(body.text, /AAPL/)
  assert.match(body.text, /First pin/)
  // Slack toggle on but no webhook configured → recorded as failed.
  const noUrl = await deliverLiveHighlightNotification({
    orgId: 'org_1', userId: 'user_1',
    notif: baseNotif({ id: 'x:first:n2' }),
    settings: baseSettings({ deliveryChannels: { bell: true, email: false, slack: true }, slackWebhookUrl: null }),
    resolvedRecipients: [],
    deps: { fetchImpl, skipAudit: true },
  })
  assert.deepEqual(noUrl.deliveredChannels, ['bell'])
  const slackAttempt = noUrl.attempts.find((a: DeliveryAttempt) => a.channel === 'slack')!
  assert.equal(slackAttempt.ok, false)
  assert.match(slackAttempt.reason ?? '', /no slack webhook/)
})

test('email-only delivery sends one Resend POST with all recipients', async () => {
  const { fetchImpl, calls } = makeFakeFetch({
    'https://api.resend.com/emails': { ok: true, status: 200, body: '{"id":"em_1"}' },
  })
  const result = await deliverLiveHighlightNotification({
    orgId: 'org_1',
    userId: 'user_1',
    notif: baseNotif(),
    settings: baseSettings({ deliveryChannels: { bell: true, email: true, slack: false } }),
    resolvedRecipients: ['analyst@fund.com', 'pm@fund.com'],
    deps: { fetchImpl, resendApiKey: 'rk_test', skipAudit: true },
  })
  assert.deepEqual(result.deliveredChannels, ['bell', 'email'])
  assert.equal(calls.length, 1)
  const body = JSON.parse(calls[0].body!)
  assert.deepEqual(body.to, ['analyst@fund.com', 'pm@fund.com'])
  assert.match(body.subject, /AAPL/)
})

test('email opted in but no Resend key → degrades gracefully, audits the reason', async () => {
  const { fetchImpl, calls } = makeFakeFetch({})
  const result = await deliverLiveHighlightNotification({
    orgId: 'org_1',
    userId: 'user_1',
    notif: baseNotif(),
    settings: baseSettings({ deliveryChannels: { bell: true, email: true, slack: false } }),
    resolvedRecipients: ['x@y.com'],
    deps: { fetchImpl, resendApiKey: null, skipAudit: true },
  })
  assert.deepEqual(result.deliveredChannels, ['bell'])
  assert.equal(calls.length, 0)
  const emailAttempt = result.attempts.find((a) => a.channel === 'email')!
  assert.equal(emailAttempt.ok, false)
  assert.match(emailAttempt.reason ?? '', /RESEND_API_KEY/)
})

test('email opted in but no recipients resolved → recorded as failed, not silently skipped', async () => {
  const { fetchImpl, calls } = makeFakeFetch({})
  const result = await deliverLiveHighlightNotification({
    orgId: 'org_1',
    userId: 'user_1',
    notif: baseNotif(),
    settings: baseSettings({ deliveryChannels: { bell: true, email: true, slack: false } }),
    resolvedRecipients: [],
    deps: { fetchImpl, resendApiKey: 'rk_test', skipAudit: true },
  })
  assert.equal(calls.length, 0)
  const emailAttempt = result.attempts.find((a) => a.channel === 'email')!
  assert.equal(emailAttempt.ok, false)
  assert.match(emailAttempt.reason ?? '', /no recipients/)
})

test('email + slack both opted in fan out a single message per channel (not one per pin)', async () => {
  const { fetchImpl, calls } = makeFakeFetch({
    'https://api.resend.com/emails': { ok: true, status: 200, body: '{"id":"em_1"}' },
    [SLACK_HOOK]: { ok: true, status: 200 },
  })
  // End-of-call rollup notification — represents N pins but must only
  // send 1 email and 1 Slack message.
  const result = await deliverLiveHighlightNotification({
    orgId: 'org_1',
    userId: 'user_1',
    notif: baseNotif({ id: 'AAPL:Q3:end', kind: 'end_of_call', noteId: null, pinCount: 5,
      message: 'AAPL Q3 FY26 Earnings Call ended — 5 highlights pinned' }),
    settings: baseSettings({
      deliveryChannels: { bell: true, email: true, slack: true },
      slackWebhookUrl: SLACK_HOOK,
    }),
    resolvedRecipients: ['analyst@fund.com'],
    deps: { fetchImpl, resendApiKey: 'rk_test', skipAudit: true },
  })
  assert.deepEqual(result.deliveredChannels, ['bell', 'email', 'slack'])
  assert.equal(calls.length, 2, 'exactly one email POST and one Slack POST per notification')
  const emailCall = calls.find((c) => c.url.startsWith('https://api.resend.com/'))!
  const slackCall = calls.find((c) => c.url === SLACK_HOOK)!
  const emailBody = JSON.parse(emailCall.body!)
  assert.match(emailBody.subject, /5 highlights/)
  const slackBody = JSON.parse(slackCall.body!)
  assert.match(slackBody.text, /Call ended/)
  assert.match(slackBody.text, /5 highlights/)
})

test('explicit recipient override takes precedence over org-member fallback', async () => {
  const { fetchImpl, calls } = makeFakeFetch({
    'https://api.resend.com/emails': { ok: true, status: 200, body: '{"id":"em_1"}' },
  })
  await deliverLiveHighlightNotification({
    orgId: 'org_1',
    userId: 'user_1',
    notif: baseNotif(),
    settings: baseSettings({
      deliveryChannels: { bell: true, email: true, slack: false },
      emailRecipients: ['ops@desk.com'],
    }),
    resolvedRecipients: ['someone-else@fund.com'],
    deps: { fetchImpl, resendApiKey: 'rk_test', skipAudit: true },
  })
  const body = JSON.parse(calls[0].body!)
  assert.deepEqual(body.to, ['ops@desk.com'])
})

test('Slack 500 surfaces as failed delivery and does NOT throw', async () => {
  const { fetchImpl } = makeFakeFetch({
    [SLACK_HOOK]: { ok: false, status: 500, body: 'invalid_payload' },
  })
  const result = await deliverLiveHighlightNotification({
    orgId: 'org_1',
    userId: 'user_1',
    notif: baseNotif(),
    settings: baseSettings({
      deliveryChannels: { bell: true, email: false, slack: true },
      slackWebhookUrl: SLACK_HOOK,
    }),
    resolvedRecipients: [],
    deps: { fetchImpl, skipAudit: true },
  })
  assert.deepEqual(result.deliveredChannels, ['bell'])
  const slackAttempt = result.attempts.find((a) => a.channel === 'slack')!
  assert.equal(slackAttempt.ok, false)
  assert.match(slackAttempt.reason ?? '', /slack 500/)
})
