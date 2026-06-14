'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui'
import { getNodeType, type NodeTypeDef } from '@/lib/workflows/catalog'
import Palette from './Palette'
import Canvas from './Canvas'
import PropertiesPanel from './PropertiesPanel'
import RunPanel from './RunPanel'
import type { NodeResult, Workflow, WorkflowEdge, WorkflowNode, WorkflowRun } from './types'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

function uid(): string {
  try { return crypto.randomUUID() } catch { return `n_${Math.random().toString(36).slice(2, 11)}` }
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'gray'> = { Active: 'green', Paused: 'amber', Draft: 'gray' }

export default function WorkflowEditor({ initial }: { initial: Workflow }) {
  const router = useRouter()
  const [wf, setWf] = useState<Workflow>(initial)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [history, setHistory] = useState<WorkflowRun[]>([])
  const [error, setError] = useState<string | null>(null)

  const savedRef = useRef(initial)

  // Load recent run history once.
  useEffect(() => {
    fetch(`${BASE}/api/workflows/runs?workflowId=${wf.id}`)
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((j) => { setHistory(j.runs ?? []); if (j.runs?.[0]) setRun(j.runs[0]) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patchGraph = useCallback((mutate: (g: Workflow['graph']) => Workflow['graph']) => {
    setWf((prev) => ({ ...prev, graph: mutate(prev.graph) }))
    setDirty(true)
  }, [])

  const addNode = useCallback((def: NodeTypeDef) => {
    const id = uid()
    const count = wf.graph.nodes.length
    const node: WorkflowNode = {
      id,
      type: def.type,
      position: { x: 120 + (count % 4) * 90, y: 120 + (count % 5) * 70 },
      config: Object.fromEntries(
        def.fields.filter((f) => f.defaultValue !== undefined).map((f) => [f.key, f.defaultValue as string | number]),
      ),
    }
    patchGraph((g) => ({ ...g, nodes: [...g.nodes, node] }))
    setSelectedId(id)
  }, [patchGraph, wf.graph.nodes.length])

  const moveNode = useCallback((id: string, pos: { x: number; y: number }) => {
    patchGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, position: pos } : n)) }))
  }, [patchGraph])

  const changeNode = useCallback((id: string, patch: Partial<WorkflowNode>) => {
    patchGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
  }, [patchGraph])

  const deleteNode = useCallback((id: string) => {
    patchGraph((g) => ({
      nodes: g.nodes.filter((n) => n.id !== id),
      edges: g.edges.filter((e) => e.source !== id && e.target !== id),
    }))
    setSelectedId(null)
  }, [patchGraph])

  const connect = useCallback((source: string, target: string) => {
    if (source === target) return
    patchGraph((g) => {
      if (g.edges.some((e) => e.source === source && e.target === target)) return g
      const edge: WorkflowEdge = { id: uid(), source, target }
      return { ...g, edges: [...g.edges, edge] }
    })
  }, [patchGraph])

  const deleteEdge = useCallback((id: string) => {
    patchGraph((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== id) }))
  }, [patchGraph])

  const changeWorkflow = useCallback((patch: Partial<Workflow>) => {
    setWf((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }, [])

  const selectedNode = useMemo(() => wf.graph.nodes.find((n) => n.id === selectedId) ?? null, [wf.graph.nodes, selectedId])

  const resultMap = useMemo<Record<string, NodeResult>>(() => {
    const m: Record<string, NodeResult> = {}
    if (run) for (const r of run.nodeResults) m[r.nodeId] = r
    return m
  }, [run])

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true); setError(null)
    try {
      const r = await fetch(`${BASE}/api/workflows/${wf.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wf.name,
          description: wf.description,
          status: wf.status,
          graph: wf.graph,
          schedule: wf.schedule,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Save failed')
      savedRef.current = j.workflow
      setWf(j.workflow)
      setDirty(false)
      return true
    } catch (e) {
      setError(String((e as Error).message))
      return false
    } finally {
      setSaving(false)
    }
  }, [wf])

  const runOnce = useCallback(async () => {
    setError(null)
    if (dirty) { const ok = await save(); if (!ok) return }
    setRunning(true); setRun(null)
    try {
      const r = await fetch(`${BASE}/api/workflows/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: wf.id }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.status === 402) throw new Error(j?.message || 'Running automations requires a paid plan. Upgrade to continue.')
      if (!r.ok) throw new Error(j?.error || 'Run failed')
      // The run endpoint returns { runId, status, nodeResults }. Refetch the
      // persisted run record so the panel shows timing/trigger metadata too.
      const runs = await fetch(`${BASE}/api/workflows/runs?workflowId=${wf.id}`).then((x) => (x.ok ? x.json() : { runs: [] }))
      setHistory(runs.runs ?? [])
      setRun(runs.runs?.[0] ?? { ...j, startedAt: new Date().toISOString(), runStatus: j.status, workflowId: wf.id, workflowName: wf.name, triggeredBy: 'manual', latencyMs: null, completedAt: null, triggeredByUserId: null, errorMessage: j.errorMessage ?? null })
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setRunning(false)
    }
  }, [dirty, save, wf.id, wf.name])

  const del = useCallback(async () => {
    if (!confirm('Delete this workflow? This cannot be undone.')) return
    await fetch(`${BASE}/api/workflows/${wf.id}`, { method: 'DELETE' }).catch(() => {})
    router.push(`${BASE}/app/workflows`)
  }, [router, wf.id])

  // Keyboard: Delete removes selected node; Cmd/Ctrl+S saves.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const t = e.target as HTMLElement
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
        deleteNode(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, deleteNode, selectedId])

  const nodeCount = wf.graph.nodes.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        <button onClick={() => router.push(`${BASE}/app/workflows`)} style={ghostBtn}>← Workflows</button>
        <input
          value={wf.name}
          onChange={(e) => changeWorkflow({ name: e.target.value })}
          style={{ fontSize: 16, fontWeight: 700, border: 'none', background: 'transparent', color: 'var(--text-primary)', outline: 'none', minWidth: 200, flex: '0 1 auto' }}
        />
        <Badge tone={STATUS_TONE[wf.status]}>{wf.status}</Badge>
        {wf.schedule && <Badge tone="gray">⏱ {wf.schedule.frequency}{wf.schedule.time ? ` ${wf.schedule.time}` : ''}</Badge>}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{nodeCount} node{nodeCount === 1 ? '' : 's'}</span>
        {dirty && <span style={{ fontSize: 12, color: 'var(--accent-text)' }}>● unsaved</span>}
        <div style={{ flex: 1 }} />
        {error && <span style={{ fontSize: 12, color: '#ef4444', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>}
        <button onClick={del} style={{ ...ghostBtn, color: '#ef4444' }}>Delete</button>
        <button onClick={() => save()} disabled={saving || !dirty} style={{ ...ghostBtn, opacity: saving || !dirty ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={runOnce} disabled={running || nodeCount === 0} style={{ ...primaryBtn, opacity: running || nodeCount === 0 ? 0.6 : 1 }}>
          {running ? 'Running…' : '▶ Run once'}
        </button>
      </div>

      {/* Three-pane body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto', padding: 14, background: 'var(--surface)' }}>
          <Palette onAdd={addNode} />
        </aside>

        <main style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Canvas
            graph={wf.graph}
            selectedId={selectedId}
            results={resultMap}
            onSelect={setSelectedId}
            onMoveNode={moveNode}
            onConnect={connect}
            onDeleteEdge={deleteEdge}
          />
        </main>

        <aside style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)', overflow: 'auto', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <PropertiesPanel
              workflow={wf}
              node={selectedNode}
              onChangeNode={(patch) => selectedId && changeNode(selectedId, patch)}
              onDeleteNode={() => selectedId && deleteNode(selectedId)}
              onChangeWorkflow={changeWorkflow}
            />
          </div>
          <div style={{ padding: 16, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Run output</div>
            <RunPanel run={run} history={history} running={running} onSelectNode={setSelectedId} />
          </div>
        </aside>
      </div>
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const primaryBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 7, border: 'none',
  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
