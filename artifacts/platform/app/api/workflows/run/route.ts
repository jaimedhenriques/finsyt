import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { audit, runWorkflowSchema } from '@workspace/db'
import { runWorkflow } from '@/lib/workflows/executor'
import { requireFeature } from '@/lib/billing-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Workflow runs fan out to providers + the LLM agent; allow a long ceiling.
export const maxDuration = 300

// POST /api/workflows/run — execute a stored workflow once, synchronously.
export async function POST(req: NextRequest) {
  // Running automations (manual trigger) is a paid capability.
  const gate = await requireFeature('workflow_automation')
  if (!gate.ok) return gate.response!

  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = runWorkflowSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await runWorkflow({
      orgId,
      userId,
      workflowId: parsed.data.workflowId,
      triggeredBy: 'manual',
    })

    audit.log({
      orgId,
      actorId: userId,
      actorType: 'user',
      action: 'workflow.run',
      resourceType: 'workflow',
      resourceId: parsed.data.workflowId,
      metadata: { runId: result.runId, status: result.status },
    }).catch(() => {})

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'workflow run failed'
    const status = message === 'Workflow not found' ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
