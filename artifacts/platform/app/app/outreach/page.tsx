'use client'
import { useMemo, useRef, useState } from 'react'
import { Card, PageHero, ContextualAskBar } from '@/components/ui'
import DataSourcesUsedFooter from '@/components/DataSourcesUsedFooter'
import {
  traceFromToolResult, dedupeTrace, type ProviderTrace,
} from '@/lib/data-sources-trace'
import { useWorkspace } from '@/lib/workspace'
import { PROVIDER_META } from '@/lib/data-providers'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface EmailTemplate {
  id: 'expert_call' | 'briefing' | 'followup' | 'intro'
  label: string
  description: string
  /** Generates the agent prompt that produces a SUBJECT + BODY draft. */
  prompt: (opts: { recipient: string; symbol: string; name: string; topic: string }) => string
}

const TEMPLATES: EmailTemplate[] = [
  {
    id: 'expert_call',
    label: 'Expert call request',
    description: 'Request an intro to a relevant industry operator',
    prompt: ({ recipient, symbol, name, topic }) =>
      `Draft a concise outbound email to ${recipient} requesting a 30-minute expert call ` +
      `to discuss ${topic} as it relates to ${name} (${symbol}). ` +
      `Pull 2-3 specific data points from real sources via your tools (recent news, ` +
      `transcripts, or filings) and reference them as the reason for the call. ` +
      `Output strictly as:\nSUBJECT: <subject line>\nBODY:\n<body, ~140 words, sign as "Best, [Analyst]">. ` +
      `Use [src: tool_name] inline citations next to each fact in the body.`,
  },
  {
    id: 'briefing',
    label: 'Client briefing',
    description: 'Send a stakeholder a quick research note',
    prompt: ({ recipient, symbol, name, topic }) =>
      `Draft a brief client update email to ${recipient} on ${name} (${symbol}) covering ${topic}. ` +
      `Use real data via your tools — quote, news, estimates, transcripts. Include the latest price ` +
      `and one to two recent material datapoints. ` +
      `Output strictly as:\nSUBJECT: <subject line>\nBODY:\n<body, ~160 words, professional tone>. ` +
      `Use [src: tool_name] inline citations next to each fact.`,
  },
  {
    id: 'followup',
    label: 'Earnings follow-up',
    description: 'Recap what changed after a recent print',
    prompt: ({ recipient, symbol, name, topic }) =>
      `Draft a follow-up email to ${recipient} recapping what changed in ${name} (${symbol}) ` +
      `after their most recent earnings call. Theme to focus on: ${topic}. ` +
      `Pull from get_transcripts, get_news and get_estimates. ` +
      `Output strictly as:\nSUBJECT: <subject>\nBODY:\n<body, ~150 words>. ` +
      `Cite each fact inline like [src: tool_name].`,
  },
  {
    id: 'intro',
    label: 'Cold intro',
    description: 'Open a new contact with a relevant insight',
    prompt: ({ recipient, symbol, name, topic }) =>
      `Draft a cold intro email to ${recipient} that opens with a specific, recent ` +
      `${topic} insight on ${name} (${symbol}). Pull the insight from get_news or get_filings ` +
      `via your tools. Keep it under 110 words. ` +
      `Output strictly as:\nSUBJECT: <subject>\nBODY:\n<body>. ` +
      `Use one inline [src: tool_name] citation next to the insight.`,
  },
]

interface DraftState {
  subjectLine: string
  body: string
  trace: ProviderTrace[]
  running: boolean
  error: string | null
}

const EMPTY_DRAFT: DraftState = {
  subjectLine: '', body: '', trace: [], running: false, error: null,
}

/**
 * Parse the agent's raw output into { subject, body }. The prompt locks the
 * model to `SUBJECT: ...` + `BODY:` so this is forgiving but predictable.
 */
function splitSubjectBody(raw: string): { subjectLine: string; body: string } {
  const subjMatch = raw.match(/SUBJECT\s*:\s*(.+)/i)
  const bodyMatch = raw.match(/BODY\s*:\s*([\s\S]+)/i)
  return {
    subjectLine: subjMatch ? subjMatch[1].trim().split('\n')[0] : '',
    body: bodyMatch ? bodyMatch[1].trim() : raw.trim(),
  }
}

/**
 * Render the trace as a self-contained HTML block that can be appended to an
 * outbound email. Mirrors the columns shown in `DataSourcesUsedFooter` so the
 * recipient sees the same provenance the analyst saw.
 */
function buildHtmlAppendix(trace: ProviderTrace[]): string {
  const items = dedupeTrace(trace)
  if (items.length === 0) return ''
  const rows = items.map(row => {
    const role = row.role === 'citation' ? 'Citation'
      : row.role === 'fallback' ? 'Fallback' : 'Primary'
    const meta = row.provider ? PROVIDER_META[row.provider] : null
    const provider = meta?.label || row.label
    const detail = row.detail ? ` &middot; ${escapeHtml(row.detail)}` : ''
    const ms = typeof row.responseMs === 'number'
      ? ` &middot; ${row.responseMs < 1000 ? `${Math.round(row.responseMs)} ms` : `${(row.responseMs / 1000).toFixed(2)} s`}`
      : ''
    return `<tr>
      <td style="padding:6px 10px;border-top:1px solid #e5e7eb;font-size:11px;color:#475569;font-weight:600;">${role}</td>
      <td style="padding:6px 10px;border-top:1px solid #e5e7eb;font-size:12px;color:#0f172a;font-weight:600;">${escapeHtml(provider)}<span style="color:#64748b;font-weight:400;">${detail}${ms}</span></td>
    </tr>`
  }).join('\n')
  return `
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;" />
<div style="font-family:Inter,system-ui,sans-serif;font-size:11px;color:#64748b;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Data sources used</div>
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;font-family:Inter,system-ui,sans-serif;width:100%;max-width:560px;">
${rows}
</table>
<div style="font-family:Inter,system-ui,sans-serif;font-size:10.5px;color:#94a3b8;margin-top:6px;">Drafted by Finsyt &middot; ${items.length} provider${items.length === 1 ? '' : 's'}</div>
`.trim()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;'
      : c === '"' ? '&quot;' : '&#39;'
  ))
}

export default function OutreachPage() {
  const { dataSourcesFooterEnabled } = useWorkspace()
  const [recipient, setRecipient] = useState('')
  const [symbol, setSymbol]       = useState('')
  const [companyName, setCompanyName] = useState('')
  const [topic, setTopic]         = useState('AI capex outlook')
  const [templateId, setTemplateId] = useState<EmailTemplate['id']>('expert_call')
  const [draft, setDraft]         = useState<DraftState>(EMPTY_DRAFT)
  // When on, the appendix is included in the copied HTML so the recipient
  // sees the same data-sources block the analyst saw on screen.
  const [appendAppendix, setAppendAppendix] = useState(true)
  const [copied, setCopied]       = useState<'plain' | 'html' | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const template = TEMPLATES.find(t => t.id === templateId)!

  const htmlBody = useMemo(() => {
    if (!draft.body) return ''
    const escaped = escapeHtml(draft.body).replace(/\n/g, '<br/>')
    const wrapped = `<div style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;">${escaped}</div>`
    if (appendAppendix && dataSourcesFooterEnabled) {
      return `${wrapped}\n${buildHtmlAppendix(draft.trace)}`
    }
    return wrapped
  }, [draft.body, draft.trace, appendAppendix, dataSourcesFooterEnabled])

  async function generate() {
    if (!recipient.trim() || !symbol.trim()) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setDraft({ ...EMPTY_DRAFT, running: true })
    setCopied(null)
    const sym = symbol.trim().toUpperCase()
    const name = companyName.trim() || sym
    try {
      const r = await fetch(`${BASE}/api/agent/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          question: template.prompt({ recipient: recipient.trim(), symbol: sym, name, topic: topic.trim() || 'recent developments' }),
          symbols: [sym],
          context: { surface: 'outreach', template: template.id },
        }),
      })
      if (!r.ok || !r.body) {
        setDraft({ ...EMPTY_DRAFT, error: `Agent error ${r.status}` })
        return
      }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let raw = ''
      const trace: ProviderTrace[] = []
      const flush = () => {
        const { subjectLine, body } = splitSubjectBody(raw)
        setDraft(d => ({ ...d, subjectLine, body, trace: [...trace], running: true }))
      }
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const blocks = buf.split('\n\n'); buf = blocks.pop() || ''
        for (const block of blocks) {
          let evtName = 'message'; let dataLine = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) evtName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim()
          }
          if (!dataLine) continue
          let p: any = {}
          try { p = JSON.parse(dataLine) } catch { continue }
          if (evtName === 'tool_result' && p.ok) {
            const row = traceFromToolResult(p, 1)
            if (row) trace.push(row)
            flush()
          } else if (evtName === 'answer_chunk') {
            raw += p.text || ''
            flush()
          } else if (evtName === 'error') {
            setDraft(d => ({ ...d, error: p.message || 'agent error', running: false }))
          }
        }
      }
      const final = splitSubjectBody(raw)
      setDraft({ subjectLine: final.subjectLine, body: final.body, trace, running: false, error: null })
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setDraft({ ...EMPTY_DRAFT, error: e?.message || String(e) })
    }
  }

  async function copy(kind: 'plain' | 'html') {
    if (!draft.body) return
    if (kind === 'plain') {
      const plainAppendix = appendAppendix && dataSourcesFooterEnabled && draft.trace.length
        ? `\n\n--\nData sources used:\n${dedupeTrace(draft.trace).map(r => {
            const meta = r.provider ? PROVIDER_META[r.provider] : null
            return `- [${r.role}] ${meta?.label || r.label}${r.detail ? ` (${r.detail})` : ''}`
          }).join('\n')}`
        : ''
      const text = `Subject: ${draft.subjectLine}\n\n${draft.body}${plainAppendix}`
      await navigator.clipboard.writeText(text)
    } else {
      // Some browsers strip rich HTML when only `text/html` is offered, so we
      // ship a plain-text fallback alongside it via the modern Clipboard API.
      try {
        const item = new ClipboardItem({
          'text/html': new Blob([htmlBody], { type: 'text/html' }),
          'text/plain': new Blob([draft.body], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([item])
      } catch {
        await navigator.clipboard.writeText(htmlBody)
      }
    }
    setCopied(kind)
    setTimeout(() => setCopied(null), 1800)
  }

  const canGenerate = recipient.trim() && symbol.trim() && !draft.running

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <PageHero
        eyebrow="Outreach"
        title="Draft a sourced email"
        accentWord="sourced"
        subtitle="Generate outbound emails grounded in real Finsyt data. Each draft shows the providers it used and can ship that data-sources block as an HTML appendix in the copied email."
      />

      <div style={{ padding: '0 1.75rem 2.5rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 18, maxWidth: 1200 }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <ContextualAskBar
            context="Outreach"
            contextData={{ page: 'outreach', symbol, template: templateId }}
            chips={[
              { label: 'Improve subject line', prompt: 'Suggest 3 stronger subject lines for the email I just drafted on the Outreach page.' },
              { label: 'Make it shorter',      prompt: 'Tighten the body of the email I just drafted to under 90 words while keeping the citations.' },
            ]}
            placeholder="Ask Finsyt to refine this email…"
            style={{ margin: '0 0 8px' }}
          />

          <Card padding="22px 24px">
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Compose
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="Recipient (e.g. Jane Doe — PM, Acme Capital)"
                aria-label="Recipient"
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <input
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="Ticker (e.g. NVDA)"
                aria-label="Ticker"
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Company name (optional)"
                aria-label="Company name"
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Topic (e.g. AI capex outlook)"
                aria-label="Topic"
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Template</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setTemplateId(t.id)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                      border: '1px solid', borderColor: templateId === t.id ? 'var(--accent)' : 'var(--border)',
                      background: templateId === t.id ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                      color: templateId === t.id ? 'var(--accent-text)' : 'var(--text-primary)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={generate}
                disabled={!canGenerate}
                style={{
                  padding: '11px 18px', borderRadius: 10,
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  fontSize: 13, fontWeight: 700, cursor: canGenerate ? 'pointer' : 'not-allowed',
                  opacity: canGenerate ? 1 : 0.5, fontFamily: 'inherit',
                }}>
                {draft.running ? 'Drafting…' : draft.body ? 'Regenerate draft' : 'Generate draft'}
              </button>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={appendAppendix}
                  onChange={e => setAppendAppendix(e.target.checked)}
                />
                <span>
                  Append <strong>data-sources block</strong> to copied email
                  {!dataSourcesFooterEnabled && (
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 6 }}>
                      (workspace toggle off — appendix won&apos;t be included)
                    </span>
                  )}
                </span>
              </label>
            </div>
          </Card>

          <Card padding="0">
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</span>
              {draft.running && (
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent-text)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 5, letterSpacing: '0.04em' }}>
                  STREAMING
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => copy('plain')} disabled={!draft.body}
                  style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                    fontSize: 11, fontWeight: 700, cursor: draft.body ? 'pointer' : 'not-allowed',
                    opacity: draft.body ? 1 : 0.5, fontFamily: 'inherit',
                  }}>{copied === 'plain' ? '✓ Copied' : 'Copy plain'}</button>
                <button onClick={() => copy('html')} disabled={!draft.body}
                  style={{
                    padding: '5px 10px', borderRadius: 6, border: 'none',
                    background: 'var(--accent)', color: '#fff',
                    fontSize: 11, fontWeight: 700, cursor: draft.body ? 'pointer' : 'not-allowed',
                    opacity: draft.body ? 1 : 0.5, fontFamily: 'inherit',
                  }}>{copied === 'html' ? '✓ Copied HTML' : 'Copy HTML'}</button>
              </div>
            </div>
            {draft.body || draft.running ? (
              <div style={{ padding: '16px 20px' }}>
                {draft.subjectLine && (
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 8 }}>Subject</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{draft.subjectLine}</span>
                  </div>
                )}
                {draft.body ? (
                  <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {draft.body}{draft.running && <span style={{ opacity: 0.5 }}>▍</span>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Array(6).fill(0).map((_, i) => (
                      <span key={i} className="skeleton" style={{ height: 12, width: `${72 + (i % 3) * 8}%` }} />
                    ))}
                  </div>
                )}
                {draft.error && (
                  <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.08)', fontSize: 12, color: '#ef4444' }}>
                    {draft.error}
                  </div>
                )}

                {/* Inline footer mirroring Research / AI Analysis. The HTML
                    appendix appended on copy is built from the same trace via
                    `buildHtmlAppendix`. */}
                {draft.trace.length > 0 && (
                  <DataSourcesUsedFooter trace={draft.trace} />
                )}
              </div>
            ) : (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                Fill in the recipient and ticker, pick a template, then click <strong>Generate draft</strong>.
              </div>
            )}
          </Card>
        </div>

        <aside style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Card padding="16px 18px">
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>HTML appendix preview</div>
            <div style={{
              padding: '12px 14px', borderRadius: 8, background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', maxHeight: 360, overflow: 'auto',
              fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)',
            }}>
              {draft.trace.length === 0 || !appendAppendix || !dataSourcesFooterEnabled ? (
                <span>Will appear here once a draft has streamed and the appendix toggle is on. The same block is included in the copied HTML email.</span>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: buildHtmlAppendix(draft.trace) }} />
              )}
            </div>
          </Card>
          <Card padding="16px 18px">
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Why this matters</div>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              Outbound emails are a transparency edge case — once they leave Finsyt, the recipient
              has no way to inspect the citations the analyst saw. Including the data-sources
              appendix keeps the same provenance attached to the message.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  )
}
