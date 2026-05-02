import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { auth } from '@/lib/auth-server'
import { z } from 'zod'

const DEBOUNCE_MS = 60 * 60 * 1000

type CacheEntry = { at: number }
const sentCache = new Map<string, CacheEntry>()

function pruneCache(): void {
  const cutoff = Date.now() - DEBOUNCE_MS * 2
  for (const [k, v] of sentCache) if (v.at < cutoff) sentCache.delete(k)
}

const AlertSchema = z.object({
  id: z.string().min(1).max(128),
  symbol: z.string().min(1).max(16),
  name: z.string().max(200).optional().default(''),
  type: z.enum(['price_above', 'price_below', 'pct_change', 'volume_spike', 'news']),
  threshold: z.number().finite(),
  currentVal: z.number().finite(),
})
type AlertPayload = z.infer<typeof AlertSchema>

const BodySchema = z.object({
  alert: AlertSchema,
  channel: z.enum(['email', 'none']).optional().default('email'),
})
type RequestBody = z.infer<typeof BodySchema>

interface EmailContent { subject: string; text: string; html: string }
interface ResendSuccess { id?: string }
interface SendResult { sent: boolean; reason?: string; id?: string }

async function sendEmailViaResend(to: string, content: EmailContent): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY not configured' }
  const from = process.env.ALERT_EMAIL_FROM || 'Finsyt Alerts <alerts@finsyt.app>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject: content.subject, html: content.html, text: content.text }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return { sent: false, reason: `resend ${res.status}: ${detail.slice(0, 200)}` }
  }
  const data = (await res.json().catch(() => ({}))) as ResendSuccess
  return { sent: true, id: data.id }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function buildEmail(alert: AlertPayload): EmailContent {
  const { symbol, name, type, threshold, currentVal } = alert
  const reasons: Record<AlertPayload['type'], string> = {
    price_above: `crossed above $${threshold}`,
    price_below: `fell below $${threshold}`,
    pct_change: `moved ${threshold}% in session`,
    volume_spike: `volume spiked above 2× average`,
    news: `was mentioned in news`,
  }
  const reason = reasons[type]
  const sym = escapeHtml(symbol)
  const nm = escapeHtml(name || symbol)
  const r = escapeHtml(reason)
  const subject = `🔔 ${symbol} alert: ${reason}`
  const text = `Your alert for ${symbol} (${name || symbol}) has been triggered.\n\n${symbol} ${reason}.\nCurrent value: $${currentVal}\n\nView on Finsyt: https://finsyt.app/app/alerts`
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b1020;color:#e6ecff;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#11183a;border:1px solid #1f2a55;border-radius:12px;padding:24px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8aa0d6;margin-bottom:8px">Finsyt alert</div>
      <h1 style="font-size:22px;margin:0 0 12px;color:#fff">${sym} ${r}</h1>
      <p style="margin:0 0 16px;color:#b9c6ee">${nm} — current value <b>$${currentVal}</b></p>
      <a href="https://finsyt.app/app/alerts" style="display:inline-block;background:#1B4FFF;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Open alerts</a>
      <p style="margin:24px 0 0;font-size:11px;color:#6b7aa6">You're receiving this because you set up a notification for ${sym} on Finsyt. Manage notifications in the alert detail panel.</p>
    </div></body></html>`
  return { subject, text, html }
}

interface TriggerResponse {
  ok: true
  debounced: boolean
  delivered: boolean
  transport: 'resend' | 'log' | 'none'
  reason?: string
  messageId?: string
  nextEligibleAt?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Authn — only signed-in users may invoke this endpoint.
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: RequestBody
  try {
    const raw = await req.json()
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 })
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Channel "none" is an explicit no-op (in-app only) — return early.
  if (body.channel === 'none') {
    const resp: TriggerResponse = { ok: true, debounced: false, delivered: false, transport: 'none', reason: 'channel=none' }
    return NextResponse.json(resp)
  }

  // Recipient is derived from the authenticated user's primary email — never
  // taken from the request body — so this endpoint cannot be used as an open
  // email relay against arbitrary addresses.
  const user = await currentUser()
  const primaryId = user?.primaryEmailAddressId
  const recipient = user?.emailAddresses?.find(e => e.id === primaryId)?.emailAddress
    || user?.emailAddresses?.[0]?.emailAddress
    || ''

  pruneCache()
  const key = `${userId}:${body.alert.id}`
  const prev = sentCache.get(key)
  if (prev && Date.now() - prev.at < DEBOUNCE_MS) {
    const resp: TriggerResponse = {
      ok: true, debounced: true, delivered: false, transport: 'none',
      nextEligibleAt: new Date(prev.at + DEBOUNCE_MS).toISOString(),
    }
    return NextResponse.json(resp)
  }

  const content = buildEmail(body.alert)

  let result: SendResult
  if (recipient) {
    result = await sendEmailViaResend(recipient, content)
  } else {
    result = { sent: false, reason: 'no email on user account' }
  }

  if (!result.sent) {
    console.log('FINSYT_ALERT_TRIGGER', JSON.stringify({
      at: new Date().toISOString(),
      userId,
      alert: { id: body.alert.id, symbol: body.alert.symbol, type: body.alert.type, threshold: body.alert.threshold, currentVal: body.alert.currentVal },
      to: recipient || null,
      subject: content.subject,
      reason: result.reason,
    }))
  }

  // Only seed the debounce cache on confirmed delivery so retries are possible
  // when sending failed (e.g. Resend not configured, no email on profile).
  if (result.sent) sentCache.set(key, { at: Date.now() })

  const resp: TriggerResponse = {
    ok: true,
    debounced: false,
    delivered: result.sent,
    transport: result.sent ? 'resend' : 'log',
    reason: result.reason,
    messageId: result.id,
  }
  return NextResponse.json(resp)
}
