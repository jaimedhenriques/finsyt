/**
 * Tests for the Live Highlights settings update path. Mostly checks the
 * delivery-prefs additions: channel toggles, Slack URL validation, and
 * the safety rule that clearing the Slack URL also clears the slack
 * channel toggle.
 *
 * The settings store is now persisted (Postgres-backed) so each call is
 * async; tests `await` accordingly. Unique synthetic org ids prevent
 * cross-case bleed-through in the shared test database.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  getLiveHighlightsSettings,
  redactSettingsForAudit,
  updateLiveHighlightsSettings,
} from '../live-highlights'

function freshOrg(label: string): string {
  return `org_test_${label}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

test('default settings expose bell-only delivery, no Slack URL, no recipient overrides', async () => {
  const org = freshOrg('default')
  const s = await getLiveHighlightsSettings(org)
  assert.deepEqual(s.deliveryChannels, { bell: true, email: false, slack: false })
  assert.equal(s.slackWebhookUrl, null)
  assert.deepEqual(s.emailRecipients, [])
})

test('toggling email on persists and survives the next get', async () => {
  const org = freshOrg('email-toggle')
  const next = await updateLiveHighlightsSettings(org, { deliveryChannels: { email: true } })
  assert.equal(next.deliveryChannels.email, true)
  assert.equal(next.deliveryChannels.slack, false)
  assert.equal(next.deliveryChannels.bell, true)
  assert.equal((await getLiveHighlightsSettings(org)).deliveryChannels.email, true)
})

test('Slack URL must match the Slack webhook pattern; bad input is silently rejected', async () => {
  const org = freshOrg('slack-pattern')
  // Good URL accepted.
  const ok = await updateLiveHighlightsSettings(org, {
    slackWebhookUrl: 'https://hooks.slack.com/services/T1/B1/secret',
  })
  assert.equal(ok.slackWebhookUrl, 'https://hooks.slack.com/services/T1/B1/secret')
  // Bad URL leaves the previous value intact.
  const bad = await updateLiveHighlightsSettings(org, { slackWebhookUrl: 'https://evil.example.com/hook' })
  assert.equal(bad.slackWebhookUrl, 'https://hooks.slack.com/services/T1/B1/secret')
})

test('clearing Slack URL also force-clears the slack channel toggle', async () => {
  const org = freshOrg('slack-clear')
  await updateLiveHighlightsSettings(org, {
    slackWebhookUrl: 'https://hooks.slack.com/services/T1/B1/secret',
    deliveryChannels: { slack: true },
  })
  const cleared = await updateLiveHighlightsSettings(org, { slackWebhookUrl: null })
  assert.equal(cleared.slackWebhookUrl, null)
  assert.equal(cleared.deliveryChannels.slack, false, 'channel must auto-disable when no endpoint is configured')
})

test('audit redaction never leaks the Slack webhook URL or recipient emails', async () => {
  const org = freshOrg('audit-redact')
  const SECRET = 'https://hooks.slack.com/services/T1/B1/secrettoken'
  const RECIP = 'analyst@fund.com'
  await updateLiveHighlightsSettings(org, {
    slackWebhookUrl: SECRET,
    deliveryChannels: { slack: true, email: true },
    emailRecipients: [RECIP],
  })
  const redacted = redactSettingsForAudit(await getLiveHighlightsSettings(org))
  const json = JSON.stringify(redacted)
  // Hard guarantee: secret string and PII email never appear anywhere
  // in the audit blob, including any nested field.
  assert.ok(!json.includes(SECRET), 'audit blob must not contain the Slack webhook URL')
  assert.ok(!json.includes('secrettoken'), 'audit blob must not contain the Slack token verbatim')
  assert.ok(!json.includes('T1/B1'), 'audit blob must not contain Slack channel/team identifiers')
  assert.ok(!json.includes(RECIP), 'audit blob must not contain recipient emails')
  // But it must still record *that* slack is configured for reviewers,
  // and the fingerprint must change when the URL changes.
  assert.equal(redacted.slackWebhookConfigured, true)
  assert.equal(redacted.emailRecipientCount, 1)
  assert.match(String(redacted.slackWebhookFingerprint), /^fp_[0-9a-f]{8}$/)
  await updateLiveHighlightsSettings(org, {
    slackWebhookUrl: 'https://hooks.slack.com/services/T2/B2/different',
  })
  const redacted2 = redactSettingsForAudit(await getLiveHighlightsSettings(org))
  assert.notEqual(redacted2.slackWebhookFingerprint, redacted.slackWebhookFingerprint)
})

test('emailRecipients filters non-emails and caps at 50', async () => {
  const org = freshOrg('emails')
  const many = Array.from({ length: 60 }, (_, i) => `user${i}@example.com`)
  const next = await updateLiveHighlightsSettings(org, {
    emailRecipients: [...many, 'not-an-email', '   ', 'spaces in@email.com'],
  })
  assert.equal(next.emailRecipients.length, 50)
  assert.ok(next.emailRecipients.every((e: string) => /@/.test(e) && !/\s/.test(e)))
})

test('emailRecipients normalizes case and dedupes before persisting', async () => {
  const org = freshOrg('emails-dedupe')
  const next = await updateLiveHighlightsSettings(org, {
    emailRecipients: [
      ' Analyst@Fund.com ',
      'analyst@fund.com',
      'OPS@Fund.com',
      'ops@fund.com ',
    ],
  })

  assert.deepEqual(next.emailRecipients, ['analyst@fund.com', 'ops@fund.com'])
  assert.deepEqual((await getLiveHighlightsSettings(org)).emailRecipients, [
    'analyst@fund.com',
    'ops@fund.com',
  ])
})
