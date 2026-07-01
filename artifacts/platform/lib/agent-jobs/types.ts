import type {
  AgentJobRow,
  DeliverableType,
  JobSurface,
  JobStatus,
  JobStepEntry,
  JobSource,
  JobAttachment,
  JobResult,
} from '@workspace/db'

export type {
  AgentJobRow,
  DeliverableType,
  JobSurface,
  JobStatus,
  JobStepEntry,
  JobSource,
  JobAttachment,
  JobResult,
}

/** Shape returned to the client for a single job (jsonb fields typed). */
export interface AgentJobDTO {
  id: string
  threadId: string
  parentJobId: string | null
  title: string
  brief: string
  deliverableType: DeliverableType
  surface: JobSurface
  context: Record<string, unknown>
  status: JobStatus
  currentStep: string
  progress: number
  steps: JobStepEntry[]
  result: JobResult | null
  sources: JobSource[]
  error: string | null
  model: string | null
  provider: string | null
  read: boolean
  authorUserId: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  updatedAt: string
}

/** One thread in the inbox: the latest job plus its prior versions. */
export interface AgentJobThreadDTO {
  threadId: string
  latest: AgentJobDTO
  history: AgentJobDTO[]
  versions: number
}

export function rowToDTO(row: AgentJobRow): AgentJobDTO {
  return {
    id: row.id,
    threadId: row.threadId,
    parentJobId: row.parentJobId,
    title: row.title,
    brief: row.brief,
    deliverableType: row.deliverableType as DeliverableType,
    surface: row.surface as JobSurface,
    context: (row.context ?? {}) as Record<string, unknown>,
    status: row.status as JobStatus,
    currentStep: row.currentStep,
    progress: row.progress,
    steps: (row.steps ?? []) as JobStepEntry[],
    result: (row.result ?? null) as JobResult | null,
    sources: (row.sources ?? []) as JobSource[],
    error: row.error,
    model: row.model,
    provider: row.provider,
    read: row.read,
    authorUserId: row.authorUserId,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

const DELIVERABLE_LABELS: Record<DeliverableType, string> = {
  memo: 'Investment memo',
  deck: 'Slide deck',
  model: 'Financial model',
  matrix: 'Document matrix',
  research_note: 'Research note',
  analysis: 'Analysis brief',
}

export function deliverableLabel(t: DeliverableType): string {
  return DELIVERABLE_LABELS[t] ?? 'Deliverable'
}
