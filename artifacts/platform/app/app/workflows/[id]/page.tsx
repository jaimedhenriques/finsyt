'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import WorkflowEditor from '@/components/workflows/WorkflowEditor'
import type { Workflow } from '@/components/workflows/types'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

export default function WorkflowEditorPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = params?.id
    if (!id) return
    fetch(`${BASE}/api/workflows/${id}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j?.error || 'Workflow not found')
        }
        return r.json()
      })
      .then((j) => setWorkflow(j.workflow))
      .catch((e) => setError(String((e as Error).message)))
  }, [params?.id])

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Could not load workflow</div>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>{error}</p>
        <button
          onClick={() => router.push(`${BASE}/app/workflows`)}
          style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
        >
          ← Back to workflows
        </button>
      </div>
    )
  }

  if (!workflow) {
    return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading workflow…</div>
  }

  return <WorkflowEditor initial={workflow} />
}
