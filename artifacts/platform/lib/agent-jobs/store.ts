import { withClerkContext, agentJobsTable } from '@workspace/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import type {
  AgentJobRow,
  JobStepEntry,
  JobSource,
  JobResult,
  JobStatus,
} from '@workspace/db'

// All reads/writes flow through `withClerkContext(orgId, userId, fn)` so the
// `app.current_clerk_org_id` GUC is bound and the agent_jobs RLS policies in
// rls-sql.ts scope every row to the caller's workspace.

export type ListedJob = AgentJobRow

export async function listJobs(orgId: string, userId: string): Promise<AgentJobRow[]> {
  return withClerkContext(orgId, userId, (tx) =>
    tx
      .select()
      .from(agentJobsTable)
      .where(eq(agentJobsTable.orgId, orgId))
      .orderBy(desc(agentJobsTable.createdAt))
      .limit(200),
  )
}

export async function getJob(
  orgId: string,
  userId: string,
  id: string,
): Promise<AgentJobRow | null> {
  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx
      .select()
      .from(agentJobsTable)
      .where(and(eq(agentJobsTable.orgId, orgId), eq(agentJobsTable.id, id)))
      .limit(1),
  )
  return rows[0] ?? null
}

export async function getThread(
  orgId: string,
  userId: string,
  threadId: string,
): Promise<AgentJobRow[]> {
  return withClerkContext(orgId, userId, (tx) =>
    tx
      .select()
      .from(agentJobsTable)
      .where(and(eq(agentJobsTable.orgId, orgId), eq(agentJobsTable.threadId, threadId)))
      .orderBy(desc(agentJobsTable.createdAt)),
  )
}

export interface CreateJobArgs {
  orgId: string
  userId: string
  title: string
  brief: string
  deliverableType: string
  surface: string
  context: Record<string, unknown>
  threadId?: string
  parentJobId?: string | null
}

export async function insertJob(args: CreateJobArgs): Promise<AgentJobRow> {
  const rows = await withClerkContext(args.orgId, args.userId, (tx) =>
    tx
      .insert(agentJobsTable)
      .values({
        orgId: args.orgId,
        authorUserId: args.userId,
        threadId: args.threadId ?? sql`gen_random_uuid()`,
        parentJobId: args.parentJobId ?? null,
        title: args.title,
        brief: args.brief,
        deliverableType: args.deliverableType,
        surface: args.surface,
        context: args.context,
        status: 'queued',
        currentStep: 'Queued',
        progress: 0,
        steps: [],
        sources: [],
        read: false,
      })
      .returning(),
  )
  return rows[0]
}

export async function markRead(
  orgId: string,
  userId: string,
  id: string,
): Promise<void> {
  await withClerkContext(orgId, userId, (tx) =>
    tx
      .update(agentJobsTable)
      .set({ read: true, updatedAt: new Date() })
      .where(and(eq(agentJobsTable.orgId, orgId), eq(agentJobsTable.id, id))),
  )
}

// ── Runner-side mutations ───────────────────────────────────────────────────
// These run inside the background runner, which holds the same orgId/userId.

export async function setRunning(orgId: string, userId: string, id: string): Promise<void> {
  await withClerkContext(orgId, userId, (tx) =>
    tx
      .update(agentJobsTable)
      .set({ status: 'running', currentStep: 'Starting', startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agentJobsTable.orgId, orgId), eq(agentJobsTable.id, id))),
  )
}

export async function appendStep(
  orgId: string,
  userId: string,
  id: string,
  step: JobStepEntry,
  patch?: { currentStep?: string; progress?: number },
): Promise<void> {
  await withClerkContext(orgId, userId, (tx) =>
    tx
      .update(agentJobsTable)
      .set({
        steps: sql`${agentJobsTable.steps} || ${JSON.stringify([step])}::jsonb`,
        currentStep: patch?.currentStep ?? sql`${agentJobsTable.currentStep}`,
        progress: patch?.progress ?? sql`${agentJobsTable.progress}`,
        updatedAt: new Date(),
      })
      .where(and(eq(agentJobsTable.orgId, orgId), eq(agentJobsTable.id, id))),
  )
}

export async function finishJob(
  orgId: string,
  userId: string,
  id: string,
  data: {
    status: Extract<JobStatus, 'done' | 'failed'>
    result?: JobResult | null
    sources?: JobSource[]
    error?: string | null
    model?: string | null
    provider?: string | null
  },
): Promise<void> {
  await withClerkContext(orgId, userId, (tx) =>
    tx
      .update(agentJobsTable)
      .set({
        status: data.status,
        currentStep: data.status === 'done' ? 'Completed' : 'Failed',
        progress: 100,
        result: data.result ?? null,
        sources: data.sources ?? [],
        error: data.error ?? null,
        model: data.model ?? null,
        provider: data.provider ?? null,
        read: false,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(agentJobsTable.orgId, orgId), eq(agentJobsTable.id, id))),
  )
}
