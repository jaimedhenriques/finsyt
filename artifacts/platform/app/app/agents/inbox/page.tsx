'use client'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import { PageHero, ContextualAskBar } from '@/components/ui'
import { useAgents, relTime } from '@/lib/agents'

const RANGES = [
  { id: '1d', label: 'Today',     hours: 24 },
  { id: '7d', label: 'Last 7d',   hours: 24 * 7 },
  { id: '30d',label: 'Last 30d',  hours: 24 * 30 },
  { id: 'all',label: 'All time',  hours: Infinity },
] as const

export default function InboxPage() {
  const { runs, agents, markRunRead, markAllRunsRead, unreadCount } = useAgents()
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [range,       setRange]       = useState<typeof RANGES[number]['id']>('7d')

  const filtered = useMemo(() => {
    const r = RANGES.find(x => x.id === range)!
    const cutoff = Date.now() - r.hours * 3600 * 1000
    return runs
      .filter(run => agentFilter === 'all' || run.agentId === agentFilter)
      .filter(run => r.hours === Infinity || new Date(run.ranAt).getTime() >= cutoff)
      .sort((a,b) => b.ranAt.localeCompare(a.ranAt))
  }, [runs, agentFilter, range])

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <PageHero
          eyebrow={`Inbox · ${unreadCount} unread`}
          title="Your agent briefs."
          accentWord="briefs"
          subtitle="Every completed agent run lands here. Filter by agent or by date range, and click any brief to open the full deliverable."
          actions={
            unreadCount > 0 ? (
              <button onClick={markAllRunsRead} style={{
                height: 40, padding: '0 16px', borderRadius: 10,
                background: 'transparent', border: '1.5px solid var(--border)',
                color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>Mark all as read</button>
            ) : undefined
          }
        />
      </div>

      <div style={{ padding: '0 1.75rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
        <ContextualAskBar
          context="Agent Inbox"
          contextData={{ page: 'agent-inbox', unreadCount, agentFilter, range }}
          chips={[
            { label: 'Summarise unread', prompt: `Summarise my ${unreadCount} unread agent runs into a single morning briefing.` },
            { label: 'High importance',  prompt: 'Filter the inbox to only the agent runs with material findings I should action today.' },
            { label: 'Recent failures',  prompt: 'Show me agent runs that failed or returned no signal in the past week.' },
            { label: 'Mark all reviewed',prompt: 'Mark every brief I have already opened as reviewed and remind me of the rest.' },
          ]}
          placeholder="Ask Finsyt about your agent inbox…"
          style={{ margin: '0 0 18px' }}
        />
        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} style={selectStyle}>
            <option value="all">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            {RANGES.map(r => (
              <button key={r.id} onClick={() => setRange(r.id)} style={{
                padding: '7px 12px', borderRadius: 999,
                background: range === r.id ? 'var(--accent-dim)' : 'transparent',
                border: `1px solid ${range === r.id ? 'rgba(27,79,255,0.4)' : 'var(--border)'}`,
                color: range === r.id ? 'var(--accent-text)' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>{r.label}</button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {filtered.length} brief{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div style={{
            padding: '64px 24px', textAlign: 'center',
            background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 14,
          }}>
            <div style={{ fontSize: 32, opacity: 0.5, marginBottom: 12 }}>◰</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No briefs in this window</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
              Try widening the date range, or run an agent now to generate a fresh brief.
            </div>
            <Link href="/app/agents" style={{
              padding: '8px 16px', borderRadius: 10, background: 'var(--gradient-brand)',
              color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
            }}>Open My Agents</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(r => (
              <Link key={r.id} href={`/app/agents/${r.agentId}/runs/${r.id}`}
                onClick={() => markRunRead(r.id)}
                style={{
                  display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 14,
                  padding: '14px 18px', textDecoration: 'none',
                  background: r.read ? 'var(--bg-elevated)' : 'rgba(27,79,255,0.06)',
                  border: `1px solid ${r.read ? 'var(--border)' : 'rgba(27,79,255,0.25)'}`,
                  borderRadius: 12, alignItems: 'center',
                  transition: 'border-color 0.15s, transform 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(27,79,255,0.4)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = r.read ? 'var(--border)' : 'rgba(27,79,255,0.25)' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'rgba(27,79,255,0.18)', color: 'var(--accent-text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, flexShrink: 0,
                }}>{r.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-text)' }}>{r.agentName}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {r.category}</span>
                    {!r.read && <span style={{
                      fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: 'var(--accent)', color: '#fff', letterSpacing: '0.04em',
                    }}>NEW</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{r.headline}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{relTime(r.ranAt)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(r.ranAt).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8,
  background: 'var(--bg-input)', border: '1.5px solid var(--border)',
  color: 'var(--text-primary)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
  minWidth: 200,
}
