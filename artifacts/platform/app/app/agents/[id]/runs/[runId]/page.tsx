'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect } from 'react'
import { useAgents } from '@/lib/agents'

export default function AgentRunPage() {
  const params = useParams<{ id: string; runId: string }>()
  const { runs, agents, loading, markRunRead } = useAgents()

  const ag  = agents.find(a => a.id === params?.id)
  const run = runs.find(r => r.id === params?.runId && r.agentId === params?.id)

  useEffect(() => { if (run && !run.read) markRunRead(run.id) }, [run?.id])

  if (loading && !run) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Loading brief…</div>
  }
  if (!run) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Run not found</div>
        <Link href={`/app/agents/${params?.id}`} style={{ color: 'var(--accent-text)' }}>← Back to agent</Link>
      </div>
    )
  }

  const ranOn = new Date(run.ranAt)

  return (
    <div style={{ color: 'var(--text-primary)', maxWidth: 880, margin: '0 auto', padding: '24px 32px 80px' }}>
      <Link href={ag ? `/app/agents/${ag.id}` : '/app/agents'} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
        color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 18,
      }}>← {ag ? ag.name : 'Agents'}</Link>

      {/* Brief container — tactile, document-like */}
      <article style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '32px 36px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
      }}>
        {/* Brief masthead */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, background: 'var(--gradient-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#fff',
          }}>F</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Finsyt Workflow Agent · {run.category}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {run.agentName} · delivered {ranOn.toLocaleString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={iconBtn} title="Download brief">⬇</button>
            <button style={iconBtn} title="Share">↗</button>
            <button style={iconBtn} title="Pin to workspace">⌘</button>
          </div>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: "'Inter Tight', 'Inter', sans-serif",
          fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em',
          lineHeight: 1.2, margin: 0,
        }}>{run.headline}</h1>

        {/* Summary */}
        <p style={{
          fontSize: 15.5, lineHeight: 1.65, color: 'var(--text-primary)',
          marginTop: 16, marginBottom: 28, fontWeight: 500,
        }}>{run.summary}</p>

        {/* Findings */}
        <SectionHead>Key findings</SectionHead>
        <div style={{ marginBottom: 32 }}>
          {run.findings.map((f, i) => (
            <div key={i} style={{
              padding: '14px 0',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: 'rgba(27,79,255,0.18)', color: 'var(--accent-text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, marginTop: 1,
              }}>{i + 1}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{f.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Sources */}
        <SectionHead>Sources</SectionHead>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {run.sources.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                background: 'rgba(27,79,255,0.18)', color: 'var(--accent-text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800,
              }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.meta}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 600 }}>Open ↗</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 32, paddingTop: 18, borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Generated by <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{run.agentName}</span> · run id <code style={{ background:'rgba(255,255,255,0.05)', padding:'1px 5px', borderRadius:4 }}>{run.id}</code>
          </span>
          {ag && (
            <Link href={`/app/agents/${ag.id}`} style={{
              fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600,
            }}>View agent configuration →</Link>
          )}
        </div>
      </article>
    </div>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
      letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12,
    }}>{children}</div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7,
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
  color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
}
