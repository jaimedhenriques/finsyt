'use client'
import Link from 'next/link'
import { useState } from 'react'
import { PageHero, ContextualAskBar, ACTION_ICONS, ICON_STROKE } from '@/components/ui'
import { TEMPLATES, AgentCategory } from '@/lib/agents'

const CATEGORIES: ('All' | AgentCategory)[] = ['All', 'Monitoring', 'Research', 'Competitive', 'Earnings', 'Macro', 'Diligence']

const CAT_ACCENT: Record<AgentCategory, string> = {
  Monitoring:  'rgba(27,79,255,0.18)',
  Research:    'rgba(167,139,250,0.18)',
  Competitive: 'rgba(251,191,36,0.18)',
  Earnings:    'rgba(52,211,153,0.18)',
  Macro:       'rgba(13,159,232,0.18)',
  Diligence:   'rgba(248,113,113,0.16)',
}
const CAT_FG: Record<AgentCategory, string> = {
  Monitoring:  'var(--accent-text)',
  Research:    '#C4B5FD',
  Competitive: 'var(--amber)',
  Earnings:    'var(--pos)',
  Macro:       '#7DD3FC',
  Diligence:   '#FCA5A5',
}

export default function AgentLibraryPage() {
  const [cat, setCat] = useState<'All' | AgentCategory>('All')
  const visible = cat === 'All' ? TEMPLATES : TEMPLATES.filter(t => t.category === cat)

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <PageHero
          eyebrow={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ACTION_ICONS.sparkles width={11} height={11} strokeWidth={ICON_STROKE} />
              Agent Library · 14 templates
            </span>
          }
          title="Workflow agents, ready to run."
          accentWord="ready to run"
          subtitle="Pick a template, point it at your tickers, and Finsyt will run the workflow on a schedule and deliver the brief to your Inbox. Or build your own from scratch."
          actions={
            <Link href="/app/agents/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
              borderRadius: 10, background: 'var(--gradient-brand)', border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 4px 14px var(--accent-dim)',
            }}>+ Start from scratch</Link>
          }
        />
      </div>

      <div style={{ padding: '0 1.75rem 2rem', maxWidth: 1400, margin: '0 auto' }}>

        <ContextualAskBar
          context="Agent Library"
          contextData={{ page: 'agent-library', category: cat }}
          chips={[
            { label: 'Find an agent',     prompt: 'Find an agent in the library that monitors competitor pricing changes.' },
            { label: 'Most popular',      prompt: 'Show me the most popular agent templates this week and what they do.' },
            { label: 'New agents',        prompt: 'List the newest agent templates added to the library, with a one-line summary of each.' },
            { label: 'Build my own',      prompt: 'Help me design a custom agent that runs every Monday morning before market open.' },
          ]}
          placeholder="Describe an agent and Finsyt will find or build it…"
          style={{ margin: '0 0 18px' }}
        />

        {/* Category chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => {
            const active = cat === c
            const count = c === 'All' ? TEMPLATES.length : TEMPLATES.filter(t => t.category === c).length
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {visible.map(t => (
            <Link key={t.slug} href={`/app/agents/library/${t.slug}`} style={{
              display: 'block', textDecoration: 'none',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 14, padding: 18, transition: 'border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(27,79,255,0.4)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: CAT_ACCENT[t.category], color: CAT_FG[t.category],
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>{t.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{t.name}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                    background: CAT_ACCENT[t.category], color: CAT_FG[t.category],
                    letterSpacing: '0.04em',
                  }}>{t.category}</span>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
                {t.description}
              </div>
              <TagRow label="Watches"  tags={t.watches}  />
              <TagRow label="Produces" tags={t.produces} />
              <div style={{
                marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>◷ {t.defaultSchedule.frequency.toLowerCase()}</span>
                <span style={{ fontSize: 12, color: 'var(--accent-text)', fontWeight: 700 }}>Use template →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {tags.map(t => (
          <span key={t} style={{
            fontSize: 10.5, padding: '2px 7px', borderRadius: 5,
            background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}>{t}</span>
        ))}
      </div>
    </div>
  )
}
