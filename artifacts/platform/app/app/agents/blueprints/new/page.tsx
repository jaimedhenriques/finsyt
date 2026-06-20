'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PageHero } from '@/components/ui'
import { apiUrl } from '@/lib/api-url'
import Link from 'next/link'

// Lightweight scaffolder that creates a one-step Blueprint and immediately
// drops the user into the structured editor at `/app/agents/blueprints/[id]`.
// All deeper editing (parameters, multiple steps, outputs) happens there so we
// only have one source of truth for the editor UI.

const CATEGORIES = ['Monitoring', 'Research', 'Competitive', 'Earnings', 'Macro', 'Diligence', 'M&A', 'Outreach']

export default function NewBlueprintPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Research')
  const [icon, setIcon] = useState('◎')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    if (!name.trim()) { setErr('name is required'); return }
    setCreating(true); setErr(null)
    try {
      const r = await fetch(apiUrl('/api/blueprints'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category,
          icon,
          visibility: 'private',
          steps: [
            { id: 'step-1', title: 'First step', prompt: 'Describe what this step should do. Reference any parameters with {{key}}.' },
          ],
        }),
      })
      const data = await r.json()
      if (!r.ok) { setErr(data?.error || 'create failed'); return }
      router.push(`/app/agents/blueprints/${data.blueprint.id}`)
    } finally { setCreating(false) }
  }

  return (
    <div style={{ color: 'var(--text-primary)', maxWidth: 720, margin: '0 auto' }}>
      <PageHero
        eyebrow={<Link href="/app/agents/library" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 12 }}>← Blueprint Library</Link>}
        title="New Blueprint"
        subtitle="Create a private Blueprint, then add steps, parameters, and expected outputs in the structured editor."
      />
      <div style={{ padding: '0 32px 64px' }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, display: 'grid', gap: 14 }}>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="IC memo · NVDA" style={inputStyle} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One sentence on what this Blueprint does." style={{ ...inputStyle, minHeight: 80 }} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Icon">
              <input value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 4) || '◎')} maxLength={4} style={inputStyle} />
            </Field>
          </div>
          {err && <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--neg-dim)', color: 'var(--neg)', fontSize: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Link href="/app/agents/library" style={{ ...ghostBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Cancel</Link>
            <button onClick={create} disabled={creating} style={primaryBtn}>{creating ? 'Creating…' : 'Create Blueprint →'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit',
}
const ghostBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10, background: 'transparent',
  border: '1px solid var(--border)', color: 'var(--text-primary)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10, background: 'var(--gradient-brand)',
  border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 14px var(--accent-dim)',
}
