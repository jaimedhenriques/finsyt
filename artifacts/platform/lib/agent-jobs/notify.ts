import type { AgentJobRow, JobAttachment } from '@workspace/db'

// ── Delegated-job completion / failure email ────────────────────────────────
// Mirrors the best-effort Resend fan-out used by Live Highlights delivery
// (direct POST to https://api.resend.com/emails). The in-app bell is the
// source of truth and is always "delivered" via the unread flag on the row;
// email is an opt-in convenience for analysts who walked away from the tab.
//
// Best-effort: a missing RESEND_API_KEY, missing recipients, or a non-2xx
// response is a silent skip with a reason — it never throws and never blocks
// the job from being marked done/failed.

export interface JobEmailDeps {
  fetchImpl?: typeof fetch
  resendApiKey?: string | null
  emailFrom?: string
  appBaseUrl?: string
}

export interface JobEmailResult {
  ok: boolean
  reason?: string
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function resolveAppBaseUrl(override?: string): string {
  if (override) return override
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.LIVE_HIGHLIGHTS_APP_URL) return process.env.LIVE_HIGHLIGHTS_APP_URL
  const dom = process.env.REPLIT_DOMAINS?.split(',')[0]?.trim()
  if (dom) return `https://${dom}`
  const dev = process.env.REPLIT_DEV_DOMAIN
  if (dev) return `https://${dev}`
  return 'https://finsyt.app'
}

function buildEmail(job: AgentJobRow, appBaseUrl: string): { subject: string; text: string; html: string } {
  const base = appBaseUrl.replace(/\/$/, '')
  const link = `${base}/platform/app/jobs?job=${encodeURIComponent(job.id)}`
  const done = job.status === 'done'
  const subject = done
    ? `✅ ${job.title} — analyst job complete`
    : `⚠️ ${job.title} — analyst job failed`
  const title = escapeHtml(job.title)
  const subline = done ? 'Your delegated analyst job finished' : 'Your delegated analyst job could not complete'
  const result = (job.result ?? null) as { summary?: string; attachments?: JobAttachment[] } | null
  const summary = done
    ? escapeHtml((result?.summary ?? '').slice(0, 600))
    : escapeHtml((job.error ?? 'No error detail available.').slice(0, 600))

  const attachments = done ? result?.attachments ?? [] : []
  const attachmentRows = attachments
    .map((a) => {
      const href = a.downloadUrl || a.href
      const abs = href ? (href.startsWith('http') ? href : `${base}${href.startsWith('/') ? '' : '/'}${href}`) : null
      const label = escapeHtml(a.label)
      return abs
        ? `<li style="margin:0 0 6px"><a href="${abs}" style="color:#8ab4ff">${label}</a></li>`
        : `<li style="margin:0 0 6px;color:#b9c6ee">${label}</li>`
    })
    .join('')

  const text =
    `${job.title} — ${done ? 'complete' : 'failed'}\n\n${done ? result?.summary ?? '' : job.error ?? ''}\n\nOpen the job: ${link}`

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b1020;color:#e6ecff;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#11183a;border:1px solid #1f2a55;border-radius:12px;padding:24px">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8aa0d6;margin-bottom:8px">Finsyt · Delegated Agent</div>
      <h1 style="font-size:20px;margin:0 0 6px;color:#fff">${title}</h1>
      <div style="font-size:11px;color:#8aa0d6;margin-bottom:14px">${subline}</div>
      <p style="margin:0 0 18px;color:#b9c6ee;line-height:1.5">${summary || '—'}</p>
      ${attachmentRows ? `<div style="font-size:11px;color:#8aa0d6;margin-bottom:6px">Deliverables</div><ul style="margin:0 0 18px;padding-left:18px">${attachmentRows}</ul>` : ''}
      <a href="${link}" style="display:inline-block;background:#1B4FFF;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Open in Finsyt</a>
      <p style="margin:24px 0 0;font-size:11px;color:#6b7aa6">You're receiving this because you delegated a job to the Finsyt analyst agent.</p>
    </div></body></html>`

  return { subject, text, html }
}

/**
 * Send a completion/failure email for a finished job. Best-effort.
 * `recipients` are resolved at the call site (the delegating user's email).
 */
export async function notifyJobFinished(
  job: AgentJobRow,
  recipients: string[],
  deps: JobEmailDeps = {},
): Promise<JobEmailResult> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const resendApiKey = deps.resendApiKey !== undefined ? deps.resendApiKey : process.env.RESEND_API_KEY ?? null
  const emailFrom = deps.emailFrom ?? process.env.ALERT_EMAIL_FROM ?? 'Finsyt Agent <alerts@finsyt.app>'
  const appBaseUrl = resolveAppBaseUrl(deps.appBaseUrl)

  const to = recipients.map((r) => r.trim()).filter(Boolean)
  if (!resendApiKey) return { ok: false, reason: 'RESEND_API_KEY not configured' }
  if (to.length === 0) return { ok: false, reason: 'no recipients resolved' }

  try {
    const content = buildEmail(job, appBaseUrl)
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({ from: emailFrom, to, subject: content.subject, html: content.html, text: content.text }),
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
