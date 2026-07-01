'use client'
import { useState } from 'react'
import { getNodeType } from '@/lib/workflows/catalog'
import type { NodeResult, WorkflowRun } from './types'

function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

const STATUS_COLOR: Record<string, string> = { ok: '#22c55e', error: '#ef4444', skipped: 'var(--text-muted)' }

export default function RunPanel({
  run,
  history,
  running,
  onSelectNode,
}: {
  run: WorkflowRun | null
  history: WorkflowRun[]
  running: boolean
  onSelectNode: (nodeId: string) => void
}) {
  if (running && !run) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Running workflow…</div>
  }
  if (!run) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        No runs yet. Press <strong>Run once</strong> to execute the workflow and see per-node output here.
        {history.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Recent runs</div>
            {history.slice(0, 8).map((h) => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                <span style={{ color: STATUS_COLOR[h.runStatus] ?? 'var(--text-muted)' }}>{h.runStatus}</span>
                <span style={{ color: 'var(--text-muted)' }}>{relTime(h.startedAt)} · {h.triggeredBy}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLOR[run.runStatus] ?? 'var(--text-primary)' }}>
          Run {run.runStatus}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {run.latencyMs != null ? `${run.latencyMs}ms` : ''} · {relTime(run.startedAt)}
        </span>
      </div>
      {run.errorMessage && (
        <div style={{ fontSize: 12, color: '#ef4444', background: '#ef444412', padding: '8px 10px', borderRadius: 7 }}>
          {run.errorMessage}
        </div>
      )}
      {run.nodeResults.map((r) => (
        <NodeResultCard key={r.nodeId} result={r} onSelect={() => onSelectNode(r.nodeId)} />
      ))}
    </div>
  )
}

function NodeResultCard({ result, onSelect }: { result: NodeResult; onSelect: () => void }) {
  const [open, setOpen] = useState(false)
  const def = getNodeType(result.type)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); onSelect() }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          background: 'var(--surface)', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ color: STATUS_COLOR[result.status] ?? 'var(--text-muted)', fontWeight: 700 }}>
          {result.status === 'ok' ? '✓' : result.status === 'error' ? '✕' : '·'}
        </span>
        <span style={{ fontSize: 14 }}>{def?.icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{result.label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{result.latencyMs}ms</span>
      </button>
      {open && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          {result.status === 'error' ? (
            <div style={{ fontSize: 12, color: '#ef4444' }}>{result.errorMessage}</div>
          ) : (
            <>
              {result.text && (
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-secondary)', maxHeight: 240, overflow: 'auto' }}>
                  {result.text}
                </pre>
              )}
              {result.sources.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.sources.map((s, i) => (
                    <span key={i} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {s.label}{s.meta ? ` · ${s.meta}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
