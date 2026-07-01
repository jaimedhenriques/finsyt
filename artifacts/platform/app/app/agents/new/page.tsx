'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, Suspense } from 'react'
import { useAgents, TEMPLATES, Frequency, Weekday, AgentSchedule } from '@/lib/agents'

const FREQS: Frequency[] = ['Daily', 'Weekly', 'Monthly', 'Real-time']
const DAYS:  Weekday[]   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TIMES = ['6:00 AM', '7:00 AM', '7:30 AM', '8:00 AM', '9:00 AM', '12:00 PM', '4:00 PM', '5:00 PM', '6:00 PM']
const TZS   = ['ET', 'PT', 'CT', 'GMT', 'CET']

function CreateAgentInner() {
  const router  = useRouter()
  const params  = useSearchParams()
  const editId  = params.get('edit')
  const tplSlug = params.get('template')
  const { agents, createAgent, updateAgent, templates } = useAgents()

  const editingAgent = editId ? agents.find(a => a.id === editId) : null
  const tpl = tplSlug ? templates.find(t => t.slug === tplSlug) : null

  const [name,         setName]         = useState('')
  const [frequency,    setFrequency]    = useState<Frequency>('Weekly')
  const [day,          setDay]          = useState<Weekday>('Mon')
  const [time,         setTime]         = useState('8:00 AM')
  const [timezone,     setTimezone]     = useState('ET')
  const [instructions, setInstructions] = useState('')
  const [hydrated,     setHydrated]     = useState(false)

  useEffect(() => {
    if (editingAgent) {
      setName(editingAgent.name)
      setFrequency(editingAgent.schedule.frequency)
      setDay(editingAgent.schedule.day ?? 'Mon')
      setTime(editingAgent.schedule.time ?? '8:00 AM')
      setTimezone(editingAgent.schedule.timezone ?? 'ET')
      setInstructions(editingAgent.instructions)
    } else if (tpl) {
      setName(tpl.name)
      setFrequency(tpl.defaultSchedule.frequency)
      setDay(tpl.defaultSchedule.day ?? 'Mon')
      setTime(tpl.defaultSchedule.time ?? '8:00 AM')
      setTimezone(tpl.defaultSchedule.timezone ?? 'ET')
      setInstructions(tpl.defaultInstructions)
    }
    setHydrated(true)
  }, [editId, tplSlug, editingAgent?.id, tpl?.slug])

  const [saving, setSaving] = useState(false)
  async function save() {
    if (!name.trim() || !instructions.trim() || saving) return
    const schedule: AgentSchedule = {
      frequency,
      day:      frequency === 'Weekly' || frequency === 'Monthly' ? day : undefined,
      time:     frequency === 'Real-time' ? undefined : time,
      timezone,
    }
    setSaving(true)
    try {
      if (editingAgent) {
        await updateAgent(editingAgent.id, { name: name.trim(), schedule, instructions: instructions.trim() })
        router.push(`/app/agents/${editingAgent.id}`)
      } else {
        const ag = await createAgent({
          name: name.trim(),
          status: 'Scheduled',
          templateSlug: tpl?.slug,
          category: tpl?.category ?? 'Research',
          icon: tpl?.icon ?? '◎',
          schedule,
          instructions: instructions.trim(),
        })
        if (ag) router.push(`/app/agents/${ag.id}`)
      }
    } finally { setSaving(false) }
  }

  function cancel() {
    if (editingAgent) router.push(`/app/agents/${editingAgent.id}`)
    else router.push('/app/agents')
  }

  const canSave = name.trim().length > 0 && instructions.trim().length > 0

  return (
    <div style={{
      minHeight: '100%', position: 'relative',
      background: 'var(--bg-page)',
      padding: '40px 24px 80px',
    }}>
      {/* Backdrop tint to evoke the "card on dark page" reference visual */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at top, var(--accent-dim), transparent 60%)',
        opacity: 0.6, pointerEvents: 'none',
      }}/>

      <div style={{
        position: 'relative', maxWidth: 640, margin: '0 auto',
        background: '#FFFFFF', color: '#0A1628',
        borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #E5EAF2',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button onClick={cancel} aria-label="Close" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#0A1628', fontSize: 18, lineHeight: 1, padding: 0,
            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {editingAgent ? 'Edit Agent' : 'Create Agent'}
          </div>
          {tpl && !editingAgent && (
            <span style={{
              marginLeft: 'auto', fontSize: 11, fontWeight: 700,
              padding: '3px 8px', borderRadius: 999,
              background: '#EEF2FF', color: '#1B4FFF',
            }}>From template · {tpl.name}</span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '22px 24px 18px' }}>
          {/* Title */}
          <Field label="Title">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Air Freight & Logistics – Weekly Briefing"
              style={inputStyle}
            />
          </Field>

          {/* Email schedule */}
          <Field label="Email Schedule">
            {frequency === 'Real-time' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select value={frequency} onChange={e => setFrequency(e.target.value as Frequency)} style={selectStyle}>
                  {FREQS.map(f => <option key={f}>{f}</option>)}
                </select>
                <div style={{ ...inputStyle, color: '#7D8FA9', display: 'flex', alignItems: 'center' }}>
                  Delivered as events fire
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <select value={frequency} onChange={e => setFrequency(e.target.value as Frequency)} style={selectStyle}>
                  {FREQS.map(f => <option key={f}>{f}</option>)}
                </select>
                {frequency === 'Daily' ? (
                  <div style={{ ...inputStyle, color: '#7D8FA9', display: 'flex', alignItems: 'center' }}>
                    Every day
                  </div>
                ) : (
                  <select value={day} onChange={e => setDay(e.target.value as Weekday)} style={selectStyle}>
                    {DAYS.map(d => <option key={d}>{d}</option>)}
                  </select>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={time} onChange={e => setTime(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                    {TIMES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <select value={timezone} onChange={e => setTimezone(e.target.value)} style={{ ...selectStyle, width: 76 }}>
                    {TZS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )}
          </Field>

          {/* Instructions */}
          <Field label="Instructions">
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Tell the agent what to research, which tickers or themes to cover, and what the brief should look like."
              rows={5}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 110, lineHeight: 1.55 }}
            />
            <div style={{ fontSize: 11, color: '#7D8FA9', marginTop: 6 }}>
              {instructions.length} characters · Tip: be specific about scope, output format, and any guardrails.
            </div>
          </Field>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid #E5EAF2',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button onClick={cancel} style={{
            padding: '8px 18px', borderRadius: 8, border: '1px solid #E5EAF2',
            background: '#FFFFFF', color: '#0A1628',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={save} disabled={!canSave || saving} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: canSave && !saving ? '#1B4FFF' : '#B6C4E2', color: '#FFFFFF',
            fontSize: 13, fontWeight: 700,
            cursor: canSave && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            boxShadow: canSave && !saving ? '0 2px 8px rgba(27,79,255,0.3)' : 'none',
          }}>{saving ? 'Saving…' : editingAgent ? 'Save changes' : 'Save Agent'}</button>
        </div>
      </div>

      {/* Secondary entry-point footer */}
      {!editingAgent && (
        <div style={{ position: 'relative', maxWidth: 640, margin: '14px auto 0', textAlign: 'center' }}>
          <Link href="/app/agents/library" style={{
            fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none',
          }}>or browse the template library →</Link>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: '#7D8FA9',
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7,
      }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 8,
  border: '1px solid #E5EAF2', background: '#FFFFFF',
  fontSize: 13.5, fontFamily: 'inherit', color: '#0A1628', outline: 'none',
}
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'auto' }

export default function CreateAgentPage() {
  return <Suspense fallback={null}><CreateAgentInner /></Suspense>
}
