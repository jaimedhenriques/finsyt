// Client-side mirrors of the workflow zod/db shapes. Kept local (not imported
// from @workspace/db) so the canvas bundle never pulls server-only code.

export type WorkflowStatus = 'Active' | 'Paused' | 'Draft'

export interface WorkflowNode {
  id: string
  type: string
  label?: string
  position: { x: number; y: number }
  config: Record<string, string | number | boolean | string[]>
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface WorkflowGraph {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowSchedule {
  frequency: 'Daily' | 'Weekly' | 'Monthly'
  day?: string
  time?: string
}

export interface Workflow {
  id: string
  name: string
  description: string
  status: WorkflowStatus
  graph: WorkflowGraph
  schedule: WorkflowSchedule | null
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NodeResult {
  nodeId: string
  type: string
  label: string
  status: 'ok' | 'error' | 'skipped'
  text: string
  data?: unknown
  sources: { label: string; meta: string }[]
  errorMessage?: string
  latencyMs: number
}

export interface WorkflowRun {
  id: string
  workflowId: string
  workflowName: string
  triggeredBy: string
  triggeredByUserId: string | null
  runStatus: 'running' | 'ok' | 'error'
  nodeResults: NodeResult[]
  errorMessage: string | null
  latencyMs: number | null
  startedAt: string
  completedAt: string | null
}
