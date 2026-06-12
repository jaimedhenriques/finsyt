import 'server-only'
import { and, eq } from 'drizzle-orm'
import {
  withClerkContext,
  agentsTable,
  agentRunsTable,
  type AgentRow,
} from '@workspace/db'
import { computeNextRunAt } from './agent-schedule'
import { executeAgent, harvestTickers, type RunOutput } from './agent-executor'

// ── Shared run-and-persist path used by both the manual API route and the
// in-process cron scheduler. Keeps run accounting (lastRunAt / nextRunAt)
// and the agent_runs row insert in lock-step with the LLM call.

export interface RunPersistArgs {
  agent:        AgentRow
  triggeredBy:  'manual' | 'scheduled'
  triggeredByUserId?: string | null
}

export interface RunPersistResult {
  runId:     string
  output:    RunOutput
  ranAt:     Date
  nextRunAt: Date | null
}

export async function runAndPersist({ agent, triggeredBy, triggeredByUserId }: RunPersistArgs): Promise<RunPersistResult> {
  const tickers = harvestTickers(agent.instructions)
  const out = await executeAgent({
    agentName:    agent.name,
    category:     agent.category,
    templateSlug: agent.templateSlug,
    instructions: agent.instructions,
    tickers,
    orgId:        agent.orgId,
  })

  const ranAt = new Date()
  const nextRunAt = agent.status === 'Paused' ? null : computeNextRunAt(agent.schedule as any, ranAt)

  // The scheduler does not have a Clerk session, so we bind the org/user via
  // withClerkContext using the agent's owning author. RLS still enforces that
  // the row's org_id matches the GUC.
  const userIdForCtx = triggeredByUserId ?? agent.authorUserId

  const runId = await withClerkContext(agent.orgId, userIdForCtx, async (tx) => {
    const [run] = await tx.insert(agentRunsTable).values({
      orgId: agent.orgId,
      agentId: agent.id,
      agentName: agent.name,
      category: agent.category,
      icon: agent.icon,
      triggeredBy,
      triggeredByUserId: triggeredByUserId ?? null,
      ranAt,
      read: false,
      headline: out.headline,
      summary: out.summary,
      findings: out.findings,
      sources:  out.sources,
      model: out.model,
      provider: out.provider,
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      latencyMs: out.latencyMs,
      runStatus: out.ok ? 'ok' : 'error',
      errorMessage: out.errorMessage,
    }).returning({ id: agentRunsTable.id })

    await tx.update(agentsTable)
      .set({ lastRunAt: ranAt, nextRunAt, updatedAt: new Date() })
      .where(and(eq(agentsTable.orgId, agent.orgId), eq(agentsTable.id, agent.id)))

    return run.id
  })

  return { runId, output: out, ranAt, nextRunAt }
}
