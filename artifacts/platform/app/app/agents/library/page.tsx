'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PageHero, ContextualAskBar, ACTION_ICONS, ICON_STROKE } from '@/components/ui'
import { apiUrl } from '@/lib/api-url'

// Blueprint Library — replaces the static `TEMPLATES` view. Lists every
// Blueprint visible to the active workspace (curated `published` + workspace
// rows). Curated rows are read-only here; workspace rows can be edited via
// the structured editor at /app/agents/blueprints/[id].

type Visibility = 'private' | 'team' | 'firm' | 'published'

interface BlueprintListItem {
  id: string
  slug: string
  name: string
  description: string
  category: string
  icon: string
  visibility: Visibility
  version: number
  steps: { id: string; title: string }[]
  parameters: { key: string; label: string; type: string; required?: boolean }[]
  expectedOutputs: { key: string; label: string }[]
  isPublished: boolean
  updatedAt: string
}

const CATEGORIES = ['All', 'Monitoring', 'Research', 'Competitive', 'Earnings', 'Macro', 'Diligence', 'M&A', 'Outreach'] as const
type Cat = typeof CATEGORIES[number]

const CAT_ACCENT: Record<string, string> = {
  Monitoring:  'rgba(27,79,255,0.18)',
  Research:    'rgba(167,139,250,0.18)',
  Competitive: 'rgba(251,191,36,0.18)',
  Earnings:    'rgba(52,211,153,0.18)',
  Macro:       'rgba(13,159,232,0.18)',
  Diligence:   'rgba(248,113,113,0.16)',
  'M&A':       'rgba(240,138,255,0.16)',
  Outreach:    'rgba(120,200,140,0.18)',
}
const CAT_FG: Record<string, string> = {
  Monitoring:  'var(--accent-text)',
  Research:    '#C4B5FD',
  Competitive: 'var(--amber)',
  Earnings:    'var(--pos)',
  Macro:       '#7DD3FC',
  Diligence:   '#FCA5A5',
  'M&A':       '#F0C2FF',
  Outreach:    '#A5E3B8',
}

export default function BlueprintLibraryPage() {
  const [cat, setCat] = useState<Cat>('All')
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [items, setItems] = useState<BlueprintListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    setItems(null)
    fetch(apiUrl(`/api/blueprints${scope === 'mine' ? '?mine=1' : ''}`), { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (aborted) return
        if (data.error) { setError(data.error); return }
        setItems(data.blueprints || [])
      })
      .catch((e: Error) => { if (!aborted) setError(e.message) })
    return () => { aborted = true }
  }, [scope])

  const visible = useMemo(() => {
    if (!items) return []
    return cat === 'All' ? items : items.filter((b) => b.category === cat)
  }, [items, cat])

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <PageHero
          eyebrow={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ACTION_ICONS.sparkles width={11} height={11} strokeWidth={ICON_STROKE} />
              Blueprint Library{items ? ` · ${items.length} playbooks` : ''}
            </span>
          }
          title="Multi-step playbooks, ready to run."
          accentWord="ready to run"
          subtitle="Pick a Blueprint, point it at your tickers or a Matrix, and Finsyt will run every step in sequence — citations included. Edit the steps, save it as your own, or build a new one from scratch."
          actions={
            <Link href="/app/agents/blueprints/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
              borderRadius: 10, background: 'var(--gradient-brand)', border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 4px 14px var(--accent-dim)',
            }}>+ New Blueprint</Link>
          }
        />
      </div>

      <div style={{ padding: '0 1.75rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
        <ContextualAskBar
          context="Blueprint Library"
          contextData={{ page: 'blueprint-library', category: cat }}
          chips={[
            { label: 'IC memo for NVDA',     prompt: 'Run the IC memo Blueprint with NVDA as the primary ticker and AMD, AVGO, TSM as peers.' },
            { label: 'M&A shortlist',        prompt: 'Run the M&A shortlist Blueprint to find acquisition targets in the cybersecurity sector under $5B EV.' },
            { label: 'Sector landscape',     prompt: 'Run the sector landscape Blueprint on the data infrastructure space and pin the result to my notebook.' },
            { label: 'Build my own',         prompt: 'Help me design a custom Blueprint with three steps: monitor news, summarise findings, draft an analyst note.' },
          ]}
          placeholder="Describe a Blueprint and Finsyt will find or build it…"
          style={{ margin: '0 0 18px' }}
        />

        {/* Scope + category filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <ScopeChip active={scope === 'all'} onClick={() => setScope('all')}>All</ScopeChip>
          <ScopeChip active={scope === 'mine'} onClick={() => setScope('mine')}>My workspace</ScopeChip>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => {
            const active = cat === c
            const count = c === 'All' ? (items?.length ?? 0) : (items?.filter((t) => t.category === c).length ?? 0)
            return (
              <button key={c} onClick={() => setCat(c)} style={{
                padding: '7px 14px', borderRadius: 999,
                background: active ? 'var(--accent-dim)' : 'transparent',
                border: `1px solid ${active ? 'rgba(27,79,255,0.4)' : 'var(--border)'}`,
                color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {c} <span style={{ marginLeft: 6, opacity: 0.7 }}>{count}</span>
              </button>
            )
          })}
        </div>

        {error && (
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--neg-dim)', color: 'var(--neg)', marginBottom: 18 }}>
            Failed to load Blueprint library: {error}
          </div>
        )}
        {items === null && !error && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>Loading Blueprints…</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {visible.map((t) => (
            <Link key={t.id} href={`/app/agents/blueprints/${t.id}`} style={{
              display: 'block', textDecoration: 'none',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 14, padding: 18, transition: 'border-color 0.15s, transform 0.15s',
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(27,79,255,0.4)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: CAT_ACCENT[t.category] || 'var(--bg-subtle)',
                  color: CAT_FG[t.category] || 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>{t.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{t.name}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                      background: CAT_ACCENT[t.category] || 'var(--bg-subtle)',
                      color: CAT_FG[t.category] || 'var(--text-primary)', letterSpacing: '0.04em',
                    }}>{t.category}</span>
                    <VisBadge v={t.visibility} isPublished={t.isPublished} />
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
                {t.description}
              </div>
              <TagRow label={`${t.steps.length} steps`} tags={t.steps.slice(0, 4).map((s) => s.title)} />
              {t.expectedOutputs.length > 0 && (
                <TagRow label="Produces" tags={t.expectedOutputs.map((o) => o.label)} />
              )}
              <div style={{
                marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>v{t.version}</span>
                <span style={{ fontSize: 12, color: 'var(--accent-text)', fontWeight: 700 }}>Open Blueprint →</span>
              </div>
            </Link>
          ))}
        </div>

        {items && items.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No Blueprints yet.</div>
            <div style={{ fontSize: 13 }}>The starter library is provisioned at server boot. Try refreshing in a moment, or create one from scratch.</div>
          </div>
        )}
      </div>
    </div>
  )
}

function ScopeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 8,
      background: active ? 'var(--bg-elevated)' : 'transparent',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    }}>{children}</button>
  )
}

function VisBadge({ v, isPublished }: { v: Visibility; isPublished: boolean }) {
  const label = isPublished ? 'Curated' : v
  const tone = isPublished ? 'rgba(120,200,140,0.18)' : 'rgba(255,255,255,0.06)'
  const fg = isPublished ? '#A5E3B8' : 'var(--text-muted)'
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: tone, color: fg, letterSpacing: '0.04em', textTransform: 'capitalize' }}>{label}</span>
  )
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  if (!tags.length) return null
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {tags.map((t, i) => (
          <span key={`${t}-${i}`} style={{
            fontSize: 10.5, padding: '2px 7px', borderRadius: 5,
            background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}>{t}</span>
        ))}
      </div>
    </div>
  )
}
