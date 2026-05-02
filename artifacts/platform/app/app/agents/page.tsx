'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PageHero } from '@/components/ui'
import { useAgents, scheduleSummary, relTime, statusTone, AgentStatus } from '@/lib/agents'

const TONE_BG: Record<string, string> = {
  green: 'rgba(52,211,153,0.18)', blue: 'rgba(27,79,255,0.20)',
  amber: 'rgba(251,191,36,0.18)',  gray: 'rgba(255,255,255,0.06)',
}
const TONE_FG: Record<string, string> = {
  green: 'var(--pos)', blue: 'var(--accent-text)',
  amber: 'var(--amber)', gray: 'var(--text-secondary)',
}

const FILTERS: (AgentStatus | 'All')[] = ['All', 'Running', 'Scheduled', 'Paused', 'Draft']

export default function MyAgentsPage() {
  const router = useRouter()
  const { agents, runs, loading, deleteAgent, duplicateAgent, updateAgent, runAgentNow } = useAgents()
  const [filter, setFilter] = useState<AgentStatus | 'All'>('All')
  const [runningId, setRunningId] = useState<string | null>(null)

  const visible = filter === 'All' ? agents : agents.filter(a => a.status === filter)
  const lastRunFor = (id: string) => runs.find(r => r.agentId === id)

  async function triggerRun(id: string) {
    if (runningId) return
    setRunningId(id)
    try {
      const r = await runAgentNow(id)
      if (r) router.push(`/app/agents/${id}/runs/${r.id}`)
    } finally { setRunningId(null) }
  }

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <PageHero
          eyebrow={`Agents · ${agents.length} configured`}
          title="My Agents."
          accentWord="Agents"
          subtitle="Your scheduled research workflows. Each agent runs on its own cadence and drops finished briefs into your Inbox."
          actions={
            <>
              <Link href="/app/agents/library" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
                borderRadius: 10, background: 'transparent', border: '1.5px solid var(--border)',
                color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, textDecoration: 'none',
              }}>Browse template library</Link>
              <Link href="/app/agents/new" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
                borderRadius: 10, background: 'var(--gradient-brand)', border: 'none',
                color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                boxShadow: '0 4px 14px var(--accent-dim)',
              }}>+ Create agent</Link>
            </>
          }
        />
      </div>

      <div style={{ padding: '0 1.75rem 2rem', maxWidth: 1400, margin: '0 auto' }}>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {FILTERS.map(f => {
            const active = filter === f
            const count = f === 'All' ? agents.length : agents.filter(a => a.status === f).length
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '7px 14px', borderRadius: 999,
                background: active ? 'var(--accent-dim)' : 'transparent',
                border: `1px solid ${active ? 'rgba(27,79,255,0.4)' : 'var(--border)'}`,
                color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {f} <span style={{ marginLeft: 6, opacity: 0.7 }}>{count}</span>
              </button>
            )
          })}
        </div>

        {loading && agents.length === 0 ? (
          <div style={{
            padding: '64px 24px', textAlign: 'center',
            background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 14,
            color: 'var(--text-secondary)', fontSize: 13,
          }}>Loading your agents…</div>
        ) : visible.length === 0 ? (
          <div style={{
            padding: '64px 24px', textAlign: 'center',
            background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 14,
          }}>
            <div style={{ fontSize: 32, opacity: 0.5, marginBottom: 12 }}>◎</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {filter === 'All' ? 'No agents yet' : `No ${filter.toLowerCase()} agents`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
              Start from a template or build one from scratch.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Link href="/app/agents/library" style={{
                padding: '8px 16px', borderRadius: 10, background: 'transparent',
                border: '1.5px solid var(--border)', color: 'var(--text-primary)',
                fontSize: 13, fontWeight: 700, textDecoration: 'none',
              }}>Browse templates</Link>
              <Link href="/app/agents/new" style={{
                padding: '8px 16px', borderRadius: 10, background: 'var(--gradient-brand)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
              }}>+ Create agent</Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(a => {
              const tone = statusTone(a.status)
              const lastRun = lastRunFor(a.id)
              return (
                <div key={a.id} style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '16px 18px',
                  display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 14, alignItems: 'center',
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: 'rgba(27,79,255,0.15)', color: 'var(--accent-text)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, flexShrink: 0,
                  }}>{a.icon}</div>

                  <Link href={`/app/agents/${a.id}`} style={{ textDecoration: 'none', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{a.name}</span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '2px 8px', borderRadius: 999,
                        background: TONE_BG[tone], color: TONE_FG[tone],
                        fontSize: 10.5, fontWeight: 700,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', background: TONE_FG[tone],
                          boxShadow: a.status === 'Running' ? `0 0 6px ${TONE_FG[tone]}` : 'none',
                        }}/>
                        {a.status}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.category}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                      <span>◷ {scheduleSummary(a.schedule)}</span>
                      <span>Last run: <span style={{ color: 'var(--text-primary)' }}>{relTime(a.lastRunAt)}</span></span>
                      <span>Next: <span style={{ color: a.status === 'Paused' ? 'var(--amber)' : 'var(--text-primary)' }}>
                        {a.status === 'Paused' ? 'Paused' : relTime(a.nextRunAt)}
                      </span></span>
                      {lastRun && <Link href={`/app/agents/${a.id}/runs/${lastRun.id}`} style={{ color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>View latest brief →</Link>}
                    </div>
                  </Link>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button disabled={runningId === a.id} onClick={() => triggerRun(a.id)}
                      style={{ ...btnGhost, opacity: runningId === a.id ? 0.6 : 1, cursor: runningId === a.id ? 'wait' : 'pointer' }}>
                      {runningId === a.id ? 'Running…' : '▶ Run now'}
                    </button>
                    <button onClick={() => updateAgent(a.id, { status: a.status === 'Paused' ? 'Scheduled' : 'Paused' })}
                      style={btnGhost}>{a.status === 'Paused' ? 'Resume' : 'Pause'}</button>
                    <Link href={`/app/agents/new?edit=${a.id}`} style={{ ...btnGhost, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Edit</Link>
                    <button onClick={() => duplicateAgent(a.id)} style={btnGhost} title="Duplicate">⎘</button>
                    <button onClick={() => { if (confirm(`Delete "${a.name}"?`)) deleteAgent(a.id) }}
                      style={{ ...btnGhost, color: 'var(--neg)' }} title="Delete">×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const btnGhost: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 7,
  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
  color: 'var(--text-secondary)', fontSize: 11.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
