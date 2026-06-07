import { audit } from '@workspace/db'
import type { LiveHighlightNotification, LiveHighlightsSettings } from './live-highlights'

// ── Live Highlights external delivery ─────────────────────────────────────
// The bell already shows first-pin and end-of-call rollup notifications. For
// buy-side users who aren't in the app while a call is running the signal
// drops sharply once the print is widely read, so we also fan the same
// notifications out to email + Slack when the workspace has opted in.
//
// Design notes:
//   * Bell delivery is always on; email and Slack are independent toggles
//     stored in `LiveHighlightsSettings.deliveryChannels`.
//   * A single notification produces a single email and a single Slack
//     message — we never send one per pin. The first-pin notification is
//     itself throttled to one per call by the engine.
//   * Delivery is best-effort: a failing channel logs + audits an error
//     metadata entry but never throws and never blocks the bell from
//     getting the notification.
//   * The audit row records exactly which channels were attempted and
//     which succeeded so reviewers can answer "did the team get paged on
//     this print?" from the audit log alone.

export type DeliveryChannel = 'bell' | 'email' | 'slack'

export interface DeliveryAttempt {
  channel: DeliveryChannel
  ok: boolean
  reason?: string
}

export interface DeliveryResult {
  deliveredChannels: DeliveryChannel[]
  attempts: DeliveryAttempt[]
}

export interface DeliveryDeps {
  /** Override for tests — defaults to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Override for tests — defaults to env `RESEND_API_KEY`. */
  resendApiKey?: string | null
  /** Override for tests — defaults to env `ALERT_EMAIL_FROM`. */
  emailFrom?: string
  /** Override for tests — defaults to env `LIVE_HIGHLIGHTS_APP_URL` or '/'. */
  appBaseUrl?: string
  /** Override for tests — skip the audit write. */
  skipAudit?: boolean
}

interface EmailContent { subject: string; text: string; html: string }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function buildEmail(notif: LiveHighlightNotification, appBaseUrl: string): EmailContent {
  const isFirst = notif.kind === 'first_pin'
  const isFiling = notif.kind === 'filing_signal'
  const subject = isFiling
    ? `📄 ${notif.symbol} ${notif.event} — high-signal SEC filing`
    : isFirst
      ? `🎯 ${notif.symbol} live — first highlight pinned`
      : `📋 ${notif.symbol} ${notif.event} — ${notif.pinCount ?? 0} highlight${(notif.pinCount ?? 0) === 1 ? '' : 's'} pinned`
  const sym = escapeHtml(notif.symbol)
  const ev = escapeHtml(notif.event)
  const msg = escapeHtml(notif.message)
  const subline = isFiling
    ? 'High-signal SEC filing'
    : isFirst
      ? 'First pin of the call'
      : 'End-of-call rollup'
  const link = `${appBaseUrl.replace(/\/$/, '')}/app/settings/live-highlights`
  const text = `${notif.message}\n\nReview pins on Finsyt: ${link}`
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b1020;color:#e6ecff;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#11183a;border:1px solid #1f2a55;border-radius:12px;padding:24px">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8aa0d6;margin-bottom:8px">Finsyt · Live Highlights</div>
      <h1 style="font-size:20px;margin:0 0 6px;color:#fff">${sym} · ${ev}</h1>
      <div style="font-size:11px;color:#8aa0d6;margin-bottom:14px">${subline}</div>
      <p style="margin:0 0 18px;color:#b9c6ee;line-height:1.5">${msg}</p>
      <a href="${link}" style="display:inline-block;background:#1B4FFF;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Open Live Highlights</a>
      <p style="margin:24px 0 0;font-size:11px;color:#6b7aa6">You're receiving this because email delivery is enabled on Live Highlights for this workspace. Manage it under Settings → Live Highlights.</p>
    </div></body></html>`
  return { subject, text, html }
}

function buildSlackText(notif: LiveHighlightNotification, appBaseUrl: string): string {
  const link = `${appBaseUrl.replace(/\/$/, '')}/app/settings/live-highlights`
  const tag = notif.kind === 'filing_signal'
    ? '📄 High-signal filing'
    : notif.kind === 'first_pin'
      ? '🎯 First pin'
      : '📋 Call ended'
  return `*${tag} — ${notif.symbol} ${notif.event}*\n${notif.message}\n<${link}|Open Live Highlights>`
}

async function postSlack(
  webhookUrl: string,
  notif: LiveHighlightNotification,
  appBaseUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const body = JSON.stringify({ text: buildSlackText(notif, appBaseUrl) })
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, reason: `slack ${res.status}: ${detail.slice(0, 120)}` }
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, reason: (e as Error)?.message ?? 'slack fetch failed' }
  }
}

async function postEmail(
  recipients: string[],
  notif: LiveHighlightNotification,
  apiKey: string,
  from: string,
  appBaseUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const content = buildEmail(notif, appBaseUrl)
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, reason: `resend ${res.status}: ${detail.slice(0, 120)}` }
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, reason: (e as Error)?.message ?? 'email fetch failed' }
  }
}

export interface DeliverArgs {
  orgId: string
  userId: string
  notif: LiveHighlightNotification
  settings: LiveHighlightsSettings
  /** Org member emails resolved at the call site (Clerk lookup). */
  resolvedRecipients: string[]
  deps?: DeliveryDeps
}

/**
 * Decide which channels should fire for this notification given the
 * workspace's delivery preferences, and execute the resulting fan-out.
 *
 * Always reports `bell` as delivered — the bell is the source of truth
 * and the in-memory notification has already been queued before this
 * runs. Email and Slack fire only when the user has opted them in *and*
 * the relevant config is present (Resend key + recipients for email; a
 * webhook URL for Slack). A missing config is a silent skip with a
 * `reason` recorded on the audit row, not an error.
 */
export async function deliverLiveHighlightNotification(args: DeliverArgs): Promise<DeliveryResult> {
  const { orgId, userId, notif, settings, resolvedRecipients, deps = {} } = args
  const fetchImpl = deps.fetchImpl ?? fetch
  const resendApiKey = deps.resendApiKey !== undefined ? deps.resendApiKey : process.env.RESEND_API_KEY ?? null
  const emailFrom = deps.emailFrom ?? process.env.ALERT_EMAIL_FROM ?? 'Finsyt Live Highlights <alerts@finsyt.app>'
  const appBaseUrl = deps.appBaseUrl ?? process.env.LIVE_HIGHLIGHTS_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://finsyt.app'

  const attempts: DeliveryAttempt[] = [{ channel: 'bell', ok: true }]
  const channels = settings.deliveryChannels

  // Email channel.
  if (channels.email) {
    const recipients = (settings.emailRecipients?.length ? settings.emailRecipients : resolvedRecipients)
      .map((r) => r.trim())
      .filter(Boolean)
    if (!resendApiKey) {
      attempts.push({ channel: 'email', ok: false, reason: 'RESEND_API_KEY not configured' })
    } else if (recipients.length === 0) {
      attempts.push({ channel: 'email', ok: false, reason: 'no recipients resolved' })
    } else {
      const res = await postEmail(recipients, notif, resendApiKey, emailFrom, appBaseUrl, fetchImpl)
      attempts.push({ channel: 'email', ok: res.ok, reason: res.reason })
    }
  }

  // Slack channel.
  if (channels.slack) {
    const url = settings.slackWebhookUrl?.trim()
    if (!url) {
      attempts.push({ channel: 'slack', ok: false, reason: 'no slack webhook configured' })
    } else {
      const res = await postSlack(url, notif, appBaseUrl, fetchImpl)
      attempts.push({ channel: 'slack', ok: res.ok, reason: res.reason })
    }
  }

  const deliveredChannels = attempts.filter((a) => a.ok).map((a) => a.channel)

  if (!deps.skipAudit) {
    try {
      await audit.log({
        orgId,
        actorId: userId,
        actorType: 'system',
        action: 'live_highlight.notification.delivered',
        resourceType: 'live_highlight_notification',
        resourceId: notif.id,
        metadata: {
          kind: notif.kind,
          symbol: notif.symbol,
          event: notif.event,
          callKey: notif.callKey,
          pinCount: notif.pinCount ?? null,
          deliveredChannels,
          attempts: attempts.map((a) => ({ channel: a.channel, ok: a.ok, reason: a.reason ?? null })),
        },
      })
    } catch {
      /* audit is best-effort by design */
    }
  }

  return { deliveredChannels, attempts }
}
