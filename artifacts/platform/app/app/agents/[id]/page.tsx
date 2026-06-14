'use client'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAgents, scheduleSummary, relTime, statusTone } from '@/lib/agents'
import { ContextualAskBar } from '@/components/ui'

const TONE_BG: Record<string, string> = {
  green: 'rgba(52,211,153,0.18)', blue: 'rgba(27,79,255,0.20)',
  amber: 'rgba(251,191,36,0.18)',  gray: 'rgba(255,255,255,0.06)',
}
const TONE_FG: Record<string, string> = {
  green: 'var(--pos)', blue: 'var(--accent-text)',
  amber: 'var(--amber)', gray: 'var(--text-secondary)',
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { agents, runs, loading, runAgentNow, updateAgent, deleteAgent, duplicateAgent } = useAgents()
  const [busy, setBusy] = useState(false)

  const ag = agents.find(a => a.id === params?.id)
  if (loading && !ag) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Loading agent…</div>
  }
  if (!ag) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Agent not found</div>
        <Link href="/app/agents" style={{ color: 'var(--accent-text)' }}>← Back to My Agents</Link>
      </div>
    )
  }
  async function triggerRun() {
    if (busy || !ag) return
    setBusy(true)
    try {
      const r = await runAgentNow(ag.id)
      if (r) router.push(`/app/agents/${ag.id}/runs/${r.id}`)
    } finally { setBusy(false) }
  }

  const myRuns = runs.filter(r => r.agentId === ag.id).sort((a,b) => b.ranAt.localeCompare(a.ranAt))
  const tone = statusTone(ag.status)

  return (
    <div style={{ color: 'var(--text-primary)', maxWidth: 1100, margin: '0 auto', padding: '24px 32px 64px' }}>
      <Link href="/app/agents" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
        color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 18,
      }}>← My Agents</Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12, flexShrink: 0,
          background: 'rgba(27,79,255,0.18)', color: 'var(--accent-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        }}>{ag.icon}</div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <h1 style={{
              fontFamily: "'Inter Tight', 'Inter', sans-serif",
              fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em',
              margin: 0, lineHeight: 1.15,
            }}>{ag.name}</h1>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', borderRadius: 999,
              background: TONE_BG[tone], color: TONE_FG[tone],
              fontSize: 11, fontWeight: 700,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: TONE_FG[tone],
                boxShadow: ag.status === 'Running' ? `0 0 6px ${TONE_FG[tone]}` : 'none',
              }}/>
              {ag.status}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {ag.category} · created {ag.createdAt}{ag.templateSlug ? ' · from template' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button disabled={busy} onClick={triggerRun}
            style={{ ...primaryBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Running…' : '▶ Run now'}
          </button>
          <button onClick={() => updateAgent(ag.id, { status: ag.status === 'Paused' ? 'Scheduled' : 'Paused' })}
            style={ghostBtn}>{ag.status === 'Paused' ? 'Resume' : 'Pause'}</button>
          <Link href={`/app/agents/new?edit=${ag.id}`} style={{ ...ghostBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Edit</Link>
          <button onClick={() => duplicateAgent(ag.id)} style={ghostBtn}>Duplicate</button>
          <button onClick={() => { if (confirm(`Delete "${ag.name}"?`)) { deleteAgent(ag.id); router.push('/app/agents') } }}
            style={{ ...ghostBtn, color: 'var(--neg)' }}>Delete</button>
        </div>
      </div>

      <ContextualAskBar
        context={`Agent · ${ag.name}`}
        contextData={{ page: 'agent-detail', agentId: ag.id, status: ag.status, category: ag.category }}
        chips={[
          { label: 'Tighten the brief',  prompt: `Review the instructions for the agent "${ag.name}" and suggest tightenings that will produce more decision-grade output.` },
          { label: 'Suggest schedule',   prompt: `Suggest the optimal cadence and time-of-day for the agent "${ag.name}" given its purpose.` },
          { label: 'Explain last run',   prompt: `Explain what the agent "${ag.name}" produced in its most recent run and what I should act on.` },
          { label: 'Add a guardrail',    prompt: `Propose a guardrail or output schema constraint for the agent "${ag.name}" so its results stay consistent.` },
        ]}
        placeholder={`Ask Finsyt about the "${ag.name}" agent…`}
        style={{ margin: '0 0 18px' }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18 }}>
        {/* Left: instructions + runs */}
        <div>
          <Section title="Instructions">
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
              {ag.instructions}
            </div>
          </Section>

          <Section title={`Recent runs · ${myRuns.length}`}>
            {myRuns.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                No runs yet. Hit <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Run now</span> to generate the first brief.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {myRuns.map((r, i) => (
                  <Link key={r.id} href={`/app/agents/${ag.id}/runs/${r.id}`} style={{
                    display: 'block', textDecoration: 'none', padding: '14px 0',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(r.ranAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                      {!r.read && <span style={{
                        fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: 'var(--accent)', color: '#fff', letterSpacing: '0.04em',
                      }}>NEW</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent-text)', fontWeight: 600 }}>Open →</span>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>{r.headline}</div>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Right: meta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Section title="Schedule">
            <Meta label="Frequency"  value={ag.schedule.frequency} />
            {ag.schedule.day  && <Meta label="Day"       value={ag.schedule.day} />}
            {ag.schedule.time && <Meta label="Time"      value={`${ag.schedule.time} ${ag.schedule.timezone ?? ''}`.trim()} />}
            <Meta label="Summary"  value={scheduleSummary(ag.schedule)} />
          </Section>
          <Section title="Activity">
            <Meta label="Last run"  value={relTime(ag.lastRunAt)} />
            <Meta label="Next run"  value={ag.status === 'Paused' ? 'Paused' : relTime(ag.nextRunAt)} />
            <Meta label="Total runs" value={String(myRuns.length)} />
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 18, marginBottom: 14,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12,
      }}>{title}</div>
      {children}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 9, border: 'none',
  background: 'var(--gradient-brand)', color: '#fff',
  fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 14px var(--accent-dim)',
}
const ghostBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 9,
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
  color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
