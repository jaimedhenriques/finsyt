'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface DeliveryChannelPrefs {
  bell: true
  email: boolean
  slack: boolean
}
interface Settings {
  enabled: boolean
  blueprintId: string | null
  disabledSymbols: string[]
  adHocSymbols: string[]
  deliveryChannels: DeliveryChannelPrefs
  slackWebhookUrl: string | null
  emailRecipients: string[]
  filingScoreThreshold: number
}
interface AvailableBlueprint {
  id: string
  name: string
  publishedSlug: string | null
  orgId: string
}
interface ActiveCall {
  symbol: string
  event: string
  callKey: string
  startedAt: string
  ended: boolean
}
interface Pin {
  noteId: string
  callKey: string
  symbol: string
  event: string
  speaker: string
  role: string
  kind: 'management_commentary' | 'kpi_change' | 'qa_standout'
  headline: string
  summary: string
  timestampLabel: string
  pinnedAt: number
  alignment: 'estimated' | 'aligned'
  blueprintVersion: number | null
}

const KIND_LABEL: Record<Pin['kind'], string> = {
  management_commentary: 'Management commentary',
  kpi_change: 'KPI change',
  qa_standout: 'Q&A standout',
}

export default function LiveHighlightsSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [available, setAvailable] = useState<AvailableBlueprint[]>([])
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([])
  const [recentPins, setRecentPins] = useState<Pin[]>([])
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [adHocInput, setAdHocInput] = useState('')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [stRes, statusRes] = await Promise.all([
        fetch(`${BASE}/api/live-highlights/settings`, { cache: 'no-store' }),
        fetch(`${BASE}/api/live-highlights`, { cache: 'no-store' }),
      ])
      if (stRes.ok) {
        const d = await stRes.json()
        setSettings(d.settings)
        setAvailable(Array.isArray(d.availableBlueprints) ? d.availableBlueprints : [])
      }
      if (statusRes.ok) {
        const d = await statusRes.json()
        setActiveCalls(Array.isArray(d.activeCalls) ? d.activeCalls : [])
        setRecentPins(Array.isArray(d.recentPins) ? d.recentPins : [])
        setWatchlist(Array.isArray(d.watchlist) ? d.watchlist : [])
      }
    } catch {}
  }, [])

  useEffect(() => { refresh() }, [refresh])

  type SettingsPatchBody = Partial<Omit<Settings, 'deliveryChannels'>> & {
    deliveryChannels?: { email?: boolean; slack?: boolean }
  }
  async function patch(body: SettingsPatchBody) {
    setSaveMsg('Saving…')
    try {
      const r = await fetch(`${BASE}/api/live-highlights/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setSettings(d.settings)
      setSaveMsg('Saved')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setSaveMsg(msg)
    } finally {
      setTimeout(() => setSaveMsg(null), 2500)
    }
  }

  function toggleDisabled(symbol: string) {
    if (!settings) return
    const next = settings.disabledSymbols.includes(symbol)
      ? settings.disabledSymbols.filter((s) => s !== symbol)
      : [...settings.disabledSymbols, symbol]
    patch({ disabledSymbols: next })
  }

  function addAdHoc() {
    if (!settings) return
    const v = adHocInput.toUpperCase().trim()
    if (!v || settings.adHocSymbols.includes(v)) return
    patch({ adHocSymbols: [...settings.adHocSymbols, v] })
    setAdHocInput('')
  }
  function removeAdHoc(s: string) {
    if (!settings) return
    patch({ adHocSymbols: settings.adHocSymbols.filter((x) => x !== s) })
  }

  return (
    <div style={{ padding:'24px 28px', maxWidth:920 }}>
      <div style={{ marginBottom:6, fontSize:11, color:'var(--text-muted)' }}>
        <Link href="/app/settings" style={{ color:'var(--text-secondary)', textDecoration:'none' }}>Settings</Link> · Live Highlights
      </div>
      <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>Live Highlights</h1>
      <p style={{ fontSize:13, color:'var(--text-secondary)', maxWidth:680, lineHeight:1.55, marginBottom:20 }}>
        Watches live earnings calls for the names on your watchlist and pins management commentary,
        KPI changes, and analyst Q&amp;A standout moments to your notebook in real time. Each pin
        carries a citation back to the exact transcript timestamp; the bell shows a first-pin and
        an end-of-call rollup notification per call. Every pin is recorded in the audit log against
        the Blueprint that drove it.
      </p>

      {saveMsg && (
        <div style={{ marginBottom:16, fontSize:12, color:'var(--accent-text)' }}>{saveMsg}</div>
      )}

      {settings && (
        <>
          {/* Master toggle */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-card)',
            marginBottom:18 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>Enable Live Highlights</div>
              <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>
                Turn the engine on for this workspace. New watchlist additions are auto-monitored.
              </div>
            </div>
            <button
              onClick={() => patch({ enabled: !settings.enabled })}
              style={{
                padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)',
                background: settings.enabled ? 'var(--accent)' : 'var(--bg)',
                color: settings.enabled ? '#fff' : 'var(--text-primary)',
                fontSize:12, fontWeight:600, cursor:'pointer',
              }}>
              {settings.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Blueprint selector */}
          <Section title="Blueprint">
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10 }}>
              Pick the Blueprint that drives moment selection. Default is the curated <em>Live Highlights</em>
              published Blueprint; swap to one of your own to customise the criteria.
            </div>
            <select
              value={settings.blueprintId ?? ''}
              onChange={(e) => patch({ blueprintId: e.target.value || null })}
              style={{
                width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)',
                background:'var(--bg-card)', color:'var(--text-primary)', fontSize:13,
              }}
            >
              <option value="">Default — Live Highlights (curated)</option>
              {available.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.publishedSlug ? ' (published)' : ''}
                </option>
              ))}
            </select>
          </Section>

          {/* Delivery channels */}
          <Section title="How to deliver notifications">
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10 }}>
              The bell always shows first-pin and end-of-call rollup notifications.
              Optionally fan the same notification out to email and/or Slack so the team gets the
              signal even when nobody is staring at the app. End-of-call rollups send as a single
              message per call (not one per pin), and the first-pin notification fires at most once
              per call.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <ChannelToggle
                label="In-app bell"
                description="Always on — the source of truth for the engine."
                value
                disabled
                onToggle={() => {}}
              />
              <ChannelToggle
                label="Email"
                description={
                  settings.deliveryChannels.email
                    ? `Sending to ${settings.emailRecipients.length || 'all workspace members'}.`
                    : 'Send the same notification as a single email to your workspace members (or a custom list).'
                }
                value={settings.deliveryChannels.email}
                onToggle={() => patch({ deliveryChannels: { email: !settings.deliveryChannels.email } })}
              />
              {settings.deliveryChannels.email && (
                <EmailRecipientsEditor
                  recipients={settings.emailRecipients}
                  onChange={(next) => patch({ emailRecipients: next })}
                />
              )}
              <ChannelToggle
                label="Slack"
                description={
                  settings.slackWebhookUrl
                    ? 'Posting to your configured incoming webhook.'
                    : 'Configure an incoming webhook URL below to enable Slack delivery.'
                }
                value={settings.deliveryChannels.slack}
                disabled={!settings.slackWebhookUrl}
                onToggle={() =>
                  settings.slackWebhookUrl &&
                  patch({ deliveryChannels: { slack: !settings.deliveryChannels.slack } })
                }
              />
              <SlackWebhookEditor
                value={settings.slackWebhookUrl}
                onSave={(url) => patch({ slackWebhookUrl: url })}
              />
            </div>
          </Section>

          {/* Filing-signal threshold */}
          <Section title="High-signal filing alerts">
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10 }}>
              When a watchlisted company files a fresh document with the SEC, Finsyt scores it with the
              Apify SEC EDGAR Intelligence connection. Filings scoring at or above this threshold pin a
              Live Highlight and fire the same bell/email/Slack alert as a live-call highlight. Raise it
              to cut noise; lower it to catch more.
            </div>
            <FilingThresholdEditor
              value={settings.filingScoreThreshold}
              onSave={(n) => patch({ filingScoreThreshold: n })}
            />
          </Section>

          {/* Watchlist opt-out */}
          <Section title="Per-symbol opt-out">
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10 }}>
              Disable Live Highlights for individual watchlist tickers without removing them from your watchlist.
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {watchlist.length === 0 && (
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>Your watchlist is empty.</div>
              )}
              {watchlist.map((s) => {
                const off = settings.disabledSymbols.includes(s)
                return (
                  <button key={s} onClick={() => toggleDisabled(s)}
                    style={{
                      padding:'5px 10px', borderRadius:18,
                      border:'1px solid var(--border)',
                      background: off ? 'var(--bg)' : 'var(--accent-dim)',
                      color: off ? 'var(--text-muted)' : 'var(--accent-text)',
                      fontSize:11.5, fontWeight:600, cursor:'pointer',
                      textDecoration: off ? 'line-through' : 'none',
                    }}>{s}</button>
                )
              })}
            </div>
          </Section>

          {/* Ad-hoc add */}
          <Section title="Monitor extra tickers">
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10 }}>
              Watch live calls for tickers that are NOT on your watchlist (e.g. ad-hoc IPO or peer prints).
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
              <input value={adHocInput} onChange={(e) => setAdHocInput(e.target.value.toUpperCase())}
                placeholder="e.g. RACE"
                style={{
                  flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)',
                  background:'var(--bg-card)', color:'var(--text-primary)', fontSize:13,
                }}/>
              <button onClick={addAdHoc}
                style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--border)',
                  background:'var(--bg-card)', color:'var(--text-primary)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                Add
              </button>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {settings.adHocSymbols.map((s) => (
                <button key={s} onClick={() => removeAdHoc(s)}
                  style={{ padding:'5px 10px', borderRadius:18, border:'1px solid var(--border)',
                    background:'var(--accent-dim)', color:'var(--accent-text)',
                    fontSize:11.5, fontWeight:600, cursor:'pointer' }}>{s} ✕</button>
              ))}
              {settings.adHocSymbols.length === 0 && (
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>No ad-hoc symbols.</div>
              )}
            </div>
          </Section>

          {/* Live status */}
          <Section title={`Active monitored calls (${activeCalls.length})`}>
            {activeCalls.length === 0 ? (
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>No live calls right now for your monitored set.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {activeCalls.map((c) => (
                  <div key={c.callKey} style={{
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)',
                    background:'var(--bg-card)',
                  }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{c.symbol} · {c.event}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>started {new Date(c.startedAt).toLocaleTimeString()}</div>
                    </div>
                    <div style={{ fontSize:11, fontWeight:600, color: c.ended ? 'var(--text-muted)' : 'var(--pos)' }}>
                      {c.ended ? 'ENDED' : 'LIVE'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Recent pins */}
          <Section title={`Recent highlights (${recentPins.length})`}>
            {recentPins.length === 0 ? (
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>No highlights pinned yet. They will appear here as live calls run.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {recentPins.slice(0, 12).map((p) => (
                  <div key={p.noteId} style={{
                    padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)',
                    background:'var(--bg-card)',
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--accent-text)' }}>
                        {p.symbol} · {KIND_LABEL[p.kind]} · {p.timestampLabel} ({p.alignment})
                      </div>
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>v{p.blueprintVersion ?? '?'}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:4 }}>{p.headline}</div>
                    <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5 }}>{p.summary}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:22 }}>
      <div style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:10 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function ChannelToggle({ label, description, value, disabled, onToggle }: {
  label: string
  description: string
  value: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
      padding:'12px 14px', borderRadius:8, border:'1px solid var(--border)',
      background:'var(--bg-card)', opacity: disabled ? 0.7 : 1,
    }}>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize:11.5, color:'var(--text-secondary)', marginTop:2, lineHeight:1.45 }}>{description}</div>
      </div>
      <button
        type="button"
        aria-pressed={value}
        disabled={disabled}
        onClick={onToggle}
        style={{
          flexShrink:0,
          padding:'6px 12px', borderRadius:18, border:'1px solid var(--border)',
          background: value ? 'var(--accent)' : 'var(--bg)',
          color: value ? '#fff' : 'var(--text-primary)',
          fontSize:11.5, fontWeight:700, cursor: disabled ? 'not-allowed' : 'pointer',
        }}>
        {value ? 'On' : 'Off'}
      </button>
    </div>
  )
}

function EmailRecipientsEditor({ recipients, onChange }: {
  recipients: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim().toLowerCase()
    if (!v) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return
    if (recipients.includes(v)) { setDraft(''); return }
    onChange([...recipients, v])
    setDraft('')
  }
  return (
    <div style={{
      padding:'10px 12px', borderRadius:8, border:'1px dashed var(--border)',
      background:'var(--bg)',
    }}>
      <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:8 }}>
        Custom recipient list — leave empty to send to all workspace members.
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
        {recipients.map((r) => (
          <button key={r} onClick={() => onChange(recipients.filter((x) => x !== r))}
            style={{ padding:'4px 9px', borderRadius:14, border:'1px solid var(--border)',
              background:'var(--accent-dim)', color:'var(--accent-text)',
              fontSize:11, fontWeight:600, cursor:'pointer' }}>
            {r} ✕
          </button>
        ))}
        {recipients.length === 0 && (
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>(no overrides)</div>
        )}
      </div>
      <div style={{ display:'flex', gap:6 }}>
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="ops@yourfund.com"
          style={{ flex:1, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)',
            background:'var(--bg-card)', color:'var(--text-primary)', fontSize:12 }}
        />
        <button onClick={add}
          style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)',
            background:'var(--bg-card)', color:'var(--text-primary)', fontSize:11.5, fontWeight:600, cursor:'pointer' }}>
          Add
        </button>
      </div>
    </div>
  )
}

function SlackWebhookEditor({ value, onSave }: {
  value: string | null
  onSave: (url: string | null) => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => { setDraft(value ?? '') }, [value])
  const valid = draft === '' || /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+$/.test(draft)
  const dirty = (value ?? '') !== draft
  return (
    <div style={{
      padding:'10px 12px', borderRadius:8, border:'1px dashed var(--border)',
      background:'var(--bg)',
    }}>
      <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:8 }}>
        Slack incoming webhook URL — must be of the form{' '}
        <code style={{ fontSize:10.5 }}>https://hooks.slack.com/services/…</code>
      </div>
      <div style={{ display:'flex', gap:6 }}>
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://hooks.slack.com/services/T000/B000/XXXX"
          style={{ flex:1, padding:'6px 10px', borderRadius:8,
            border:`1px solid ${valid ? 'var(--border)' : 'var(--error, #ef4444)'}`,
            background:'var(--bg-card)', color:'var(--text-primary)', fontSize:12 }}
        />
        <button
          onClick={() => onSave(draft.trim() === '' ? null : draft.trim())}
          disabled={!valid || !dirty}
          style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)',
            background:'var(--bg-card)', color: valid && dirty ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize:11.5, fontWeight:600, cursor: valid && dirty ? 'pointer' : 'default' }}>
          {draft === '' && value ? 'Clear' : 'Save'}
        </button>
      </div>
      {!valid && (
        <div style={{ fontSize:11, color:'var(--error, #ef4444)', marginTop:6 }}>
          Doesn&apos;t look like a Slack incoming webhook URL.
        </div>
      )}
    </div>
  )
}

function FilingThresholdEditor({ value, onSave }: {
  value: number
  onSave: (n: number) => void
}) {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  const [draft, setDraft] = useState(clamp(value))
  useEffect(() => { setDraft(clamp(value)) }, [value])
  const dirty = clamp(value) !== draft
  return (
    <div style={{
      padding:'10px 12px', borderRadius:8, border:'1px dashed var(--border)',
      background:'var(--bg)',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={draft}
          onChange={(e) => setDraft(clamp(Number(e.target.value)))}
          style={{ flex:1 }}
          aria-label="Filing signal score threshold"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={draft}
          onChange={(e) => setDraft(clamp(Number(e.target.value)))}
          style={{ width:64, padding:'6px 8px', borderRadius:8,
            border:'1px solid var(--border)', background:'var(--bg-card)',
            color:'var(--text-primary)', fontSize:12, textAlign:'center' }}
        />
        <button
          onClick={() => onSave(draft)}
          disabled={!dirty}
          style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)',
            background:'var(--bg-card)', color: dirty ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize:11.5, fontWeight:600, cursor: dirty ? 'pointer' : 'default' }}>
          Save
        </button>
      </div>
      <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:8 }}>
        Alert on filings scoring <strong>{draft}</strong> or higher (0–100).
      </div>
    </div>
  )
}
