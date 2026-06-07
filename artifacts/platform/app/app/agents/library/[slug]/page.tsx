'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { TEMPLATES, scheduleSummary } from '@/lib/agents'

export default function TemplateDetailPage() {
  const params = useParams<{ slug: string }>()
  const tpl = TEMPLATES.find(t => t.slug === params?.slug)

  if (!tpl) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Template not found</div>
        <Link href="/app/agents/library" style={{ color: 'var(--accent-text)' }}>← Back to library</Link>
      </div>
    )
  }

  return (
    <div style={{ color: 'var(--text-primary)', maxWidth: 920, margin: '0 auto', padding: '32px 32px 64px' }}>
      <Link href="/app/agents/library" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
        color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 20,
      }}>← Agent Library</Link>

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginBottom: 28 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 14, flexShrink: 0,
          background: 'rgba(27,79,255,0.18)', color: 'var(--accent-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
        }}>{tpl.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-text)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            {tpl.category} · Workflow agent
          </div>
          <h1 style={{
            fontFamily: "'Inter Tight', 'Inter', sans-serif",
            fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em',
            margin: 0, lineHeight: 1.1,
          }}>{tpl.name}</h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 14, marginBottom: 0 }}>
            {tpl.description}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <Card title="What it watches" items={tpl.watches} />
        <Card title="What it produces" items={tpl.produces} />
      </div>

      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 18, marginBottom: 18,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
          Default schedule
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>◷ {scheduleSummary(tpl.defaultSchedule)}</div>
      </div>

      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 18, marginBottom: 24,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
          Default instructions
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>
          {tpl.defaultInstructions}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
          You'll be able to edit these instructions before saving.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Link href="/app/agents/library" style={{
          padding: '10px 18px', borderRadius: 10, background: 'transparent',
          border: '1.5px solid var(--border)', color: 'var(--text-primary)',
          fontSize: 13, fontWeight: 700, textDecoration: 'none',
        }}>Cancel</Link>
        <Link href={`/app/agents/new?template=${tpl.slug}`} style={{
          padding: '10px 18px', borderRadius: 10, background: 'var(--gradient-brand)',
          color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
          boxShadow: '0 4px 14px var(--accent-dim)',
        }}>Use this template →</Link>
      </div>
    </div>
  )
}

function Card({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 18,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(it => (
          <div key={it} style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: 'var(--accent-text)', fontWeight: 700, marginTop: 1 }}>·</span>
            {it}
          </div>
        ))}
      </div>
    </div>
  )
}
