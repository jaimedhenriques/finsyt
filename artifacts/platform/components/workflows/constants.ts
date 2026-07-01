// Client-safe copies of the workflow enums (mirrors lib/db/src/schema/workflows.ts).
export const WORKFLOW_STATUSES = ['Active', 'Paused', 'Draft'] as const
export const WORKFLOW_FREQUENCIES = ['Daily', 'Weekly', 'Monthly'] as const
export const WORKFLOW_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
