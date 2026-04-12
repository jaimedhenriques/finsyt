import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export type WorkspaceSourceType = "pdf" | "url" | "text" | "sec"

export interface WorkspaceSourceRecord {
  sourceId: string
  name: string
  type: WorkspaceSourceType
  chunks: string[]
}

interface WorkspaceSourceRow {
  source_id: string
  name: string
  source_type: WorkspaceSourceType
  chunks: unknown
}

const MEMORY_STORE = new Map<string, WorkspaceSourceRecord>()
const TABLE_NAME = process.env.SUPABASE_WORKSPACE_SOURCES_TABLE || "workspace_sources"

let supabaseClient: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""

  if (!supabaseUrl || !serviceRoleKey) return null

  supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return supabaseClient
}

function normaliseChunks(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function rowToRecord(row: WorkspaceSourceRow): WorkspaceSourceRecord {
  return {
    sourceId: row.source_id,
    name: row.name,
    type: row.source_type,
    chunks: normaliseChunks(row.chunks),
  }
}

export async function upsertWorkspaceSource(record: WorkspaceSourceRecord): Promise<"supabase" | "memory"> {
  MEMORY_STORE.set(record.sourceId, record)
  const client = getSupabaseClient()
  if (!client) return "memory"

  const { error } = await client.from(TABLE_NAME).upsert(
    {
      source_id: record.sourceId,
      name: record.name,
      source_type: record.type,
      chunks: record.chunks,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source_id" },
  )

  if (error) {
    console.error(`[workspaces/store] Supabase upsert failed, falling back to memory: ${error.message}`)
    return "memory"
  }

  return "supabase"
}

export async function getWorkspaceSources(sourceIds: string[]): Promise<Map<string, WorkspaceSourceRecord>> {
  const ids = sourceIds.filter(Boolean)
  const records = new Map<string, WorkspaceSourceRecord>()

  if (ids.length === 0) return records

  const client = getSupabaseClient()
  if (client) {
    const { data, error } = await client
      .from(TABLE_NAME)
      .select("source_id,name,source_type,chunks")
      .in("source_id", ids)

    if (!error && data) {
      for (const row of data as WorkspaceSourceRow[]) {
        const record = rowToRecord(row)
        records.set(record.sourceId, record)
      }
    } else if (error) {
      console.error(`[workspaces/store] Supabase read failed, using memory fallback: ${error.message}`)
    }
  }

  for (const id of ids) {
    if (!records.has(id)) {
      const memoryRecord = MEMORY_STORE.get(id)
      if (memoryRecord) records.set(id, memoryRecord)
    }
  }

  return records
}

export async function saveSource(
  sourceId: string,
  name: string,
  type: WorkspaceSourceType,
  chunks: string[],
): Promise<void> {
  await upsertWorkspaceSource({ sourceId, name, type, chunks })
}

export async function getManySources(sourceIds: string[]): Promise<Map<string, WorkspaceSourceRecord>> {
  return getWorkspaceSources(sourceIds)
}

export async function getSourcesWithChunks(sourceIds: string[]): Promise<WorkspaceSourceRecord[]> {
  return Array.from((await getWorkspaceSources(sourceIds)).values())
}

