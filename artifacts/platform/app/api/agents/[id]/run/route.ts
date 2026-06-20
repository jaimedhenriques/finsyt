import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import { withClerkContext, agentsTable, agentRunsTable } from '@workspace/db'
import { runAndPersist } from '@/lib/agent-runner-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// LLM calls can run for 30–60s; bump the route timeout above the Next default.
export const maxDuration = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/agents/:id/run — execute the agent with a real LLM, persist the
// run, and return the new row. Triggered manually from the UI; the cron
// scheduler reuses the same persistence path via runAndPersist.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  // 1. Load the agent (RLS ensures it belongs to this workspace).
  const agent = await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx.select().from(agentsTable)
      .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id))).limit(1)
    return row
  })
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // 2. Run + persist via the shared helper.
  const { runId, output, ranAt, nextRunAt } = await runAndPersist({
    agent,
    triggeredBy: 'manual',
    triggeredByUserId: userId,
  })

  return NextResponse.json({
    run: {
      id: runId,
      agentId: agent.id,
      agentName: agent.name,
      category: agent.category,
      icon: agent.icon,
      ranAt: ranAt.toISOString(),
      read: false,
      headline: output.headline,
      summary: output.summary,
      findings: output.findings,
      sources: output.sources,
      model: output.model,
      provider: output.provider,
      latencyMs: output.latencyMs,
      runStatus: output.ok ? 'ok' : 'error',
      triggeredBy: 'manual',
    },
    agent: { lastRunAt: ranAt.toISOString(), nextRunAt: nextRunAt?.toISOString() ?? null },
  }, { status: 201 })
}

// Kept for the Inbox & runs feed serialiser.
export function serialiseRun(r: typeof agentRunsTable.$inferSelect) {
  return {
    id: r.id,
    agentId: r.agentId,
    agentName: r.agentName,
    category: r.category,
    icon: r.icon,
    ranAt: r.ranAt.toISOString(),
    read: r.read,
    headline: r.headline,
    summary: r.summary,
    findings: (r.findings as { title: string; detail: string }[]) ?? [],
    sources:  (r.sources  as { label: string; meta: string }[])   ?? [],
    model: r.model ?? undefined,
    provider: r.provider ?? undefined,
    latencyMs: r.latencyMs ?? undefined,
    runStatus: r.runStatus,
    triggeredBy: r.triggeredBy,
  }
}
