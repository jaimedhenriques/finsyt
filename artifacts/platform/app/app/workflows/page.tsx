'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Badge, PageHero } from '@/components/ui'
import type { Workflow } from '@/components/workflows/types'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
const STATUS_TONE: Record<string, 'green' | 'amber' | 'gray'> = { Active: 'green', Paused: 'amber', Draft: 'gray' }

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const d = Date.now() - new Date(iso).getTime()
  if (d < 0) return new Date(iso).toLocaleString()
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

export default function WorkflowsPage() {
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [noWorkspace, setNoWorkspace] = useState(false)
  const [gate, setGate] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/workflows`)
      if (r.status === 401) { setWorkflows([]); return }
      const j = await r.json()
      if (j.reason === 'no_workspace') { setNoWorkspace(true); setWorkflows([]); return }
      setWorkflows(j.workflows ?? [])
    } catch {
      setWorkflows([])
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const create = useCallback(async () => {
    setCreating(true)
    setGate(null)
    try {
      const r = await fetch(`${BASE}/api/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled workflow', graph: { nodes: [], edges: [] } }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.status === 402) {
        setGate(j.message || 'Workflow automation requires a paid plan.')
        return
      }
      if (r.ok && j.workflow) router.push(`${BASE}/app/workflows/${j.workflow.id}`)
    } finally {
      setCreating(false)
    }
  }, [router])

  return (
    <div>
      <PageHero
        eyebrow="Automation"
        title="Workflow Studio"
        accentWord="Workflow"
        subtitle="Wire data sources, transforms, AI agents and outputs into a pipeline. Run on demand or on a schedule."
        actions={
          <button onClick={create} disabled={creating || noWorkspace} style={primaryBtn}>
            {creating ? 'Creating…' : '+ New workflow'}
          </button>
        }
      />

      <div style={{ padding: '0 32px 40px' }}>
        {gate && (
          <Card style={{ marginBottom: 14, borderColor: 'var(--accent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{gate}</div>
              <a href={`${BASE}/app/upgrade`} style={primaryBtn}>Upgrade plan</a>
            </div>
          </Card>
        )}
        {noWorkspace && (
          <Card><div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Select or create a workspace to build workflows.</div></Card>
        )}

        {!noWorkspace && workflows === null && (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
        )}

        {!noWorkspace && workflows?.length === 0 && (
          <Card>
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔀</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No workflows yet</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
                Create your first pipeline — e.g. <em>Quote → AI Agent → Save to Notebook</em>.
              </p>
              <button onClick={create} disabled={creating} style={primaryBtn}>+ New workflow</button>
            </div>
          </Card>
        )}

        {!!workflows?.length && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {workflows.map((wf) => {
              const nodeCount = wf.graph?.nodes?.length ?? 0
              return (
                <Card key={wf.id} className="hover-lift" style={{ cursor: 'pointer' }}>
                  <div onClick={() => router.push(`${BASE}/app/workflows/${wf.id}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</span>
                      <Badge tone={STATUS_TONE[wf.status] ?? 'gray'}>{wf.status}</Badge>
                    </div>
                    {wf.description && (
                      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{wf.description}</p>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>{nodeCount} node{nodeCount === 1 ? '' : 's'}</span>
                      {wf.schedule && <span>⏱ {wf.schedule.frequency}</span>}
                      <span>Last run {relTime(wf.lastRunAt)}</span>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 8, border: 'none',
  background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
